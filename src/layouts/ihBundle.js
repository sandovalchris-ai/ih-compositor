/**
 * ih-bundle — white/light background sale style (IH8 reference)
 *
 * Structure top→bottom:
 *   Logo · Social proof pill · Badge pill · Headline
 *   Hoop (hero, centered) · Free gifts row
 *   CTA pill · Urgency line
 */
const sharp = require('sharp');
const { resizeContain } = require('../utils/imageLoader');
const { F, renderTextLayer, drawRoundedRect, wrapText, fitFontSize } = require('../utils/textRenderer');

const W = 1080, H = 1080, PAD = 48;
// Vertical zones (pixel-exact so nothing overlaps):
//   Logo:         y=42
//   Social proof: y=56–84 (28px pill)
//   Badge:        y=92–130 (38px pill)
//   Headline:     y=152+ baseline (top of 76px caps = 152–58 = 94 > 130 ✓)
//   Hoop:         y=415–755
//   Gifts:        y=763–911
//   Urgency:      y=916
//   CTA:          y=928–1000
const BADGE_BOTTOM = 130;
const HL_Y_START   = 155;   // headline first-line baseline; cap-top ≈ 155-60 = 95 > BADGE_BOTTOM ✓
const HOOP_TOP = 415, HOOP_W = 600, HOOP_H = 340;
const GIFTS_TOP = 763, GIFT_H = 148;

async function render({ products, text, colors }) {
  const bgColor = colors.background || '#FFFFFF';

  // ── 1. Background ──────────────────────────────────────────────────────────
  const base = await sharp({
    create: { width: W, height: H, channels: 4, background: hexToObj(bgColor) },
  }).png().toBuffer();

  // ── 2. Product images (parallel) ──────────────────────────────────────────
  const [hoopBuf, bundleBuf, beltBuf, teaBuf, creamBuf] = await Promise.all([
    products.hoop   ? resizeContain(products.hoop,   HOOP_W, HOOP_H) : null,
    products.bundle ? resizeContain(products.bundle,  520,    GIFT_H) : null,
    products.belt   ? resizeContain(products.belt,    230,    GIFT_H) : null,
    products.tea    ? resizeContain(products.tea,     230,    GIFT_H) : null,
    products.cream  ? resizeContain(products.cream,   230,    GIFT_H) : null,
  ]);

  // ── 3. Text layer ──────────────────────────────────────────────────────────
  const textBuf = renderTextLayer(W, H, (ctx) => {
    // Logo
    ctx.font      = F.logo(22);
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'center';
    ctx.fillText('INFINITY HOOP', W / 2, 52);

    // Social proof pill
    const spText = '★★★★★  Loved by 500,000+ Women';
    ctx.font = F.badge(17);
    const spW = ctx.measureText(spText).width + 40;
    ctx.fillStyle = '#111111';
    drawRoundedRect(ctx, (W - spW) / 2, 66, spW, 36, 18);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(spText, W / 2, 90);

    // Badge pill
    if (text.badge) {
      ctx.font = F.badge(22);
      const bW = ctx.measureText(text.badge).width + 48;
      const bY = 114;
      ctx.fillStyle = colors.badge_bg || '#FF2D55';
      drawRoundedRect(ctx, (W - bW) / 2, bY, bW, 44, 22);
      ctx.fill();
      ctx.fillStyle = colors.badge_text || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text.badge, W / 2, bY + 29);
    }

    // Headline — auto-size, max 3 lines
    if (text.headline) {
      const upper = text.headline.toUpperCase();
      const maxW  = W - PAD * 2;
      const px    = fitFontSize(ctx, F.headline, upper, maxW, 76, 28, 3);
      ctx.font      = F.headline(px);
      ctx.fillStyle = colors.headline || '#111111';
      ctx.textAlign = 'center';
      wrapText(ctx, upper, maxW).forEach((line, i) =>
        ctx.fillText(line, W / 2, HL_Y_START + i * px * 1.15));
    }

    // Subheadline
    if (text.subheadline) {
      ctx.font      = F.badge(26);
      ctx.fillStyle = '#555555';
      ctx.textAlign = 'center';
      ctx.fillText(text.subheadline, W / 2, 340);
    }

    // "FREE GIFTS INCLUDED" label
    const hasGifts = bundleBuf || beltBuf || teaBuf || creamBuf;
    if (hasGifts) {
      ctx.font      = F.body(16);
      ctx.fillStyle = '#888888';
      ctx.textAlign = 'center';
      ctx.fillText('FREE GIFTS INCLUDED:', W / 2, GIFTS_TOP - 14);
    }

    // Urgency
    if (text.urgency) {
      ctx.font      = F.body(17);
      ctx.fillStyle = '#888888';
      ctx.textAlign = 'center';
      ctx.fillText(text.urgency, W / 2, H - PAD - 72 - 22);
    }

    // CTA pill — full-width at bottom
    if (text.cta) {
      const ctaY = H - 72 - PAD;
      ctx.fillStyle = colors.cta_bg || '#FF2D55';
      drawRoundedRect(ctx, PAD, ctaY, W - PAD * 2, 72, 36);
      ctx.fill();
      ctx.font      = F.cta(28);
      ctx.fillStyle = colors.cta_text || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text.cta.toUpperCase(), W / 2, ctaY + 46);
    }
  });

  // ── 4. Composite: bg → hoop → gifts → text ────────────────────────────────
  const composites = [];

  if (hoopBuf)   composites.push({ input: hoopBuf,   top: HOOP_TOP,  left: Math.round((W - HOOP_W) / 2) });

  if (bundleBuf) {
    composites.push({ input: bundleBuf, top: GIFTS_TOP, left: Math.round((W - 520) / 2) });
  } else {
    const items  = [beltBuf, teaBuf, creamBuf].filter(Boolean);
    const itemW  = 230, gap = 20;
    let leftX    = Math.round((W - (items.length * itemW + (items.length - 1) * gap)) / 2);
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
  return { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16), alpha: 1 };
}

module.exports = { render };
