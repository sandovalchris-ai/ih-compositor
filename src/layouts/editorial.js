/**
 * editorial layout — light pink/white background, long copy, emoji headline (IH11 reference)
 */
const sharp = require('sharp');
const { resizeContain } = require('../utils/imageLoader');
const { renderTextLayer, drawRoundedRect, wrapText } = require('../utils/textRenderer');

const W = 1080;
const H = 1080;
const PAD = 56;

async function render(params) {
  const { products, text, colors } = params;

  const bgColor = colors.background || '#FFF0F3';

  // ── 1. Background ────────────────────────────────────────────────────────
  const base = await sharp({
    create: { width: W, height: H, channels: 4, background: hexToObj(bgColor) },
  }).png().toBuffer();

  // ── 2. Products split: bundle left, hoop right ───────────────────────────
  const halfW = Math.floor(W / 2) - PAD;
  const productH = 300;

  let bundleBuf = null;
  let hoopBuf = null;

  const bundleSource = products.bundle || products.belt || products.tea || null;
  const hoopSource = products.hoop || null;

  if (bundleSource) {
    bundleBuf = await resizeContain(bundleSource, halfW, productH);
  }
  if (hoopSource) {
    hoopBuf = await resizeContain(hoopSource, halfW, productH);
  } else if (!bundleSource && products.cream) {
    // fall back
    bundleBuf = await resizeContain(products.cream, halfW, productH);
  }

  // ── 3. Text layer ────────────────────────────────────────────────────────
  const textBuf = renderTextLayer(W, H, (ctx) => {
    ctx.textAlign = 'center';

    // Emoji + headline
    let headlineStr = text.headline || '';
    let headlineY = 90;

    if (headlineStr) {
      let fontSize = 52;
      while (fontSize > 20) {
        ctx.font = `900 ${fontSize}px Impact`;
        const lines = wrapText(ctx, headlineStr.toUpperCase(), W - PAD * 2);
        if (lines.length <= 3) break;
        fontSize -= 4;
      }
      ctx.font = `900 ${fontSize}px Impact`;
      const lines = wrapText(ctx, headlineStr.toUpperCase(), W - PAD * 2);
      const lineH = fontSize * 1.2;

      ctx.fillStyle = colors.headline || '#111111';
      lines.forEach((line, i) => {
        ctx.fillText(line, W / 2, headlineY + i * lineH);
      });
      headlineY += lines.length * lineH + 16;
    }

    // Subheadline
    if (text.subheadline) {
      ctx.font = 'bold 26px Arial';
      ctx.fillStyle = '#444444';
      ctx.fillText(text.subheadline, W / 2, headlineY + 10);
    }

    // Long body copy below products
    if (text.body) {
      const bodyStartY = 520;
      const maxLineW = W - PAD * 2;
      const paragraphs = text.body.split('\n').filter(Boolean);

      ctx.font = '22px Arial';
      ctx.fillStyle = '#333333';
      ctx.textAlign = 'left';
      let curY = bodyStartY;

      paragraphs.slice(0, 4).forEach((para) => {
        const lines = wrapText(ctx, para, maxLineW);
        lines.forEach((line) => {
          if (curY < H - 100) {
            ctx.fillText(line, PAD, curY);
            curY += 30;
          }
        });
        curY += 8;
      });
    }

    // Bold CTA text at bottom (no button)
    if (text.cta) {
      ctx.font = 'bold 32px Arial';
      ctx.fillStyle = colors.badge_bg || '#FF2D55';
      ctx.textAlign = 'center';
      ctx.fillText(text.cta.toUpperCase(), W / 2, H - PAD);
    }
  });

  // ── 4. Composite ─────────────────────────────────────────────────────────
  const productY = 230;
  const composites = [];

  if (bundleBuf) {
    composites.push({ input: bundleBuf, top: productY, left: PAD });
  }
  if (hoopBuf) {
    composites.push({ input: hoopBuf, top: productY, left: Math.floor(W / 2) });
  } else if (bundleBuf && !hoopBuf) {
    // Center single product
    composites[0] = { input: bundleBuf, top: productY, left: Math.floor((W - halfW) / 2) };
  }

  composites.push({ input: textBuf, top: 0, left: 0 });

  return sharp(base).composite(composites).png().toBuffer();
}

function hexToObj(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    alpha: 1,
  };
}

module.exports = { render };
