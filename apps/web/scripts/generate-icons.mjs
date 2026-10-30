import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('../../../apps/api/node_modules/sharp');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Brand Indigo #4338CA, Accent Violet #6366F1, Emerald #059669
const svgIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="96" fill="#4338CA"/>
  <circle cx="256" cy="256" r="180" fill="#131B2E" opacity="0.85"/>
  <path d="M160 160 H352 V200 H220 V236 H332 V276 H220 V312 H352 V352 H160 Z" fill="#FFFFFF"/>
  <circle cx="360" cy="160" r="24" fill="#059669"/>
  <circle cx="160" cy="360" r="20" fill="#6366F1"/>
</svg>
`.trim();

fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgIcon, 'utf8');

async function generate() {
  const svgBuffer = Buffer.from(svgIcon);

  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));

  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));

  // Maskable icon with safe-zone margin
  const maskableSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#4338CA"/>
  <circle cx="256" cy="256" r="140" fill="#131B2E" opacity="0.85"/>
  <path d="M180 180 H332 V212 H228 V240 H316 V272 H228 V300 H332 V332 H180 Z" fill="#FFFFFF"/>
  <circle cx="340" cy="180" r="18" fill="#059669"/>
  <circle cx="180" cy="340" r="16" fill="#6366F1"/>
</svg>
`.trim();

  await sharp(Buffer.from(maskableSvg))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'maskable-icon-512x512.png'));

  console.log('PWA icons successfully generated in apps/web/public');
}

generate().catch((err) => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
