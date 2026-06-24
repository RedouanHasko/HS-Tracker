/**
 * Generates PWA icon sizes from the HS Infinity source image.
 * Run before build: node scripts/generate-pwa-icons.mjs
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'assets/img/HS INFINITY-icon.jpeg');
const outDir = path.join(root, 'public/icons');

if (!fs.existsSync(src)) {
  console.error('Source icon not found:', src);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const themeBg = { r: 15, g: 23, b: 42, alpha: 1 }; // slate-900 — matches theme-color
const lightBg = { r: 248, g: 250, b: 252, alpha: 1 }; // splash background

async function writeIcon(size, filename, background) {
  await sharp(src)
    .resize(size, size, { fit: 'contain', background })
    .png()
    .toFile(path.join(outDir, filename));
  console.log('  ✓', filename);
}

console.log('Generating PWA icons from HS INFINITY-icon.jpeg…');

await writeIcon(180, 'apple-touch-icon.png', lightBg);
await writeIcon(192, 'icon-192.png', lightBg);
await writeIcon(512, 'icon-512.png', lightBg);

// Maskable: logo inset ~20% safe zone for Android adaptive icons
const maskableInner = Math.round(512 * 0.62);
await sharp(src)
  .resize(maskableInner, maskableInner, { fit: 'contain', background: themeBg })
  .extend({
    top: Math.floor((512 - maskableInner) / 2),
    bottom: Math.ceil((512 - maskableInner) / 2),
    left: Math.floor((512 - maskableInner) / 2),
    right: Math.ceil((512 - maskableInner) / 2),
    background: themeBg,
  })
  .png()
  .toFile(path.join(outDir, 'icon-512-maskable.png'));
console.log('  ✓ icon-512-maskable.png');

console.log('Done — icons saved to public/icons/');
