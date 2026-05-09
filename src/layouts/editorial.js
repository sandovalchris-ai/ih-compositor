/**
 * editorial — IH13 style
 * White bg · Stars social proof · Giant black headline ·
 * Black offer pill · Hoop large left · Bundle right with arrow labels · CTA pill
 */
const sharp = require('sharp');
const { loadImageBuffer, resizeContain, removeBackground } = require('../utils/imageLoader');
const { F, renderTextLayer, drawRoundedRect, drawLogo, wrapText, fitFontSize } = require('../utils/textRenderer');

const W = 1080, H = 1350, PAD = 55;

async function render({ products, text, colors }) {
  // BG — pure white
  const bgBuf = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
  }).png().toBuffer();

  async function loadClean(src, w, h) {
    if (!src) return null;
    const buf   = await loadImageBuffer(src);
    const clean = await removeBackground(buf);
    return sharp(clean)
      .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }

  const [hoopBuf, beltBuf, creamBuf, detoxBuf] = await Promise.all([
    loadClean(products.hoop,  580, 580),
    loadClean(products.belt,  230, 230),
    loadClean(products.cream, 175, 175),
    loadClean(products.tea,   215, 215),
  ]);

  const hoopM  = hoopBuf  ? await sharp(hoopBuf).metadata()  : null;
  const beltM  = beltBuf  ? await sharp(beltBuf).metadata()  : null;
  const creamM = creamBuf ? await sharp(creamBuf).metadata() : null;
  const detoxM = detoxBuf ? await sharp(detoxBuf).metadata() : null;

  // Product positions — hoop large left, bundle stacked right
  const hoopLeft  = 20;
  const hoopTop   = 490;
  const beltLeft  = hoopM ? 700 : 0;
  const beltTop   = 500;
  const detoxLeft = hoopM ? 730 : 0;
  const detoxTop  = 730;
  const creamLeft = hoopM ? 420 : 0;
  const creamTop  = 920;

  const textBuf = renderTextLayer(W, H, (ctx) => {
    // Stars + social proof
    ctx.font = F.body(22);
    ctx.fillStyle = '#00B67A';
    ctx.textAlign = 'center';
    ctx.fillText('★★★★★', 310, 42);
    ctx.fillStyle = '#333333';
    ctx.textAlign = 'left';
    ctx.fillText('Loved by OVER 500,000+ Happy Women', 360, 42);

    // Giant headline — auto-fit
    if (text.headline) {
      const upper = text.headline.toUpperCase();
      const px = fitFontSize(ctx, F.headline, upper, W - PAD * 2, 112, 48, 3);
      const lineH = px * 1.05;
      const lines = wrapText(ctx, upper, W - PAD * 2);
      ctx.font = F.headline(px);
      ctx.fillStyle = colors.headline || '#111111';
      ctx.textAlign = 'center';
      lines.forEach((line, i) => ctx.fillText(line, W / 2, 130 + i * lineH));
    }

    // Accent line 2 color
    if (text.subheadline) {
      ctx.font = F.headline(112);
      ctx.fillStyle = colors.badge_bg || '#00AEEF';
      ctx.textAlign = 'center';
      ctx.fillText(text.subheadline.toUpperCase(), W / 2, 375);
      // Party emoji
      ctx.font = '90px serif';
      ctx.fillText('🎉', 830, 375);
    }

    // Black offer pill
    if (text.badge) {
      ctx.fillStyle = '#111111';
      drawRoundedRect(ctx, 80, 405, 920, 76, 38);
      ctx.fill();
      ctx.font = F.badge(32);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text.badge.toUpperCase(), W / 2, 453);
    }

    // Arrow labels pointing to products
    const accentColor = colors.badge_bg || '#E91E8C';
    const labelConfigs = [
      { text: 'FREE SLIMMING BELT', x: 600, y: 508, tx: 740, ty: 590 },
      { text: 'FREE DETOX TEA',     x: 640, y: 755, tx: 760, ty: 730 },
      { text: 'FREE TONING CREAM',  x: 60,  y: 880, tx: 200, ty: 940 },
    ];

    labelConfigs.forEach(({ text: lt, x, y, tx, ty }) => {
      ctx.fillStyle = accentColor;
      drawRoundedRect(ctx, x, y, lt.length * 13 + 40, 42, 21);
      ctx.fill();
      ctx.font = F.badge(18);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(lt, x + (lt.length * 13 + 40) / 2, y + 27);
      // Arrow line
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(tx, ty - 20);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    });

    // CTA pill
    if (text.cta) {
      ctx.fillStyle = colors.cta_bg || accentColor;
      drawRoundedRect(ctx, 55, 1240, 970, 90, 45);
      ctx.fill();
      ctx.font = F.badge(40);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(text.cta.toUpperCase(), W / 2, 1298);
    }
  });

  const composites = [];
  if (hoopBuf)  composites.push({ input: hoopBuf,  top: hoopTop,  left: hoopLeft  });
  if (beltBuf)  composites.push({ input: beltBuf,  top: beltTop,  left: beltLeft  });
  if (detoxBuf) composites.push({ input: detoxBuf, top: detoxTop, left: detoxLeft });
  if (creamBuf) composites.push({ input: creamBuf, top: creamTop, left: creamLeft });
  composites.push({ input: textBuf, top: 0, left: 0 });

  return sharp(bgBuf).composite(composites).png().toBuffer();
}

module.exports = { render };
