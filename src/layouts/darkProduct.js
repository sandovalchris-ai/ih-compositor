/**
 * dark-product — dark background, products right column, text left
 * Supports: assets.lifestyle as background with dimmer overlay
 */
const sharp = require('sharp');
const { resizeContain, resizeCover } = require('../utils/imageLoader');
const {
  F, renderTextLayer, drawRoundedRect, drawPill, drawCTA,
  drawLogo, drawGroundShadow,
  wrapText, fitFontSize,
} = require('../utils/textRenderer');

const W = 1080, H = 1080, PAD = 56;
const HOOP_LEFT = 570, HOOP_W = 490, HOOP_H = 690, HOOP_TOP = 70;
const GIFT_TOP  = 770, GIFT_W  = 460, GIFT_H  = 180;
const ITEM_W    = 145, ITEM_H  = 145;

async function render({ products, text, colors, background, assets }) {
  const bgColor = colors.background || '#111111';
  const leftW   = HOOP_LEFT - PAD - 16;

  let base;
  const bgSrc = (assets && assets.lifestyle) ? assets.lifestyle : background;
  if (bgSrc) {
    const raw = await resizeCover(bgSrc, W, H);
    const dim = await sharp({
      create: { width: W, height: H, channels: 4, background: { r:0, g:0, b:0, alpha: 0.62 } },
    }).png().toBuffer();
    base = await sharp(raw).composite([{ input: dim, top: 0, left: 0 }]).png().toBuffer();
  } else {
    base = await sharp({
      create: { width: W, height: H, channels: 4, background: hexToObj(bgColor) },
    }).png().toBuffer();
  }

  const [hoopBuf, bundleBuf, beltBuf, teaBuf, creamBuf] = await Promise.all([
    products.hoop   ? resizeContain(products.hoop,   HOOP_W, HOOP_H) : null,
    products.bundle ? resizeContain(products.bundle,  GIFT_W, GIFT_H) : null,
    products.belt   ? resizeContain(products.belt,   ITEM_W, ITEM_H) : null,
    products.tea    ? resizeContain(products.tea,    ITEM_W, ITEM_H) : null,
    products.cream  ? resizeContain(products.cream,  ITEM_W, ITEM_H) : null,
  ]);

  const textBuf = renderTextLayer(W, H, (ctx) => {
    // ── Logo ──
    drawLogo(ctx, W, 42, { color: '#FFFFFF', align: 'left' });

    // ── Badge top-right ──
    if (text.badge) {
      const bFont = F.badge(20);
      ctx.font = bFont;
      const bW = ctx.measureText(text.badge).width + 40;
      const bX = W - bW - PAD;
      ctx.save();
      ctx.shadowColor   = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur    = 10;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = colors.badge_bg || '#FF2D55';
      drawRoundedRect(ctx, bX, 24, bW, 46, 23);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = colors.badge_text || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text.badge, bX + bW / 2, 55);
    }

    // ── Headline (Bebas Neue, white) ──
    if (text.headline) {
      const upper = text.headline.toUpperCase();
      const px    = fitFontSize(ctx, F.headline, upper, leftW, 108, 36, 4);
      const lineH = px * 1.08;
      ctx.save();
      ctx.shadowColor   = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur    = 6;
      ctx.shadowOffsetY = 3;
      ctx.font      = F.headline(px);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      wrapText(ctx, upper, leftW).forEach((line, i) =>
        ctx.fillText(line, PAD, 140 + i * lineH));
      ctx.restore();
    }

    // ── Body copy ──
    if (text.body) {
      ctx.font      = F.body(21);
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.textAlign = 'left';
      let curY = 500;
      text.body.split('\n').filter(Boolean).slice(0, 5).forEach((para) => {
        wrapText(ctx, para, leftW).forEach((line) => {
          if (curY < H - 200) { ctx.fillText(line, PAD, curY); curY += 32; }
        });
        curY += 8;
      });
    }

    // ── Subheadline ──
    if (text.subheadline) {
      ctx.font      = F.badge(22);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.textAlign = 'left';
      ctx.fillText(text.subheadline, PAD, 690);
    }

    // ── Ground shadow for hoop ──
    if (hoopBuf) {
      drawGroundShadow(ctx, HOOP_LEFT + HOOP_W / 2, HOOP_TOP + HOOP_H - 20, HOOP_W * 0.7, { opacity: 0.2 });
    }

    // ── CTA ──
    if (text.cta) {
      const ctaY = H - 156;
      ctx.save();
      ctx.shadowColor   = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur    = 20;
      ctx.shadowOffsetY = 5;
      ctx.fillStyle = colors.cta_bg || '#FF2D55';
      drawRoundedRect(ctx, PAD, ctaY, leftW, 72, 36);
      ctx.fill();
      ctx.restore();
      ctx.font      = F.cta(28);
      ctx.fillStyle = colors.cta_text || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text.cta.toUpperCase(), PAD + leftW / 2, ctaY + 46);
    }

    // ── Urgency ──
    if (text.urgency) {
      ctx.font      = F.body(15);
      ctx.fillStyle = 'rgba(255,255,255,0.52)';
      ctx.textAlign = 'left';
      ctx.fillText(text.urgency, PAD, H - 58);
    }
  });

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
