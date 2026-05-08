const express = require('express');
const JSZip = require('jszip');
const { composite, getLayouts } = require('./compositor');

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_BATCH_SIZE = parseInt(process.env.MAX_BATCH_SIZE || '25', 10);
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '*';

// ── Middleware ──────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Increase JSON body limit for base64 images (up to 50MB per request)
app.use(express.json({ limit: '50mb' }));

// ── GET /health ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// ── GET /debug-fonts ─────────────────────────────────────────────────────────
app.get('/debug-fonts', (req, res) => {
  try {
    const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
    const path = require('path');
    const fs = require('fs');

    const FONT_BASE = path.join(__dirname, '../node_modules/@fontsource');
    const results = {};

    const testFile = (relPath, family) => {
      const full = path.join(FONT_BASE, relPath);
      const exists = fs.existsSync(full);
      let regResult = null;
      let regError = null;
      if (exists) {
        try {
          regResult = String(GlobalFonts.registerFromPath(full, family));
        } catch (e) {
          regError = e.message;
        }
      }
      return { exists, path: full, regResult, regError };
    };

    results.woff2_oswald = testFile('oswald/files/oswald-latin-700-normal.woff2', 'TestOswaldW2');
    results.woff_oswald  = testFile('oswald/files/oswald-latin-700-normal.woff',  'TestOswaldW1');
    results.woff2_roboto = testFile('roboto/files/roboto-latin-700-normal.woff2', 'TestRobotoW2');
    results.woff_roboto  = testFile('roboto/files/roboto-latin-400-normal.woff',  'TestRobotoW1');

    const canvas = createCanvas(400, 100);
    const ctx = canvas.getContext('2d');
    const measureTests = {};

    ['TestOswaldW2', 'TestOswaldW1', 'TestRobotoW2', 'TestRobotoW1', 'IHImpact', 'IHBold', 'IHRegular', 'sans-serif'].forEach((fam) => {
      ctx.font = `700 40px ${fam}`;
      measureTests[fam] = ctx.measureText('TEST HELLO').width;
    });

    results.measureText = measureTests;
    results.families = GlobalFonts.families.map(f => f.family);
    results.platform = process.platform;

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// ── GET /layouts ─────────────────────────────────────────────────────────────
app.get('/layouts', (req, res) => {
  res.json({ layouts: getLayouts() });
});

// ── POST /composite ───────────────────────────────────────────────────────────
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

// ── POST /composite-batch ─────────────────────────────────────────────────────
app.post('/composite-batch', async (req, res) => {
  try {
    const items = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Request body must be an array of composite requests' });
    }

    if (items.length === 0) {
      return res.status(400).json({ error: 'Batch must contain at least 1 item' });
    }

    if (items.length > MAX_BATCH_SIZE) {
      return res.status(400).json({
        error: `Batch size ${items.length} exceeds maximum of ${MAX_BATCH_SIZE}`,
      });
    }

    // Process all composites (in parallel with concurrency cap)
    const CONCURRENCY = 5;
    const results = [];

    for (let i = 0; i < items.length; i += CONCURRENCY) {
      const chunk = items.slice(i, i + CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async (item, idx) => {
          const globalIdx = i + idx;
          try {
            const buf = await composite(item);
            return { success: true, buf, item, idx: globalIdx };
          } catch (err) {
            return { success: false, error: err.message, item, idx: globalIdx };
          }
        })
      );
      results.push(...chunkResults);
    }

    // Build ZIP
    const zip = new JSZip();

    results.forEach(({ success, buf, item, idx, error }) => {
      const varId = item.variation_id || idx + 1;
      const layout = item.layout || 'ih-bundle';
      const filename = `variation_${String(varId).padStart(2, '0')}_${layout}.png`;

      if (success) {
        zip.file(filename, buf);
      } else {
        // Add an error log file instead of breaking the whole batch
        zip.file(
          filename.replace('.png', '_ERROR.txt'),
          `Error generating variation ${varId}:\n${error}`
        );
      }
    });

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const successCount = results.filter(r => r.success).length;
    const errorCount = results.filter(r => !r.success).length;

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

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`IH Compositor v1.0.0 running on port ${PORT}`);
});

module.exports = app;
