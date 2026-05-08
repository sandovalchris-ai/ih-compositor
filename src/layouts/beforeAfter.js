/**
 * before-after — split-screen transformation layout
 * Left panel: "before" (desaturated/grey) · Right panel: "after" (color + products)
 * Bottom strip: headline + CTA button
 * Center divider: 8px accent color line
 */
const sharp = require('sharp');
const { resizeContain, resizeCover, loadImageBuffer } = require('../utils/imageLoader');
const {
  F, renderTextLayer, drawRoundedRect, drawPill, drawCTA,
  drawSocialProof, drawLogo, drawGroundShadow,
  wrapText, fitFontSize, hexToRgba,
} = require('../utils/textRenderer');

const W = 1080, H = 1080;
const SPLIT_H   = 730;           // split zone height
const PANEL_W   = 534;           // each panel width
const BORDER_W  = 12;            // center divider
const RIGHT_X   = PANEL_W + BORDER_W;
const BOTTOM_H  = H - SPLIT_H;   // 350px for headline + CTA
const PAD       = 48;

const HOOP_W   = 340, HOOP_H   = 380;
const GIFT_W   = 130, GIFT_H   = 130;
const HOOP_TOP = 130;

async function render({ products, text, colors, assets, background }) {
  const accent       = colors.badge_bg || colors.cta_bg || colors.accent || '#FF2D55';
  const bgColor      = colors.background || '#FFFFFF';
  const headlineColor = colors.headline || '#111111';

  // ── Load and split background image ─────────────────────────────────────────
  let beforeBuf, afterBuf;
  const imgSrc = assets?.before_after || assets?.lifestyle || assets?.model || background;

  if (imgSrc) {
    const fullBuf = await loadImageBuffer(imgSrc);
    const meta    = await sharp(fullBuf).metadata();

    if (assets?.before_after) {
      // Split provided before/after photo at horizontal center
      const halfW = Math.floor(meta.width / 2);
      const [rawL, rawR] = await Promise.all([
        sharp(fullBuf).extract({ left: 0,     top: 0, width: halfW,               height: meta.height }).toBuffer(),
        sharp(fullBuf).extract({ left: halfW, top: 0, width: meta.width - halfW,  height: meta.height }).toBuffer(),
      ]);
      [beforeBuf, afterBuf] = await Promise.all([
        sharp(rawL).resize(PANEL_W, SPLIT_H, { fit: 'cover', position: 'center' }).greyscale().modulate({ brightness: 0.82 }).png().toBuffer(),
        sharp(rawR).resize(PANEL_W, SPLIT_H, { fit: 'cover', position: 'center' }).png().toBuffer(),
      ]);
    } else {
      // Same image: left = greyscale darkened, right = full color
      [beforeBuf, afterBuf] = await Promise.all([
        sharp(fullBuf).resize(PANEL_W, SPLIT_H, { fit: 'cover', position: 'center' }).greyscale().modulate({ brightness: 0.80 }).png().toBuffer(),
        sharp(fullBuf).resize(PANEL_W, SPLIT_H, { fit: 'cover', position: 'center' }).png().toBuffer(),
      ]);
    }
  }

  // ── Fallback panels when no image provided ───────────────────────────────────
  if (!beforeBuf) {
    beforeBuf = await sharp({
      create: { width: PANEL_W, height: SPLIT_H, channels: 4, background: { r: 180, g: 180, b: 180, alpha: 1 } },
    }).png().toBuffer();
  }
  if (!afterBuf) {
    afterBuf = await sharp({
      create: { width: PANEL_W, height: SPLIT_H, channels: 4, background: { r: 255, g: 220, b: 225, alpha: 1 } },
    }).png().toBuffer();
  }

  // ── Product images ───────────────────────────────────────────────────────────
  const [hoopBuf, beltBuf, teaBuf, creamBuf] = await Promise.all([
    products.hoop  ? resizeContain(products.hoop,  HOOP_W, HOOP_H) : null,
    products.belt  ? resizeContain(products.belt,  GIFT_W, GIFT_H) : null,
    products.tea   ? resizeContain(products.tea,   GIFT_W, GIFT_H) : null,
    products.cream ? resizeContain(products.cream, GIFT_W, GIFT_H) : null,
  ]);

  const giftItems = [beltBuf, teaBuf, creamBuf].filter(Boolean);
  const giftTotalW = giftItems.length * GIFT_W + (giftItems.length - 1) * 10;
  const GIFTS_TOP  = HOOP_TOP + HOOP_H + 18;
  const HOOP_LEFT  = RIGHT_X + Math.round((PANEL_W - HOOP_W) / 2);

  // ── Canvas overlay layer ─────────────────────────────────────────────────────
  const textBuf = renderTextLayer(W, H, (ctx) => {
    // Before label
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur  = 8;
    ctx.fillStyle   = 'rgba(0,0,0,0.68)';
    drawRoundedRect(ctx, PANEL_W / 2 - 60, SPLIT_H - 68, 120, 46, 23);
    ctx.fill();
    ctx.restore();
    ctx.font      = F.badge(20);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText('BEFORE', PANEL_W / 2, SPLIT_H - 36);

    // After label
    ctx.save();
    ctx.shadowColor   = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur    = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = accent;
    drawRoundedRect(ctx, RIGHT_X + PANEL_W / 2 - 60, SPLIT_H - 68, 120, 46, 23);
    ctx.fill();
    ctx.restore();
    ctx.font      = F.badge(20);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText('AFTER', RIGHT_X + PANEL_W / 2, SPLIT_H - 36);

    // Ground shadow beneath hoop
    if (hoopBuf) {
      drawGroundShadow(ctx, HOOP_LEFT + HOOP_W / 2, HOOP_TOP + HOOP_H - 10, HOOP_W, { opacity: 0.14 });
    }

    // ── Bottom strip ──────────────────────────────────────────────────────────
    const stripY = SPLIT_H;

    // Headline
    if (text.headline) {
      const upper = text.headline.toUpperCase();
      const maxW  = W - PAD * 2;
      const px    = fitFontSize(ctx, F.headline, upper, maxW, 88, 20, 2);
      const lineH = px * 1.08;
      const lines = wrapText(ctx, upper, maxW);
      const hlY   = stripY + 44 + px * 0.82;

      ctx.save();
      ctx.shadowColor   = 'rgba(0,0,0,0.1)';
      ctx.shadowBlur    = 3;
      ctx.shadowOffsetY = 1;
      ctx.font      = F.headline(px);
      ctx.fillStyle = headlineColor;
      ctx.textAlign = 'center';
      lines.forEach((line, i) => ctx.fillText(line, W / 2, hlY + i * lineH));
      ctx.restore();
    }

    // Urgency
    if (text.urgency) {
      ctx.font      = F.body(14);
      ctx.fillStyle = '#888888';
      ctx.textAlign = 'center';
      ctx.fillText(text.urgency, W / 2, H - PAD - 80);
    }

    // CTA
    if (text.cta) {
      drawCTA(ctx, text.cta, H - PAD - 72, W, PAD, {
        bg:       accent,
        color:    colors.cta_text || '#FFFFFF',
        height:   72,
        fontSize: 28,
      });
    }
  });

  // ── Assemble composites ──────────────────────────────────────────────────────
  const base = await sharp({
    create: { width: W, height: H, channels: 4, background: hexToObj(bgColor) },
  }).png().toBuffer();

  // Center divider (accent color stripe)
  const borderBuf = await sharp({
    create: { width: BORDER_W, height: SPLIT_H, channels: 4, background: hexToObj(accent) },
  }).png().toBuffer();

  const composites = [
    { input: beforeBuf,  top: 0, left: 0 },
    { input: afterBuf,   top: 0, left: RIGHT_X },
    { input: borderBuf,  top: 0, left: PANEL_W },
  ];

  if (hoopBuf) composites.push({ input: hoopBuf, top: HOOP_TOP, left: HOOP_LEFT });

  if (giftItems.length) {
    let gx = RIGHT_X + Math.round((PANEL_W - giftTotalW) / 2);
    giftItems.forEach(buf => {
      composites.push({ input: buf, top: GIFTS_TOP, left: gx });
      gx += GIFT_W + 10;
    });
  }

  composites.push({ input: textBuf, top: 0, left: 0 });

  return sharp(base).composite(composites).png().toBuffer();
}

function hexToObj(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  return {
    r: parseInt(hex.slice(0,2), 16),
    g: parseInt(hex.slice(2,4), 16),
    b: parseInt(hex.slice(4,6), 16),
    alpha: 1,
  };
}

module.exports = { render };
