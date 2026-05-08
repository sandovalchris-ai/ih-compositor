/**
 * ih-bundle — white/light background sale style (IH8 reference)
 *
 * Product zones (all use resizeContain — aspect ratio never altered):
 *   Hoop hero:   600 × 400, centered horizontally, top=355
 *   Bundle photo: 520 × 150, centered horizontally, top=762
 *   — OR —
 *   Individual belt/tea/cream: each 230 × 148, side by side, top=762
 */
const sharp = require('sharp');
const { resizeContain } = require('../utils/imageLoader');
const { renderTextLayer, drawRoundedRect, wrapText } = require('../utils/textRenderer');

const W = 1080;
const H = 1080;
const PAD = 48;

// Fixed product zone Y positions
const HOOP_TOP  = 355;
const HOOP_W    = 600;
const HOOP_H    = 400;
const GIFTS_TOP = 762;
const GIFT_H    = 148;

async function render({ products, text, colors }) {
  const bgColor = colors.background || '#FFFFFF';

  // ── 1. Background ─────────────────────────────────────────────────────────
  const base = await sharp({
    create: { width: W, height: H, channels: 4, background: hexToObj(bgColor) },
  }).png().toBuffer();

  // ── 2. Load product images in parallel ────────────────────────────────────
  const [hoopBuf, bundleBuf, beltBuf, teaBuf, creamBuf] = await Promise.all([
    products.hoop   ? resizeContain(products.hoop,  HOOP_W, HOOP_H) : null,
    products.bundle ? resizeContain(products.bundle, 520, GIFT_H)   : null,
    products.belt   ? resizeContain(products.belt,   230, GIFT_H)   : null,
    products.tea    ? resizeContain(products.tea,    230, GIFT_H)   : null,
    products.cream  ? resizeContain(products.cream,  230, GIFT_H)   : null,
  ]);

  // ── 3. Text layer ─────────────────────────────────────────────────────────
  const textBuf = renderTextLayer(W, H, (ctx) => {
    // Logo
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('INFINITY HOOP', W / 2, 52);

    // Social proof pill
    const spText = '★★★★★  Loved by 500,000+ Women';
    ctx.font = 'bold 18px Arial';
    const spW = ctx.measureText(spText).width + 40;
    ctx.fillStyle = '#111111';
    drawRoundedRect(ctx, (W - spW) / 2, 66, spW, 36, 18);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(spText, W / 2, 90);

    // Badge pill
    if (text.badge) {
      ctx.font = 'bold 22px Arial';
      const bW = ctx.measureText(text.badge).width + 48;
      const bY = 114;
      ctx.fillStyle = colors.badge_bg || '#FF2D55';
      drawRoundedRect(ctx, (W - bW) / 2, bY, bW, 44, 22);
      ctx.fill();
      ctx.fillStyle = colors.badge_text || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text.badge, W / 2, bY + 28);
    }

    // Headline — auto-sizes from 76px down, max 3 lines
    if (text.headline) {
      let fontSize = 76;
      const upper = text.headline.toUpperCase();
      while (fontSize > 28) {
        ctx.font = `900 ${fontSize}px Impact`;
        if (wrapText(ctx, upper, W - PAD * 2).length <= 3) break;
        fontSize -= 4;
      }
      ctx.font = `900 ${fontSize}px Impact`;
      const lines = wrapText(ctx, upper, W - PAD * 2);
      ctx.fillStyle = colors.headline || '#111111';
      ctx.textAlign = 'center';
      lines.forEach((line, i) => ctx.fillText(line, W / 2, 182 + i * fontSize * 1.15));
    }

    // Subheadline
    if (text.subheadline) {
      ctx.font = 'bold 26px Arial';
      ctx.fillStyle = '#555555';
      ctx.textAlign = 'center';
      ctx.fillText(text.subheadline, W / 2, 340);
    }

    // "FREE GIFTS INCLUDED" label above the gift row (only when gifts are shown)
    const hasGifts = bundleBuf || beltBuf || teaBuf || creamBuf;
    if (hasGifts) {
      ctx.font = 'bold 17px Arial';
      ctx.fillStyle = '#888888';
      ctx.textAlign = 'center';
      ctx.fillText('FREE GIFTS INCLUDED:', W / 2, GIFTS_TOP - 12);
    }

    // Urgency line (sits between gifts and CTA)
    if (text.urgency) {
      ctx.font = '17px Arial';
      ctx.fillStyle = '#888888';
      ctx.textAlign = 'center';
      ctx.fillText(text.urgency, W / 2, H - PAD - 72 - 22);
    }

    // CTA pill — full width, fixed at bottom
    if (text.cta) {
      const ctaH = 72;
      const ctaY = H - ctaH - PAD;
      ctx.fillStyle = colors.cta_bg || '#FF2D55';
      drawRoundedRect(ctx, PAD, ctaY, W - PAD * 2, ctaH, 36);
      ctx.fill();
      ctx.font = 'bold 30px Arial';
      ctx.fillStyle = colors.cta_text || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text.cta.toUpperCase(), W / 2, ctaY + 46);
    }
  });

  // ── 4. Composite: bg → hoop → gifts → text ───────────────────────────────
  const composites = [];

  // Hoop centered
  if (hoopBuf) {
    composites.push({ input: hoopBuf, top: HOOP_TOP, left: Math.round((W - HOOP_W) / 2) });
  }

  // Bundle photo OR individual items side-by-side
  if (bundleBuf) {
    composites.push({ input: bundleBuf, top: GIFTS_TOP, left: Math.round((W - 520) / 2) });
  } else {
    // Lay out whichever individual items were supplied
    const items = [beltBuf, teaBuf, creamBuf].filter(Boolean);
    const itemW = 230;
    const gap   = 20;
    const totalW = items.length * itemW + (items.length - 1) * gap;
    let leftX = Math.round((W - totalW) / 2);
    items.forEach((buf) => {
      composites.push({ input: buf, top: GIFTS_TOP, left: leftX });
      leftX += itemW + gap;
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
