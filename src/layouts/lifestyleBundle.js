/**
 * lifestyle-bundle — Claude Vision-driven dynamic layout
 * 1080×1350 · Products placed naturally with no card borders
 * Fixed:    INFINITY HOOP logo · $100 OFF + 3 FREE GIFTS offer · 4 real products · CTA
 * Variable: headline, bg color, hoop color, urgency, product arrangement, decorations
 *
 * dna object (from /analyze-winners or brief):
 *   background_type:       "solid" | "gradient"
 *   background_colors:     { primary: "#hex", secondary: "#hex" }
 *   headline_position:     "top" | "center"
 *   headline_style:        "big_bold" | "mixed_weight" | "quote_style"
 *   product_arrangement:   "hero_center" | "natural_scene" | "split" | "card"
 *   decorative_elements:   "confetti" | "stars" | "ribbons" | "none"
 *   social_proof_position: "top" | "bottom" | "none"
 */
const sharp = require('sharp');
const { loadImageBuffer, removeBackground } = require('../utils/imageLoader');
const {
  F, renderTextLayer, drawRoundedRect, drawStar,
  drawSocialProof, drawLogo, drawCTA, wrapText, fitFontSize,
} = require('../utils/textRenderer');
const { loadLogo } = require('../utils/logoLoader');

const W = 1080, H = 1350, PAD = 44;

function stripEmoji(s) {
  return (s || '')
    .replace(/[\u{1F300}-\u{1FFFF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}|\u{FE00}-\u{FE0F}|\u{1F000}-\u{1F02F}|\u{1F0A0}-\u{1F0FF}|\u{1F100}-\u{1F1FF}|\u{1F200}-\u{1F2FF}|\u{1F900}-\u{1F9FF}|\u{1FA00}-\u{1FA6F}|\u{1FA70}-\u{1FAFF}|\u{231A}-\u{231B}|\u{23E9}-\u{23F3}|\u{23F8}-\u{23FA}|\u{25AA}-\u{25AB}|\u{25B6}|\u{25C0}|\u{25FB}-\u{25FE}|\u{2614}-\u{2615}|\u{2648}-\u{2653}|\u{267F}|\u{2693}|\u{26A1}|\u{26AA}-\u{26AB}|\u{26BD}-\u{26BE}|\u{26C4}-\u{26C5}|\u{26CE}|\u{26D4}|\u{26EA}|\u{26F2}-\u{26F3}|\u{26F5}|\u{26FA}|\u{26FD}|\u{2702}|\u{2705}|\u{2708}-\u{270D}|\u{270F}|\u{2712}|\u{2714}|\u{2716}|\u{271D}|\u{2721}|\u{2728}|\u{2733}-\u{2734}|\u{2744}|\u{2747}|\u{274C}|\u{274E}|\u{2753}-\u{2755}|\u{2757}|\u{2763}-\u{2764}|\u{2795}-\u{2797}|\u{27A1}|\u{27B0}|\u{27BF}|\u{2934}-\u{2935}|\u{2B05}-\u{2B07}|\u{2B1B}-\u{2B1C}|\u{2B50}|\u{2B55}|\u{3030}|\u{303D}|\u{3297}|\u{3299}]/gu,
    '',
  ).trim();
}

// Product zone sizes and positions for each arrangement style (1080×1350 canvas)
const ZONES = {
  // Large hoop centered top, three gifts in a row below
  hero_center: {
    hoop:  { w: 560, h: 560, top: 350, left: 260 },
    belt:  { w: 172, h: 172, top: 950, left: 92  },
    cream: { w: 172, h: 172, top: 950, left: 454 },
    tea:   { w: 172, h: 172, top: 950, left: 816 },
  },
  // Hoop left-center, gifts scattered organically around it
  natural_scene: {
    hoop:  { w: 500, h: 500, top: 370, left: 52  },
    belt:  { w: 200, h: 200, top: 300, left: 760 },
    cream: { w: 190, h: 190, top: 700, left: 800 },
    tea:   { w: 190, h: 190, top: 1000, left: 250 },
  },
  // Hoop fills left half, gifts stacked vertically on right
  split: {
    hoop:  { w: 480, h: 480, top: 420, left: 18  },
    belt:  { w: 200, h: 200, top: 420, left: 636 },
    cream: { w: 200, h: 200, top: 660, left: 636 },
    tea:   { w: 200, h: 200, top: 900, left: 636 },
  },
  // Hoop dominant center-top, gifts in a clean row below
  card: {
    hoop:  { w: 590, h: 590, top: 300, left: 245 },
    belt:  { w: 172, h: 172, top: 940, left: 92  },
    cream: { w: 172, h: 172, top: 940, left: 454 },
    tea:   { w: 172, h: 172, top: 940, left: 816 },
  },
};

