const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

// ── Font registration ─────────────────────────────────────────────────────────
// Bundled via @fontsource — work identically on macOS, Linux (Railway), and CI.
// Oswald is a condensed grotesque — visually close to Impact.
// Roboto is a neutral sans-serif — visually close to Arial.
const FONT_BASE = path.join(__dirname, '../../node_modules/@fontsource');

function reg(relPath, family) {
  try {
    const result = GlobalFonts.registerFromPath(path.join(FONT_BASE, relPath), family);
    return !!result;
  } catch (e) {
    console.warn(`Font registration failed for ${family}:`, e.message);
    return false;
  }
}

// Register all weights we use. Register under stable alias names so layouts
// don't need to know the underlying package name.
reg('oswald/files/oswald-latin-700-normal.woff2', 'IHImpact');   // headline / badge heavy
reg('oswald/files/oswald-latin-600-normal.woff2', 'IHImpact');   // same family, 600
reg('oswald/files/oswald-latin-500-normal.woff2', 'IHImpact');   // same family, 500
reg('roboto/files/roboto-latin-700-normal.woff2', 'IHBold');     // badge text, CTA, UI labels
reg('roboto/files/roboto-latin-400-normal.woff2', 'IHRegular');  // body copy

// Convenience font strings used by layout files
const F = {
  headline: (px)   => `700 ${px}px IHImpact`,   // large headline — Oswald Bold
  badge:    (px)   => `700 ${px}px IHBold`,      // badge pill / social proof — Roboto Bold
  cta:      (px)   => `700 ${px}px IHBold`,      // CTA button
  body:     (px)   => `400 ${px}px IHRegular`,   // body copy
  logo:     (px)   => `700 ${px}px IHBold`,      // logo wordmark
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Wrap text into lines that fit within maxWidth. Returns string[]. */
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

/** Auto-reduce fontSize until text wraps to ≤ maxLines lines within maxWidth. */
function fitFontSize(ctx, fontFn, text, maxWidth, startPx, minPx = 14, maxLines = 3) {
  let px = startPx;
  while (px >= minPx) {
    ctx.font = fontFn(px);
    if (wrapText(ctx, text, maxWidth).length <= maxLines) break;
    px -= 4;
  }
  return px;
}

/** Draw a filled rounded rectangle path. */
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

/**
 * Render a 1080×1080 transparent text layer.
 * drawFn receives (ctx, canvas). Returns a PNG Buffer ready for Sharp composite.
 */
function renderTextLayer(width, height, drawFn) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  drawFn(ctx, canvas);
  return canvas.toBuffer('image/png');
}

module.exports = { F, hexToRgba, wrapText, fitFontSize, renderTextLayer, drawRoundedRect };
