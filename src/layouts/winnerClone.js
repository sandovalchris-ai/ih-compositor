/**
 * winnerClone — analyzes a winning ad and generates a variation
 * using the closest matching template.
 *
 * variation_type controls which dimension is being tested:
 *   background_swap  — same structure, new background color/scene
 *   hoop_swap        — same structure, new hoop color + headline
 *   before_after     — split-screen transformation layout
 *   problem_target   — same structure, problem-specific headline
 *   offer_variation  — same structure, new badge + CTA copy
 *
 * All non-before_after types route to the detected template and rely on
 * the caller having already set the correct text/colors/products in params.
 */
const { analyzeWinner, selectTemplate } = require('../utils/imageAnalyzer');
const { loadImageBuffer } = require('../utils/imageLoader');

const templateMap = {
  'ih-bundle':          require('./ihBundle'),
  'dark-product':       require('./darkProduct'),
  'seasonal':           require('./seasonal'),
  'editorial':          require('./editorial'),
  'lifestyle-headline': require('./lifestyleHeadline'),
  'before-after':       require('./beforeAfter'),
};

async function render({ products, text, colors, assets, background, winnerImage, variationType }) {
  // before_after always uses its dedicated layout regardless of winner analysis
  if (variationType === 'before_after') {
    return templateMap['before-after'].render({ products, text, colors, assets, background });
  }

  let templateName = 'ih-bundle';

  if (winnerImage) {
    try {
      const buf      = await loadImageBuffer(winnerImage);
      const analysis = await analyzeWinner(buf);
      templateName   = selectTemplate(analysis, assets || {});
      console.log(`[winnerClone] type=${variationType || 'none'} → template=${templateName}`, {
        isDark:    analysis.isDark,
        lrContrast: Math.round(analysis.leftRightContrast),
        tbContrast: Math.round(analysis.topBottomContrast),
      });
    } catch (e) {
      console.warn('[winnerClone] analysis failed, defaulting to ih-bundle:', e.message);
    }
  } else if (assets) {
    templateName = selectTemplate({ isDark: false, leftRightContrast: 0, topBottomContrast: 0 }, assets);
  }

  const template = templateMap[templateName];

  // background_swap: honor explicit background asset or color
  // All other types pass through as-is — caller provides the varied content
  const bg = assets?.lifestyle
    ? assets.lifestyle
    : assets?.model
    ? assets.model
    : background || null;

  return template.render({ products, text, colors, background: bg, assets });
}

module.exports = { render, _templateMap: templateMap };
