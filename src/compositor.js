const layouts = {
  'ih-bundle': require('./layouts/ihBundle'),
  'dark-product': require('./layouts/darkProduct'),
  'seasonal': require('./layouts/seasonal'),
  'editorial': require('./layouts/editorial'),
  'lifestyle-headline': require('./layouts/lifestyleHeadline'),
};

const LAYOUT_DESCRIPTIONS = {
  'ih-bundle': 'White/light background sale style — logo, social proof pill, badge, headline, centered product, full-width CTA',
  'dark-product': 'Dark background — badge top-right, bold white headline left, body copy, product stack right, CTA button left',
  'seasonal': 'Gradient background — top banner/badge, product left, headline + 3 checkmark benefits + CTA right',
  'editorial': 'Light pink/white background — emoji headline, products split center, long body copy, bold CTA text at bottom',
  'lifestyle-headline': 'Lifestyle photo fills frame — white headline box overlay, badge pill, product callout labels with arrows',
};

async function composite(params) {
  const { layout = 'ih-bundle' } = params;

  const layoutModule = layouts[layout];
  if (!layoutModule) {
    throw new Error(`Unknown layout: "${layout}". Available: ${Object.keys(layouts).join(', ')}`);
  }

  // Normalize params with defaults
  const normalized = {
    layout,
    background: params.background || null,
    products: params.products || {},
    text: params.text || {},
    colors: {
      background: '#FFFFFF',
      headline: '#111111',
      badge_bg: '#FF2D55',
      badge_text: '#FFFFFF',
      cta_bg: '#FF2D55',
      cta_text: '#FFFFFF',
      ...(params.colors || {}),
    },
    variation_id: params.variation_id || 1,
  };

  return layoutModule.render(normalized);
}

function getLayouts() {
  return Object.entries(LAYOUT_DESCRIPTIONS).map(([id, description]) => ({ id, description }));
}

module.exports = { composite, getLayouts };
