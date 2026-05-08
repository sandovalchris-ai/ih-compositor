/**
 * editorial — light pink/white, long copy, products split center (IH11 reference)
 *
 * Product zones (middle band y=235–530):
 *   Left slot  (x=56,  w=450, h=295): bundle photo OR belt+tea+cream stacked
 *   Right slot (x=562, w=450, h=295): hoop
 *
 * If only one product type is supplied it centers in the full width band.
 */
const sharp = require('sharp');
const { resizeContain } = require('../utils/imageLoader');
const { renderTextLayer, drawRoundedRect, wrapText } = require('../utils/textRenderer');

const W = 1080;
const H = 1080;
const PAD = 56;

const PROD_TOP  = 235;
const PROD_H    = 295;
const SLOT_W    = 450;
const LEFT_X    = 56;
const RIGHT_X   = 562;  // LEFT_X + SLOT_W + 12 gap
const BODY_Y    = PROD_TOP + PROD_H + 28;

async function render({ products, text, colors }) {
  const bgColor = colors.background || '#FFF0F3';

  // ── 1. Background ─────────────────────────────────────────────────────────
  const base = await sharp({
    create: { width: W, height: H, channels: 4, background: hexToObj(bgColor) },
  }).png().toBuffer();

  // ── 2. Load products in parallel ──────────────────────────────────────────
  const giftW = 136; const giftH = 180;
  const [hoopBuf, bundleBuf, beltBuf, teaBuf, creamBuf] = await Promise.all([
    products.hoop   ? resizeContain(products.hoop,   SLOT_W, PROD_H) : null,
    products.bundle ? resizeContain(products.bundle,  SLOT_W, PROD_H) : null,
    products.belt   ? resizeContain(products.belt,   giftW,  giftH)  : null,
    products.tea    ? resizeContain(products.tea,    giftW,  giftH)  : null,
    products.cream  ? resizeContain(products.cream,  giftW,  giftH)  : null,
  ]);

  // ── 3. Text layer ─────────────────────────────────────────────────────────
  const textBuf = renderTextLayer(W, H, (ctx) => {
    ctx.textAlign = 'center';

    // Headline — large, centered
    const upper = (text.headline || '').toUpperCase();
    let fontSize = 54;
    while (fontSize > 20) {
      ctx.font = `900 ${fontSize}px Impact`;
      if (wrapText(ctx, upper, W - PAD * 2).length <= 3) break;
      fontSize -= 4;
    }
    ctx.font = `900 ${fontSize}px Impact`;
    const hlLines = wrapText(ctx, upper, W - PAD * 2);
    const hlLineH = fontSize * 1.2;
    ctx.fillStyle = colors.headline || '#111111';
    hlLines.forEach((line, i) => ctx.fillText(line, W / 2, 80 + i * hlLineH));

    // Subheadline
    if (text.subheadline) {
      ctx.font = 'bold 26px Arial';
      ctx.fillStyle = '#444444';
      ctx.fillText(text.subheadline, W / 2, 80 + hlLines.length * hlLineH + 12);
    }

    // Divider line above product zone
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(PAD, PROD_TOP - 14);
    ctx.lineTo(W - PAD, PROD_TOP - 14);
    ctx.stroke();

    // Body copy below product zone
    if (text.body) {
      const paragraphs = text.body.split('\n').filter(Boolean);
      ctx.font = '21px Arial';
      ctx.fillStyle = '#333333';
      ctx.textAlign = 'left';
      let curY = BODY_Y;
      paragraphs.slice(0, 5).forEach((para) => {
        wrapText(ctx, para, W - PAD * 2).forEach((line) => {
          if (curY < H - 90) { ctx.fillText(line, PAD, curY); curY += 30; }
        });
        curY += 6;
      });
    }

    // CTA — bold colored text at bottom, no button
    if (text.cta) {
      ctx.font = 'bold 34px Arial';
      ctx.fillStyle = colors.badge_bg || '#FF2D55';
      ctx.textAlign = 'center';
      ctx.fillText(text.cta.toUpperCase(), W / 2, H - PAD);
    }
  });

  // ── 4. Composite ─────────────────────────────────────────────────────────
  const composites = [];
  const hasLeft  = bundleBuf || beltBuf || teaBuf || creamBuf;
  const hasRight = !!hoopBuf;

  if (hasLeft && hasRight) {
    // Both slots occupied
    if (bundleBuf) {
      composites.push({ input: bundleBuf, top: PROD_TOP, left: LEFT_X });
    } else {
      // Individual items stacked in left slot
      const items = [beltBuf, teaBuf, creamBuf].filter(Boolean);
      const gap   = 10;
      const totalW = items.length * giftW + (items.length - 1) * gap;
      let lx = LEFT_X + Math.round((SLOT_W - totalW) / 2);
      items.forEach((buf) => {
        composites.push({ input: buf, top: PROD_TOP + Math.round((PROD_H - giftH) / 2), left: lx });
        lx += giftW + gap;
      });
    }
    composites.push({ input: hoopBuf, top: PROD_TOP, left: RIGHT_X });
  } else if (hasRight && !hasLeft) {
    // Only hoop — center it
    composites.push({ input: hoopBuf, top: PROD_TOP, left: Math.round((W - SLOT_W) / 2) });
  } else if (hasLeft && !hasRight) {
    // Only bundle/items — center them
    if (bundleBuf) {
      composites.push({ input: bundleBuf, top: PROD_TOP, left: Math.round((W - SLOT_W) / 2) });
    } else {
      const items = [beltBuf, teaBuf, creamBuf].filter(Boolean);
      const gap   = 20;
      const totalW = items.length * giftW + (items.length - 1) * gap;
      let lx = Math.round((W - totalW) / 2);
      items.forEach((buf) => {
        composites.push({ input: buf, top: PROD_TOP + Math.round((PROD_H - giftH) / 2), left: lx });
        lx += giftW + gap;
      });
    }
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
