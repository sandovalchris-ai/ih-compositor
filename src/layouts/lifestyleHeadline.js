/**
 * lifestyle-headline — lifestyle/background photo fills frame (IH7 reference)
 */
const sharp = require('sharp');
const { resizeContain, resizeCover } = require('../utils/imageLoader');
const { F, renderTextLayer, drawRoundedRect, wrapText, fitFontSize } = require('../utils/textRenderer');

const W = 1080, H = 1080, PAD = 40;
const HOOP_LEFT = 350, HOOP_TOP = 390, HOOP_W = 380, HOOP_H = 480;
const GIFT_SIZE = 200;
const BELT_LEFT = 52,  BELT_TOP  = 830;
const TEA_LEFT  = 440, TEA_TOP   = 830;
const CREAM_LEFT= 828, CREAM_TOP = 830;
const LABEL_Y   = 790;

async function render({ products, text, colors, background }) {
  // ── 1. Background ──────────────────────────────────────────────────────────
  let base;
  if (background) {
    base = await resizeCover(background, W, H);
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

  // ── 2. Products ────────────────────────────────────────────────────────────
  const [hoopBuf, beltBuf, teaBuf, creamBuf] = await Promise.all([
    products.hoop  ? resizeContain(products.hoop,  HOOP_W,   HOOP_H)   : null,
    products.belt  ? resizeContain(products.belt,  GIFT_SIZE, GIFT_SIZE) : null,
    products.tea   ? resizeContain(products.tea,   GIFT_SIZE, GIFT_SIZE) : null,
    products.cream ? resizeContain(products.cream, GIFT_SIZE, GIFT_SIZE) : null,
  ]);

  // ── 3. Text / overlay layer ────────────────────────────────────────────────
  const textBuf = renderTextLayer(W, H, (ctx) => {
    const boxX = PAD, boxW = W - PAD * 2, boxPad = 30;

    // White rounded headline box
    if (text.headline) {
      const upper = text.headline.toUpperCase();
      const px    = fitFontSize(ctx, F.headline, upper, boxW - boxPad * 2, 52, 22, 3);
      ctx.font = F.headline(px);
      const lines = wrapText(ctx, upper, boxW - boxPad * 2);
      const lineH = px * 1.2;
      const boxH  = lines.length * lineH + boxPad * 2;
      const boxY  = PAD;

      // White box
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 24);
      ctx.fill();

      // Headline text
      ctx.font      = F.headline(px);
      ctx.fillStyle = colors.headline || '#111111';
      ctx.textAlign = 'center';
      lines.forEach((line, i) =>
        ctx.fillText(line, W / 2, boxY + boxPad + px * 0.85 + i * lineH));

      // Badge pill below headline box
      if (text.badge) {
        const bY = boxY + boxH + 14;
        ctx.font = F.badge(24);
        const bW = ctx.measureText(text.badge).width + 48;
        ctx.fillStyle = colors.badge_bg || '#FF2D55';
        drawRoundedRect(ctx, (W - bW) / 2, bY, bW, 46, 23);
        ctx.fill();
        ctx.fillStyle = colors.badge_text || '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(text.badge, W / 2, bY + 30);
      }
    }

    // Callout labels with arrows pointing to each gift product
    const callouts = [
      { label: 'FREE SWEAT BELT',  cx: BELT_LEFT  + GIFT_SIZE / 2, cy: BELT_TOP  + 20 },
      { label: 'FREE DETOX TEA',   cx: TEA_LEFT   + GIFT_SIZE / 2, cy: TEA_TOP   + 20 },
      { label: 'FREE SWEAT CREAM', cx: CREAM_LEFT + GIFT_SIZE / 2, cy: CREAM_TOP + 20 },
    ];
    const giftBufs = [beltBuf, teaBuf, creamBuf];

    callouts.forEach(({ label, cx, cy }, idx) => {
      if (!giftBufs[idx]) return;

      ctx.font = F.badge(17);
      const lW = ctx.measureText(label).width + 28;
      const lX = cx - lW / 2;
      const lY = LABEL_Y - 36;

      // Arrow line
      ctx.beginPath();
      ctx.moveTo(cx, lY + 36);
      ctx.lineTo(cx, cy);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth   = 2;
      ctx.stroke();

      // Arrow dot
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();

      // Label pill
      ctx.fillStyle = 'rgba(255,255,255,0.93)';
      drawRoundedRect(ctx, lX, lY, lW, 34, 17);
      ctx.fill();
      ctx.font      = F.badge(17);
      ctx.fillStyle = '#111111';
      ctx.textAlign = 'center';
      ctx.fillText(label, cx, lY + 22);
    });
  });

  // ── 4. Composite ──────────────────────────────────────────────────────────
  const composites = [];
  if (hoopBuf)  composites.push({ input: hoopBuf,  top: HOOP_TOP,  left: HOOP_LEFT  });
  if (beltBuf)  composites.push({ input: beltBuf,  top: BELT_TOP,  left: BELT_LEFT  });
  if (teaBuf)   composites.push({ input: teaBuf,   top: TEA_TOP,   left: TEA_LEFT   });
  if (creamBuf) composites.push({ input: creamBuf, top: CREAM_TOP, left: CREAM_LEFT });
  composites.push({ input: textBuf, top: 0, left: 0 });

  return sharp(base).composite(composites).png().toBuffer();
}

module.exports = { render };
