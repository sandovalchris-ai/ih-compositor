/**
 * seasonal — gradient/scene background, hoop hero left, text+checkmarks right (IH5 reference)
 *
 * Product zones:
 *   Hoop: 500 × 760, left=10, top=110 (below banner, fills left column)
 *   No separate gift slots — hoop is the hero; bundle promo handled via checkmark text
 */
const sharp = require('sharp');
const { resizeContain, resizeCover } = require('../utils/imageLoader');
const { renderTextLayer, drawRoundedRect, wrapText } = require('../utils/textRenderer');

const W = 1080;
const H = 1080;
const PAD = 52;

const BANNER_H  = 90;   // top badge banner height
const HOOP_LEFT = 10;
const HOOP_TOP  = BANNER_H + 20;
const HOOP_W    = 500;
const HOOP_H    = H - HOOP_TOP - 60;  // ~910px

async function render({ products, text, colors, background }) {
  // ── 1. Background ─────────────────────────────────────────────────────────
  let base;
  if (background) {
    base = await resizeCover(background, W, H);
    // Light wash to keep text readable without killing the scene
    const wash = await sharp({
      create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0.35 } },
    }).png().toBuffer();
    base = await sharp(base).composite([{ input: wash, top: 0, left: 0 }]).png().toBuffer();
  } else {
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

  // ── 2. Hoop product ───────────────────────────────────────────────────────
  const hoopBuf = products.hoop
    ? await resizeContain(products.hoop, HOOP_W, HOOP_H)
    : null;

  // ── 3. Text layer (right half + full-width banner) ────────────────────────
  const rightX = HOOP_LEFT + HOOP_W + 20;
  const rightW = W - rightX - PAD;

  const textBuf = renderTextLayer(W, H, (ctx) => {
    // Top banner/badge — full width
    if (text.badge) {
      ctx.font = 'bold 26px Arial';
      ctx.fillStyle = colors.badge_bg || '#FF2D55';
      drawRoundedRect(ctx, 28, 18, W - 56, BANNER_H - 18, 26);
      ctx.fill();
      ctx.fillStyle = colors.badge_text || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text.badge, W / 2, 18 + (BANNER_H - 18) / 2 + 9);
    }

    // Headline — right side
    if (text.headline) {
      let fontSize = 56;
      const upper = text.headline.toUpperCase();
      ctx.textAlign = 'left';
      while (fontSize > 22) {
        ctx.font = `900 ${fontSize}px Impact`;
        if (wrapText(ctx, upper, rightW).length <= 4) break;
        fontSize -= 4;
      }
      ctx.font = `900 ${fontSize}px Impact`;
      const lines = wrapText(ctx, upper, rightW);
      ctx.fillStyle = colors.headline || '#111111';
      const hlStartY = BANNER_H + 44;
      lines.forEach((line, i) => ctx.fillText(line, rightX, hlStartY + i * fontSize * 1.15));

      // Checkmark benefit rows
      const benefits = text.body
        ? text.body.split('\n').filter(Boolean).slice(0, 3)
        : ['Free Shipping Today', 'Results in 2 Weeks', '30-Day Money Back'];

      const benefitY = hlStartY + lines.length * fontSize * 1.15 + 28;
      const dot = colors.badge_bg || '#FF2D55';

      benefits.forEach((benefit, i) => {
        const by = benefitY + i * 60;
        ctx.beginPath();
        ctx.arc(rightX + 18, by, 18, 0, Math.PI * 2);
        ctx.fillStyle = dot;
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('✓', rightX + 18, by + 7);

        ctx.fillStyle = '#222222';
        ctx.font = 'bold 21px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(benefit, rightX + 46, by + 7);
      });

      // CTA button
      if (text.cta) {
        const ctaY = H - 148;
        ctx.fillStyle = colors.cta_bg || '#FF2D55';
        drawRoundedRect(ctx, rightX, ctaY, rightW, 64, 32);
        ctx.fill();
        ctx.font = 'bold 24px Arial';
        ctx.fillStyle = colors.cta_text || '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(text.cta.toUpperCase(), rightX + rightW / 2, ctaY + 40);
      }
    }

    // Social proof bottom-center
    ctx.font = 'bold 15px Arial';
    ctx.fillStyle = '#666666';
    ctx.textAlign = 'center';
    ctx.fillText('★★★★★  500,000+ Women Love Infinity Hoop', W / 2, H - 22);
  });

  // ── 4. Composite ─────────────────────────────────────────────────────────
  const composites = [];
  if (hoopBuf) composites.push({ input: hoopBuf, top: HOOP_TOP, left: HOOP_LEFT });
  composites.push({ input: textBuf, top: 0, left: 0 });

  return sharp(base).composite(composites).png().toBuffer();
}

module.exports = { render };
