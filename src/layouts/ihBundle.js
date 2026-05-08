/**
 * ih-bundle — white/light background sale style
 * Logo · Social proof (drawn stars) · Badge pill · Headline (Bebas Neue)
 * Hoop hero centered · Free gifts row · CTA pill · Urgency
 */
const sharp = require('sharp');
const { resizeContain } = require('../utils/imageLoader');
const {
  F, renderTextLayer, drawRoundedRect, drawPill, drawCTA,
  drawSocialProof, drawLogo, drawGroundShadow,
  wrapText, fitFontSize,
} = require('../utils/textRenderer');

const W = 1080, H = 1080, PAD = 48;
const HOOP_TOP = 420, HOOP_W = 620, HOOP_H = 330;
const GIFTS_TOP = 770, GIFT_H = 148;
const CTA_H = 80;

async function render({ products, text, colors }) {
  const bgColor = colors.background || '#FFFFFF';

  const base = await sharp({
    create: { width: W, height: H, channels: 4, background: hexToObj(bgColor) },
  }).png().toBuffer();

  const [hoopBuf, bundleBuf, beltBuf, teaBuf, creamBuf] = await Promise.all([
    products.hoop   ? resizeContain(products.hoop,   HOOP_W, HOOP_H) : null,
    products.bundle ? resizeContain(products.bundle,  520,    GIFT_H) : null,
    products.belt   ? resizeContain(products.belt,    230,    GIFT_H) : null,
    products.tea    ? resizeContain(products.tea,     230,    GIFT_H) : null,
    products.cream  ? resizeContain(products.cream,   230,    GIFT_H) : null,
  ]);

  const textBuf = renderTextLayer(W, H, (ctx) => {
    // ── Logo ──
    drawLogo(ctx, W, 38, { color: colors.headline || '#111111' });

    // ── Social proof pill ──
    const spBottom = drawSocialProof(ctx, W, 52);

    // ── Badge pill ──
    let badgeBottom = spBottom;
    if (text.badge) {
      badgeBottom = drawPill(ctx, text.badge, W / 2, spBottom + 10, {
        font:   F.badge(22),
        bg:     colors.badge_bg || '#FF2D55',
        color:  colors.badge_text || '#FFFFFF',
        padX:   36,
        height: 52,
      });
    }

    // ── Headline (Bebas Neue) ──
    if (text.headline) {
      const upper  = text.headline.toUpperCase();
      const maxW   = W - PAD * 2;
      const px     = fitFontSize(ctx, F.headline, upper, maxW, 112, 36, 3);
      const lineH  = px * 1.08;
      const lines  = wrapText(ctx, upper, maxW);
      const hlY    = badgeBottom + 24 + px * 0.75;

      ctx.save();
      ctx.shadowColor   = 'rgba(0,0,0,0.1)';
      ctx.shadowBlur    = 4;
      ctx.shadowOffsetY = 2;
      ctx.font      = F.headline(px);
      ctx.fillStyle = colors.headline || '#111111';
      ctx.textAlign = 'center';
      lines.forEach((line, i) => ctx.fillText(line, W / 2, hlY + i * lineH));
      ctx.restore();

      // ── Subheadline ──
      if (text.subheadline) {
        ctx.font      = F.badge(24);
        ctx.fillStyle = '#555555';
        ctx.textAlign = 'center';
        ctx.fillText(text.subheadline, W / 2, hlY + lines.length * lineH + 16);
      }
    }

    // ── "FREE GIFTS INCLUDED" label ──
    const hasGifts = bundleBuf || beltBuf || teaBuf || creamBuf;
    if (hasGifts) {
      ctx.font      = F.body(15);
      ctx.fillStyle = '#888888';
      ctx.textAlign = 'center';
      ctx.fillText('FREE GIFTS INCLUDED:', W / 2, GIFTS_TOP - 18);
    }

    // ── Ground shadow for hoop ──
    if (hoopBuf) {
      drawGroundShadow(ctx, W / 2, HOOP_TOP + HOOP_H - 8, HOOP_W * 0.75, { opacity: 0.12 });
    }

    // ── CTA pill ──
    if (text.cta) {
      drawCTA(ctx, text.cta, H - PAD - CTA_H, W, PAD, {
        bg:       colors.cta_bg || '#FF2D55',
        color:    colors.cta_text || '#FFFFFF',
        height:   CTA_H,
        fontSize: 34,
      });
    }

    // ── Urgency — sits below CTA, never touches products ──
    if (text.urgency) {
      ctx.font      = F.body(15);
      ctx.fillStyle = '#999999';
      ctx.textAlign = 'center';
      ctx.fillText(text.urgency, W / 2, H - 14);
    }
  });

  const composites = [];

  if (hoopBuf) composites.push({ input: hoopBuf, top: HOOP_TOP, left: Math.round((W - HOOP_W) / 2) });

  if (bundleBuf) {
    composites.push({ input: bundleBuf, top: GIFTS_TOP, left: Math.round((W - 520) / 2) });
  } else {
    const items = [beltBuf, teaBuf, creamBuf].filter(Boolean);
    const itemW = 230, gap = 20;
    let lx = Math.round((W - (items.length * itemW + (items.length - 1) * gap)) / 2);
    items.forEach((buf) => {
      composites.push({ input: buf, top: GIFTS_TOP, left: lx });
      lx += itemW + gap;
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
