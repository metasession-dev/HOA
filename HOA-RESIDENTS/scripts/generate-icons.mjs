/**
 * Generate the PNG icon set + iOS splash screens for BOTH apps. Each app
 * owns its own master at `public/icons/logo.png` — drop the file there and
 * this script resizes it into every other size that platform needs.
 *
 * Run with:
 *   node scripts/generate-icons.mjs
 *
 * Source (per app):
 *   <app>/public/icons/logo.png   (square, ≥1024×1024 recommended)
 *
 * Output (per app):
 *   public/icons/icon-{192,256,384,512,1024}.png
 *   public/icons/icon-maskable-{192,512}.png
 *   public/icons/apple-touch-icon.png (180×180)
 *   public/icons/favicon-{16,32}.png
 *   public/favicon.png                — 32×32 root favicon
 *   public/splash/apple-splash-{w}x{h}.png  (RESIDENTS only — iOS PWA splash)
 *
 * Why per-app instead of one shared master? Each app's public folder is
 * self-contained — no relative paths up to HOA-DOCS, no tooling that needs
 * to know about repo layout. If the two apps ever want to ship with
 * slightly different brand marks (a future white-label scenario) the model
 * already supports it.
 */
import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Per-app config. Each app holds its own master at public/icons/logo.png.
// RESIDENTS is the PWA — it needs the iOS splash set too; ENTERPRISE is
// desktop-only so we skip splash there.
const APPS = [
  { name: 'HOA-RESIDENTS', root: path.join(REPO_ROOT, 'HOA-RESIDENTS'), splash: true },
  { name: 'HOA-ENTERPRISE', root: path.join(REPO_ROOT, 'HOA-ENTERPRISE'), splash: false },
];

const ICON_SIZES = [192, 256, 384, 512, 1024];
const MASKABLE_SIZES = [192, 512];
// Common iOS splash sizes — covers iPhone SE through iPhone 15 Pro Max.
const SPLASH_SIZES = [
  { w: 750, h: 1334 },  // iPhone 8
  { w: 1170, h: 2532 }, // iPhone 13 Pro
  { w: 1290, h: 2796 }, // iPhone 15 Pro Max
];
// Background for splash + maskable safe-zone padding.
const CANVAS_BG = { r: 251, g: 250, b: 249, alpha: 1 }; // #fbfaf9

async function ensureDirs(root, includeSplash) {
  await fs.mkdir(path.join(root, 'public', 'icons'), { recursive: true });
  if (includeSplash) await fs.mkdir(path.join(root, 'public', 'splash'), { recursive: true });
}

async function readAppSource(root, name) {
  const srcPath = path.join(root, 'public', 'icons', 'logo.png');
  try {
    return await fs.readFile(srcPath);
  } catch (err) {
    console.error(`\n[${name}] Missing source logo at: ${srcPath}`);
    console.error('Drop your master PNG (square, ≥1024×1024) at that path and run again.\n');
    throw err;
  }
}

async function renderForApp({ name, root, splash }) {
  await ensureDirs(root, splash);
  const iconsDir = path.join(root, 'public', 'icons');
  const srcBuffer = await readAppSource(root, name);

  // Note: we intentionally DON'T re-write public/icons/logo.png — the
  // master IS that file. Re-encoding it through sharp would only change the
  // bytes without semantic benefit and would muddy git history when the
  // user updates the master.

  // Regular PWA icons.
  for (const size of ICON_SIZES) {
    await sharp(srcBuffer).resize(size, size, { fit: 'contain', background: CANVAS_BG }).png().toFile(path.join(iconsDir, `icon-${size}.png`));
  }
  // Apple touch icon (Apple HIG: 180×180).
  await sharp(srcBuffer).resize(180, 180, { fit: 'contain', background: CANVAS_BG }).png().toFile(path.join(iconsDir, 'apple-touch-icon.png'));
  // Favicons.
  await sharp(srcBuffer).resize(32, 32, { fit: 'contain', background: CANVAS_BG }).png().toFile(path.join(iconsDir, 'favicon-32.png'));
  await sharp(srcBuffer).resize(16, 16, { fit: 'contain', background: CANVAS_BG }).png().toFile(path.join(iconsDir, 'favicon-16.png'));
  // Root favicon (Next.js uses /favicon.png as a default lookup target).
  await sharp(srcBuffer).resize(32, 32, { fit: 'contain', background: CANVAS_BG }).png().toFile(path.join(root, 'public', 'favicon.png'));

  // Maskable icons (PWA install) — pad the logo to 80% of the canvas to
  // give Android's safe zone enough breathing room when the launcher
  // crops it into a circle / squircle / squared-circle.
  for (const size of MASKABLE_SIZES) {
    const inner = Math.round(size * 0.8);
    const offset = Math.round((size - inner) / 2);
    const innerBuf = await sharp(srcBuffer).resize(inner, inner, { fit: 'contain', background: CANVAS_BG }).png().toBuffer();
    await sharp({
      create: { width: size, height: size, channels: 4, background: CANVAS_BG },
    })
      .composite([{ input: innerBuf, left: offset, top: offset }])
      .png()
      .toFile(path.join(iconsDir, `icon-maskable-${size}.png`));
  }

  // iOS splash — only the resident PWA needs these.
  if (splash) {
    for (const { w, h } of SPLASH_SIZES) {
      const logoSize = Math.round(Math.min(w, h) * 0.3);
      const logo = await sharp(srcBuffer).resize(logoSize, logoSize, { fit: 'contain', background: CANVAS_BG }).png().toBuffer();
      const left = Math.round((w - logoSize) / 2);
      const top = Math.round((h - logoSize) / 2);
      await sharp({
        create: { width: w, height: h, channels: 4, background: CANVAS_BG },
      })
        .composite([{ input: logo, left, top }])
        .png()
        .toFile(path.join(root, 'public', 'splash', `apple-splash-${w}x${h}.png`));
    }
  }

  console.log(`✓ ${name} icons written`);
}

async function main() {
  for (const app of APPS) {
    await renderForApp(app);
  }
  console.log('\nAll done. Restart the dev servers (or hard-refresh) to pick up the new images.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
