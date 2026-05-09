/**
 * seasonal — IH17 style
 * White bg · Red top+bottom banners · Big quote headline ·
 * Hoop center with 4 benefit circles + line-art icons + arrows ·
 * Bundle row bottom · Red CTA banner
 */
const sharp = require('sharp');
const { loadImageBuffer, resizeContain, removeBackground } = require('../utils/imageLoader');
const { F, renderTextLayer, drawRoundedRect, wrapText, fitFontSize } = require('../utils/textRenderer');

const W = 1080, H = 1350, PAD = 55;

function stripEmoji(str) {
  return (str || '').replace(/[\u{1F300}-\u{1FFFF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}|\u{FE00}-\u{FE0F}|\u{1F000}-\u{1F02F}|\u{1F0A0}-\u{1F0FF}|\u{1F100}-\u{1F1FF}|\u{1F200}-\u{1F2FF}|\u{1F900}-\u{1F9FF}|\u{1FA00}-\u{1FA6F}|\u{1FA70}-\u{1FAFF}]/gu, '').trim();
}

async function render({ products, text, colors }) {
  const bannerColor = colors.badge_bg || '#CC1111';

  // BG with gray zone and benefit circles pre-drawn
  const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#FFFFFF"/>
    <defs>
      <linearGradient id="gz" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FFFFFF"/>
        <stop offset="15%" stop-color="#F2F2F2"/>
        <stop offset="85%" stop-color="#F2F2F2"/>
        <stop offset="100%" stop-color="#FFFFFF"/>
      </linearGradient>
    </defs>
    <rect x="0" y="450" width="${W}" height="660" fill="url(#gz)"/>
    <rect x="0" y="0" width="${W}" height="90" fill="${bannerColor}"/>
    <rect x="0" y="1255" width="${W}" height="95" fill="${bannerColor}"/>
    <circle cx="148" cy="670" r="100" fill="#E0E0E0"/>
    <circle cx="148" cy="670" r="96"  fill="#FFFFFF"/>
    <circle cx="932" cy="670" r="100" fill="#E0E0E0"/>
    <circle cx="932" cy="670" r="96"  fill="#FFFFFF"/>
    <circle cx="148" cy="930" r="100" fill="#E0E0E0"/>
    <circle cx="148" cy="930" r="96"  fill="#FFFFFF"/>
    <circle cx="932" cy="930" r="100" fill="#E0E0E0"/>
    <circle cx="932" cy="930" r="96"  fill="#FFFFFF"/>
  </svg>`;
  const bgBuf = await sharp(Buffer.from(bgSvg)).png().toBuffer();

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
    loadClean(products.hoop,  500, 500),
    loadClean(products.belt,  210, 210),
    loadClean(products.cream, 180, 180),
    loadClean(products.tea,   200, 200),
  ]);

  const hoopM  = hoopBuf  ? await sharp(hoopBuf).metadata()  : null;
  const beltM  = beltBuf  ? await sharp(beltBuf).metadata()  : null;
  const creamM = creamBuf ? await sharp(creamBuf).metadata() : null;
  const detoxM = detoxBuf ? await sharp(detoxBuf).metadata() : null;

  const hoopLeft  = hoopM  ? Math.round(540 - hoopM.width  / 2) : 0;
  const hoopTop   = hoopM  ? Math.round(800 - hoopM.height / 2) : 0;
  const rowY      = 1068;
  const creamLeft = creamM ? Math.round(175  - creamM.width / 2) : 0;
  const beltLeft  = beltM  ? Math.round(540  - beltM.width  / 2) : 0;
  const detoxLeft = detoxM ? Math.round(905  - detoxM.width / 2) : 0;

  const benefits = text.body
    ? text.body.split('\n').filter(Boolean).slice(0, 4)
    : ['Kills Stubborn\nBelly Fat', 'Shrinks\nMan Boobs', 'Boosts T\n& Energy', 'Easy on\nBad Knees'];

  const textBuf = renderTextLayer(W, H, (ctx) => {
    // Top banner text
    ctx.font = F.badge(40);
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(stripEmoji(text.badge || 'LIMITED TIME SALE').toUpperCase(), W / 2, 58);

    // Big headline — 2 lines max
    if (text.headline) {
      const upper = stripEmoji(text.headline).toUpperCase();
      const px = fitFontSize(ctx, F.headline, upper, W - PAD * 2, 106, 56, 2);
      const lineH = px * 1.05;
      const lines = wrapText(ctx, upper, W - PAD * 2);
      ctx.font = F.headline(px);
      ctx.fillStyle = colors.headline || '#111111';
      ctx.textAlign = 'center';
      lines.slice(0, 2).forEach((line, i) => ctx.fillText(line, W / 2, 168 + i * lineH));
    }

    // Subhead
    if (text.subheadline) {
      ctx.font = F.badge(26);
      ctx.fillStyle = '#666666';
      ctx.textAlign = 'center';
      ctx.fillText(stripEmoji(text.subheadline).toUpperCase(), W / 2, 340);
    }

    // Benefit circle icons — line art drawn with canvas paths
    const circleData = [
      { cx: 148, cy: 670, label: benefits[0] || '' },
      { cx: 932, cy: 670, label: benefits[1] || '' },
      { cx: 148, cy: 930, label: benefits[2] || '' },
      { cx: 932, cy: 930, label: benefits[3] || '' },
    ];

    function drawWaistIcon(ctx, cx, cy) {
      ctx.strokeStyle = bannerColor; ctx.lineWidth = 3.5; ctx.fillStyle = 'none';
      ctx.beginPath(); ctx.ellipse(cx, cy - 8, 22, 28, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = bannerColor; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.rect(cx - 40, cy - 14, 80, 14); ctx.stroke();
      [cx - 20, cx, cx + 20].forEach(x => {
        ctx.beginPath(); ctx.moveTo(x, cy - 14); ctx.lineTo(x, cy - 7); ctx.stroke();
      });
    }
    function drawTorsoIcon(ctx, cx, cy) {
      ctx.strokeStyle = bannerColor; ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 30); ctx.bezierCurveTo(cx - 28, cy - 30, cx - 38, cy - 15, cx - 38, cy + 5);
      ctx.lineTo(cx - 38, cy + 25); ctx.lineTo(cx + 38, cy + 25); ctx.lineTo(cx + 38, cy + 5);
      ctx.bezierCurveTo(cx + 38, cy - 15, cx + 28, cy - 30, cx, cy - 30);
      ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 28, cy - 10); ctx.lineTo(cx + 28, cy - 10); ctx.stroke();
    }
    function drawBoltIcon(ctx, cx, cy) {
      ctx.strokeStyle = bannerColor; ctx.lineWidth = 3.5; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx + 10, cy - 28); ctx.lineTo(cx - 14, cy + 4);
      ctx.lineTo(cx + 2,  cy + 4);  ctx.lineTo(cx - 10, cy + 28);
      ctx.lineTo(cx + 14, cy - 4);  ctx.lineTo(cx - 2,  cy - 4);
      ctx.closePath(); ctx.stroke();
    }
    function drawKneeIcon(ctx, cx, cy) {
      ctx.strokeStyle = bannerColor; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(cx - 11, cy - 32, 22, 28, 8); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy + 4, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(cx - 11, cy + 18, 22, 28, 8); ctx.stroke();
    }

    const iconFns = [drawWaistIcon, drawTorsoIcon, drawBoltIcon, drawKneeIcon];

    circleData.forEach(({ cx, cy, label }, i) => {
      ctx.save();
      iconFns[i](ctx, cx, cy - 14);
      ctx.restore();

      label.split('\n').forEach((line, j) => {
        ctx.font = F.badge(18);
        ctx.fillStyle = '#111111';
        ctx.textAlign = 'center';
        ctx.fillText(line, cx, cy + 52 + j * 22);
      });

      // Arrow toward hoop center (540, 800)
      const angle  = Math.atan2(800 - cy, 540 - cx);
      const startX = cx + Math.cos(angle) * 104;
      const startY = cy + Math.sin(angle) * 104;
      const endX   = cx + Math.cos(angle) * 140;
      const endY   = cy + Math.sin(angle) * 140;
      ctx.strokeStyle = bannerColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      // Arrowhead
      const headLen   = 10;
      const headAngle = Math.PI / 6;
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - headLen * Math.cos(angle - headAngle), endY - headLen * Math.sin(angle - headAngle));
      ctx.lineTo(endX - headLen * Math.cos(angle + headAngle), endY - headLen * Math.sin(angle + headAngle));
      ctx.closePath();
      ctx.fillStyle = bannerColor;
      ctx.fill();
    });

    // Bottom banner text
    if (text.cta) {
      ctx.font = F.badge(46);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(stripEmoji(text.cta).toUpperCase(), W / 2, 1313);
    }
  });

  const composites = [];
  if (hoopBuf)  composites.push({ input: hoopBuf,  top: hoopTop, left: hoopLeft  });
  if (creamBuf) composites.push({ input: creamBuf, top: rowY,    left: creamLeft });
  if (beltBuf)  composites.push({ input: beltBuf,  top: rowY,    left: beltLeft  });
  if (detoxBuf) composites.push({ input: detoxBuf, top: rowY,    left: detoxLeft });
  composites.push({ input: textBuf, top: 0, left: 0 });

  return sharp(bgBuf).composite(composites).png().toBuffer();
}

module.exports = { render };
