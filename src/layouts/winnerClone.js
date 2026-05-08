/**
 * winnerClone — analyzes a winning ad image and generates a variation
 * using the closest matching template.
 *
 * Layout selection uses Sharp pixel analysis (brightness, composition split)
 * since true text/object detection would require ML. The heuristics correctly
 * classify dark vs. light, split vs. centered, and asset-driven layouts.
 */
const { analyzeWinner, selectTemplate } = require('../utils/imageAnalyzer');
const { loadImageBuffer } = require('../utils/imageLoader');

// Direct references to avoid circular dependency with compositor.js
const templateMap = {
  'ih-bundle':         require('./ihBundle'),
  'dark-product':      require('./darkProduct'),
  'seasonal':          require('./seasonal'),
  'editorial':         require('./editorial'),
  'lifestyle-headline': require('./lifestyleHeadline'),
};

async function render({ products, text, colors, assets, background, winnerImage }) {
  let templateName = 'ih-bundle';

  if (winnerImage) {
    try {
      const buf = await loadImageBuffer(winnerImage);
      const analysis = await analyzeWinner(buf);
      templateName = selectTemplate(analysis, assets || {});
      console.log(`[winnerClone] detected template: ${templateName}`, {
        isDark: analysis.isDark,
        lrContrast: Math.round(analysis.leftRightContrast),
        tbContrast: Math.round(analysis.topBottomContrast),
      });
    } catch (e) {
      console.warn('[winnerClone] analysis failed, defaulting to ih-bundle:', e.message);
    }
  } else if (assets) {
    // No winner image — pick template from assets alone
    templateName = selectTemplate({ isDark: false, leftRightContrast: 0, topBottomContrast: 0 }, assets);
  }

  const template = templateMap[templateName];

  // Priority: lifestyle asset > model asset > explicit background
  const bg = assets?.lifestyle
    ? assets.lifestyle
    : assets?.model
    ? assets.model
    : background || null;

  return template.render({ products, text, colors, background: bg, assets });
}

module.exports = { render, _templateMap: templateMap };
