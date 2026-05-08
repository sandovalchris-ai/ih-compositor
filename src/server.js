const express = require('express');
const JSZip = require('jszip');
const { composite, getLayouts } = require('./compositor');

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_BATCH_SIZE = parseInt(process.env.MAX_BATCH_SIZE || '25', 10);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '50mb' }));

// ── GET /health ───────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0' });
});

// ── GET /layouts ──────────────────────────────────────────────────────────────
app.get('/layouts', (req, res) => {
  res.json({ layouts: getLayouts() });
});

// ── POST /composite ───────────────────────────────────────────────────────────
// Body: { layout, products, text, colors, assets, background, variation_id }
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
// Body: {
//   winner_image: base64,          ← analyzed to detect layout type
//   products: { hoop, bundle, belt, tea, cream },
//   assets: { model, lifestyle, before_after },
//   text: { headline, body, offer, cta, badge, urgency },
//   colors: { bg, headline, cta_bg, cta_text },
//   variation_id: number
// }
app.post('/composite-from-winner', async (req, res) => {
  try {
    const {
      winner_image,
      products = {},
      assets   = {},
      text     = {},
      colors   = {},
      variation_id = 1,
    } = req.body || {};

    if (!winner_image && !assets.lifestyle && !assets.model) {
      return res.status(400).json({
        error: 'Provide winner_image (base64) or at least one asset (lifestyle/model) to determine layout',
      });
    }

    // Normalize colors
    const normalizedColors = {
      background: colors.bg || colors.background || '#FFFFFF',
      headline:   colors.headline || '#111111',
      badge_bg:   colors.cta_bg   || '#FF2D55',
      badge_text: '#FFFFFF',
      cta_bg:     colors.cta_bg   || '#FF2D55',
      cta_text:   colors.cta_text || '#FFFFFF',
      ...colors,
    };

    // Normalize text (support 'offer' as alias for 'badge')
    const normalizedText = { ...text };
    if (normalizedText.offer && !normalizedText.badge) {
      normalizedText.badge = normalizedText.offer;
    }

    const pngBuffer = await composite({
      layout:       'winner-clone',
      winner_image,
      products,
      assets,
      text:         normalizedText,
      colors:       normalizedColors,
      variation_id,
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="winner_clone_${variation_id}.png"`);
    res.send(pngBuffer);
  } catch (err) {
    console.error('Winner clone error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /composite-batch ─────────────────────────────────────────────────────
// Array of composite requests. Items with winner_image are routed to winner-clone.
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
    const results = [];

    for (let i = 0; i < items.length; i += CONCURRENCY) {
      const chunk = items.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async (item, idx) => {
          const globalIdx = i + idx;
          // Auto-route to winner-clone when winner_image is present
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
      const varId  = item.variation_id || idx + 1;
      const layout = item.winner_image ? 'winner-clone' : (item.layout || 'ih-bundle');
      const fname  = `variation_${String(varId).padStart(2, '0')}_${layout}.png`;
      if (success) {
        zip.file(fname, buf);
      } else {
        zip.file(fname.replace('.png', '_ERROR.txt'), `Error generating variation ${varId}:\n${error}`);
      }
    });

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const successCount = results.filter(r => r.success).length;
    const errorCount   = results.filter(r => !r.success).length;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="ih_composites.zip"');
    res.setHeader('X-Success-Count', successCount);
    res.setHeader('X-Error-Count', errorCount);
    res.send(zipBuffer);
  } catch (err) {
    console.error('Batch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /trends ───────────────────────────────────────────────────────────────
// ?keywords=belly+fat,hormonal+weight,menopause
// Uses Google Trends unofficial API. Rate-limited; may return 429 from Google.
// Meta Ad Library is NOT included — requires Facebook API credentials.
app.get('/trends', async (req, res) => {
  const raw = (req.query.keywords || 'weighted hoop,belly fat,weight loss,hormonal belly,menopause weight');
  const keywords = raw.split(',').map(k => k.trim()).filter(Boolean).slice(0, 5);

  try {
    const googleTrends = require('google-trends-api');

    // Fetch interest over time for all keywords (last 90 days, US)
    const interestRaw = await googleTrends.interestOverTime({
      keyword: keywords,
      startTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      geo: 'US',
    });

    const interestData = JSON.parse(interestRaw);
    const timeline = (interestData.default?.timelineData || []).slice(-12); // last 12 data points

    // Compute average interest per keyword
    const scores = keywords.map((kw, i) => {
      const avg = timeline.length
        ? Math.round(timeline.reduce((sum, pt) => sum + (pt.value?.[i] || 0), 0) / timeline.length)
        : 0;
      return { keyword: kw, score: avg };
    });
    scores.sort((a, b) => b.score - a.score);

    // Fetch related queries for the top keyword
    let relatedQueries = [];
    try {
      const rqRaw = await googleTrends.relatedQueries({ keyword: keywords[0], geo: 'US' });
      const rqData = JSON.parse(rqRaw);
      relatedQueries = (rqData.default?.rankedList?.[0]?.rankedKeyword || [])
        .slice(0, 8)
        .map(r => ({ query: r.query, value: r.value }));
    } catch (_) {}

    res.json({
      source: 'Google Trends (unofficial API)',
      note: 'Meta Ad Library requires Facebook API credentials — not included',
      geo: 'US',
      period: 'last 90 days',
      keywords: scores,
      related_queries: relatedQueries,
      copy_angles: buildCopyAngles(scores),
    });
  } catch (err) {
    // Google Trends API can return 429 or fail — handle gracefully
    const isRateLimit = err.message?.includes('429') || err.message?.includes('rate');
    res.status(isRateLimit ? 429 : 502).json({
      error: isRateLimit
        ? 'Google Trends rate limited — try again in a few minutes'
        : 'Google Trends fetch failed',
      details: err.message,
      fallback_angles: buildCopyAngles(keywords.map(kw => ({ keyword: kw, score: 0 }))),
    });
  }
});

function buildCopyAngles(scores) {
  const angleMap = {
    'belly fat':         ['Target belly fat specifically', 'Show before/after stomach results'],
    'hormonal belly':    ['Address hormonal weight gain angle', 'Perimenopause/menopause messaging'],
    'menopause weight':  ['Over-40 women audience', 'Hormonal weight loss copy'],
    'weight loss':       ['General weight loss benefit', 'Numbers: lbs lost in weeks'],
    'weighted hoop':     ['Product-specific USP', 'Fun vs. exercise framing'],
    'hula hoop':         ['Nostalgia + modern twist', 'Low impact, high results'],
  };

  return scores.slice(0, 3).map(({ keyword, score }) => ({
    keyword,
    score,
    angles: angleMap[keyword.toLowerCase()] || [`Test "${keyword}" copy angle`],
  }));
}

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`IH Compositor v2.0.0 running on port ${PORT}`);
});

module.exports = app;
