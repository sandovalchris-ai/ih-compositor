/**
 * ih-bundle layout — white background birthday/sale style (IH8 reference)
 * Structure top→bottom:
 *   Logo (small, centered)
 *   Social proof pill
 *   Badge pill
 *   Headline (large, bold, centered)
 *   Product image (centered)
 *   CTA pill (full-width, colored)
 */
const sharp = require('sharp');
const { resizeContain, resizeCover } = require('../utils/imageLoader');
const { renderTextLayer, drawRoundedRect, wrapText } = require('../utils/textRenderer');

const W = 1080;
const H = 1080;
const PAD = 48;

async function render(params) {
  const { products, text, colors } = params;

  const bgColor = colors.background || '#FFFFFF';

  // ── 1. Base canvas (flat color background) ──────────────────────────────
  const base = await sharp({
    create: { width: W, height: H, channels: 4, background: hexToObj(bgColor) },
  }).png().toBuffer();

  // ── 2. Product image (hoop + bundle or just hoop) ────────────────────────
  const productSource = products.hoop || products.bundle || null;
  let productBuf = null;
  if (productSource) {
    productBuf = await resizeContain(productSource, 620, 420);
  }

  // ── 3. Text overlay layer ────────────────────────────────────────────────
  const textBuf = renderTextLayer(W, H, (ctx) => {
    // ── Logo area ──────────────────────────────────────────────────────────
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('INFINITY HOOP', W / 2, 58);

    // ── Social proof pill ──────────────────────────────────────────────────
    const spText = '★★★★★  Loved by 500,000+ Women';
    ctx.font = 'bold 18px Arial';
    const spW = ctx.measureText(spText).width + 40;
    const spX = (W - spW) / 2;
    const spY = 74;
    ctx.fillStyle = '#111111';
    drawRoundedRect(ctx, spX, spY, spW, 38, 19);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(spText, W / 2, spY + 24);

    // ── Badge pill ────────────────────────────────────────────────────────
    if (text.badge) {
      ctx.font = 'bold 22px Arial';
      const bW = ctx.measureText(text.badge).width + 48;
      const bX = (W - bW) / 2;
      const bY = 124;
      ctx.fillStyle = colors.badge_bg || '#FF2D55';
      drawRoundedRect(ctx, bX, bY, bW, 44, 22);
      ctx.fill();
      ctx.fillStyle = colors.badge_text || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text.badge, W / 2, bY + 28);
    }

    // ── Headline ──────────────────────────────────────────────────────────
    if (text.headline) {
      const hlY = 190;
      const maxHlW = W - PAD * 2;
      let fontSize = 72;
      const headlineUpper = text.headline.toUpperCase();

      ctx.font = `900 ${fontSize}px Impact`;
      // Auto-size down to fit
      while (fontSize > 28) {
        ctx.font = `900 ${fontSize}px Impact`;
        const lines = wrapText(ctx, headlineUpper, maxHlW);
        if (lines.length <= 3) break;
        fontSize -= 4;
      }
      ctx.font = `900 ${fontSize}px Impact`;
      const hlLines = wrapText(ctx, headlineUpper, maxHlW);
      const lineH = fontSize * 1.15;

      ctx.fillStyle = colors.headline || '#111111';
      ctx.textAlign = 'center';
      hlLines.forEach((line, i) => {
        ctx.fillText(line, W / 2, hlY + i * lineH);
      });
    }

    // ── Subheadline ───────────────────────────────────────────────────────
    if (text.subheadline) {
      const subY = text.headline ? 360 : 220;
      ctx.font = 'bold 28px Arial';
      ctx.fillStyle = '#555555';
      ctx.textAlign = 'center';
      ctx.fillText(text.subheadline, W / 2, subY);
    }

    // ── CTA pill ──────────────────────────────────────────────────────────
    if (text.cta) {
      const ctaH = 72;
      const ctaY = H - ctaH - PAD;
      const ctaX = PAD;
      const ctaW = W - PAD * 2;
      ctx.fillStyle = colors.cta_bg || '#FF2D55';
      drawRoundedRect(ctx, ctaX, ctaY, ctaW, ctaH, 36);
      ctx.fill();

      ctx.font = 'bold 30px Arial';
      ctx.fillStyle = colors.cta_text || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text.cta.toUpperCase(), W / 2, ctaY + 44);
    }

    // ── Urgency text ──────────────────────────────────────────────────────
    if (text.urgency) {
      const urgY = H - PAD - 72 - 24;
      ctx.font = '18px Arial';
      ctx.fillStyle = '#888888';
      ctx.textAlign = 'center';
      ctx.fillText(text.urgency, W / 2, urgY);
    }
  });

  // ── 4. Composite everything ──────────────────────────────────────────────
  const composites = [];

  if (productBuf) {
    composites.push({
      input: productBuf,
      top: Math.round(H / 2 - 10),
      left: Math.round((W - 620) / 2),
    });
  }

  composites.push({ input: textBuf, top: 0, left: 0 });

  return sharp(base)
    .composite(composites)
    .png()
    .toBuffer();
}

function hexToObj(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    alpha: 1,
  };
}

module.exports = { render };
