const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

// Register system fonts
try {
  GlobalFonts.registerFromPath('/System/Library/Fonts/Helvetica.ttc', 'Helvetica');
  GlobalFonts.registerFromPath('/System/Library/Fonts/Arial.ttf', 'Arial');
  GlobalFonts.registerFromPath('/System/Library/Fonts/Impact.ttf', 'Impact');
} catch (e) {
  // Fonts may not be available — fall back to system defaults
}

function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function measureText(ctx, text, maxWidth) {
  return ctx.measureText(text).width <= maxWidth;
}

function autoFontSize(ctx, text, maxWidth, startSize, minSize = 12) {
  let size = startSize;
  while (size >= minSize) {
    ctx.font = ctx.font.replace(/\d+px/, `${size}px`);
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

/**
 * Wrap text into lines that fit within maxWidth.
 * Returns array of strings.
 */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Render text onto a transparent canvas layer and return as PNG buffer.
 * This layer gets composited over the base image using Sharp.
 */
function renderTextLayer(width, height, drawFn) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  drawFn(ctx, canvas);
  return canvas.toBuffer('image/png');
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

module.exports = {
  hexToRgba,
  autoFontSize,
  wrapText,
  renderTextLayer,
  drawRoundedRect,
  measureText,
};
