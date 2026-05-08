/**
 * seasonal — gradient/scene background, hoop hero left, text+checkmarks right (IH5 reference)
 */
const sharp = require('sharp');
const { resizeContain, resizeCover } = require('../utils/imageLoader');
const { F, renderTextLayer, drawRoundedRect, wrapText, fitFontSize } = require('../utils/textRenderer');

const W = 1080, H = 1080, PAD = 52;
const BANNER_H = 90;
const HOOP_LEFT = 10, HOOP_TOP = BANNER_H + 20, HOOP_W = 500, HOOP_H = H - HOOP_TOP - 60;

async function render({ products, text, colors, background }) {
  // ── 1. Background ──────────────────────────────────────────────────────────
  let base;
  if (background) {
    const raw = await resizeCover(background, W, H);
    const wash = await sharp({
      create: { width: W, height: H, channels: 4, background: { r:255, g:255, b:255, alpha: 0.35 } },
    }).png().toBuffer();
    base = await sharp(raw).composite([{ input: wash, top:0, left:0 }]).png().toBuffer();
  } else {
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#FFE4EC"/>
        <stop offset="100%" stop-color="#FFF9FB"/>
      </linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
    </svg>`;
    base = await sharp(Buffer.from(svg)).png().toBuffer();
  }

  // ── 2. Hoop ────────────────────────────────────────────────────────────────
  const hoopBuf = products.hoop ? await resizeContain(products.hoop, HOOP_W, HOOP_H) : null;

  // ── 3. Text layer ──────────────────────────────────────────────────────────
  const rightX = HOOP_LEFT + HOOP_W + 20;
  const rightW = W - rightX - PAD;

  const textBuf = renderTextLayer(W, H, (ctx) => {
    // Top banner / badge
    if (text.badge) {
      ctx.font      = F.badge(26);
      ctx.fillStyle = colors.badge_bg || '#FF2D55';
      drawRoundedRect(ctx, 28, 18, W - 56, BANNER_H - 18, 26);
      ctx.fill();
      ctx.fillStyle = colors.badge_text || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text.badge, W / 2, 18 + (BANNER_H - 18) / 2 + 9);
    }

    // Headline — right side
    if (text.headline) {
      const upper = text.headline.toUpperCase();
      const px    = fitFontSize(ctx, F.headline, upper, rightW, 58, 22, 4);
      ctx.font      = F.headline(px);
      ctx.fillStyle = colors.headline || '#111111';
      ctx.textAlign = 'left';
      const hlStartY = BANNER_H + 44;
      wrapText(ctx, upper, rightW).forEach((line, i) =>
        ctx.fillText(line, rightX, hlStartY + i * px * 1.15));

      // Checkmark benefits
      const benefits = text.body
        ? text.body.split('\n').filter(Boolean).slice(0, 3)
        : ['Free Shipping Today', 'Results in 2 Weeks', '30-Day Money Back'];

      const lines       = wrapText(ctx, upper, rightW);
      const benefitY    = hlStartY + lines.length * px * 1.15 + 28;
      const dotColor    = colors.badge_bg || '#FF2D55';

      benefits.forEach((benefit, i) => {
        const by = benefitY + i * 60;

        // Circle
        ctx.beginPath();
        ctx.arc(rightX + 18, by, 18, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();

        // Checkmark drawn as a canvas path (avoids font subset gaps)
        const cx = rightX + 18;
        ctx.save();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth   = 3.5;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 7, by + 1);
        ctx.lineTo(cx - 1, by + 7);
        ctx.lineTo(cx + 8, by - 6);
        ctx.stroke();
        ctx.restore();

        // Benefit text
        ctx.font      = F.badge(21);
        ctx.fillStyle = '#222222';
        ctx.textAlign = 'left';
        ctx.fillText(benefit, rightX + 46, by + 7);
      });

      // CTA
      if (text.cta) {
        const ctaY = H - 148;
        ctx.fillStyle = colors.cta_bg || '#FF2D55';
        drawRoundedRect(ctx, rightX, ctaY, rightW, 64, 32);
        ctx.fill();
        ctx.font      = F.cta(24);
        ctx.fillStyle = colors.cta_text || '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(text.cta.toUpperCase(), rightX + rightW / 2, ctaY + 40);
      }
    }

    // Social proof
    ctx.font      = F.body(15);
    ctx.fillStyle = '#666666';
    ctx.textAlign = 'center';
    ctx.fillText('5-STAR  500,000+ Women Love Infinity Hoop', W / 2, H - 22);
  });

  // ── 4. Composite ──────────────────────────────────────────────────────────
  const composites = [];
  if (hoopBuf) composites.push({ input: hoopBuf, top: HOOP_TOP, left: HOOP_LEFT });
  composites.push({ input: textBuf, top: 0, left: 0 });

  return sharp(base).composite(composites).png().toBuffer();
}

module.exports = { render };
