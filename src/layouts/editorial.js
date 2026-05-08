/**
 * editorial — light pink/white, long copy, products split center (IH11 reference)
 */
const sharp = require('sharp');
const { resizeContain } = require('../utils/imageLoader');
const { F, renderTextLayer, drawRoundedRect, wrapText, fitFontSize } = require('../utils/textRenderer');

const W = 1080, H = 1080, PAD = 56;
const PROD_TOP = 235, PROD_H = 295, SLOT_W = 450;
const LEFT_X = 56, RIGHT_X = 562;
const BODY_Y  = PROD_TOP + PROD_H + 28;
const GIFT_W  = 136, GIFT_H  = 180;

async function render({ products, text, colors }) {
  const bgColor = colors.background || '#FFF0F3';

  // ── 1. Background ──────────────────────────────────────────────────────────
  const base = await sharp({
    create: { width: W, height: H, channels: 4, background: hexToObj(bgColor) },
  }).png().toBuffer();

  // ── 2. Products ────────────────────────────────────────────────────────────
  const [hoopBuf, bundleBuf, beltBuf, teaBuf, creamBuf] = await Promise.all([
    products.hoop   ? resizeContain(products.hoop,   SLOT_W, PROD_H) : null,
    products.bundle ? resizeContain(products.bundle,  SLOT_W, PROD_H) : null,
    products.belt   ? resizeContain(products.belt,   GIFT_W, GIFT_H) : null,
    products.tea    ? resizeContain(products.tea,    GIFT_W, GIFT_H) : null,
    products.cream  ? resizeContain(products.cream,  GIFT_W, GIFT_H) : null,
  ]);

  // ── 3. Text layer ──────────────────────────────────────────────────────────
  const textBuf = renderTextLayer(W, H, (ctx) => {
    ctx.textAlign = 'center';

    // Headline — auto-size, max 3 lines
    if (text.headline) {
      const upper = text.headline.toUpperCase();
      const px    = fitFontSize(ctx, F.headline, upper, W - PAD * 2, 54, 20, 3);
      ctx.font      = F.headline(px);
      ctx.fillStyle = colors.headline || '#111111';
      wrapText(ctx, upper, W - PAD * 2).forEach((line, i) =>
        ctx.fillText(line, W / 2, 80 + i * px * 1.2));
    }

    // Subheadline
    if (text.subheadline) {
      ctx.font      = F.badge(26);
      ctx.fillStyle = '#444444';
      ctx.fillText(text.subheadline, W / 2, 200);
    }

    // Divider
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(PAD, PROD_TOP - 14);
    ctx.lineTo(W - PAD, PROD_TOP - 14);
    ctx.stroke();

    // Body copy below products
    if (text.body) {
      const paragraphs = text.body.split('\n').filter(Boolean);
      ctx.font      = F.body(21);
      ctx.fillStyle = '#333333';
      ctx.textAlign = 'left';
      let curY      = BODY_Y;
      paragraphs.slice(0, 5).forEach((para) => {
        wrapText(ctx, para, W - PAD * 2).forEach((line) => {
          if (curY < H - 90) { ctx.fillText(line, PAD, curY); curY += 30; }
        });
        curY += 6;
      });
    }

    // CTA — bold colored text at bottom, no button
    if (text.cta) {
      ctx.font      = F.cta(34);
      ctx.fillStyle = colors.badge_bg || '#FF2D55';
      ctx.textAlign = 'center';
      ctx.fillText(text.cta.toUpperCase(), W / 2, H - PAD);
    }
  });

  // ── 4. Composite ──────────────────────────────────────────────────────────
  const composites = [];
  const hasLeft  = bundleBuf || beltBuf || teaBuf || creamBuf;
  const hasRight = !!hoopBuf;

  if (hasLeft && hasRight) {
    if (bundleBuf) {
      composites.push({ input: bundleBuf, top: PROD_TOP, left: LEFT_X });
    } else {
      const items  = [beltBuf, teaBuf, creamBuf].filter(Boolean);
      const gap    = 10;
      const totalW = items.length * GIFT_W + (items.length - 1) * gap;
      let lx       = LEFT_X + Math.round((SLOT_W - totalW) / 2);
      items.forEach((buf) => {
        composites.push({ input: buf, top: PROD_TOP + Math.round((PROD_H - GIFT_H) / 2), left: lx });
        lx += GIFT_W + gap;
      });
    }
    composites.push({ input: hoopBuf, top: PROD_TOP, left: RIGHT_X });
  } else if (hasRight) {
    composites.push({ input: hoopBuf, top: PROD_TOP, left: Math.round((W - SLOT_W) / 2) });
  } else if (hasLeft) {
    if (bundleBuf) {
      composites.push({ input: bundleBuf, top: PROD_TOP, left: Math.round((W - SLOT_W) / 2) });
    } else {
      const items  = [beltBuf, teaBuf, creamBuf].filter(Boolean);
      const gap    = 20;
      const totalW = items.length * GIFT_W + (items.length - 1) * gap;
      let lx       = Math.round((W - totalW) / 2);
      items.forEach((buf) => {
        composites.push({ input: buf, top: PROD_TOP + Math.round((PROD_H - GIFT_H) / 2), left: lx });
        lx += GIFT_W + gap;
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
