/**
 * IH Compositor v5.0.0
 * Full AI ad agency: competitor research, pain points, winner analysis,
 * creative generation, quality control, daily cron, Google Drive upload.
 */
const path    = require('path');
const fs      = require('fs');
const express = require('express');
const JSZip   = require('jszip');
const cron    = require('node-cron');
const fetch   = require('node-fetch');
const sharp   = require('sharp');
const { composite, getLayouts } = require('./compositor');

const app            = express();
const PORT           = process.env.PORT || 3000;
const MAX_BATCH_SIZE = parseInt(process.env.MAX_BATCH_SIZE || '25', 10);

// ── Directory paths ───────────────────────────────────────────────────────────
const PUBLIC_DIR      = path.join(__dirname, '..', 'public');
const STATIC_DIR      = path.join(PUBLIC_DIR, 'static');
const INTEL_DIR       = path.join(PUBLIC_DIR, 'intelligence');
const DEFAULTS_FILE   = path.join(INTEL_DIR, 'defaults.json');

[STATIC_DIR, INTEL_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── Static file serving ───────────────────────────────────────────────────────
app.use('/static',       express.static(STATIC_DIR));
app.use('/intelligence', express.static(INTEL_DIR));

// ── Default product paths ─────────────────────────────────────────────────────
const DEFAULT_PRODUCTS = {
  hoop:  path.join(STATIC_DIR, 'hoop.png'),
  belt:  path.join(STATIC_DIR, 'belt.webp'),
  cream: path.join(STATIC_DIR, 'cream.webp'),
  tea:   path.join(STATIC_DIR, 'detox.webp'),
};

// ── CORS + JSON ───────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '100mb' }));

// ═══════════════════════════════════════════════════════════════════════════════
// INTELLIGENCE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function loadDefaults() {
  try { return JSON.parse(fs.readFileSync(DEFAULTS_FILE, 'utf8')); }
  catch(e) { return { competitors: {}, pain_points: {}, ih_winner_dna: {} }; }
}

function loadIntelligence() {
  const defaults = loadDefaults();
  const result   = { competitors: defaults.competitors, pain_points: defaults.pain_points, ih_winner_dna: defaults.ih_winner_dna };

  // Load latest competitor file
  try {
    const files = fs.readdirSync(INTEL_DIR).filter(f => f.startsWith('competitors-')).sort().reverse();
    if (files.length) result.competitors = JSON.parse(fs.readFileSync(path.join(INTEL_DIR, files[0]), 'utf8'));
  } catch(e) {}

  // Load pain points
  try {
    const ppFile = path.join(INTEL_DIR, 'pain-points.json');
    if (fs.existsSync(ppFile)) result.pain_points = JSON.parse(fs.readFileSync(ppFile, 'utf8'));
  } catch(e) {}

  // Load winner DNA
  try {
    const dnaFile = path.join(INTEL_DIR, 'ih-winner-dna.json');
    if (fs.existsSync(dnaFile)) result.ih_winner_dna = JSON.parse(fs.readFileSync(dnaFile, 'utf8'));
  } catch(e) {}

  return result;
}

function saveIntelligence(filename, data) {
  fs.writeFileSync(path.join(INTEL_DIR, filename), JSON.stringify(data, null, 2));
}

async function callClaude(systemPrompt, userPrompt, maxTokens = 4096) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6', max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`Claude API ${r.status}: ${err.slice(0, 200)}`);
  }
  const d = await r.json();
  return d.content?.[0]?.text || '';
}

function parseJsonFromText(text) {
  // Try to extract JSON array or object from Claude response
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) { try { return JSON.parse(arrayMatch[0]); } catch(e) {} }
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch(e) {} }
  throw new Error('No valid JSON found in response');
}

// ═══════════════════════════════════════════════════════════════════════════════
// THING 7 — QUALITY CONTROL
// ═══════════════════════════════════════════════════════════════════════════════

