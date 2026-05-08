const express = require('express');
const JSZip   = require('jszip');
const { composite, getLayouts } = require('./compositor');

const app           = express();
const PORT          = process.env.PORT || 3000;
const MAX_BATCH_SIZE = parseInt(process.env.MAX_BATCH_SIZE || '25', 10);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '100mb' }));

// ── GET /health ───────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '3.0.0' });
});

// ── GET /layouts ──────────────────────────────────────────────────────────────
app.get('/layouts', (req, res) => {
  res.json({ layouts: getLayouts() });
});

// ── POST /composite ───────────────────────────────────────────────────────────
// Body: { layout, products, text, colors, assets, background, variation_id, variation_type }
app.post('/composite', async (req, res) => {
  try {
    const params = req.body;
    if (!params || typeof params !== 'object') {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }
    const pngBuffer = await composite(params);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="composite_${params.variation_id || 1}.png"`);
    res.send(pngBuffer);
  } catch (err) {
    console.error('Composite error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /composite-from-winner ───────────────────────────────────────────────
// Accepts a winning ad image, detects its layout, and produces a variation.
// variation_type: background_swap | hoop_swap | before_after | problem_target | offer_variation
app.post('/composite-from-winner', async (req, res) => {
  try {
    const {
      winner_image,
      variation_type = null,
      products  = {},
      assets    = {},
      text      = {},
      colors    = {},
      variation_id = 1,
    } = req.body || {};

    if (!winner_image && !assets.lifestyle && !assets.model && variation_type !== 'before_after') {
      return res.status(400).json({
        error: 'Provide winner_image (base64) or at least one asset (lifestyle/model), or set variation_type to before_after',
      });
    }

    const normalizedColors = {
      background: colors.bg || colors.background || '#FFFFFF',
      headline:   colors.headline || '#111111',
      badge_bg:   colors.accent   || colors.cta_bg || '#FF2D55',
      badge_text: '#FFFFFF',
      cta_bg:     colors.accent   || colors.cta_bg || '#FF2D55',
      cta_text:   colors.cta_text || '#FFFFFF',
      ...colors,
    };

    const normalizedText = { ...text };
    if (normalizedText.offer && !normalizedText.badge) {
      normalizedText.badge = normalizedText.offer;
    }

    const pngBuffer = await composite({
      layout:         'winner-clone',
      winner_image,
      variation_type,
      products,
      assets,
      text:           normalizedText,
      colors:         normalizedColors,
      variation_id,
    });

    const typeLabel = variation_type ? `_${variation_type}` : '';
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="winner_v${variation_id}${typeLabel}.png"`);
    res.send(pngBuffer);
  } catch (err) {
    console.error('Winner clone error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /analyze-winner ──────────────────────────────────────────────────────
// Accepts a winner ad image and returns layout zones, dominant colors, estimated template.
app.post('/analyze-winner', async (req, res) => {
  try {
    const { winner_image } = req.body || {};
    if (!winner_image) {
      return res.status(400).json({ error: 'winner_image (base64) required' });
    }

    const { loadImageBuffer }                                           = require('./utils/imageLoader');
    const { analyzeWinner, selectTemplate, estimateLayoutZones }        = require('./utils/imageAnalyzer');

    const buf       = await loadImageBuffer(winner_image);
    const analysis  = await analyzeWinner(buf);
    const estimated_layout = analysis.estimated_layout;

    res.json({
      estimated_layout,
      aspect_ratio:    analysis.aspect_ratio,
      is_dark:         analysis.isDark,
      is_high_contrast: analysis.isHighContrast,
      dominant_colors: analysis.dominant_colors,
      layout_zones:    analysis.layout_zones,
      contrast: {
        left_right:  Math.round(analysis.leftRightContrast),
        top_bottom:  Math.round(analysis.topBottomContrast),
        left_darker: analysis.leftDarker,
      },
      recommended_variation_types: [
        'background_swap',
        'hoop_swap',
        'before_after',
        'problem_target',
        'offer_variation',
      ],
    });
  } catch (err) {
    console.error('Analyze winner error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /composite-batch ─────────────────────────────────────────────────────
// Array of up to 25 composite requests. Each item may include variation_type.
// Returns a ZIP with files named: IH-[date]-[id]-[layout]-[type].png
app.post('/composite-batch', async (req, res) => {
  try {
    const items = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Request body must be an array' });
    }
    if (items.length === 0) {
      return res.status(400).json({ error: 'Batch must have at least 1 item' });
    }
    if (items.length > MAX_BATCH_SIZE) {
      return res.status(400).json({ error: `Batch size ${items.length} exceeds max ${MAX_BATCH_SIZE}` });
    }

    const CONCURRENCY = 5;
    const results     = [];
    const dateStr     = new Date().toISOString().slice(0,10).replace(/-/g,'');

    for (let i = 0; i < items.length; i += CONCURRENCY) {
      const chunk = items.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async (item, idx) => {
          const globalIdx = i + idx;
          const params = item.winner_image
            ? { ...item, layout: 'winner-clone' }
            : item;
          try {
            const buf = await composite(params);
            return { success: true, buf, item, idx: globalIdx };
          } catch (err) {
            return { success: false, error: err.message, item, idx: globalIdx };
          }
        })
      );
      results.push(...chunkResults);
    }

    const zip = new JSZip();
    results.forEach(({ success, buf, item, idx, error }) => {
      const varId    = item.variation_id || idx + 1;
      const layout   = item.winner_image ? 'winner-clone' : (item.layout || 'ih-bundle');
      const typeStr  = item.variation_type ? `-${item.variation_type}` : '';
      const fname    = `IH-${dateStr}-${String(varId).padStart(2,'0')}-${layout}${typeStr}.png`;

      if (success) {
        zip.file(fname, buf);
      } else {
        zip.file(fname.replace('.png', '_ERROR.txt'), `Error generating variation ${varId}:\n${error}`);
      }
    });

    const zipBuffer    = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const successCount = results.filter(r => r.success).length;
    const errorCount   = results.filter(r => !r.success).length;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="IH-${dateStr}-batch.zip"`);
    res.setHeader('X-Success-Count', successCount);
    res.setHeader('X-Error-Count',   errorCount);
    res.send(zipBuffer);
  } catch (err) {
    console.error('Batch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /trends ───────────────────────────────────────────────────────────────
// ?keywords=belly+fat,hormonal+weight,menopause
app.get('/trends', async (req, res) => {
  const raw      = (req.query.keywords || 'weighted hoop,belly fat,weight loss,hormonal belly,menopause weight');
  const keywords = raw.split(',').map(k => k.trim()).filter(Boolean).slice(0, 5);

  const seasonal  = getSeasonalOpportunities();
  const insights  = getAudienceInsights();
  const hooks     = getWinningHooks();
  const angles    = buildCopyAngles(keywords.map(k => ({ keyword: k, score: 0 })));

  try {
    const googleTrends = require('google-trends-api');

    const interestRaw  = await googleTrends.interestOverTime({
      keyword:   keywords,
      startTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      geo:       'US',
    });

    const interestData = JSON.parse(interestRaw);
    const timeline     = (interestData.default?.timelineData || []).slice(-12);

    const scores = keywords.map((kw, i) => {
      const avg = timeline.length
        ? Math.round(timeline.reduce((sum, pt) => sum + (pt.value?.[i] || 0), 0) / timeline.length)
        : 0;
      return { keyword: kw, score: avg, trend: avg > 60 ? 'rising' : avg > 30 ? 'stable' : 'low' };
    });
    scores.sort((a, b) => b.score - a.score);

    let related_queries = [];
    try {
      const rqRaw  = await googleTrends.relatedQueries({ keyword: keywords[0], geo: 'US' });
      const rqData = JSON.parse(rqRaw);
      related_queries = (rqData.default?.rankedList?.[0]?.rankedKeyword || [])
        .slice(0, 8)
        .map(r => ({ query: r.query, value: r.value }));
    } catch (_) {}

    res.json({
      source:                'Google Trends (live)',
      geo:                   'US',
      period:                'last 90 days',
      trending_keywords:     scores,
      related_queries,
      winning_hooks:         hooks,
      seasonal_opportunities: seasonal,
      audience_insights:     insights,
      copy_angles:           buildCopyAngles(scores),
    });
  } catch (_err) {
    res.json({
      source:                'curated-intelligence',
      note:                  'Google Trends blocked server-side. Data below is curated from known DTC weight-loss market intelligence.',
      geo:                   'US',
      trending_keywords:     keywords.map(k => ({ keyword: k, score: null, trend: 'unknown' })),
      related_queries:       [],
      winning_hooks:         hooks,
      seasonal_opportunities: seasonal,
      audience_insights:     insights,
      copy_angles:           angles,
    });
  }
});

// ── Trends helpers ────────────────────────────────────────────────────────────

function getSeasonalOpportunities() {
  const now  = new Date();
  const year = now.getFullYear();

  const calendar = [
    { name: "New Year's Resolution",  month: 1,  day: 1,  window: 28, angle: "New year body — start today, see results by February" },
    { name: "Valentine's Day",        month: 2,  day: 14, window: 14, angle: "Look and feel amazing — for yourself and someone special" },
    { name: "Spring Reset",           month: 3,  day: 15, window: 30, angle: "Spring body prep — shed winter weight before April" },
    { name: "Mother's Day",           month: 5,  day: 11, window: 21, angle: "Gift the transformation — the hoop she actually wants" },
    { name: "Memorial Day Weekend",   month: 5,  day: 25, window: 14, angle: "Bikini season is 2 weeks away — start now" },
    { name: "Summer Kickoff",         month: 6,  day: 1,  window: 30, angle: "Summer body — 30 days is enough with the right tool" },
    { name: "4th of July",            month: 7,  day: 4,  window: 10, angle: "Confidence all summer long" },
    { name: "Back to School",         month: 8,  day: 20, window: 21, angle: "Fall reset — back to YOU, not just the kids" },
    { name: "Fall Transformation",    month: 9,  day: 5,  window: 30, angle: "Fall is the best time to start — results by the holidays" },
    { name: "Halloween",              month: 10, day: 31, window: 14, angle: "Look amazing in your costume — start this week" },
    { name: "Holiday Party Prep",     month: 11, day: 5,  window: 45, angle: "Holiday party confidence — the 6-week window starts now" },
    { name: "Black Friday",           month: 11, day: 28, window:  5, angle: "Biggest sale of the year — the gift that keeps giving" },
    { name: "Christmas Gift",         month: 12, day: 25, window: 18, angle: "The fitness gift she actually asked for" },
    { name: "New Year's Eve",         month: 12, day: 31, window:  8, angle: "End the year transformed — new you by January 1" },
  ];

  const upcoming = [];
  for (const ev of calendar) {
    const eventDate = new Date(year, ev.month - 1, ev.day);
    const daysAway  = Math.round((eventDate - now) / 86400000);
    if (daysAway >= -3 && daysAway <= ev.window + 14) {
      upcoming.push({
        event:     ev.name,
        days_away: daysAway,
        angle:     ev.angle,
        urgency:   daysAway <= 5 ? 'critical' : daysAway <= 14 ? 'high' : 'medium',
      });
    }
  }

  // If nothing is immediately upcoming, add the next 2 future events
  if (upcoming.length === 0) {
    for (const ev of calendar) {
      const tryYears = [year, year + 1];
      for (const y of tryYears) {
        const eventDate = new Date(y, ev.month - 1, ev.day);
        const daysAway  = Math.round((eventDate - now) / 86400000);
        if (daysAway > 0 && upcoming.length < 2) {
          upcoming.push({ event: ev.name, days_away: daysAway, angle: ev.angle, urgency: 'low' });
          break;
        }
      }
      if (upcoming.length >= 2) break;
    }
  }

  return upcoming.sort((a, b) => a.days_away - b.days_away).slice(0, 3);
}

function getWinningHooks() {
  return [
    { formula: '[Specific pain] + [specific body part] + [timeframe]',            example: '"Hormonal belly fat — gone in 30 days with this hoop"' },
    { formula: '[Social proof number] + [transformation]',                          example: '"500,000 women already slimmed their waist doing this 10 minutes a day"' },
    { formula: '[Objection reversal] + [product USP]',                             example: '"Bad knees? This is the one workout your joints can actually handle"' },
    { formula: '[Specific audience] + [permission to want this]',                  example: '"If you\'re a mom over 35 with cortisol belly — this was designed for you"' },
    { formula: '[Transformation story] + [specific timeframe]',                    example: '"From hiding my stomach to wearing crop tops — 28 days with Infinity Hoop"' },
    { formula: '[Comparison] + [result]',                                          example: '"I tried everything. The only thing that actually worked was this hoop"' },
  ];
}

function getAudienceInsights() {
  return [
    'Women 35-55 are the #1 buyer — they want joint-safe, low-impact solutions that feel fun not punishing',
    'Menopause & perimenopause weight searches are up 340% YoY — the cortisol/hormonal belly angle converts extremely well',
    'Mom audience converts best with "no time" + "can do it while watching TV" messaging',
    '"Bad knees" and "can\'t do high impact" is a major untapped pain angle — virtually no competition',
    'Before/after creatives with specific transformations (crop tops, jeans, wedding) outperform generic "weight loss" ads 3:1',
    'Postpartum/mom-pouch angle converts well for 28-40 demographic — pair with specific timeframe promise',
    'Free gifts (detox tea, sweat belt, toning cream) dramatically increase perceived value — emphasize $247 value',
    'Facebook/Instagram: women 35-65 with interests in weight loss, yoga, low-impact fitness, menopause',
  ];
}

function buildCopyAngles(scores) {
  const angleMap = {
    'belly fat':       ['Target belly specifically — "flatten your belly" not "lose weight"', 'Before/after stomach photos outperform all others'],
    'hormonal belly':  ['Address the root cause — hormones, cortisol, perimenopause', 'Permission-based: "this is not your fault — it\'s hormonal"'],
    'menopause weight':['Over-40 women audience exclusively', 'Lead with empathy: "your body changed — your workout needs to too"'],
    'weight loss':     ['General benefit — add specificity: lbs lost in X weeks', 'Numbers convert: "Lost 14 lbs in 28 days"'],
    'weighted hoop':   ['Product-specific USP — weighted, not just any hoop', 'Fun vs exercise framing — "I forgot I was working out"'],
    'hula hoop':       ['Nostalgia angle + modern science twist', 'Low impact, high results — knees/joints safe messaging'],
    'cortisol belly':  ['Stress-weight angle — highly specific and underserved', 'Education hook: "This is why diet and cardio aren\'t working"'],
    'postpartum':      ['Mom pouch — specific and emotional', 'Pair with timeline: "Back to pre-baby body in 6 weeks"'],
  };

  return scores.slice(0, 3).map(({ keyword, score }) => ({
    keyword,
    score,
    angles: angleMap[keyword.toLowerCase()] || [`Test "${keyword}" copy angle`, `Combine with specific transformation promise`],
  }));
}

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`IH Compositor v3.0.0 running on port ${PORT}`);
});

module.exports = app;
