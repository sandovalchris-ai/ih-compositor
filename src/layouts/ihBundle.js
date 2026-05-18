/**
 * ih-bundle — IH9 style
 * 960×1220 · lavender gradient bg · logo w/ O-as-hoop-ring · hot-pink banner
 * 70% OFF pill · hoop card · 3 gift cards · CTA pill
 */
const sharp = require('sharp');
const { loadImageBuffer, removeBackground } = require('../utils/imageLoader');
const { F, renderTextLayer, drawRoundedRect } = require('../utils/textRenderer');
const { loadLogo } = require('../utils/logoLoader'); // always light bg — no invert needed

const W = 960, H = 1220;

// Layout zones
const BANNER_Y  = 62,  BANNER_H  = 82;
const PILL_Y    = 152, PILL_H    = 58;
const CARD_X    = 70,  CARD_Y    = 220, CARD_W = 820, CARD_H = 540;
const GIFT_Y    = 826, GIFT_H    = 310, GIFT_W = 276;
const IMG_MAX_W = 193, IMG_MAX_H = 200;
const IMG_ZONE_TOP = GIFT_Y + 50;

const GIFTS = [
  { x: 28,  cx: 166, key: 'belt',  label: 'FREE SLIMMING BELT' },
  { x: 342, cx: 480, key: 'cream', label: 'FREE TONING CREAM'  },
  { x: 656, cx: 794, key: 'tea',   label: 'FREE DETOX TEA'     },
];

function stripEmoji(str) {
  if (!str) return '';
  return str.replace(/[\u{1F300}-\u{1FFFF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}|\u{FE00}-\u{FE0F}|\u{1F000}-\u{1F02F}|\u{1F0A0}-\u{1F0FF}|\u{1F100}-\u{1F1FF}|\u{1F200}-\u{1F2FF}|\u{1F900}-\u{1F9FF}|\u{1FA00}-\u{1FA6F}|\u{1FA70}-\u{1FAFF}|\u{231A}-\u{231B}|\u{23E9}-\u{23F3}|\u{23F8}-\u{23FA}|\u{25AA}-\u{25AB}|\u{25B6}|\u{25C0}|\u{25FB}-\u{25FE}|\u{2614}-\u{2615}|\u{2648}-\u{2653}|\u{267F}|\u{2693}|\u{26A1}|\u{26AA}-\u{26AB}|\u{26BD}-\u{26BE}|\u{26C4}-\u{26C5}|\u{26CE}|\u{26D4}|\u{26EA}|\u{26F2}-\u{26F3}|\u{26F5}|\u{26FA}|\u{26FD}|\u{2702}|\u{2705}|\u{2708}-\u{270D}|\u{270F}|\u{2712}|\u{2714}|\u{2716}|\u{271D}|\u{2721}|\u{2728}|\u{2733}-\u{2734}|\u{2744}|\u{2747}|\u{274C}|\u{274E}|\u{2753}-\u{2755}|\u{2757}|\u{2763}-\u{2764}|\u{2795}-\u{2797}|\u{27A1}|\u{27B0}|\u{27BF}|\u{2934}-\u{2935}|\u{2B05}-\u{2B07}|\u{2B1B}-\u{2B1C}|\u{2B50}|\u{2B55}|\u{3030}|\u{303D}|\u{3297}|\u{3299}]/gu, '').trim();
}