async function qualityCheck(pngBuffer, brief = {}) {
  const checks = { dimensions: false, file_size: false, hoop_zone: false, cta_zone: false, colors_match: false };
  let retriesNeeded = [];

  try {
    const meta = await sharp(pngBuffer).metadata();

    // Check 1: Dimensions (must be 960×1220 or 1080×1350)
    const validDims = (meta.width === 960 && meta.height === 1220) || (meta.width === 1080 && meta.height === 1350);
    checks.dimensions = validDims;
    if (!validDims) retriesNeeded.push('wrong_dimensions');

    // Check 2: File size (too small = rendering failure)
    checks.file_size = pngBuffer.length > 20000;
    if (!checks.file_size) retriesNeeded.push('file_too_small');

    // Check 3: Hoop zone — sample center of main card for non-transparent pixels
    const W = meta.width, H = meta.height;
    const hoopZone = await sharp(pngBuffer)
      .extract({ left: Math.round(W * 0.2), top: Math.round(H * 0.2), width: Math.round(W * 0.6), height: Math.round(H * 0.35) })
      .raw().toBuffer();
    const totalPixels = hoopZone.length / 4;
    let nonTransparent = 0;
    for (let i = 3; i < hoopZone.length; i += 4) { if (hoopZone[i] > 10) nonTransparent++; }
    checks.hoop_zone = (nonTransparent / totalPixels) > 0.15;
    if (!checks.hoop_zone) retriesNeeded.push('hoop_not_visible');

    // Check 4: CTA zone — bottom 10% should have colored pixels (button)
    const ctaZone = await sharp(pngBuffer)
      .extract({ left: Math.round(W * 0.05), top: Math.round(H * 0.88), width: Math.round(W * 0.9), height: Math.round(H * 0.1) })
      .raw().toBuffer();
    const ctaTotal = ctaZone.length / 4;
    let ctaColored = 0;
    for (let i = 0; i < ctaZone.length; i += 4) {
      const r = ctaZone[i], g = ctaZone[i+1], b = ctaZone[i+2], a = ctaZone[i+3];
      // Not white/near-white and not transparent
      if (a > 10 && !(r > 240 && g > 240 && b > 240)) ctaColored++;
    }
    checks.cta_zone = (ctaColored / ctaTotal) > 0.1;
    if (!checks.cta_zone) retriesNeeded.push('cta_not_visible');

    // Check 5: Colors — sample top banner area, confirm it's colored (not white)
    const bannerZone = await sharp(pngBuffer)
      .extract({ left: 0, top: Math.round(H * 0.05), width: W, height: Math.round(H * 0.08) })
      .raw().toBuffer();
    let coloredBanner = 0;
    for (let i = 0; i < bannerZone.length; i += 4) {
      const r = bannerZone[i], g = bannerZone[i+1], b = bannerZone[i+2], a = bannerZone[i+3];
      if (a > 10 && (r < 230 || g < 100 || b < 100)) coloredBanner++;
    }
    const bannerTotal = bannerZone.length / 4;
    checks.colors_match = (coloredBanner / bannerTotal) > 0.3;
    if (!checks.colors_match) retriesNeeded.push('banner_color_wrong');

  } catch(e) {
    console.warn('Quality check error:', e.message);
  }

  const passedCount = Object.values(checks).filter(Boolean).length;
  const totalChecks = Object.keys(checks).length;
  const passed = passedCount >= totalChecks - 1; // Allow 1 failure

  return {
    passed,
    checks,
    retriesNeeded,
    score:       passedCount / totalChecks,
    scoreLabel:  `${passedCount}/${totalChecks}`,
    finalStatus: passedCount === totalChecks ? 'passed' : passedCount >= totalChecks - 1 ? 'partial' : 'failed',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// THING 3 — COMPETITOR RESEARCH AGENT
// ═══════════════════════════════════════════════════════════════════════════════

async function doCompetitorResearch() {
  const fbToken = process.env.FACEBOOK_ACCESS_TOKEN;
  const searchTerms = [
    'weight loss women', 'belly fat workout', 'mommy pouch fitness',
    'at home workout no equipment', 'menopause weight loss',
    'low impact workout', 'hula hoop fitness', 'waist trainer women',
  ];

  let rawAds = [];

  if (fbToken) {
    // Live Meta Ad Library
    for (const term of searchTerms) {
      try {
        const url = `https://graph.facebook.com/v19.0/ads_archive?access_token=${fbToken}&search_terms=${encodeURIComponent(term)}&ad_reached_countries=["US"]&ad_active_status=ACTIVE&fields=id,ad_creative_bodies,ad_creative_link_captions,page_name,ad_creative_link_titles&limit=5`;
        const r = await fetch(url);
        if (!r.ok) continue;
        const d = await r.json();
        if (d.data) {
          rawAds.push(...d.data.map(ad => ({
            brand:    ad.page_name || 'Unknown',
            headline: (ad.ad_creative_link_titles || [])[0] || (ad.ad_creative_bodies || [])[0]?.slice(0, 60) || '',
            body:     (ad.ad_creative_bodies || [])[0] || '',
            search_term: term,
          })));
        }
      } catch(e) { console.warn(`FB API error for "${term}":`, e.message); }
    }
  }

  // If no live data, use curated set
  if (!rawAds.length) {
    const defaults = loadDefaults();
    rawAds = defaults.competitors?.ads || [];
  }

  // Claude pattern analysis
  const analysisPrompt = `You are a performance marketing analyst. Analyze these ${rawAds.length} winning competitor ads from the weight loss and fitness niche on Meta.

COMPETITOR ADS:
${JSON.stringify(rawAds, null, 2)}

IMPORTANT CONTEXT — Infinity Hoop offer (never changes):
$100 OFF the hoop + FREE Infinity Sweat Belt ($29.99 value) + FREE Infinity Toning Cream ($29.99 value) + FREE Infinity Detox Tea ($29.99 value) = $189.97 total savings.
When analyzing competitor offer structures, note patterns but do NOT suggest different offer amounts for Infinity Hoop. The IH offer is fixed.

Find the patterns that repeat across the winners. Return ONLY valid JSON (no markdown):
{
  "top_headline_structures": ["10 structures with examples"],
  "top_color_combinations": ["5 color combos"],
  "top_offer_framings": ["5 offer structures"],
  "top_emotional_triggers": ["5 emotional triggers"],
  "top_layout_patterns": ["5 layout descriptions"],
  "top_pain_points": ["5 pain points being targeted"],
  "scroll_stop_elements": ["what makes these ads stop the scroll"],
  "conversion_factors": ["why these ads convert"]
}`;

  let patterns;
  try {
    const raw = await callClaude('You are a direct response marketing analyst. Return only valid JSON.', analysisPrompt, 2048);
    patterns = parseJsonFromText(raw);
  } catch(e) {
    patterns = loadDefaults().competitors?.patterns || {};
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const result  = {
    source:    fbToken ? 'meta_ad_library' : 'curated_intelligence',
    generated: new Date().toISOString(),
    ad_count:  rawAds.length,
    ads:       rawAds.slice(0, 40),
    patterns,
  };

  saveIntelligence(`competitors-${dateStr}.json`, result);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// THING 4 — PAIN POINT RESEARCH AGENT
// ═══════════════════════════════════════════════════════════════════════════════

async function doPainPointResearch() {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  let rawResearch = null;

  if (perplexityKey) {
    try {
      const queries = [
        'What exact phrases are women using on Reddit r/loseit r/menopause r/fitness when talking about belly fat, cortisol weight gain, and postpartum belly this week? Give me verbatim quotes.',
        'What are women on YouTube and TikTok comments saying about at-home workouts, menopause weight, bad knees workouts, and mom pouch in 2026? Give me exact language they use.',
      ];

      const results = [];
      for (const q of queries) {
        const r = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${perplexityKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: q }], max_tokens: 1000 }),
        });
        if (!r.ok) continue;
        const d = await r.json();
        results.push(d.choices?.[0]?.message?.content || '');
      }
      rawResearch = results.join('\n\n');
    } catch(e) { console.warn('Perplexity error:', e.message); }
  }

  // Use Claude (either to process Perplexity results or generate from training)
  const IH_OFFER_CONTEXT = `
INFINITY HOOP OFFER — NEVER CHANGES:
- $100 OFF the hoop
- FREE Infinity Sweat Belt (valued at $29.99)
- FREE Infinity Toning Cream (valued at $29.99)
- FREE Infinity Detox Tea (valued at $29.99)
- Total savings: $189.97
The offer NEVER changes. Do not suggest different discount amounts or different free gifts.
The only variables are: headline hook, copy angle, audience pain point, urgency framing.`;

  const claudePrompt = rawResearch
    ? `Based on this fresh social media research, extract the most important pain point phrases and patterns for Infinity Hoop ad targeting:\n\n${rawResearch}\n\n${IH_OFFER_CONTEXT}\n\nReturn as JSON with segments array. Each segment's headline_options should reference the $100 OFF + 3 FREE GIFTS offer framing, not invent new offer amounts.`
    : `You are a consumer research analyst specializing in women's fitness and weight loss. Generate the exact language real women use when talking about these problems on Reddit, YouTube, Facebook, and TikTok right now: FUPA, mommy pouch, belly fat, menopause weight gain, no time to work out, bad knees.

${IH_OFFER_CONTEXT}

For each pain point provide: 10 exact phrases women use, core emotional frustration, what they've tried, what they wish existed, and 5 headline options in their exact language that pair with the $100 OFF + 3 FREE GIFTS offer.

Return as JSON: { "segments": [ { "pain_point": string, "audience": string, "exact_phrases": [], "emotional_core": string, "already_tried": [], "wish_existed": string, "headline_options": [] } ] }`;

  let segments;
  try {
    const raw = await callClaude(
      'You are a consumer research analyst. Return only valid JSON. No markdown.',
      claudePrompt, 3000
    );
    const parsed = parseJsonFromText(raw);
    segments = parsed.segments || parsed;
  } catch(e) {
    segments = loadDefaults().pain_points?.segments || [];
  }

  const result = {
    source:    perplexityKey ? 'perplexity_live' : 'claude_synthesized',
    generated: new Date().toISOString(),
    segments:  Array.isArray(segments) ? segments : [],
  };

  saveIntelligence('pain-points.json', result);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// THING 5 — WINNER ANALYSIS AGENT
