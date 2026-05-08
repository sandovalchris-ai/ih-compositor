const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

// ── Font registration ─────────────────────────────────────────────────────────
const FONT_BASE = path.join(__dirname, '../../node_modules/@fontsource');

function reg(relPath, family) {
  try {
    GlobalFonts.registerFromPath(path.join(FONT_BASE, relPath), family);
  } catch (e) {
    console.warn(`Font registration failed for ${family}:`, e.message);
  }
}

// IHDisplay  → Bebas Neue 400 — ultra-condensed, looks like Impact 900
reg('bebas-neue/files/bebas-neue-latin-400-normal.woff2', 'IHDisplay');
reg('bebas-neue/files/bebas-neue-latin-ext-400-normal.woff2', 'IHDisplay');

// IHImpact   → Oswald 700 — condensed bold, fallback headlines
reg('oswald/files/oswald-latin-700-normal.woff2', 'IHImpact');
reg('oswald/files/oswald-latin-600-normal.woff2', 'IHImpact');

// IHBold     → Roboto 700 — badge pills, CTA text, labels
reg('roboto/files/roboto-latin-700-normal.woff2', 'IHBold');

// IHRegular  → Roboto 400 — body copy, fine print
reg('roboto/files/roboto-latin-400-normal.woff2', 'IHRegular');

// Font strings used by all layout files
const F = {
  headline: (px) => `400 ${px}px IHDisplay`,   // Bebas Neue — ultra-condensed
  badge:    (px) => `700 ${px}px IHBold`,       // Roboto Bold — badge pills, callouts
  cta:      (px) => `700 ${px}px IHBold`,       // Roboto Bold — CTA buttons
  body:     (px) => `400 ${px}px IHRegular`,    // Roboto Regular — body copy
  logo:     (px) => `700 ${px}px IHBold`,       // Roboto Bold — logo wordmark
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgba(hex, alpha = 1) {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0,2), 16);
  const g = parseInt(c.slice(2,4), 16);
  const b = parseInt(c.slice(4,6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

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

function fitFontSize(ctx, fontFn, text, maxWidth, startPx, minPx = 14, maxLines = 3) {
  let px = startPx;
  while (px >= minPx) {
    ctx.font = fontFn(px);
    if (wrapText(ctx, text, maxWidth).length <= maxLines) break;
    px -= 4;
  }
  return px;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const safeR = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeR, y);
  ctx.lineTo(x + w - safeR, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + safeR);
  ctx.lineTo(x + w, y + h - safeR);
  ctx.quadraticCurveTo(x + w, y + h, x + w - safeR, y + h);
  ctx.lineTo(x + safeR, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - safeR);
  ctx.lineTo(x, y + safeR);
  ctx.quadraticCurveTo(x, y, x + safeR, y);
  ctx.closePath();
}

// Draw bold pill badge (colored bg + white text), returns bottom Y
function drawPill(ctx, text, x, y, opts = {}) {
  const {
    font = F.badge(22),
    bg = '#FF2D55',
    color = '#FFFFFF',
    padX = 40,
    height = 52,
    align = 'center',
    maxWidth,
  } = opts;

  ctx.font = font;
  let tw = ctx.measureText(text).width;
  if (maxWidth) tw = Math.min(tw, maxWidth - padX * 2);
  const w = tw + padX * 2;
  const drawX = align === 'center' ? x - w / 2 : x;

  ctx.fillStyle = bg;
  drawRoundedRect(ctx, drawX, y, w, height, height / 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, drawX + w / 2, y + height / 2 + 8);

  return y + height;
}

// Draw full-width CTA button
function drawCTA(ctx, text, y, W, PAD, opts = {}) {
  const {
    bg = '#FF2D55',
    color = '#FFFFFF',
    height = 80,
    fontSize = 32,
  } = opts;

  ctx.fillStyle = bg;
  drawRoundedRect(ctx, PAD, y, W - PAD * 2, height, height / 2);
  ctx.fill();
  ctx.font = F.cta(fontSize);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text.toUpperCase(), W / 2, y + height / 2 + 11);

  return y + height;
}

function renderTextLayer(width, height, drawFn) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  drawFn(ctx, canvas);
  return canvas.toBuffer('image/png');
}

module.exports = {
  F,
  hexToRgba,
  wrapText,
  fitFontSize,
  drawRoundedRect,
  drawPill,
  drawCTA,
  renderTextLayer,
};
