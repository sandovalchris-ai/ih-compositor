/**
 * seasonal layout — gradient background, product left, text right with checkmarks (IH5 reference)
 */
const sharp = require('sharp');
const { resizeContain, resizeCover } = require('../utils/imageLoader');
const { renderTextLayer, drawRoundedRect, wrapText } = require('../utils/textRenderer');

const W = 1080;
const H = 1080;
const PAD = 52;

async function render(params) {
  const { products, text, colors, background } = params;

  // ── 1. Background ────────────────────────────────────────────────────────
  let base;
  if (background) {
    base = await resizeCover(background, W, H);
  } else {
    // Soft pink-to-white gradient via SVG
    const gradSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#FFE4EC"/>
          <stop offset="100%" stop-color="#FFF9FB"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
    </svg>`;
    base = await sharp(Buffer.from(gradSvg)).png().toBuffer();
  }

  // ── 2. Product (left side, prominent hoop) ────────────────────────────────
  const productSource = products.hoop || products.bundle || null;
  let productBuf = null;
  if (productSource) {
    productBuf = await resizeContain(productSource, 520, 620);
  }

  // ── 3. Text layer ────────────────────────────────────────────────────────
  const textBuf = renderTextLayer(W, H, (ctx) => {
    const rightX = W / 2 + 20;
    const rightW = W / 2 - PAD - 20;

    // Top banner/badge
    if (text.badge) {
      ctx.font = 'bold 26px Arial';
      const bW = W - 60;
      const bX = 30;
      const bY = 28;
      ctx.fillStyle = colors.badge_bg || '#FF2D55';
      drawRoundedRect(ctx, bX, bY, bW, 52, 26);
      ctx.fill();
      ctx.fillStyle = colors.badge_text || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text.badge, W / 2, bY + 33);
    }

    // Headline (right side)
    if (text.headline) {
      let fontSize = 58;
      const headlineUpper = text.headline.toUpperCase();
      while (fontSize > 24) {
        ctx.font = `900 ${fontSize}px Impact`;
        const lines = wrapText(ctx, headlineUpper, rightW);
        if (lines.length <= 4) break;
        fontSize -= 4;
      }
      ctx.font = `900 ${fontSize}px Impact`;
      const lines = wrapText(ctx, headlineUpper, rightW);
      const lineH = fontSize * 1.15;
      const startY = 140;

      ctx.fillStyle = colors.headline || '#111111';
      ctx.textAlign = 'left';
      lines.forEach((line, i) => {
        ctx.fillText(line, rightX, startY + i * lineH);
      });

      // Checkmark benefits below headline
      const benefits = text.body
        ? text.body.split('\n').filter(Boolean).slice(0, 3)
        : ['Free Shipping Included', 'Results in 2 Weeks', '30-Day Money Back'];

      const benefitStartY = startY + lines.length * lineH + 32;
      const badgeColor = colors.badge_bg || '#FF2D55';

      benefits.forEach((benefit, i) => {
        const by = benefitStartY + i * 56;
        // Circle checkmark
        ctx.beginPath();
        ctx.arc(rightX + 18, by - 8, 18, 0, Math.PI * 2);
        ctx.fillStyle = badgeColor;
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('✓', rightX + 18, by - 1);

        // Benefit text
        ctx.fillStyle = '#333333';
        ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(benefit, rightX + 46, by - 1);
      });

      // CTA
      if (text.cta) {
        const ctaY = H - 160;
        const ctaW = rightW;
        const ctaH = 64;
        ctx.fillStyle = colors.cta_bg || '#FF2D55';
        drawRoundedRect(ctx, rightX, ctaY, ctaW, ctaH, 32);
        ctx.fill();
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = colors.cta_text || '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(text.cta.toUpperCase(), rightX + ctaW / 2, ctaY + 40);
      }
    }

    // Social proof bottom
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = '#666666';
    ctx.textAlign = 'center';
    ctx.fillText('★★★★★  500,000+ Women Love Infinity Hoop', W / 2, H - 32);
  });

  // ── 4. Composite ─────────────────────────────────────────────────────────
  const composites = [];

  if (productBuf) {
    composites.push({
      input: productBuf,
      top: Math.round((H - 620) / 2 + 30),
      left: 20,
    });
  }

  composites.push({ input: textBuf, top: 0, left: 0 });

  return sharp(base).composite(composites).png().toBuffer();
}

module.exports = { render };