// ═══════════════════════════════════════════════════════════════════════════════

async function analyzeWinnerImages(imageDataUris) {
  const analyses = [];

  for (const uri of imageDataUris.slice(0, 50)) {
    try {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error('No API key');

      const base64 = uri.includes(',') ? uri.split(',')[1] : uri;
      const mediaType = uri.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 },
              },
              {
                type: 'text',
                text: `Analyze this Infinity Hoop static ad. Return ONLY valid JSON with these fields:
{
  "headline_text": string,
  "body_copy": string,
  "background_color_hex": "#hex",
  "accent_color_hex": "#hex",
  "emotional_trigger": string,
  "pain_point_targeted": string,
  "scroll_stop_element": string,
  "conversion_factor": string,
  "offer_framing": "how the $100 OFF + 3 FREE GIFTS offer is shown visually",
  "suggested_layout": "ih-bundle | editorial | seasonal | lifestyle-bundle",
  "lifestyle_dna": {
    "background_type": "solid | gradient",
    "background_colors": { "primary": "#hex", "secondary": "#hex" },
    "headline_position": "top | center",
    "headline_style": "big_bold | mixed_weight | quote_style",
    "product_arrangement": "hero_center | natural_scene | split | card",
    "decorative_elements": "confetti | stars | ribbons | none",
    "social_proof_position": "top | bottom | none"
  }
}

For suggested_layout, pick:
- "ih-bundle": white/lavender bg, products inside card boxes, classic grid layout
- "editorial": giant bold headline dominates, products arranged left/right with arrow labels
- "seasonal": radial/circular layout, benefit callouts around the hoop
- "lifestyle-bundle": products float naturally with NO card borders, lifestyle or gradient scene, products arranged organically

Only populate lifestyle_dna when suggested_layout is "lifestyle-bundle"; for others set it to null.
NOTE: The IH offer is always $100 OFF + 3 FREE GIFTS ($189.97 total savings) — only describe how it is framed visually.`,
              },
            ],
          }],
        }),
      });

      if (!r.ok) continue;
      const d = await r.json();
      const text = d.content?.[0]?.text || '';
      try { analyses.push(parseJsonFromText(text)); } catch(e) {}
    } catch(e) { console.warn('Winner analysis error:', e.message); }
  }

  // Aggregate into DNA
  const dnaPrompt = `You analyzed ${analyses.length} winning Infinity Hoop static ads. Here are the individual analyses:
${JSON.stringify(analyses, null, 2)}

IMPORTANT — The Infinity Hoop offer NEVER changes:
$100 OFF the hoop + FREE Infinity Sweat Belt ($29.99) + FREE Infinity Toning Cream ($29.99) + FREE Infinity Detox Tea ($29.99) = $189.97 total savings.
When listing winning_offers, document only how this fixed offer is FRAMED visually — not different amounts.

Synthesize these into the Infinity Hoop creative DNA. Find what REPEATS across the winners. Return ONLY valid JSON:
{
  "winning_headline_patterns": ["top 10 patterns with examples"],
  "winning_color_combos": [{ "bg": "#hex", "accent": "#hex", "frequency": "high/medium" }],
  "winning_offers": [{ "offer": "$100 OFF + 3 FREE GIFTS", "framing": string, "note": string }],
  "winning_layouts": [{ "name": string, "description": string }],
  "pain_points_addressed": ["list"],
  "emotional_triggers": ["list"],
  "scroll_stop_elements": ["list"],
  "what_never_to_do": ["list of patterns that don't appear — what IH avoids"],
  "layout_routing": {
    "ih-bundle":        number,
    "editorial":        number,
    "seasonal":         number,
    "lifestyle-bundle": number
  },
  "recommended_layout": "ih-bundle | editorial | seasonal | lifestyle-bundle",
  "lifestyle_bundle_dna": {
    "background_type": "solid | gradient",
    "background_colors": { "primary": "#hex", "secondary": "#hex" },
    "headline_position": "top | center",
    "headline_style": "big_bold | mixed_weight | quote_style",
    "product_arrangement": "hero_center | natural_scene | split | card",
    "decorative_elements": "confetti | stars | ribbons | none",
    "social_proof_position": "top | bottom | none"
  }
}

For layout_routing: count how many of the analyzed ads map to each layout type.
For lifestyle_bundle_dna: use the most common values across all lifestyle-bundle winners, or best-guess from the full set if none were lifestyle-bundle.`;

  let dna;
  try {
    const raw = await callClaude('You are a creative strategist. Return only valid JSON.', dnaPrompt, 2000);
    dna = parseJsonFromText(raw);
  } catch(e) {
    dna = loadDefaults().ih_winner_dna || {};
  }

  const result = { source: 'winner_analysis', generated: new Date().toISOString(), ad_count: analyses.length, individual_analyses: analyses, dna };
  saveIntelligence('ih-winner-dna.json', result);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HIGGSFIELD BACKGROUND GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

