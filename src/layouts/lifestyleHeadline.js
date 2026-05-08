/**
 * lifestyle-headline — lifestyle/background photo fills frame (IH7 reference)
 *
 * Product zones:
 *   Hoop:  380 × 480, centered (x=350, top=390) — overlaid on background scene
 *   Belt:  200 × 200, bottom-left  (x=52,  top=830)
 *   Tea:   200 × 200, bottom-center(x=440, top=830)
 *   Cream: 200 × 200, bottom-right (x=828, top=830)
 *
 * Callout labels sit above each gift product with an arrow pointing down to it.
 */
const sharp = require('sharp');
const { resizeContain, resizeCover } = require('../utils/imageLoader');
const { renderTextLayer, drawRoundedRect, wrapText } = require('../utils/textRenderer');

const W = 1080;
const H = 1080;
const PAD = 40;

// Product positions
const HOOP_LEFT = 350;  const HOOP_TOP = 390;  const HOOP_W = 380;  const HOOP_H = 480;
const GIFT_SIZE = 200;
const BELT_LEFT = 52;   const BELT_TOP  = 830;
const TEA_LEFT  = 440;  const TEA_TOP   = 830;
const CREAM_LEFT= 828;  const CREAM_TOP = 830;

// Callout label Y (sits above each gift)
const LABEL_Y = 790;

async function render({ products, text, colors, background }) {
  // ── 1. Background (lifestyle scene fills frame) ───────────────────────────
  let base;
  if (background) {
    base = await resizeCover(background, W, H);
  } else {
    const gradSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFB6C1"/>
          <stop offset="100%" stop-color="#FF6B8A"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
    </svg>`;
    base = await sharp(Buffer.from(gradSvg)).png().toBuffer();
  }

  // ── 2. Load all product images in parallel ────────────────────────────────
  const [hoopBuf, beltBuf, teaBuf, creamBuf] = await Promise.all([
    products.hoop  ? resizeContain(products.hoop,  HOOP_W,  HOOP_H)  : null,
    products.belt  ? resizeContain(products.belt,  GIFT_SIZE, GIFT_SIZE) : null,
    products.tea   ? resizeContain(products.tea,   GIFT_SIZE, GIFT_SIZE) : null,
    products.cream ? resizeContain(products.cream, GIFT_SIZE, GIFT_SIZE) : null,
  ]);

  // ── 3. Text / overlay layer ───────────────────────────────────────────────
  const textBuf = renderTextLayer(W, H, (ctx) => {
    const boxX  = PAD;
    const boxW  = W - PAD * 2;
    const boxPad = 30;

    // White rounded headline box at top
    if (text.headline) {
      let fontSize = 52;
      const upper = text.headline.toUpperCase();
      while (fontSize > 22) {
        ctx.font = `900 ${fontSize}px Impact`;
        if (wrapText(ctx, upper, boxW - boxPad * 2).length <= 3) break;
        fontSize -= 4;
      }
      ctx.font = `900 ${fontSize}px Impact`;
      const lines = wrapText(ctx, upper, boxW - boxPad * 2);
      const lineH = fontSize * 1.2;
      const boxH  = lines.length * lineH + boxPad * 2;
      const boxY  = PAD;

      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 24);
      ctx.fill();

      ctx.fillStyle = colors.headline || '#111111';
      ctx.textAlign = 'center';
      lines.forEach((line, i) => {
        ctx.fillText(line, W / 2, boxY + boxPad + fontSize * 0.85 + i * lineH);
      });

      // Badge pill below headline box
      if (text.badge) {
        const bY = boxY + boxH + 14;
        ctx.font = 'bold 24px Arial';
        const bW = ctx.measureText(text.badge).width + 48;
        ctx.fillStyle = colors.badge_bg || '#FF2D55';
        drawRoundedRect(ctx, (W - bW) / 2, bY, bW, 46, 23);
        ctx.fill();
        ctx.fillStyle = colors.badge_text || '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(text.badge, W / 2, bY + 29);
      }
    }

    // Callout labels for each free gift — label pill + arrow line pointing to product
    const callouts = [
      { label: 'FREE SWEAT BELT',  productX: BELT_LEFT  + GIFT_SIZE / 2, productY: BELT_TOP  + 20 },
      { label: 'FREE DETOX TEA',   productX: TEA_LEFT   + GIFT_SIZE / 2, productY: TEA_TOP   + 20 },
      { label: 'FREE SWEAT CREAM', productX: CREAM_LEFT + GIFT_SIZE / 2, productY: CREAM_TOP + 20 },
    ];

    const hasAnyGift = beltBuf || teaBuf || creamBuf;

    callouts.forEach(({ label, productX, productY }, idx) => {
      // Only draw callout if the corresponding product was provided
      const hasBuf = [beltBuf, teaBuf, creamBuf][idx];
      if (!hasBuf && hasAnyGift) return;   // skip missing products when at least one exists
      if (!hasAnyGift) return;             // skip if no gifts at all

      ctx.font = 'bold 17px Arial';
      const lW = ctx.measureText(label).width + 28;
      const lX = productX - lW / 2;
      const lY = LABEL_Y - 36;

      // Arrow from bottom of label pill to top of product
      ctx.beginPath();
      ctx.moveTo(productX, lY + 36);
      ctx.lineTo(productX, productY);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Arrowhead dot at product
      ctx.beginPath();
      ctx.arc(productX, productY, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();

      // Label pill
      ctx.fillStyle = 'rgba(255,255,255,0.93)';
      drawRoundedRect(ctx, lX, lY, lW, 34, 17);
      ctx.fill();
      ctx.fillStyle = '#111111';
      ctx.textAlign = 'center';
      ctx.fillText(label, productX, lY + 22);
    });
  });

  // ── 4. Composite: bg → hoop → gifts → text ───────────────────────────────
  const composites = [];

  // Hoop overlaid on scene (behind gift row, in front of background)
  if (hoopBuf) {
    composites.push({ input: hoopBuf, top: HOOP_TOP, left: HOOP_LEFT });
  }

  // Individual free-gift products in bottom strip
  if (beltBuf)  composites.push({ input: beltBuf,  top: BELT_TOP,  left: BELT_LEFT  });
  if (teaBuf)   composites.push({ input: teaBuf,   top: TEA_TOP,   left: TEA_LEFT   });
  if (creamBuf) composites.push({ input: creamBuf, top: CREAM_TOP, left: CREAM_LEFT });

  // Text on top of everything
  composites.push({ input: textBuf, top: 0, left: 0 });

  return sharp(base).composite(composites).png().toBuffer();
}

module.exports = { render };
