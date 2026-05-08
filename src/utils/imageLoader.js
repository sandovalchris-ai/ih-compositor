const sharp = require('sharp');
const axios = require('axios');

async function loadImageBuffer(source) {
  if (!source) return null;

  if (source.startsWith('data:')) {
    const base64 = source.split(',')[1];
    return Buffer.from(base64, 'base64');
  }

  if (source.startsWith('http://') || source.startsWith('https://')) {
    const response = await axios.get(source, {
      responseType: 'arraybuffer',
      timeout: 15000,
    });
    return Buffer.from(response.data);
  }

  // Raw base64
  return Buffer.from(source, 'base64');
}

/**
 * Resize to fit within (width × height) while preserving exact aspect ratio.
 * Transparent padding fills the rest — product pixels are never stretched or cropped.
 */
async function resizeContain(source, width, height) {
  const buf = await loadImageBuffer(source);
  if (!buf) return null;

  return sharp(buf)
    .resize(width, height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

/**
 * Fill (width × height) by cropping from center — used for background scenes only.
 * Never use on product images.
 */
async function resizeCover(source, width, height) {
  const buf = await loadImageBuffer(source);
  if (!buf) return null;

  return sharp(buf)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .png()
    .toBuffer();
}

async function getImageDimensions(source) {
  const buf = await loadImageBuffer(source);
  if (!buf) return null;
  const meta = await sharp(buf).metadata();
  return { width: meta.width, height: meta.height };
}

module.exports = { loadImageBuffer, resizeContain, resizeCover, getImageDimensions };
