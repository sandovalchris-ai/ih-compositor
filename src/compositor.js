const layouts = {
  'ih-bundle':          require('./layouts/ihBundle'),
  'dark-product':       require('./layouts/darkProduct'),
  'seasonal':           require('./layouts/seasonal'),
  'editorial':          require('./layouts/editorial'),
  'lifestyle-headline': require('./layouts/lifestyleHeadline'),
  'lifestyle-bundle':   require('./layouts/lifestyleBundle'),
  'winner-clone':       require('./layouts/winnerClone'),
  'before-after':       require('./layouts/beforeAfter'),
};

const LAYOUT_DESCRIPTIONS = {
  'ih-bundle':          'White/light background — logo, social proof (drawn stars), badge, Bebas Neue headline, centered hoop, gift row, full-width CTA',
  'dark-product':       'Dark background — badge pill, bold white headline left, body copy, hoop + gifts right, CTA button',
  'seasonal':           'Gradient/scene background — top badge banner, hoop left, headline + checkmark benefits + CTA right',
  'editorial':          'Light pink background — large headline, split product zone, long body copy, bold CTA text',
  'lifestyle-headline': 'Lifestyle photo full-bleed — white headline box, badge pill, product cutouts, callout labels',
  'lifestyle-bundle':   'AI-cloned winner structure — products placed naturally (no card borders), dynamic arrangement driven by Claude Vision DNA, fixed $100 OFF + 3 FREE GIFTS offer',
  'winner-clone':       'Auto-detect layout from winner image; clone structure with new products, text, and variation type',
  'before-after':       'Split-screen transformation — greyscale before (left) vs. color after (right) + products; bottom strip headline + CTA',
};

async function composite(params) {
  const { layout = 'ih-bundle' } = params;

  const layoutModule = layouts[layout];
  if (!layoutModule) {
    throw new Error(`Unknown layout: "${layout}". Available: ${Object.keys(layouts).join(', ')}`);
  }

  const colors = {
    background: '#FFFFFF',
    headline:   '#111111',
    badge_bg:   '#FF2D55',
    badge_text: '#FFFFFF',
    cta_bg:     '#FF2D55',
    cta_text:   '#FFFFFF',
    ...(params.colors || {}),
  };

  const normalized = {
    layout,
    background:    params.background    || null,
    products:      params.products      || {},
    text:          params.text          || {},
    assets:        params.assets        || null,
    winnerImage:   params.winner_image  || null,
    variationType: params.variation_type || null,
    dna:           params.dna           || null,
    colors,
    variation_id:  params.variation_id  || 1,
  };

  return layoutModule.render(normalized);
}

function getLayouts() {
  return Object.entries(LAYOUT_DESCRIPTIONS).map(([id, description]) => ({ id, description }));
}

module.exports = { composite, getLayouts };
