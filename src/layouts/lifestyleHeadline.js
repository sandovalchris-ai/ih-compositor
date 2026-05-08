/**
 * lifestyle-headline layout — lifestyle photo fills frame, headline box overlay,
 * badge pill, product callout labels with arrows (IH7 reference)
 */
const sharp = require('sharp');
const { resizeContain, resizeCover } = require('../utils/imageLoader');
const { renderTextLayer, drawRoundedRect, wrapText } = require('../utils/textRenderer');

const W = 1080;
const H = 1080;
const PAD = 40;

async function render(params) {
  const { products, text, colors, background } = params;

  // ── 1. Background (lifestyle photo fills frame) ───────────────────────────
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

  // ── 2. Text overlay layer ─────────────────────────────────────────────────
  const textBuf = renderTextLayer(W, H, (ctx) => {
    const boxPad = 32;
    const boxX = PAD;
    const boxW = W - PAD * 2;

    // White rounded headline box
    if (text.headline) {
      let fontSize = 52;
      const headlineUpper = text.headline.toUpperCase();
      while (fontSize > 22) {
        ctx.font = `900 ${fontSize}px Impact`;
        const lines = wrapText(ctx, headlineUpper, boxW - boxPad * 2);
        if (lines.length <= 3) break;
        fontSize -= 4;
      }
      ctx.font = `900 ${fontSize}px Impact`;
      const lines = wrapText(ctx, headlineUpper, boxW - boxPad * 2);
      const lineH = fontSize * 1.2;
      const boxH = lines.length * lineH + boxPad * 2;
      const boxY = PAD;

      // White box
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 24);
      ctx.fill();

      // Headline text
      ctx.fillStyle = colors.headline || '#111111';
      ctx.textAlign = 'center';
      lines.forEach((line, i) => {
        ctx.fillText(line, W / 2, boxY + boxPad + fontSize + i * lineH - 4);
      });

      // Badge pill below headline box
      if (text.badge) {
        const bY = boxY + boxH + 16;
        ctx.font = 'bold 24px Arial';
        const bW = ctx.measureText(text.badge).width + 48;
        const bX = (W - bW) / 2;
        ctx.fillStyle = colors.badge_bg || '#FF2D55';
        drawRoundedRect(ctx, bX, bY, bW, 46, 23);
        ctx.fill();
        ctx.fillStyle = colors.badge_text || '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(text.badge, W / 2, bY + 29);
      }
    }

    // Product callout labels with arrow lines (bottom area)
    const callouts = [
      { label: 'FREE SWEAT BELT', x: 180, y: H - 220, arrowX: 200, arrowY: H - 160 },
      { label: 'FREE SWEAT CREAM', x: W / 2 - 80, y: H - 260, arrowX: W / 2, arrowY: H - 180 },
      { label: 'FREE DETOX TEA', x: W - 260, y: H - 220, arrowX: W - 220, arrowY: H - 160 },
    ];

    callouts.forEach(({ label, x, y, arrowX, arrowY }) => {
      // Arrow line
      ctx.beginPath();
      ctx.moveTo(x + 60, y + 22);
      ctx.lineTo(arrowX, arrowY);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Arrow dot
      ctx.beginPath();
      ctx.arc(arrowX, arrowY, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();

      // Label pill
      ctx.font = 'bold 18px Arial';
      const lW = ctx.measureText(label).width + 28;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      drawRoundedRect(ctx, x, y, lW, 36, 18);
      ctx.fill();
      ctx.fillStyle = '#111111';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + lW / 2, y + 23);
    });
  });

  // ── 3. Composite ─────────────────────────────────────────────────────────
  return sharp(base)
    .composite([{ input: textBuf, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

module.exports = { render };
