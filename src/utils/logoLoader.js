/**
 * Loads src/assets/logo.png, scales to fit maxHeight (preserving aspect ratio),
 * and returns { buffer, width, height } — or null if the file doesn't exist.
 */
const path  = require('path');
const fs    = require('fs');
const sharp = require('sharp');

const LOGO_PATH = path.join(__dirname, '../assets/logo.png');

async function loadLogo(canvasWidth, maxHeight = 60) {
  if (!fs.existsSync(LOGO_PATH)) return null;
  try {
    const raw  = fs.readFileSync(LOGO_PATH);
    const meta = await sharp(raw).metadata();
    const scale  = Math.min(maxHeight / meta.height, (canvasWidth - 80) / meta.width, 1);
    const outW   = Math.round(meta.width  * scale);
    const outH   = Math.round(meta.height * scale);
    const buffer = await sharp(raw).resize(outW, outH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return { buffer, width: outW, height: outH };
  } catch (e) {
    console.warn('[logoLoader] Failed to load logo:', e.message);
    return null;
  }
}

module.exports = { loadLogo };
