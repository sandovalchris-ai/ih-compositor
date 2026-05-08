/**
 * dark-product layout — dark background, product right, text left (IH3 reference)
 */
const sharp = require('sharp');
const { resizeContain, resizeCover } = require('../utils/imageLoader');
const { renderTextLayer, drawRoundedRect, wrapText } = require('../utils/textRenderer');

const W = 1080;
const H = 1080;
const PAD = 56;

async function render(params) {
  const { products, text, colors, background } = params;

  const bgColor = colors.background || '#111111';

  // ── 1. Background ────────────────────────────────────────────────────────
  let base;
  if (background) {
    const { resizeCover: rc } = require('../utils/imageLoader');
    base = await resizeCover(background, W, H);
    // Darken background with a semi-transparent overlay
    const overlay = await sharp({
      create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.55 } },
    }).png().toBuffer();
    base = await sharp(base).composite([{ input: overlay, top: 0, left: 0 }]).png().toBuffer();
  } else {
    base = await sharp({
      create: { width: W, height: H, channels: 4, background: hexToObj(bgColor) },
    }).png().toBuffer();
  }

  // ── 2. Product stack (right side) ────────────────────────────────────────
  const productW = 460;
  const productH = 680;
  let productBuf = null;
  const productSource = products.hoop || products.bundle || null;
  if (productSource) {
    productBuf = await resizeContain(productSource, productW, productH);
  }

  // ── 3. Bundle (below hoop on right) ──────────────────────────────────────
  let bundleBuf = null;
  if (products.bundle && products.hoop) {
    bundleBuf = await resizeContain(products.bundle, 320, 220);
  }

  // ── 4. Text layer ────────────────────────────────────────────────────────
  const textBuf = renderTextLayer(W, H, (ctx) => {
    const leftW = W / 2 - PAD;

    // Logo
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('INFINITY HOOP', PAD, 58);

    // Badge (top right area — above product)
    if (text.badge) {
      ctx.font = 'bold 20px Arial';
      const bW = ctx.measureText(text.badge).width + 40;
      const bX = W - bW - PAD;
      const bY = 36;
      ctx.fillStyle = colors.badge_bg || '#FF2D55';
      drawRoundedRect(ctx, bX, bY, bW, 40, 20);
      ctx.fill();
      ctx.fillStyle = colors.badge_text || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text.badge, bX + bW / 2, bY + 26);
    }

    // Headline (left, large)
    if (text.headline) {
      let fontSize = 68;
      const maxW = leftW;
      const headlineUpper = text.headline.toUpperCase();

      ctx.textAlign = 'left';
      while (fontSize > 28) {
        ctx.font = `900 ${fontSize}px Impact`;
        const lines = wrapText(ctx, headlineUpper, maxW);
        if (lines.length <= 4) break;
        fontSize -= 4;
      }
      ctx.font = `900 ${fontSize}px Impact`;
      const lines = wrapText(ctx, headlineUpper, maxW);
      const lineH = fontSize * 1.15;
      const startY = 160;

      ctx.fillStyle = '#FFFFFF';
      lines.forEach((line, i) => {
        ctx.fillText(line, PAD, startY + i * lineH);
      });

      // Body copy below headline
      if (text.body) {
        const bodyY = startY + lines.length * lineH + 24;
        ctx.font = '22px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        const bodyLines = wrapText(ctx, text.body, maxW);
        bodyLines.slice(0, 4).forEach((line, i) => {
          ctx.fillText(line, PAD, bodyY + i * 30);
        });
      }
    }

    // CTA button (left side, lower)
    if (text.cta) {
      const ctaY = H - 160;
      const ctaW = leftW;
      const ctaH = 64;
      ctx.fillStyle = colors.cta_bg || '#FF2D55';
      drawRoundedRect(ctx, PAD, ctaY, ctaW, ctaH, 32);
      ctx.fill();
      ctx.font = 'bold 26px Arial';
      ctx.fillStyle = colors.cta_text || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text.cta.toUpperCase(), PAD + ctaW / 2, ctaY + 40);
    }

    // Urgency
    if (text.urgency) {
      ctx.font = '16px Arial';
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.textAlign = 'left';
      ctx.fillText(text.urgency, PAD, H - 72);
    }
  });

  // ── 5. Composite ─────────────────────────────────────────────────────────
  const composites = [];

  if (productBuf) {
    composites.push({
      input: productBuf,
      top: Math.round((H - productH) / 2),
      left: W - productW - 20,
    });
  }

  if (bundleBuf) {
    composites.push({
      input: bundleBuf,
      top: H - 260,
      left: W - 360,
    });
  }

  composites.push({ input: textBuf, top: 0, left: 0 });

  return sharp(base).composite(composites).png().toBuffer();
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
