/**
 * lifestyle-headline — lifestyle/background photo fills frame
 * White headline box overlay · badge pill · product callouts with arrows
 * Supports: assets.lifestyle or assets.model or assets.before_after as background
 */
const sharp = require('sharp');
const { resizeContain, resizeCover } = require('../utils/imageLoader');
const { F, renderTextLayer, drawRoundedRect, drawPill, drawCTA, wrapText, fitFontSize } = require('../utils/textRenderer');

const W = 1080, H = 1080, PAD = 40;
const HOOP_LEFT = 340, HOOP_TOP = 380, HOOP_W = 400, HOOP_H = 500;
const GIFT_SIZE = 210;
const BELT_LEFT = 40,  BELT_TOP  = 830;
const TEA_LEFT  = 435, TEA_TOP   = 830;
const CREAM_LEFT= 830, CREAM_TOP = 830;
const LABEL_Y   = 790;

async function render({ products, text, colors, background, assets }) {
  // Background priority: lifestyle > model > before_after > explicit background > gradient
  let base;
  const bgSrc = assets?.lifestyle || assets?.model || assets?.before_after || background;

  if (bgSrc) {
    base = await resizeCover(bgSrc, W, H);
  } else {
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FFB6C1"/>
        <stop offset="100%" stop-color="#FF6B8A"/>
      </linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
    </svg>`;
    base = await sharp(Buffer.from(svg)).png().toBuffer();
  }

  // When before_after is used, add a center split line overlay
  const compositesPre = [];
  if (assets?.before_after) {
    const splitLine = await sharp({
      create: { width: 4, height: H, channels: 4, background: { r:255, g:255, b:255, alpha: 0.7 } },
    }).png().toBuffer();
    compositesPre.push({ input: splitLine, top: 0, left: Math.round(W / 2) - 2 });
  }

  const [hoopBuf, beltBuf, teaBuf, creamBuf] = await Promise.all([
    products.hoop  ? resizeContain(products.hoop,  HOOP_W,    HOOP_H)    : null,
    products.belt  ? resizeContain(products.belt,  GIFT_SIZE, GIFT_SIZE) : null,
    products.tea   ? resizeContain(products.tea,   GIFT_SIZE, GIFT_SIZE) : null,
    products.cream ? resizeContain(products.cream, GIFT_SIZE, GIFT_SIZE) : null,
  ]);

  const textBuf = renderTextLayer(W, H, (ctx) => {
    const boxX = PAD, boxW = W - PAD * 2, boxPad = 28;

    // ── White headline box ──
    if (text.headline) {
      const upper = text.headline.toUpperCase();
      const px    = fitFontSize(ctx, F.headline, upper, boxW - boxPad * 2, 96, 28, 3);
      ctx.font    = F.headline(px);
      const lines = wrapText(ctx, upper, boxW - boxPad * 2);
      const lineH = px * 1.08;
      const boxH  = lines.length * lineH + boxPad * 2;
      const boxY  = PAD;

      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 20);
      ctx.fill();

      ctx.font      = F.headline(px);
      ctx.fillStyle = colors.headline || '#111111';
      ctx.textAlign = 'center';
      lines.forEach((line, i) =>
        ctx.fillText(line, W / 2, boxY + boxPad + px * 0.82 + i * lineH));

      // ── Badge pill below headline box ──
      if (text.badge) {
        const bY = boxY + boxH + 12;
        const bFont = F.badge(24);
        ctx.font = bFont;
        const bW = ctx.measureText(text.badge).width + 48;
        ctx.fillStyle = colors.badge_bg || '#FF2D55';
        drawRoundedRect(ctx, (W - bW) / 2, bY, bW, 50, 25);
        ctx.fill();
        ctx.fillStyle = colors.badge_text || '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(text.badge, W / 2, bY + 32);
      }
    }

    // ── CTA at bottom ──
    if (text.cta) {
      drawCTA(ctx, text.cta, H - PAD - 76, W, PAD, {
        bg: colors.cta_bg || '#FF2D55',
        color: colors.cta_text || '#FFFFFF',
        height: 76,
        fontSize: 30,
      });
    }

    // ── Callout labels for gift products ──
    const callouts = [
      { label: 'FREE SWEAT BELT',  cx: BELT_LEFT  + GIFT_SIZE / 2, cy: BELT_TOP  + 20 },
      { label: 'FREE DETOX TEA',   cx: TEA_LEFT   + GIFT_SIZE / 2, cy: TEA_TOP   + 20 },
      { label: 'FREE SWEAT CREAM', cx: CREAM_LEFT + GIFT_SIZE / 2, cy: CREAM_TOP + 20 },
    ];
    const giftBufs = [beltBuf, teaBuf, creamBuf];

    callouts.forEach(({ label, cx, cy }, idx) => {
      if (!giftBufs[idx]) return;

      ctx.font = F.badge(16);
      const lW = ctx.measureText(label).width + 24;
      const lX = cx - lW / 2;
      const lY = LABEL_Y - 34;

      ctx.beginPath();
      ctx.moveTo(cx, lY + 34);
      ctx.lineTo(cx, cy);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth   = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      drawRoundedRect(ctx, lX, lY, lW, 32, 16);
      ctx.fill();
      ctx.font      = F.badge(16);
      ctx.fillStyle = '#111111';
      ctx.textAlign = 'center';
      ctx.fillText(label, cx, lY + 21);
    });
  });

  const composites = [...compositesPre];
  if (hoopBuf)  composites.push({ input: hoopBuf,  top: HOOP_TOP,  left: HOOP_LEFT  });
  if (beltBuf)  composites.push({ input: beltBuf,  top: BELT_TOP,  left: BELT_LEFT  });
  if (teaBuf)   composites.push({ input: teaBuf,   top: TEA_TOP,   left: TEA_LEFT   });
  if (creamBuf) composites.push({ input: creamBuf, top: CREAM_TOP, left: CREAM_LEFT });
  composites.push({ input: textBuf, top: 0, left: 0 });

  return sharp(base).composite(composites).png().toBuffer();
}

module.exports = { render };
