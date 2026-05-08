/**
 * imageAnalyzer — Sharp-based heuristic layout detector for winner images.
 * Analyzes brightness distribution and composition to select the closest
 * template. Does NOT use ML/CV — uses pixel-level luminance statistics.
 */
const sharp = require('sharp');

async function analyzeWinner(imageBuffer) {
  // Downsample to tiny grid for fast per-region luminance stats
  const SIZE = 60;
  const { data, info } = await sharp(imageBuffer)
    .resize(SIZE, SIZE, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const half = Math.floor(SIZE / 2);

  let lum = { tl: 0, tr: 0, bl: 0, br: 0 };
  let cnt = { tl: 0, tr: 0, bl: 0, br: 0 };
  let sat = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const r = data[i], g = data[i+1], b = data[i+2];
      const brightness = 0.299*r + 0.587*g + 0.114*b;
      const key = (y < half ? 't' : 'b') + (x < half ? 'l' : 'r');
      lum[key] += brightness;
      cnt[key]++;

      // Approximate saturation: max-min of RGB
      sat += Math.max(r,g,b) - Math.min(r,g,b);
    }
  }

  Object.keys(lum).forEach(k => { lum[k] /= cnt[k]; });

  const overall    = (lum.tl + lum.tr + lum.bl + lum.br) / 4;
  const left       = (lum.tl + lum.bl) / 2;
  const right      = (lum.tr + lum.br) / 2;
  const top        = (lum.tl + lum.tr) / 2;
  const bottom     = (lum.bl + lum.br) / 2;
  const avgSat     = sat / (width * height);

  return {
    overall,
    isDark:           overall < 90,
    isHighContrast:   avgSat > 60,
    leftRightContrast: Math.abs(left - right),
    topBottomContrast: Math.abs(top - bottom),
    leftDarker:       left < right,
    topDarker:        top < bottom,
  };
}

function selectTemplate(analysis, assets = {}) {
  const { isDark, leftRightContrast, topBottomContrast, leftDarker } = analysis;

  // Lifestyle or model asset → prefer lifestyle layouts
  if (assets.lifestyle) {
    return isDark ? 'dark-product' : 'lifestyle-headline';
  }
  if (assets.model) {
    return isDark ? 'dark-product' : 'seasonal';
  }

  // Strong left-right split → split column templates
  if (leftRightContrast > 35) {
    return isDark
      ? 'dark-product'   // products right, text left on dark
      : 'seasonal';      // hoop left, text+benefits right
  }

  // Dark overall → dark-product template
  if (isDark) return 'dark-product';

  // Strong top-bottom variation → ih-bundle (hero product centered)
  if (topBottomContrast > 25) return 'ih-bundle';

  // Balanced, light → editorial (long copy style)
  return 'editorial';
}

module.exports = { analyzeWinner, selectTemplate };
