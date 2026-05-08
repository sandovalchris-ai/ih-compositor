/**
 * dark-product — dark background, products right column, text left (IH3 reference)
 *
 * Product zones (right column, x=580–1060):
 *   Hoop:         480 × 680, top=80, left=580
 *   Bundle photo: 460 × 175, top=768, left=590
 *   — OR —
 *   Individual belt/tea/cream: each 148 × 148, top=780, spaced across right column
 */
const sharp = require('sharp');
const { resizeContain, resizeCover } = require('../utils/imageLoader');
const { renderTextLayer, drawRoundedRect, wrapText } = require('../utils/textRenderer');

const W = 1080;
const H = 1080;
const PAD = 56;

const HOOP_LEFT = 580;
const HOOP_W    = 480;
const HOOP_H    = 680;
const HOOP_TOP  = 80;
const GIFT_TOP  = 768;
const GIFT_W    = 460;
const GIFT_H    = 175;

async function render({ products, text, colors, background }) {
  const bgColor = colors.background || '#111111';

  // ── 1. Background ─────────────────────────────────────────────────────────
  let base;
  if (background) {
    const raw = await resizeCover(background, W, H);
    // Darken so white text stays readable
    const dim = await sharp({
      create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.6 } },
    }).png().toBuffer();
    base = await sharp(raw).composite([{ input: dim, top: 0, left: 0 }]).png().toBuffer();
  } else {
    base = await sharp({
      create: { width: W, height: H, channels: 4, background: hexToObj(bgColor) },
    }).png().toBuffer();
  }

  // ── 2. Load all product images in parallel ────────────────────────────────
  const itemW = 145;
  const itemH = 145;
  const [hoopBuf, bundleBuf, beltBuf, teaBuf, creamBuf] = await Promise.all([
    products.hoop   ? resizeContain(products.hoop,   HOOP_W, HOOP_H) : null,
    products.bundle ? resizeContain(products.bundle,  GIFT_W, GIFT_H) : null,
    products.belt   ? resizeContain(products.belt,   itemW, itemH) : null,
    products.tea    ? resizeContain(products.tea,    itemW, itemH) : null,
    products.cream  ? resizeContain(products.cream,  itemW, itemH) : null,
  ]);

  // ── 3. Text layer (left half) ─────────────────────────────────────────────
  const leftW = HOOP_LEFT - PAD - 20;

  const textBuf = renderTextLayer(W, H, (ctx) => {
    // Logo top-left
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('INFINITY HOOP', PAD, 54);

    // Badge top-right (above hoop column)
    if (text.badge) {
      ctx.font = 'bold 20px Arial';
      const bW = ctx.measureText(text.badge).width + 40;
      const bX = W - bW - PAD;
      ctx.fillStyle = colors.badge_bg || '#FF2D55';
      drawRoundedRect(ctx, bX, 30, bW, 40, 20);
      ctx.fill();
      ctx.fillStyle = colors.badge_text || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text.badge, bX + bW / 2, 56);
    }

    // Headline — left side, large white
    if (text.headline) {
      let fontSize = 68;
      const upper = text.headline.toUpperCase();
      ctx.textAlign = 'left';
      while (fontSize > 28) {
        ctx.font = `900 ${fontSize}px Impact`;
        if (wrapText(ctx, upper, leftW).length <= 4) break;
        fontSize -= 4;
      }
      ctx.font = `900 ${fontSize}px Impact`;
      const lines = wrapText(ctx, upper, leftW);
      ctx.fillStyle = '#FFFFFF';
      const startY = 155;
      lines.forEach((line, i) => ctx.fillText(line, PAD, startY + i * fontSize * 1.15));

      // Body copy below headline
      if (text.body) {
        const bodyY = startY + lines.length * fontSize * 1.15 + 22;
        ctx.font = '21px Arial';
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        wrapText(ctx, text.body.split('\n')[0], leftW)
          .slice(0, 5)
          .forEach((line, i) => ctx.fillText(line, PAD, bodyY + i * 30));
      }
    }

    // Subheadline
    if (text.subheadline) {
      ctx.font = 'bold 24px Arial';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.textAlign = 'left';
      ctx.fillText(text.subheadline, PAD, 700);
    }

    // CTA button — left side, lower
    if (text.cta) {
      const ctaY = H - 148;
      ctx.fillStyle = colors.cta_bg || '#FF2D55';
      drawRoundedRect(ctx, PAD, ctaY, leftW, 64, 32);
      ctx.fill();
      ctx.font = 'bold 26px Arial';
      ctx.fillStyle = colors.cta_text || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text.cta.toUpperCase(), PAD + leftW / 2, ctaY + 40);
    }

    // Urgency
    if (text.urgency) {
      ctx.font = '15px Arial';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.textAlign = 'left';
      ctx.fillText(text.urgency, PAD, H - 64);
    }
  });

  // ── 4. Composite: bg → hoop → gifts → text ───────────────────────────────
  const composites = [];

  if (hoopBuf) {
    composites.push({ input: hoopBuf, top: HOOP_TOP, left: HOOP_LEFT });
  }

  if (bundleBuf) {
    composites.push({ input: bundleBuf, top: GIFT_TOP, left: HOOP_LEFT + 10 });
  } else {
    const items = [beltBuf, teaBuf, creamBuf].filter(Boolean);
    if (items.length) {
      const gap = 12;
      const totalW = items.length * itemW + (items.length - 1) * gap;
      let leftX = HOOP_LEFT + Math.round((HOOP_W - totalW) / 2);
      items.forEach((buf) => {
        composites.push({ input: buf, top: GIFT_TOP + 14, left: leftX });
        leftX += itemW + gap;
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
