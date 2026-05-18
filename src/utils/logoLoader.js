/**
 * Loads src/assets/infinityhoop-logo.png, scales to maxHeight (preserving
 * aspect ratio), optionally inverts to white for dark backgrounds.
 * Returns { buffer, width, height } or null if file doesn't exist.
 */
const path  = require('path');
const fs    = require('fs');
const sharp = require('sharp');

const LOGO_PATH = path.join(__dirname, '../assets/infinityhoop-logo.png');

async function loadLogo(canvasWidth, { maxHeight = 55, dark = false } = {}) {
  if (!fs.existsSync(LOGO_PATH)) return null;
  try {
    const raw  = fs.readFileSync(LOGO_PATH);
    const meta = await sharp(raw).metadata();
    const scale  = Math.min(maxHeight / meta.height, (canvasWidth - 80) / meta.width, 1);
    const outW   = Math.round(meta.width  * scale);
    const outH   = Math.round(meta.height * scale);

    let pipeline = sharp(raw).resize(outW, outH, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });

    if (dark) {
      // Invert RGB channels only — keeps transparency intact, turns black logo white
      pipeline = pipeline.negate({ alpha: false });
    }

    const buffer = await pipeline.png().toBuffer();
    return { buffer, width: outW, height: outH };
  } catch (e) {
    console.warn('[logoLoader] Failed to load logo:', e.message);
    return null;
  }
}

// Returns true when background hex color is dark (luminance < 128)
function bgIsDark(hex) {
  if (!hex || hex.length < 7) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
}

module.exports = { loadLogo, bgIsDark };
