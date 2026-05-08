/**
 * dark-product — dark background, products right column, text left (IH3 reference)
 */
const sharp = require('sharp');
const { resizeContain, resizeCover } = require('../utils/imageLoader');
const { F, renderTextLayer, drawRoundedRect, wrapText, fitFontSize } = require('../utils/textRenderer');

const W = 1080, H = 1080, PAD = 56;
const HOOP_LEFT = 580, HOOP_W = 480, HOOP_H = 680, HOOP_TOP = 80;
const GIFT_TOP  = 768, GIFT_W  = 460, GIFT_H  = 175;
const ITEM_W    = 145, ITEM_H  = 145;

async function render({ products, text, colors, background }) {
  const bgColor = colors.background || '#111111';

  // ── 1. Background ──────────────────────────────────────────────────────────
  let base;
  if (background) {
    const raw = await resizeCover(background, W, H);
    const dim = await sharp({
      create: { width: W, height: H, channels: 4, background: { r:0, g:0, b:0, alpha: 0.6 } },
    }).png().toBuffer();
    base = await sharp(raw).composite([{ input: dim, top:0, left:0 }]).png().toBuffer();
  } else {
    base = await sharp({
      create: { width: W, height: H, channels: 4, background: hexToObj(bgColor) },
    }).png().toBuffer();
  }

  // ── 2. Products ────────────────────────────────────────────────────────────
  const [hoopBuf, bundleBuf, beltBuf, teaBuf, creamBuf] = await Promise.all([
    products.hoop   ? resizeContain(products.hoop,   HOOP_W, HOOP_H) : null,
    products.bundle ? resizeContain(products.bundle,  GIFT_W, GIFT_H) : null,
    products.belt   ? resizeContain(products.belt,   ITEM_W, ITEM_H) : null,
    products.tea    ? resizeContain(products.tea,    ITEM_W, ITEM_H) : null,
    products.cream  ? resizeContain(products.cream,  ITEM_W, ITEM_H) : null,
  ]);

  // ── 3. Text layer ──────────────────────────────────────────────────────────
  const leftW = HOOP_LEFT - PAD - 20;

  const textBuf = renderTextLayer(W, H, (ctx) => {
    // Logo
    ctx.font      = F.logo(20);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.fillText('INFINITY HOOP', PAD, 54);

    // Badge top-right
    if (text.badge) {
      ctx.font = F.badge(20);
      const bW = ctx.measureText(text.badge).width + 40;
      const bX = W - bW - PAD;
      ctx.fillStyle = colors.badge_bg || '#FF2D55';
      drawRoundedRect(ctx, bX, 30, bW, 40, 20);
      ctx.fill();
      ctx.fillStyle = colors.badge_text || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text.badge, bX + bW / 2, 56);
    }

    // Headline — left side, large
    if (text.headline) {
      const upper = text.headline.toUpperCase();
      const px    = fitFontSize(ctx, F.headline, upper, leftW, 68, 28, 4);
      ctx.font      = F.headline(px);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      wrapText(ctx, upper, leftW).forEach((line, i) =>
        ctx.fillText(line, PAD, 155 + i * px * 1.15));
    }

    // Body copy
    if (text.body) {
      ctx.font      = F.body(21);
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.textAlign = 'left';
      const lines   = wrapText(ctx, text.body.split('\n')[0], leftW);
      lines.slice(0, 5).forEach((line, i) =>
        ctx.fillText(line, PAD, 520 + i * 30));
    }

    // Subheadline
    if (text.subheadline) {
      ctx.font      = F.badge(22);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.textAlign = 'left';
      ctx.fillText(text.subheadline, PAD, 690);
    }

    // CTA button
    if (text.cta) {
      const ctaY = H - 148;
      ctx.fillStyle = colors.cta_bg || '#FF2D55';
      drawRoundedRect(ctx, PAD, ctaY, leftW, 64, 32);
      ctx.fill();
      ctx.font      = F.cta(24);
      ctx.fillStyle = colors.cta_text || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text.cta.toUpperCase(), PAD + leftW / 2, ctaY + 40);
    }

    // Urgency
    if (text.urgency) {
      ctx.font      = F.body(15);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.textAlign = 'left';
      ctx.fillText(text.urgency, PAD, H - 64);
    }
  });

  // ── 4. Composite ──────────────────────────────────────────────────────────
  const composites = [];

  if (hoopBuf) composites.push({ input: hoopBuf, top: HOOP_TOP, left: HOOP_LEFT });

  if (bundleBuf) {
    composites.push({ input: bundleBuf, top: GIFT_TOP, left: HOOP_LEFT + 10 });
  } else {
    const items = [beltBuf, teaBuf, creamBuf].filter(Boolean);
    if (items.length) {
      const gap    = 12;
      const totalW = items.length * ITEM_W + (items.length - 1) * gap;
      let leftX    = HOOP_LEFT + Math.round((HOOP_W - totalW) / 2);
      items.forEach((buf) => {
        composites.push({ input: buf, top: GIFT_TOP + 14, left: leftX });
        leftX += ITEM_W + gap;
      });
    }
  }

  composites.push({ input: textBuf, top: 0, left: 0 });

  return sharp(base).composite(composites).png().toBuffer();
}

function hexToObj(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  return { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16), alpha: 1 };
}

module.exports = { render };
