/**
 * editorial — IH13 style
 * White bg · Stars social proof · Giant black headline ·
 * Black offer pill · Hoop large left · Bundle right with arrow labels · CTA pill
 */
const sharp = require('sharp');
const { loadImageBuffer, resizeContain, removeBackground } = require('../utils/imageLoader');
const { F, renderTextLayer, drawRoundedRect, drawLogo, wrapText, fitFontSize } = require('../utils/textRenderer');
const { loadLogo } = require('../utils/logoLoader'); // always white bg — no invert needed

const W = 1080, H = 1350, PAD = 55;

function stripEmoji(str) {
  return (str || '').replace(/[\u{1F300}-\u{1FFFF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}|\u{FE00}-\u{FE0F}|\u{1F000}-\u{1F02F}|\u{1F0A0}-\u{1F0FF}|\u{1F100}-\u{1F1FF}|\u{1F200}-\u{1F2FF}|\u{1F900}-\u{1F9FF}|\u{1FA00}-\u{1FA6F}|\u{1FA70}-\u{1FAFF}|\u{231A}-\u{231B}|\u{23E9}-\u{23F3}|\u{23F8}-\u{23FA}|\u{25AA}-\u{25AB}|\u{25B6}|\u{25C0}|\u{25FB}-\u{25FE}|\u{2614}-\u{2615}|\u{2648}-\u{2653}|\u{267F}|\u{2693}|\u{26A1}|\u{26AA}-\u{26AB}|\u{26BD}-\u{26BE}|\u{26C4}-\u{26C5}|\u{26CE}|\u{26D4}|\u{26EA}|\u{26F2}-\u{26F3}|\u{26F5}|\u{26FA}|\u{26FD}|\u{2702}|\u{2705}|\u{2708}-\u{270D}|\u{270F}|\u{2712}|\u{2714}|\u{2716}|\u{271D}|\u{2721}|\u{2728}|\u{2733}-\u{2734}|\u{2744}|\u{2747}|\u{274C}|\u{274E}|\u{2753}-\u{2755}|\u{2757}|\u{2763}-\u{2764}|\u{2795}-\u{2797}|\u{27A1}|\u{27B0}|\u{27BF}|\u{2934}-\u{2935}|\u{2B05}-\u{2B07}|\u{2B1B}-\u{2B1C}|\u{2B50}|\u{2B55}|\u{3030}|\u{303D}|\u{3297}|\u{3299}]/gu, '').trim();
}

async function render({ products, text, colors }) {
  const logo = await loadLogo(W, { maxHeight: 55, dark: false });

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
    // ── Logo fallback (text) — only when image logo not available ────────────
    if (!logo) drawLogo(ctx, W, 20, { color: '#888888', opacity: 0.7 });

    // Stars + social proof (drawn as canvas circles, not unicode)
    ctx.fillStyle = '#00B67A';
    for (let i = 0; i < 5; i++) {
      const sx = 190 + i * 28;
      ctx.beginPath();
      const r = 9;
      for (let p = 0; p < 5; p++) {
        const a = (Math.PI * 2 * p) / 5 - Math.PI / 2;
        const ri = (Math.PI * 2 * p + Math.PI) / 5 - Math.PI / 2;
        if (p === 0) ctx.moveTo(sx + r * Math.cos(a), 35 + r * Math.sin(a));
        else ctx.lineTo(sx + r * Math.cos(a), 35 + r * Math.sin(a));
        ctx.lineTo(sx + (r / 2.5) * Math.cos(ri), 35 + (r / 2.5) * Math.sin(ri));
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.font = F.body(22);
    ctx.fillStyle = '#333333';
    ctx.textAlign = 'left';
    ctx.fillText('Loved by OVER 500,000+ Happy Women', 340, 42);

    // Giant headline — auto-fit
    if (text.headline) {
      const upper = stripEmoji(text.headline).toUpperCase();
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
      ctx.fillText(stripEmoji(text.subheadline).toUpperCase(), W / 2, 375);
      // Decorative accent mark (no emoji)
      ctx.font = F.headline(90);
      ctx.fillStyle = colors.badge_bg || '#00AEEF';
      ctx.fillText('!', 900, 375);
    }

    // Black offer pill
    if (text.badge) {
      ctx.fillStyle = '#111111';
      drawRoundedRect(ctx, 80, 405, 920, 76, 38);
      ctx.fill();
      ctx.font = F.badge(32);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(stripEmoji(text.badge).toUpperCase(), W / 2, 453);
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
      ctx.fillText(stripEmoji(text.cta).toUpperCase(), W / 2, 1298);
    }
  });

  const composites = [];
  if (hoopBuf)  composites.push({ input: hoopBuf,  top: hoopTop,  left: hoopLeft  });
  if (beltBuf)  composites.push({ input: beltBuf,  top: beltTop,  left: beltLeft  });
  if (detoxBuf) composites.push({ input: detoxBuf, top: detoxTop, left: detoxLeft });
  if (creamBuf) composites.push({ input: creamBuf, top: creamTop, left: creamLeft });
  composites.push({ input: textBuf, top: 0, left: 0 });
  if (logo) {
    composites.push({
      input: logo.buffer,
      top:   Math.round(30 - logo.height / 2),
      left:  Math.round((W - logo.width) / 2),
    });
  }

  return sharp(bgBuf).composite(composites).png().toBuffer();
}

module.exports = { render };