async function render({ products, text, colors }) {
  const accent  = colors.badge_bg || colors.accent || '#FF2D87';
  const bgTop   = '#F0E6FF';
  const bgBot   = '#FAF0FF';
  const logo    = await loadLogo(W, { maxHeight: 55, dark: false });

  async function loadClean(src, w, h) {
    if (!src) return null;
    const buf   = await loadImageBuffer(src);
    const clean = await removeBackground(buf);
    return sharp(clean)
      .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }

  // Hoop: 80% of card width = 656, cap height at CARD_H - 30
  const [hoopBuf, beltBuf, creamBuf, detoxBuf] = await Promise.all([
    loadClean(products.hoop,  656, 510),
    loadClean(products.belt,  IMG_MAX_W, IMG_MAX_H),
    loadClean(products.cream, IMG_MAX_W, IMG_MAX_H),
    loadClean(products.tea,   IMG_MAX_W, IMG_MAX_H),
  ]);

  const hoopM  = hoopBuf  ? await sharp(hoopBuf).metadata()  : null;
  const beltM  = beltBuf  ? await sharp(beltBuf).metadata()  : null;
  const creamM = creamBuf ? await sharp(creamBuf).metadata() : null;
  const detoxM = detoxBuf ? await sharp(detoxBuf).metadata() : null;

  const giftMetas = { belt: beltM, cream: creamM, tea: detoxM };
  const giftBufs  = { belt: beltBuf, cream: creamBuf, tea: detoxBuf };

  // ── Base SVG: lavender gradient bg + white card shapes ────────────────────────
  const baseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="${bgTop}"/>
        <stop offset="100%" stop-color="${bgBot}"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_W}" height="${CARD_H}" rx="32" fill="white" stroke="#E8D8FF" stroke-width="2"/>
    <rect x="28"  y="${GIFT_Y}" width="${GIFT_W}" height="${GIFT_H}" rx="24" fill="white" stroke="#E0E0E0" stroke-width="1"/>
    <rect x="342" y="${GIFT_Y}" width="${GIFT_W}" height="${GIFT_H}" rx="24" fill="white" stroke="#E0E0E0" stroke-width="1"/>
    <rect x="656" y="${GIFT_Y}" width="${GIFT_W}" height="${GIFT_H}" rx="24" fill="white" stroke="#E0E0E0" stroke-width="1"/>
  </svg>`;
  const baseBuf = await sharp(Buffer.from(baseSvg)).png().toBuffer();

  // ── Text / UI layer ───────────────────────────────────────────────────────────
  const textBuf = renderTextLayer(W, H, (ctx) => {

    // ── Logo — image if available, arc-text fallback ──────────────────────────
    if (!logo) {
      const fontSize = 22;
      ctx.font      = F.headline(fontSize);
      ctx.fillStyle = '#888888';
      ctx.textAlign = 'left';
      const before  = 'INFINITYH';
      const oW      = ctx.measureText('O').width;
      const bW      = ctx.measureText(before).width;
      const totalW  = bW + oW * 2 + ctx.measureText('P').width;
      const startX  = W / 2 - totalW / 2;
      const logoY   = 42;
      ctx.fillText(before, startX, logoY);
      const ringR  = Math.round(oW * 0.42);
      const ringCY = logoY - Math.round(fontSize * 0.32);
      [startX + bW + oW * 0.5, startX + bW + oW * 1.5].forEach((cx) => {
        ctx.strokeStyle = '#999999'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, ringCY, ringR, 0, Math.PI * 2); ctx.stroke();
      });
      ctx.fillText('P', startX + bW + oW * 2, logoY);
    }

    // ── Full-width hot-pink banner ─────────────────────────────────────────────
    ctx.fillStyle = accent;
    ctx.fillRect(0, BANNER_Y, W, BANNER_H);

    if (text.badge) {
      const badgeText = stripEmoji(text.badge).toUpperCase();
      // Auto-shrink font until text fits within W - 40px padding
      let bSize = 30;
      ctx.font = F.badge(bSize);
      while (ctx.measureText(badgeText).width > W - 60 && bSize > 16) {
        bSize -= 1;
        ctx.font = F.badge(bSize);
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(badgeText, W / 2, BANNER_Y + BANNER_H / 2 + bSize * 0.37);
    }

    // ── Offer pill: hot-pink pill below banner, above hoop card ───────────────
    if (text.headline) {
      const hl = stripEmoji(text.headline).toUpperCase();
      const pillW = 400, pillH = PILL_H;
      const pillX = W / 2 - pillW / 2;
      ctx.fillStyle = accent;
      drawRoundedRect(ctx, pillX, PILL_Y, pillW, pillH, pillH / 2);
      ctx.fill();
      ctx.font      = F.headline(46);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(hl, W / 2, PILL_Y + pillH / 2 + 17);
    }

    // ── Gift card UI ──────────────────────────────────────────────────────────
    GIFTS.forEach(({ cx, key, label }) => {
      const buf = giftBufs[key];
      if (!buf) return;

      // FREE pill — above card top edge
      const pillW = 116, pillH = 36;
      ctx.fillStyle = accent;
      drawRoundedRect(ctx, cx - pillW / 2, GIFT_Y - 18, pillW, pillH, 18);
      ctx.fill();
      ctx.font      = F.badge(17);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText('FREE', cx, GIFT_Y + 14);

      // Product label
      const labelY = IMG_ZONE_TOP + IMG_MAX_H + 22;
      ctx.font      = F.badge(15);
      ctx.fillStyle = '#111111';
      ctx.textAlign = 'center';
      ctx.fillText(label, cx, labelY);

      // Strikethrough price
      const priceY = labelY + 22;
      ctx.font      = F.body(14);
      ctx.fillStyle = '#AAAAAA';
      ctx.textAlign = 'center';
      ctx.fillText('$29.99', cx, priceY);
      const pw = ctx.measureText('$29.99').width;
      ctx.strokeStyle = '#AAAAAA';
      ctx.lineWidth   = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - pw / 2, priceY - 5);
      ctx.lineTo(cx + pw / 2, priceY - 5);
      ctx.stroke();
    });

    // ── CTA pill ──────────────────────────────────────────────────────────────
    if (text.cta) {
      const ctaY = 1158;
      ctx.fillStyle = accent;
      drawRoundedRect(ctx, 40, ctaY, W - 80, 58, 29);
      ctx.fill();
      ctx.font      = F.badge(26);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(stripEmoji(text.cta).toUpperCase(), W / 2, ctaY + 37);
    }
  });

  // ── Composite ─────────────────────────────────────────────────────────────────
  const composites = [];

  if (logo) {
    composites.push({
      input: logo.buffer,
      top:   Math.round(30 - logo.height / 2),
      left:  Math.round((W - logo.width) / 2),
    });
  }

  if (hoopBuf && hoopM) {
    composites.push({
      input: hoopBuf,
      top:  Math.round(CARD_Y + (CARD_H - hoopM.height) / 2),
      left: Math.round(CARD_X + (CARD_W - hoopM.width)  / 2),
    });
  }

  GIFTS.forEach(({ cx, key }) => {
    const buf  = giftBufs[key];
    const meta = giftMetas[key];
    if (!buf || !meta) return;
    composites.push({
      input: buf,
      top:  Math.round(IMG_ZONE_TOP + (IMG_MAX_H - meta.height) / 2),
      left: Math.round(cx - meta.width / 2),
    });
  });

  composites.push({ input: textBuf, top: 0, left: 0 });

  return sharp(baseBuf).composite(composites).png().toBuffer();
}

module.exports = { render };
