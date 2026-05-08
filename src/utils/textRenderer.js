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

reg('bebas-neue/files/bebas-neue-latin-400-normal.woff2',     'IHDisplay');
reg('bebas-neue/files/bebas-neue-latin-ext-400-normal.woff2', 'IHDisplay');
reg('oswald/files/oswald-latin-700-normal.woff2',             'IHImpact');
reg('oswald/files/oswald-latin-600-normal.woff2',             'IHImpact');
reg('roboto/files/roboto-latin-700-normal.woff2',             'IHBold');
reg('roboto/files/roboto-latin-400-normal.woff2',             'IHRegular');

const F = {
  headline: (px) => `400 ${px}px IHDisplay`,
  badge:    (px) => `700 ${px}px IHBold`,
  cta:      (px) => `700 ${px}px IHBold`,
  body:     (px) => `400 ${px}px IHRegular`,
  logo:     (px) => `700 ${px}px IHBold`,
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function hexToRgba(hex, alpha = 1) {
  const c = hex.replace('#', '');
  const full = c.length === 3 ? c.split('').map(x => x + x).join('') : c;
  const r = parseInt(full.slice(0,2), 16);
  const g = parseInt(full.slice(2,4), 16);
  const b = parseInt(full.slice(4,6), 16);
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

// ── Star path — 5-point, no Unicode dependency ────────────────────────────────
function drawStar(ctx, cx, cy, r, color) {
  const inner = r * 0.42;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : inner;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// ── Social proof pill — [★★★★★ Loved by 500,000+ Women] ──────────────────────
function drawSocialProof(ctx, W, y, opts = {}) {
  const {
    text      = 'Loved by 500,000+ Women',
    starColor = '#FFD700',
    bg        = '#111111',
    textColor = '#FFFFFF',
  } = opts;

  const starCount = 5, starR = 7, starGap = 2;
  const starsW = starCount * (starR * 2) + (starCount - 1) * starGap;

  ctx.font = F.badge(15);
  const textW = ctx.measureText(text).width;
  const padX = 20, sep = 10, pillH = 36;
  const pillW = padX * 2 + starsW + sep + textW;
  const pillX = (W - pillW) / 2;

  ctx.fillStyle = bg;
  drawRoundedRect(ctx, pillX, y, pillW, pillH, pillH / 2);
  ctx.fill();

  const midY = y + pillH / 2;
  let sx = pillX + padX + starR;
  for (let i = 0; i < starCount; i++) {
    drawStar(ctx, sx, midY, starR, starColor);
    sx += starR * 2 + starGap;
  }

  ctx.fillStyle = textColor;
  ctx.textAlign = 'left';
  ctx.fillText(text, pillX + padX + starsW + sep, midY + 5);

  return y + pillH;
}

// ── Logo wordmark ─────────────────────────────────────────────────────────────
function drawLogo(ctx, W, y, opts = {}) {
  const { color = '#111111', opacity = 0.65, align = 'center' } = opts;
  ctx.save();
  ctx.font = `600 18px IHBold`;
  ctx.fillStyle = hexToRgba(color, opacity);
  ctx.textAlign = align;
  try { ctx.letterSpacing = '0.1em'; } catch(_) {}
  const x = align === 'center' ? W / 2 : (align === 'right' ? W - 48 : 48);
  ctx.fillText('INFINITY HOOP', x, y);
  try { ctx.letterSpacing = '0px'; } catch(_) {}
  ctx.restore();
  return y + 22;
}

// ── Ground shadow ellipse beneath a product ───────────────────────────────────
function drawGroundShadow(ctx, cx, bottomY, width, { opacity = 0.18 } = {}) {
  const rx = width * 0.42;
  const ry = Math.max(rx * 0.14, 10);
  ctx.save();
  ctx.translate(cx, bottomY);
  ctx.scale(1, ry / rx);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  grad.addColorStop(0, `rgba(0,0,0,${opacity})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();
}

// ── Pill badge (colored background + text) ────────────────────────────────────
function drawPill(ctx, text, x, y, opts = {}) {
  const {
    font    = F.badge(22),
    bg      = '#FF2D55',
    color   = '#FFFFFF',
    padX    = 40,
    height  = 52,
    align   = 'center',
    maxWidth,
    shadow  = true,
  } = opts;

  ctx.font = font;
  let tw = ctx.measureText(text).width;
  if (maxWidth) tw = Math.min(tw, maxWidth - padX * 2);
  const w = tw + padX * 2;
  const drawX = align === 'center' ? x - w / 2 : x;

  ctx.save();
  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur  = 10;
    ctx.shadowOffsetY = 3;
  }
  ctx.fillStyle = bg;
  drawRoundedRect(ctx, drawX, y, w, height, height / 2);
  ctx.fill();
  ctx.restore();

  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, drawX + w / 2, y + height / 2 + 8);

  return y + height;
}

// ── Full-width CTA button ─────────────────────────────────────────────────────
function drawCTA(ctx, text, y, W, PAD, opts = {}) {
  const {
    bg       = '#FF2D55',
    color    = '#FFFFFF',
    height   = 80,
    fontSize = 32,
    shadow   = true,
  } = opts;

  ctx.save();
  if (shadow) {
    ctx.shadowColor   = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur    = 20;
    ctx.shadowOffsetY = 5;
  }
  ctx.fillStyle = bg;
  drawRoundedRect(ctx, PAD, y, W - PAD * 2, height, height / 2);
  ctx.fill();
  ctx.restore();

  ctx.font      = F.cta(fontSize);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text.toUpperCase(), W / 2, y + height / 2 + Math.round(fontSize * 0.35));

  return y + height;
}

function renderTextLayer(width, height, drawFn) {
  const canvas = createCanvas(width, height);
  const ctx    = canvas.getContext('2d');
  drawFn(ctx, canvas);
  return canvas.toBuffer('image/png');
}

module.exports = {
  F,
  hexToRgba,
  wrapText,
  fitFontSize,
  drawRoundedRect,
  drawStar,
  drawSocialProof,
  drawLogo,
  drawGroundShadow,
  drawPill,
  drawCTA,
  renderTextLayer,
};
