const sharp = require('sharp');

// ── Dominant color sampling ───────────────────────────────────────────────────
async function getDominantColors(imageBuffer, count = 5) {
  const SIZE = 80;
  const { data } = await sharp(imageBuffer)
    .resize(SIZE, SIZE, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buckets = {};
  for (let i = 0; i < data.length; i += 9) {
    const r = Math.min(255, Math.round(data[i]     / 32) * 32);
    const g = Math.min(255, Math.round(data[i + 1] / 32) * 32);
    const b = Math.min(255, Math.round(data[i + 2] / 32) * 32);
    const key = `${r},${g},${b}`;
    buckets[key] = (buckets[key] || 0) + 1;
  }

  return Object.entries(buckets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number);
      return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
    });
}

// ── Heuristic layout zone estimates per template ──────────────────────────────
function estimateLayoutZones(templateName, W = 1080, H = 1080) {
  switch (templateName) {
    case 'ih-bundle':
      return {
        headline: { x: 48,  y: 155, width: W - 96,  height: 250 },
        products: { x: 230, y: 420, width: 620,      height: 340 },
        cta:      { x: 48,  y: H - 130, width: W - 96, height: 80 },
        background: { type: 'flat', zone: 'full' },
      };
    case 'dark-product':
      return {
        headline: { x: 56,  y: 100, width: 490, height: 380 },
        products: { x: 570, y: 70,  width: 490, height: 700 },
        cta:      { x: 56,  y: H - 156, width: 490, height: 72 },
        background: { type: 'dark', zone: 'full' },
      };
    case 'seasonal':
      return {
        headline: { x: 540, y: 100, width: 490, height: 300 },
        products: { x: 10,  y: 100, width: 510, height: 870 },
        cta:      { x: 540, y: H - 156, width: 490, height: 72 },
        background: { type: 'gradient', zone: 'full' },
      };
    case 'editorial':
      return {
        headline: { x: 56,  y: 40,  width: W - 112, height: 160 },
        products: { x: 56,  y: 220, width: W - 112, height: 320 },
        cta:      { x: 56,  y: H - 80, width: W - 112, height: 56 },
        background: { type: 'flat', zone: 'full' },
      };
    case 'lifestyle-headline':
      return {
        headline: { x: 40,  y: 40,  width: W - 80, height: 200 },
        products: { x: 340, y: 380, width: 400,     height: 500 },
        cta:      { x: 40,  y: H - 130, width: W - 80, height: 76 },
        background: { type: 'photo', zone: 'full' },
      };
    default:
      return {
        headline: { x: 48,  y: 120, width: W - 96,  height: 240 },
        products: { x: 200, y: 380, width: W - 400,  height: 360 },
        cta:      { x: 48,  y: H - 130, width: W - 96, height: 80 },
        background: { type: 'flat', zone: 'full' },
      };
  }
}

// ── Main analyzer ─────────────────────────────────────────────────────────────
async function analyzeWinner(imageBuffer) {
  const SIZE = 60;
  const { data, info } = await sharp(imageBuffer)
    .resize(SIZE, SIZE, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const half = Math.floor(SIZE / 2);

  const lum = { tl: 0, tr: 0, bl: 0, br: 0 };
  const cnt = { tl: 0, tr: 0, bl: 0, br: 0 };
  let sat = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = data[i], g = data[i+1], b = data[i+2];
      const brightness = 0.299*r + 0.587*g + 0.114*b;
      const key = (y < half ? 't' : 'b') + (x < half ? 'l' : 'r');
      lum[key] += brightness;
      cnt[key]++;
      sat += Math.max(r, g, b) - Math.min(r, g, b);
    }
  }

  Object.keys(lum).forEach(k => { lum[k] /= cnt[k]; });

  const overall           = (lum.tl + lum.tr + lum.bl + lum.br) / 4;
  const left              = (lum.tl + lum.bl) / 2;
  const right             = (lum.tr + lum.br) / 2;
  const top               = (lum.tl + lum.tr) / 2;
  const bottom            = (lum.bl + lum.br) / 2;
  const avgSat            = sat / (width * height);
  const leftRightContrast = Math.abs(left - right);
  const topBottomContrast = Math.abs(top - bottom);

  // Detect aspect ratio from metadata
  const meta = await sharp(imageBuffer).metadata();
  const W = meta.width || 1080;
  const H = meta.height || 1080;
  const ratio = W / H;
  let aspect_ratio = '1:1';
  if (ratio < 0.9)  aspect_ratio = '4:5';
  if (ratio < 0.65) aspect_ratio = '9:16';
  if (ratio > 1.1)  aspect_ratio = '16:9';

  const dominant_colors = await getDominantColors(imageBuffer, 5);

  const isDark = overall < 90;
  const isHighContrast = avgSat > 60;

  const estimated_layout = selectTemplate(
    { isDark, leftRightContrast, topBottomContrast, leftDarker: left < right },
    {}
  );

  const layout_zones = estimateLayoutZones(estimated_layout, W, H);

  return {
    overall,
    isDark,
    isHighContrast,
    leftRightContrast,
    topBottomContrast,
    leftDarker:      left < right,
    topDarker:       top < bottom,
    dominant_colors,
    estimated_layout,
    aspect_ratio,
    layout_zones,
  };
}

function selectTemplate(analysis, assets = {}) {
  const { isDark, isHighContrast, leftRightContrast, topBottomContrast, overall } = analysis;

  if (assets.lifestyle) return isDark ? 'dark-product' : 'lifestyle-headline';
  if (assets.model)     return isDark ? 'dark-product' : 'seasonal';

  // Strong left-right split → split-column templates
  if (leftRightContrast > 35) return isDark ? 'dark-product' : 'seasonal';

  // Dark overall → dark-product
  if (isDark) return 'dark-product';

  // Very light (near-white) balanced image → ih-bundle (default product-sale layout)
  // editorial is reserved for distinctly pinkish/colorful light backgrounds with
  // low contrast and top-heavy text
  if (overall > 180) return 'ih-bundle';

  // Moderate top-bottom variation → ih-bundle (hero product centered)
  if (topBottomContrast > 20) return 'ih-bundle';

  // Colorful, balanced, medium-light → editorial (long-copy style)
  return 'editorial';
}

module.exports = { analyzeWinner, selectTemplate, getDominantColors, estimateLayoutZones };