const GIFT_KEYS   = ['belt', 'cream', 'tea'];
const GIFT_LABELS = {
  belt:  'FREE SWEAT BELT',
  cream: 'FREE TONING CREAM',
  tea:   'FREE DETOX TEA',
};

// Seeded pseudorandom for deterministic decorations per variation
function seededRng(seed) {
  return (i) => Math.abs(Math.sin((i + 1) * seed * 9301 + 49297) * 233280) % 1;
}

async function render({ products, text, colors, dna, variation_id = 1 }) {
  const logo = await loadLogo(W, 60);

  // Resolve DNA with safe defaults
  const d = {
    background_type:       dna?.background_type                  || 'gradient',
    bg_primary:            dna?.background_colors?.primary        || colors.background || '#F5E4F2',
    bg_secondary:          dna?.background_colors?.secondary      || '#FFFFFF',
    headline_position:     dna?.headline_position                 || 'top',
    headline_style:        dna?.headline_style                    || 'big_bold',
    product_arrangement:   dna?.product_arrangement               || 'hero_center',
    decorative_elements:   dna?.decorative_elements               || 'none',
    social_proof_position: dna?.social_proof_position             || 'bottom',
  };

  // Explicit colors.background takes precedence over DNA
  if (colors.background && colors.background !== '#F5E4F2') {
    d.bg_primary = colors.background;
  }

  const accent = colors.badge_bg || colors.cta_bg || '#FF2D87';
  const zones  = ZONES[d.product_arrangement] || ZONES.hero_center;
  const isRow  = d.product_arrangement === 'hero_center' || d.product_arrangement === 'card';

  // ── Background ──────────────────────────────────────────────────────────────
  const bgSvg = d.background_type === 'solid'
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
         <rect width="${W}" height="${H}" fill="${d.bg_primary}"/>
       </svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
         <defs>
           <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
             <stop offset="0%"   stop-color="${d.bg_primary}"/>
             <stop offset="100%" stop-color="${d.bg_secondary}"/>
           </linearGradient>
         </defs>
         <rect width="${W}" height="${H}" fill="url(#bg)"/>
       </svg>`;

  const bgBuf = await sharp(Buffer.from(bgSvg)).png().toBuffer();

  // ── Load + remove background from products ───────────────────────────────────
  async function loadClean(src, w, h) {
    if (!src) return null;
    const buf   = await loadImageBuffer(src);
    const clean = await removeBackground(buf);
    return sharp(clean)
      .resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }

  const [hoopBuf, beltBuf, creamBuf, teaBuf] = await Promise.all([
    loadClean(products.hoop,  zones.hoop.w,  zones.hoop.h),
    loadClean(products.belt,  zones.belt.w,  zones.belt.h),
    loadClean(products.cream, zones.cream.w, zones.cream.h),
    loadClean(products.tea,   zones.tea.w,   zones.tea.h),
  ]);

  const bufs  = { hoop: hoopBuf,  belt: beltBuf,  cream: creamBuf,  tea: teaBuf  };
  const metas = {
    hoop:  hoopBuf  ? await sharp(hoopBuf).metadata()  : null,
    belt:  beltBuf  ? await sharp(beltBuf).metadata()  : null,
    cream: creamBuf ? await sharp(creamBuf).metadata() : null,
    tea:   teaBuf   ? await sharp(teaBuf).metadata()   : null,
  };

  // ── Text + UI layer ──────────────────────────────────────────────────────────
  const textBuf = renderTextLayer(W, H, (ctx) => {
    const rng = seededRng(variation_id || 1);

    // ── Decorative elements ──────────────────────────────────────────────────
    if (d.decorative_elements === 'confetti') {
      const palette = [accent, '#FFD700', '#FFFFFF', d.bg_secondary, '#FF6B9D', '#7EC8E3'];
      for (let i = 0; i < 55; i++) {
        ctx.globalAlpha = 0.4 + rng(i + 400) * 0.6;
        ctx.fillStyle   = palette[Math.floor(rng(i + 300) * palette.length)];
        const cx = rng(i) * W;
        const cy = rng(i + 100) * H;
        const r  = 4 + rng(i + 200) * 9;
        if (i % 3 === 0) {
          ctx.fillRect(cx - r / 2, cy - r * 0.3, r, r * 0.6);
        } else {
          ctx.beginPath();
          ctx.arc(cx, cy, r / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    } else if (d.decorative_elements === 'stars') {
      for (let i = 0; i < 20; i++) {
        const r = 7 + rng(i + 100) * 16;
        drawStar(ctx, rng(i) * W, rng(i + 50) * H, r, '#FFD700');
      }
    } else if (d.decorative_elements === 'ribbons') {
      ctx.save();
      ctx.globalAlpha = 0.1;
      ctx.fillStyle   = accent;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(320, 0); ctx.lineTo(0, 320);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(W, H); ctx.lineTo(W - 320, H); ctx.lineTo(W, H - 320);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // ── Logo — image if available, text fallback ─────────────────────────────
    if (!logo) drawLogo(ctx, W, 38, { color: '#888888', opacity: 0.8 });

    // ── Social proof — top ───────────────────────────────────────────────────
    if (d.social_proof_position === 'top') {
      drawSocialProof(ctx, W, 62, {
        bg: '#111111', starColor: '#FFD700', textColor: '#FFFFFF',
      });
    }

    // ── Offer badge — hardcoded, always $100 OFF + 3 FREE GIFTS ─────────────
    const OFFER   = '$100 OFF + 3 FREE GIFTS — $189.97 SAVINGS';
    const offerY  = d.headline_position === 'center' ? 64 : 298;
    let offerPx   = 26;
    ctx.font = F.badge(offerPx);
    while (ctx.measureText(OFFER).width > W - PAD * 2 - 48 && offerPx > 16) {
      offerPx--; ctx.font = F.badge(offerPx);
    }
    ctx.fillStyle = accent;
    drawRoundedRect(ctx, PAD, offerY, W - PAD * 2, 60, 30);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(OFFER, W / 2, offerY + 38);

    // ── Headline ─────────────────────────────────────────────────────────────
    if (text.headline) {
      const upper = stripEmoji(text.headline).toUpperCase();

      if (d.headline_position === 'center') {
        // Semi-transparent white box in the visual center
        const boxY  = 490;
        const boxPad = 28;
        const px    = fitFontSize(ctx, F.headline, upper, W - PAD * 2 - boxPad * 2, 88, 32, 2);
        const lines = wrapText(ctx, upper, W - PAD * 2 - boxPad * 2);
        const lineH = px * 1.1;
        const boxH  = lines.length * lineH + boxPad * 2 + 10;

        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        drawRoundedRect(ctx, PAD, boxY, W - PAD * 2, boxH, 20);
        ctx.fill();

        ctx.font      = F.headline(px);
        ctx.fillStyle = colors.headline || '#111111';
        ctx.textAlign = 'center';
        lines.forEach((line, i) =>
          ctx.fillText(line, W / 2, boxY + boxPad + px * 0.82 + i * lineH));

      } else {
        // Headline at top (y ≈ 112)
        const hlY = 112;

        if (d.headline_style === 'big_bold') {
          const px    = fitFontSize(ctx, F.headline, upper, W - PAD * 2, 108, 38, 2);
          const lines = wrapText(ctx, upper, W - PAD * 2);
          const lineH = px * 1.08;
          ctx.font      = F.headline(px);
          ctx.fillStyle = colors.headline || '#111111';
          ctx.textAlign = 'center';
          lines.forEach((line, i) => ctx.fillText(line, W / 2, hlY + i * lineH));

        } else if (d.headline_style === 'mixed_weight') {
          const parts = upper.split(/\s+/);
          const half  = Math.ceil(parts.length / 2);
          ctx.textAlign = 'center';
          ctx.font      = F.headline(72);
          ctx.fillStyle = colors.headline || '#111111';
          ctx.fillText(parts.slice(0, half).join(' '), W / 2, hlY);
          ctx.font      = F.body(50);
          ctx.fillStyle = colors.headline || '#444444';
          ctx.fillText(parts.slice(half).join(' '), W / 2, hlY + 86);

        } else {
          // quote_style
          const px    = fitFontSize(ctx, F.headline, upper, W - PAD * 2 - 40, 78, 28, 2);
          const lines = wrapText(ctx, upper, W - PAD * 2 - 40);
          const lineH = px * 1.1;
          ctx.font      = F.headline(px);
          ctx.fillStyle = colors.headline || '#111111';
          ctx.textAlign = 'center';
          lines.forEach((line, i) => ctx.fillText(line, W / 2, hlY + i * lineH));
          // Open/close quote marks
          ctx.font      = F.headline(Math.round(px * 1.4));
          ctx.fillStyle = accent;
          ctx.fillText('“', W / 2 - 190, hlY - px * 0.2);
          ctx.fillText('”', W / 2 + 190, hlY + (lines.length - 1) * lineH + 4);
        }
      }
    }

    // ── Gift labels ──────────────────────────────────────────────────────────
    GIFT_KEYS.forEach((key) => {
      const z   = zones[key];
      const buf = bufs[key];
      if (!buf) return;

      const cx = z.left + z.w / 2;

      if (!isRow) {
        // Scattered: floating pill above the product
        const label = GIFT_LABELS[key];
        const pillW = Math.min(label.length * 11 + 32, 268);
        const pillX = Math.max(4, Math.min(cx - pillW / 2, W - pillW - 4));
        const pillY = z.top - 44;
        ctx.fillStyle = accent;
        drawRoundedRect(ctx, pillX, pillY, pillW, 36, 18);
        ctx.fill();
        ctx.font      = F.badge(14);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(label, pillX + pillW / 2, pillY + 23);
      } else {
        // Row: "FREE" pill above image + product name below
        const freePillW = 100, freePillH = 32;
        const freePillX = cx - freePillW / 2;
        const freePillY = z.top - 18;
        ctx.fillStyle = accent;
        drawRoundedRect(ctx, freePillX, freePillY, freePillW, freePillH, 16);
        ctx.fill();
        ctx.font      = F.badge(15);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText('FREE', cx, freePillY + 21);

        // Product name below image
        const labelY = z.top + z.h + 14;
        ctx.font      = F.badge(14);
        ctx.fillStyle = colors.headline || '#111111';
        ctx.textAlign = 'center';
        ctx.fillText(GIFT_LABELS[key], cx, labelY);

        // Strikethrough price
        const priceY = labelY + 20;
        ctx.font      = F.body(13);
        ctx.fillStyle = '#AAAAAA';
        ctx.fillText('$29.99', cx, priceY);
        const pw = ctx.measureText('$29.99').width;
        ctx.strokeStyle = '#AAAAAA';
        ctx.lineWidth   = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx - pw / 2, priceY - 5);
        ctx.lineTo(cx + pw / 2, priceY - 5);
        ctx.stroke();
      }
    });

    // ── Urgency line ─────────────────────────────────────────────────────────
    if (text.urgency || text.subheadline) {
      const urg = stripEmoji(text.urgency || text.subheadline || '').toUpperCase();
      ctx.font      = F.body(22);
      ctx.fillStyle = accent;
      ctx.textAlign = 'center';
      ctx.fillText(urg, W / 2, H - 168);
    }

    // ── Social proof — bottom ────────────────────────────────────────────────
    if (d.social_proof_position === 'bottom') {
      drawSocialProof(ctx, W, H - 210, {
        bg: '#111111', starColor: '#FFD700', textColor: '#FFFFFF',
      });
    }

    // ── CTA — fixed, always present ──────────────────────────────────────────
    if (text.cta) {
      drawCTA(ctx, stripEmoji(text.cta).toUpperCase(), H - PAD - 82, W, PAD, {
        bg: accent, color: '#FFFFFF', height: 82, fontSize: 32,
      });
    }
  });

  // ── Composite everything ─────────────────────────────────────────────────────
  const composites = [];

  ['hoop', ...GIFT_KEYS].forEach((key) => {
    const buf  = bufs[key];
    const meta = metas[key];
    const zone = zones[key];
    if (!buf || !meta) return;
    composites.push({
      input: buf,
      top:   Math.round(zone.top  + (zone.h - meta.height) / 2),
      left:  Math.round(zone.left + (zone.w - meta.width)  / 2),
    });
  });

  composites.push({ input: textBuf, top: 0, left: 0 });

  if (logo) {
    composites.push({
      input: logo.buffer,
      top:   10,
      left:  Math.round((W - logo.width) / 2),
    });
  }

  return sharp(bgBuf).composite(composites).png().toBuffer();
}

module.exports = { render };