async function generateHiggsfieldBackground(prompt) {
  const apiKey = process.env.HIGGSFIELD_API_KEY;
  if (!apiKey) return null;

  try {
    // Upload prompt and generate image
    const r = await fetch('https://api.higgsfield.ai/v1/generation', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, width: 1080, height: 1350, num_images: 1 }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const imageUrl = d.images?.[0]?.url || d.output?.[0] || null;
    if (!imageUrl) return null;

    // Fetch the image and return as data URI
    const imgR = await fetch(imageUrl);
    if (!imgR.ok) return null;
    const buf  = await imgR.buffer();
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch(e) {
    console.warn('Higgsfield error:', e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// THING 6 — CREATIVE GENERATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

async function runGenerationPipeline({ count = 5, painPoint = null, specificRequest = null }) {
  const intel = loadIntelligence();

  // Build Claude prompt
  const systemPrompt = `You are the Creative Director for Infinity Hoop, a leading weighted fitness hula hoop brand.
You have three intelligence reports: competitor ads winning on Meta right now, Infinity Hoop's own winner DNA patterns, and real pain point language from the target audience.
Create ${count} brand new original Infinity Hoop static ad concepts. These are NOT variations or copies — they are new originals built from proven market intelligence.

THE OFFER NEVER CHANGES. It is always and only:
- $100 OFF the hoop
- FREE Infinity Sweat Belt (valued at $29.99)
- FREE Infinity Toning Cream (valued at $29.99)
- FREE Infinity Detox Tea (valued at $29.99)
- Total savings: $189.97
Do not create different offer amounts, different discounts, or different gift items.
The only variables per variation are: headline hook, copy angle, audience pain point, background color, hoop color, urgency framing, and layout structure.

Each static must:
- Target one specific pain point using the audience's exact language
- Apply the most effective patterns from the intelligence reports
- Include the full product bundle (hoop + belt + cream + detox tea)
- Have one dominant scroll-stopping headline (max 25 chars, NO emoji)
- Reference the $100 OFF + 3 FREE GIFTS offer with urgency framing
- Drive to one action — claim the bundle now
- Use colors proven to work in this market

Available layouts: ih-bundle (960×1220, classic bundle with gift cards), editorial (1080×1350, large headline + split products), seasonal (1080×1350, hoop center + benefit circles), lifestyle-bundle (1080×1350, products placed naturally with no card borders — driven by dna object)
Available background colors: #F5E4F2 (lavender-best), #FFFFFF (white), #000000 (black), #FFF5E6 (warm cream)
Available accent/badge colors: #FF2D87 (hot pink-best), #FF2D55 (red-pink), #CC1111 (red), #111111 (black)
Available hoop colors: pink, blue, teal, green, black, magenta — vary these across variations.

RETURN ONLY A VALID JSON ARRAY. No markdown, no explanation, just the array.`;

  const userPrompt = specificRequest
    ? `Create 1 static ad concept for this specific request: "${specificRequest}". Return as JSON array with 1 object using the schema below.`
    : `Intelligence Reports:
COMPETITORS: ${JSON.stringify(intel.competitors?.patterns || intel.competitors, null, 2).slice(0, 2000)}

PAIN POINTS: ${JSON.stringify((intel.pain_points?.segments || []).slice(0, painPoint ? 1 : 3), null, 2).slice(0, 2000)}

IH WINNER DNA: ${JSON.stringify(intel.ih_winner_dna, null, 2).slice(0, 1500)}

Create ${count} static ad concepts${painPoint ? ` focused on pain point: ${painPoint}` : ''}. Each object must have:
{
  "id": number,
  "pain_point": string,
  "audience": string,
  "layout": "ih-bundle"|"editorial"|"seasonal",
  "text": {
    "badge": string (max 35 chars, NO emoji — must reference $100 OFF or 3 FREE GIFTS or $189.97 savings),
    "headline": string (max 25 chars, NO emoji — the pain point hook, NOT the offer),
    "subheadline": string (optional),
    "cta": string (max 28 chars, NO emoji),
    "body": string (for seasonal: newline-separated benefits)
  },
  "colors": {
    "background": "#hex",
    "badge_bg": "#hex",
    "headline": "#hex",
    "hoop_color": "pink"|"blue"|"teal"|"green"|"black"|"magenta"
  },
  "emotional_trigger": string,
  "scroll_stop_element": string,
  "inspired_by": string,
  "higgsfield_background_prompt": string (describe a photo background: woman, setting, mood — for lifestyle overlay)
}

Do NOT include an "offer" field — the offer is hardcoded server-side as $100 OFF + 3 FREE GIFTS ($189.97 savings) and must not vary.

When layout is "lifestyle-bundle", also include a "dna" object:
{
  "background_type": "solid | gradient",
  "background_colors": { "primary": "#hex", "secondary": "#hex" },
  "headline_position": "top | center",
  "headline_style": "big_bold | mixed_weight | quote_style",
  "product_arrangement": "hero_center | natural_scene | split | card",
  "decorative_elements": "confetti | stars | ribbons | none",
  "social_proof_position": "top | bottom | none"
}
For other layouts, omit the dna field entirely.`;


  let briefs = [];
  try {
    const raw = await callClaude(systemPrompt, userPrompt, 5000);
    briefs = parseJsonFromText(raw);
    if (!Array.isArray(briefs)) briefs = [briefs];
  } catch(e) {
    throw new Error(`Brief generation failed: ${e.message}`);
  }

  // Build each ad with retries and quality control
  const results = [];
  const CONCURRENCY = 3;

  for (let i = 0; i < briefs.length; i += CONCURRENCY) {
    const chunk = briefs.slice(i, i + CONCURRENCY);
    const built = await Promise.all(
      chunk.map(async (brief, idx) => {
        const globalIdx = i + idx;
        let lastError = null;

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            // Optionally get Higgsfield background
            let background = null;
            if (brief.higgsfield_background_prompt && attempt === 0) {
              background = await generateHiggsfieldBackground(brief.higgsfield_background_prompt);
            }

            // Build products from static defaults
            const products = {};
            Object.entries(DEFAULT_PRODUCTS).forEach(([k, p]) => {
              if (fs.existsSync(p)) products[k] = p;
            });

            const normalizedColors = {
              background: brief.colors?.background || '#F5E4F2',
              headline:   brief.colors?.headline   || '#111111',
              badge_bg:   brief.colors?.badge_bg   || '#FF2D87',
              badge_text: '#FFFFFF',
              cta_bg:     brief.colors?.badge_bg   || '#FF2D87',
              cta_text:   '#FFFFFF',
              ...brief.colors,
            };

            const extraProducts = background ? { background } : {};

            const pngBuffer = await composite({
              layout:   brief.layout || 'ih-bundle',
              products: { ...products, ...extraProducts },
              text:     brief.text   || {},
              colors:   normalizedColors,
              dna:      brief.dna    || null,
            });

            // Thing 7: Quality check
            const qc = await qualityCheck(pngBuffer, brief);

            const b64 = pngBuffer.toString('base64');
            return {
              index:            globalIdx + 1,
              layout:           brief.layout,
              headline:         brief.text?.headline || '',
              audience:         brief.audience,
              pain_point:       brief.pain_point,
              emotional_trigger: brief.emotional_trigger,
              scroll_stop:      brief.scroll_stop_element,
              inspired_by:      brief.inspired_by,
              text:             brief.text,
              colors:           brief.colors,
              quality:          qc,
              attempts:         attempt + 1,
              image_b64:        b64,
              image_data_uri:   `data:image/png;base64,${b64}`,
            };
          } catch(e) {
            lastError = e;
            console.warn(`Brief ${globalIdx+1} attempt ${attempt+1} failed:`, e.message);
          }
        }

        return { index: globalIdx + 1, error: lastError?.message, brief };
      })
    );
    results.push(...built);
  }

  return {
    generated_at:    new Date().toISOString(),
    count_requested: briefs.length,
    count_succeeded: results.filter(r => !r.error).length,
    count_failed:    results.filter(r => r.error).length,
    quality_summary: (() => {
      const withQC  = results.filter(r => r.quality);
      const scores  = withQC.map(r => r.quality.score || 0);
      return {
        passed:    results.filter(r => r.quality?.passed).length,
        partial:   results.filter(r => r.quality?.finalStatus === 'partial').length,
        failed:    results.filter(r => r.quality?.finalStatus === 'failed' || r.error).length,
        avg_score: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      };
    })(),
    ads:    results.filter(r => !r.error),
    errors: results.filter(r => r.error),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GOOGLE DRIVE UPLOAD
// ═══════════════════════════════════════════════════════════════════════════════

async function uploadToDrive(ads, dateStr) {
  const credsJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!credsJson) { console.log('[DRIVE] No GOOGLE_SERVICE_ACCOUNT_KEY — skipping'); return null; }

  try {
    const { google }  = require('googleapis');
    const creds       = JSON.parse(credsJson);
    const auth        = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive'] });
    const drive       = google.drive({ version: 'v3', auth });
    const parentId    = process.env.GOOGLE_DRIVE_FOLDER_ID || null;
    const { Readable } = require('stream');

    // Create dated folder
    const folderRes = await drive.files.create({
      requestBody: {
        name:     dateStr,
        mimeType: 'application/vnd.google-apps.folder',
        parents:  parentId ? [parentId] : [],
      },
      fields: 'id, webViewLink',
    });
    const folderId  = folderRes.data.id;
    const folderUrl = folderRes.data.webViewLink;

    // Upload each ad
    for (let i = 0; i < ads.length; i++) {
      const ad  = ads[i];
      const buf = Buffer.from(ad.image_b64, 'base64');
      await drive.files.create({
        requestBody: { name: `IH-${dateStr}-${String(i+1).padStart(2,'0')}-${ad.layout}-${(ad.pain_point||'').replace(/[^a-z]/gi,'_')}.png`, parents: [folderId] },
        media:       { mimeType: 'image/png', body: Readable.from(buf) },
      });
    }

    console.log(`[DRIVE] Uploaded ${ads.length} ads to ${folderUrl}`);
    return folderUrl;
  } catch(e) {
    console.error('[DRIVE] Error:', e.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// REST ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /health
app.get('/health', (req, res) => {
  const staticAssets = Object.entries(DEFAULT_PRODUCTS).reduce((a, [k, p]) => { a[k] = fs.existsSync(p); return a; }, {});
  const intelFiles   = { competitors: false, pain_points: false, winner_dna: false };
  try {
    intelFiles.competitors = fs.readdirSync(INTEL_DIR).some(f => f.startsWith('competitors-'));
    intelFiles.pain_points = fs.existsSync(path.join(INTEL_DIR, 'pain-points.json'));
    intelFiles.winner_dna  = fs.existsSync(path.join(INTEL_DIR, 'ih-winner-dna.json'));
  } catch(e) {}

  res.json({
    status: 'ok', version: '5.0.0',
    static_assets: staticAssets,
    intelligence: intelFiles,
    api_keys: {
      anthropic:  !!process.env.ANTHROPIC_API_KEY,
      perplexity: !!process.env.PERPLEXITY_API_KEY,
      removebg:   !!process.env.REMOVEBG_API_KEY,
      higgsfield: !!process.env.HIGGSFIELD_API_KEY,
    },
  });
});

// GET /layouts
app.get('/layouts', (req, res) => res.json({ layouts: getLayouts() }));

// GET /static/logo.png — serves src/assets/logo.png (falls through to express.static otherwise)
app.get('/static/logo.png', (req, res) => {
  const logoPath = path.join(__dirname, 'assets/logo.png');
  if (!fs.existsSync(logoPath)) return res.status(404).json({ error: 'Logo not uploaded yet. POST a PNG to src/assets/logo.png on the server.' });
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(logoPath).pipe(res);
});

// POST /composite (legacy)
app.post('/composite', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') return res.status(400).json({ error: 'Body must be JSON object' });
    const pngBuffer = await composite(req.body);
    res.setHeader('Content-Type', 'image/png');
    res.send(pngBuffer);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /composite-from-winner (legacy)
app.post('/composite-from-winner', async (req, res) => {
  try {
    const { winner_image, variation_type = null, products = {}, assets = {}, text = {}, colors = {}, variation_id = 1 } = req.body || {};
    const nc = { background: colors.bg||colors.background||'#FFFFFF', headline: colors.headline||'#111111', badge_bg: colors.accent||colors.cta_bg||'#FF2D55', badge_text:'#FFFFFF', cta_bg: colors.accent||colors.cta_bg||'#FF2D55', cta_text: colors.cta_text||'#FFFFFF', ...colors };
    const nt = { ...text }; if (nt.offer && !nt.badge) nt.badge = nt.offer;
    const pngBuffer = await composite({ layout:'winner-clone', winner_image, variation_type, products, assets, text:nt, colors:nc, variation_id });
    res.setHeader('Content-Type', 'image/png');
    res.send(pngBuffer);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /analyze-winner (single image, legacy)
app.post('/analyze-winner', async (req, res) => {
  try {
    const { winner_image } = req.body || {};
    if (!winner_image) return res.status(400).json({ error: 'winner_image required' });
    const { loadImageBuffer } = require('./utils/imageLoader');
    const { analyzeWinner }   = require('./utils/imageAnalyzer');
    const buf = await loadImageBuffer(winner_image);
    const analysis = await analyzeWinner(buf);
    res.json({ estimated_layout: analysis.estimated_layout, dominant_colors: analysis.dominant_colors, layout_zones: analysis.layout_zones });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /composite-batch
app.post('/composite-batch', async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Body must be array' });
    if (!items.length) return res.status(400).json({ error: 'Empty batch' });
    if (items.length > MAX_BATCH_SIZE) return res.status(400).json({ error: `Max ${MAX_BATCH_SIZE}` });

    const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const results = [];
    for (let i = 0; i < items.length; i += 5) {
      const chunk = items.slice(i, i+5);
      const cr = await Promise.all(chunk.map(async (item, idx) => {
        try { const buf = await composite(item.winner_image ? {...item,layout:'winner-clone'} : item); return {success:true,buf,item,idx:i+idx}; }
        catch(e) { return {success:false,error:e.message,item,idx:i+idx}; }
      }));
      results.push(...cr);
    }

    const zip = new JSZip();
    results.forEach(({success,buf,item,idx,error}) => {
      const fname = `IH-${dateStr}-${String(idx+1).padStart(2,'0')}-${item.layout||'batch'}.png`;
      if (success) zip.file(fname, buf); else zip.file(fname.replace('.png','_ERROR.txt'), error);
    });
    const zipBuf = await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
    res.setHeader('Content-Type','application/zip');
    res.setHeader('Content-Disposition',`attachment; filename="IH-${dateStr}-batch.zip"`);
    res.send(zipBuf);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /build-ad — single ad with auto product defaults + quality report
app.post('/build-ad', async (req, res) => {
  try {
    const { layout = 'ih-bundle', text = {}, colors = {}, productUrls = {} } = req.body || {};

    const products = {};
    ['hoop','belt','cream','tea'].forEach(k => {
      const url = productUrls[k];
      const def = DEFAULT_PRODUCTS[k === 'tea' ? 'tea' : k];
      if (url)                    products[k] = url;
      else if (fs.existsSync(def)) products[k] = def;
    });

    const nc = { background: colors.background||colors.bg||'#FFFFFF', headline: colors.headline||'#111111', badge_bg: colors.badge_bg||colors.accent||'#FF2D87', badge_text: '#FFFFFF', cta_bg: colors.cta_bg||colors.accent||'#FF2D87', cta_text: '#FFFFFF', ...colors };

    const pngBuffer = await composite({ layout, products, text, colors: nc });
    const qc = await qualityCheck(pngBuffer, { layout, text, colors: nc });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('X-Quality-Score',  qc.score);
    res.setHeader('X-Quality-Status', qc.finalStatus);
    res.setHeader('X-Quality-Checks', JSON.stringify(qc.checks));
    res.send(pngBuffer);
  } catch(err) {
    console.error('Build-ad error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /test-ad
app.get('/test-ad', async (req, res) => {
  try {
    const products = {};
    Object.entries(DEFAULT_PRODUCTS).forEach(([k, p]) => { if (fs.existsSync(p)) products[k] = p; });
    const pngBuffer = await composite({ layout: 'ih-bundle', products, text: { badge: 'BIRTHDAY SALE — FINAL HOURS', headline: '70% OFF', cta: 'CLAIM YOUR BUNDLE NOW' }, colors: { background: '#F5E4F2', badge_bg: '#FF2D87', cta_bg: '#FF2D87' } });
    res.setHeader('Content-Type', 'image/png');
    res.send(pngBuffer);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// POST /research-competitors (Thing 3)
app.post('/research-competitors', async (req, res) => {
  try {
    console.log('[RESEARCH] Starting competitor research...');
    const result = await doCompetitorResearch();
    console.log(`[RESEARCH] Competitor research done — ${result.ad_count} ads analyzed`);
    res.json({ success: true, ad_count: result.ad_count, source: result.source, competitors: { ads: result.ads, patterns: result.patterns }, file: `competitors-${result.generated.slice(0,10)}.json` });
  } catch(err) {
    console.error('Competitor research error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /research-pain-points (Thing 4)
app.post('/research-pain-points', async (req, res) => {
  try {
    console.log('[RESEARCH] Starting pain point research...');
    const result = await doPainPointResearch();
    console.log(`[RESEARCH] Pain point research done — ${result.segments.length} segments`);
    res.json({ success: true, source: result.source, segment_count: result.segments.length, pain_points: { segments: result.segments } });
  } catch(err) {
    console.error('Pain point research error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /analyze-winners (Thing 5) — multi-image winner analysis
app.post('/analyze-winners', async (req, res) => {
  try {
    const { images = [] } = req.body || {};
    if (!images.length) return res.status(400).json({ error: 'images array required' });
    console.log(`[WINNERS] Analyzing ${images.length} winner ads...`);
    const result = await analyzeWinnerImages(images);
    console.log(`[WINNERS] Analysis done — DNA extracted from ${result.ad_count} ads`);
    res.json({ success: true, ad_count: result.ad_count, ih_winner_dna: result.dna, file: 'ih-winner-dna.json' });
  } catch(err) {
    console.error('Analyze winners error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /generate-statics (Thing 6) — main generation engine
app.post('/generate-statics', async (req, res) => {
  try {
    const { count = 5, pain_point = null, specific_request = null } = req.body || {};
    console.log(`[GENERATE] Starting generation: count=${count}, pain_point=${pain_point}`);
    const result = await runGenerationPipeline({ count, painPoint: pain_point, specificRequest: specific_request });
    console.log(`[GENERATE] Done: ${result.count_succeeded}/${result.count_requested} succeeded`);
    res.json(result);
  } catch(err) {
    console.error('Generate statics error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /generate-now — on-demand immediate generation (Thing 8)
app.post('/generate-now', async (req, res) => {
  try {
    const { count = 5, pain_point = null, specific_request = null } = req.body || {};
    console.log(`[GENERATE-NOW] count=${count}, request="${specific_request}"`);
    const result = await runGenerationPipeline({ count, painPoint: pain_point, specificRequest: specific_request });
    res.json(result);
  } catch(err) {
    console.error('Generate-now error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /gather-intelligence (legacy compatibility)
app.post('/gather-intelligence', async (req, res) => {
  const intel = loadIntelligence();
  res.json({ generated_at: new Date().toISOString(), competitors: intel.competitors, pain_points: intel.pain_points, winner_patterns: intel.ih_winner_dna });
});

// POST /create-statics (legacy compatibility)
app.post('/create-statics', async (req, res) => {
  try {
    const { count = 5, custom_brief = null } = req.body || {};
    const result = await runGenerationPipeline({ count, specificRequest: custom_brief });
    res.json(result);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// GET /intelligence-summary — for the app dashboard
app.get('/intelligence-summary', (req, res) => {
  const intel = loadIntelligence();
  res.json({
    competitors: {
      source:    intel.competitors?.source,
      updated:   intel.competitors?.generated || intel.competitors?.updated,
      ad_count:  intel.competitors?.ad_count || intel.competitors?.ads?.length || 0,
      ads:       (intel.competitors?.ads || []).slice(0, 10),
      patterns:  intel.competitors?.patterns || {},
    },
    pain_points: {
      source:         intel.pain_points?.source,
      updated:        intel.pain_points?.generated || intel.pain_points?.updated,
      segment_count:  intel.pain_points?.segments?.length || 0,
      segments:       intel.pain_points?.segments || [],
    },
    ih_winner_dna: {
      source:          intel.ih_winner_dna?.source,
      updated:         intel.ih_winner_dna?.generated,
      ad_count:        intel.ih_winner_dna?.ad_count || 0,
      winning_headlines: intel.ih_winner_dna?.winning_headline_patterns?.slice(0, 8) || intel.ih_winner_dna?.winning_headlines?.slice(0, 8) || [],
      winning_offers:  intel.ih_winner_dna?.winning_offers || [],
      emotional_angles: intel.ih_winner_dna?.emotional_angles || [],
      scroll_stop_elements: intel.ih_winner_dna?.scroll_stop_elements || [],
    },
  });
});

// GET /cron-status
let lastCronRun = null, lastCronResult = null;
app.get('/cron-status', (req, res) => res.json({ last_run: lastCronRun, last_result: lastCronResult, next_run: 'Daily at 7:00 AM PT', schedule: '0 7 * * *' }));

// ═══════════════════════════════════════════════════════════════════════════════
// THING 8 — DAILY CRON
// ═══════════════════════════════════════════════════════════════════════════════

async function runDailyGeneration() {
  const dateStr = new Date().toISOString().slice(0, 10);
  console.log(`[CRON] Daily generation starting for ${dateStr}...`);
  lastCronRun = new Date().toISOString();

  try {
    // Step 1: Research competitors
    console.log('[CRON] Step 1: Competitor research...');
    await doCompetitorResearch();

    // Step 2: Research pain points
    console.log('[CRON] Step 2: Pain point research...');
    await doPainPointResearch();

    // Step 3: Generate 25 statics
    console.log('[CRON] Step 3: Generating 25 statics...');
    const result = await runGenerationPipeline({ count: 25 });
    console.log(`[CRON] Generated ${result.count_succeeded} ads`);

    // Step 4: Upload to Google Drive
    const driveFolder = await uploadToDrive(result.ads, dateStr);

    lastCronResult = {
      date:        dateStr,
      ads_built:   result.count_succeeded,
      quality_summary: result.quality_summary,
      drive_folder: driveFolder,
    };

    console.log(`[CRON] Done. Drive: ${driveFolder || 'not configured'}`);
  } catch(e) {
    console.error('[CRON] Error:', e.message);
    lastCronResult = { date: dateStr, error: e.message };
  }
}

// Run at 7:00 AM PT daily
cron.schedule('0 7 * * *', runDailyGeneration, { timezone: 'America/Los_Angeles' });

// ── Trends (legacy) ───────────────────────────────────────────────────────────
app.get('/trends', async (req, res) => {
  const intel = loadIntelligence();
  res.json({
    source:                'curated-intelligence',
    winning_hooks:         intel.ih_winner_dna?.winning_headlines || [],
    pain_points:           intel.pain_points?.segments?.map(s => s.pain_point) || [],
    competitor_patterns:   intel.competitors?.patterns || {},
  });
});

// ─────────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const staticStatus = Object.entries(DEFAULT_PRODUCTS).map(([k,p]) => `${k}:${fs.existsSync(p)?'✓':'✗'}`).join(' ');
  console.log(`IH Compositor v5.0.0 running on port ${PORT}`);
  console.log(`Static products: ${staticStatus}`);
  const intelFiles = fs.readdirSync(INTEL_DIR).filter(f => f.endsWith('.json'));
  console.log(`Intelligence files: ${intelFiles.length > 0 ? intelFiles.join(', ') : 'none (using defaults)'}`);
});

module.exports = app;
