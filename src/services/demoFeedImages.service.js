const path = require('path');
const fs = require('fs/promises');
const sharp = require('sharp');

const ASSETS_DIR = path.join(__dirname, '../assets/demo-feed');
const FONT_FILE = path.join(__dirname, '../assets/fonts/Manrope.ttf');

function escapeMarkup(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function renderText(markup, { width, dpi, align = 'left' }) {
  return sharp({
    text: {
      text: markup,
      font: 'Manrope',
      fontfile: FONT_FILE,
      width,
      dpi,
      align,
      rgba: true,
      wrap: 'word',
    },
  }).png().toBuffer();
}

function gradientSvg({ width, height, direction }) {
  const coords = direction === 'top'
    ? 'x1="0" y1="0" x2="0" y2="1"'
    : 'x1="0" y1="0" x2="1" y2="0"';
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="g" ${coords}>
          <stop offset="0" stop-color="#00122e" stop-opacity="0.92"/>
          <stop offset="0.6" stop-color="#00122e" stop-opacity="0.62"/>
          <stop offset="1" stop-color="#00122e" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
    </svg>
  `);
}

async function buildWelcomeImage(schoolName) {
  const base = sharp(path.join(ASSETS_DIR, 'welcome.jpg'));
  const { width, height } = await base.metadata();
  const textWidth = Math.round(width * 0.84);
  const markup = [
    `<span foreground="#7fe3ff" weight="700" size="small">COMUNIDAD DEL COLEGIO</span>`,
    `<span foreground="#ffffff" weight="800" size="x-large">${escapeMarkup(schoolName)}</span>`,
    `<span foreground="#ffffff" weight="600">¡Bienvenidos a un nuevo año escolar!</span>`,
  ].join('\n');
  const text = await renderText(markup, { width: textWidth, dpi: 330, align: 'center' });
  const textMeta = await sharp(text).metadata();

  return base
    .composite([
      { input: gradientSvg({ width, height: Math.round(height * 0.55), direction: 'top' }), top: 0, left: 0 },
      {
        input: text,
        top: Math.round(height * 0.05),
        left: Math.max(0, Math.round((width - textMeta.width) / 2)),
      },
    ])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

async function buildPensionImage() {
  const base = sharp(path.join(ASSETS_DIR, 'pension.jpg'));
  const { width, height } = await base.metadata();
  const markup = [
    '<span foreground="#ffffff" weight="800">Ahora paga más fácil la pensión del colegio,</span>',
    '<span foreground="#7fe3ff" weight="800">¡presionando un solo botón!</span>',
  ].join('\n');
  const text = await renderText(markup, { width: Math.round(width * 0.42), dpi: 260 });
  const textMeta = await sharp(text).metadata();

  return base
    .composite([
      { input: gradientSvg({ width: Math.round(width * 0.62), height, direction: 'left' }), top: 0, left: 0 },
      {
        input: text,
        top: Math.max(0, Math.round((height - textMeta.height) / 2)),
        left: Math.round(width * 0.06),
      },
    ])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

async function buildActivityImage() {
  return fs.readFile(path.join(ASSETS_DIR, 'activity.jpg'));
}

module.exports = {
  buildWelcomeImage,
  buildPensionImage,
  buildActivityImage,
};
