/**
 * ih-bundle — IH9 style
 * 960×1220 · badge banner · offer pill · hoop card · 3 gift cards · CTA pill
 */
const sharp = require('sharp');
const { loadImageBuffer, removeBackground } = require('../utils/imageLoader');
const { F, renderTextLayer, drawRoundedRect } = require('../utils/textRenderer');

const W = 960, H = 1220;

// Hoop card
const CARD_X = 70, CARD_Y = 215, CARD_W = 820, CARD_H = 560;

// Gift card row
const GIFT_Y = 826, GIFT_CARD_H = 330, GIFT_W = 276;
const IMG_MAX = 200;          // max product image size inside gift card
const IMG_Y   = GIFT_Y + 54; // top of product image zone (below FREE pill)

const GIFTS = [
  { x: 28,  cx: 166, key: 'belt',  label: 'FREE SLIMMING BELT' },
  { x: 342, cx: 480, key: 'cream', label: 'FREE TONING CREAM'  },
  { x: 656, cx: 794, key: 'tea',   label: 'FREE DETOX TEA'     },
];

function stripEmoji(str) {
  return (str || '').replace(/[\u{1F300}-\u{1FFFF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}|\u{FE00}-\u{FE0F}|\u{1F000}-\u{1F02F}|\u{1F0A0}-\u{1F0FF}|\u{1F100}-\u{1F1FF}|\u{1F200}-\u{1F2FF}|\u{1F900}-\u{1F9FF}|\u{1FA00}-\u{1FA6F}|\u{1FA70}-\u{1FAFF}]/gu, '').trim();
}

async function render({ products, text, colors }) {
  const accent  = colors.badge_bg || colors.accent || colors.cta_bg || '#FF2D55';
  const bgColor = colors.background || '#FFFFFF';

  async function loadClean(src, w, h) {
    if (!src) return null;
    const buf   = await loadImageBuffer(src);
    const clean = await removeBackground(buf);
    return sharp(clean)
      .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }

  // Load all product images in parallel
  const [hoopBuf, beltBuf, creamBuf, detoxBuf] = await Promise.all([
    loadClean(products.hoop,  656, 448),
    loadClean(products.belt,  IMG_MAX, IMG_MAX),
    loadClean(products.cream, IMG_MAX, IMG_MAX),
    loadClean(products.tea,   IMG_MAX, IMG_MAX),
  ]);

  const hoopM  = hoopBuf  ? await sharp(hoopBuf).metadata()  : null;
  const beltM  = beltBuf  ? await sharp(beltBuf).metadata()  : null;
  const creamM = creamBuf ? await sharp(creamBuf).metadata() : null;
  const detoxM = detoxBuf ? await sharp(detoxBuf).metadata() : null;

  const giftMetas = { belt: beltM, cream: creamM, tea: detoxM };
  const giftBufs  = { belt: beltBuf, cream: creamBuf, tea: detoxBuf };

  // ── Base layer: background + white card shapes (SVG) ─────────────────────────
  const baseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="${bgColor}"/>
    <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_W}" height="${CARD_H}" rx="32" fill="white" stroke="#222222" stroke-width="3"/>
    <rect x="28"  y="${GIFT_Y}" width="${GIFT_W}" height="${GIFT_CARD_H}" rx="24" fill="white" stroke="#DDDDDD" stroke-width="1.5"/>
    <rect x="342" y="${GIFT_Y}" width="${GIFT_W}" height="${GIFT_CARD_H}" rx="24" fill="white" stroke="#DDDDDD" stroke-width="1.5"/>
    <rect x="656" y="${GIFT_Y}" width="${GIFT_W}" height="${GIFT_CARD_H}" rx="24" fill="white" stroke="#DDDDDD" stroke-width="1.5"/>
  </svg>`;
  const baseBuf = await sharp(Buffer.from(baseSvg)).png().toBuffer();

  // ── Text / UI layer (transparent canvas, composited last) ────────────────────
  const textBuf = renderTextLayer(W, H, (ctx) => {
    // Logo
    ctx.font      = F.body(16);
    ctx.fillStyle = '#999999';
    ctx.textAlign = 'center';
    ctx.fillText('INFINITY HOOP', W / 2, 50);

    // Full-width badge banner
    ctx.fillStyle = accent;
    ctx.fillRect(0, 80, W, 82);
    if (text.badge) {
      ctx.font      = F.badge(28);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(stripEmoji(text.badge).toUpperCase(), W / 2, 131);
    }

    // Offer pill (black pill, white Bebas Neue text)
    if (text.headline) {
      const hl = stripEmoji(text.headline).toUpperCase();
      ctx.fillStyle = '#111111';
      drawRoundedRect(ctx, W / 2 - 240, 195, 480, 66, 33);
      ctx.fill();
      ctx.font      = F.headline(44);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(hl, W / 2, 241);
    }

    // Gift card UI: FREE pill + label + strikethrough price
    GIFTS.forEach(({ cx, key, label }) => {
      const buf = giftBufs[key];
      if (!buf) return;

      // FREE pill — overlaps top edge of gift card
      const pillW = 110, pillH = 36;
      ctx.fillStyle = accent;
      drawRoundedRect(ctx, cx - pillW / 2, GIFT_Y - 18, pillW, pillH, 18);
      ctx.fill();
      ctx.font      = F.badge(17);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText('FREE', cx, GIFT_Y + 14);

      // Product label
      const labelY = IMG_Y + IMG_MAX + 26;
      ctx.font      = F.badge(13);
      ctx.fillStyle = '#111111';
      ctx.textAlign = 'center';
      ctx.fillText(label, cx, labelY);

      // Strikethrough price
      const priceY = labelY + 24;
      ctx.font      = F.body(13);
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

    // CTA pill
    if (text.cta) {
      ctx.fillStyle = accent;
      drawRoundedRect(ctx, 28, 1162, W - 56, 58, 29);
      ctx.fill();
      ctx.font      = F.badge(26);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(stripEmoji(text.cta).toUpperCase(), W / 2, 1200);
    }
  });

  // ── Composite ─────────────────────────────────────────────────────────────────
  const composites = [];

  // Hoop — centered inside hoop card
  if (hoopBuf && hoopM) {
    composites.push({
      input: hoopBuf,
      top:  Math.round(CARD_Y + (CARD_H - hoopM.height) / 2),
      left: Math.round(CARD_X + (CARD_W - hoopM.width)  / 2),
    });
  }

  // Gift product images — centered horizontally, top-aligned in image zone
  GIFTS.forEach(({ cx, key }) => {
    const buf  = giftBufs[key];
    const meta = giftMetas[key];
    if (!buf || !meta) return;
    composites.push({
      input: buf,
      top:  Math.round(IMG_Y + (IMG_MAX - meta.height) / 2),
      left: Math.round(cx - meta.width / 2),
    });
  });

  // Text/UI layer last — sits on top of everything
  composites.push({ input: textBuf, top: 0, left: 0 });

  return sharp(baseBuf).composite(composites).png().toBuffer();
}

module.exports = { render };
