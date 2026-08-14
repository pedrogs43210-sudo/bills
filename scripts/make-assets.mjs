/**
 * Draws the source art the phone apps are built from, then hands it to @capacitor/assets.
 *
 * A script rather than five PNGs someone made once in an image editor: when the logo changes, this
 * regenerates every size for both platforms and nobody has to remember which of forty files was
 * hand-tweaked. Run it with `npm run assets`.
 *
 * The icon deliberately loses the receipt tear. Both stores mask app icons — iOS to a rounded
 * square, Android to whatever shape the launcher prefers — so a torn bottom edge would simply be
 * clipped, and a tear cut through a gradient onto a gradient is invisible anyway. The icon is
 * therefore the bold thing that survives at 40px: the sunset, and the B. The full silhouette, tear
 * and all, still exists where it can be seen properly — the browser tab and the app's own header.
 *
 * iOS additionally rejects any icon with an alpha channel, which is why the square is drawn opaque
 * rather than relying on the mask to cover the corners.
 */
import sharp from "sharp";
import { mkdirSync, statSync } from "node:fs";

const OUT = "assets";
mkdirSync(OUT, { recursive: true });

const SUNSET_1 = "#FF7059";
const SUNSET_2 = "#FFB347";
const CREAM = "#FFF8F0";
const NIGHT = "#241A17";

/** The B, as drawn in public/icon.svg — one shape, so the two files cannot drift apart. */
const B_PATH =
  "M35 24h20.5c8.9 0 14.6 4.6 14.6 12 0 4.6-2.3 8.2-6.1 10 4.8 1.6 7.7 5.6 7.7 11 0 8.2-6.1 " +
  "13.2-16 13.2H35c-2.2 0-3.6-1.4-3.6-3.6V27.6c0-2.2 1.4-3.6 3.6-3.6zm5.4 8.6v10.2h13.2c4 0 " +
  "6.4-1.9 6.4-5.1s-2.4-5.1-6.4-5.1zm0 18.4v11h14.2c4.4 0 7-2.1 7-5.5s-2.6-5.5-7-5.5z";

const gradient = `
  <linearGradient id="sunset" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${SUNSET_1}"/><stop offset="1" stop-color="${SUNSET_2}"/>
  </linearGradient>`;

/** The whole mark including the tear, free-standing — for the splash, where nothing masks it. */
const fullMark = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>${gradient}</defs>
  <path fill="url(#sunset)" d="M0 22A22 22 0 0 1 22 0h56a22 22 0 0 1 22 22v60l-5 12-5-12-5 12-5-12-5 12-5-12-5 12-5-12-5 12-5-12-5 12-5-12-5 12-5-12-5 12-5-12-5 12-5-12z"/>
  <path transform="translate(-1.4 0)" fill="#fff" d="${B_PATH}"/>
</svg>`;

/** Full-bleed square, no rounding and no alpha: the platforms do their own masking. */
const iconSquare = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>${gradient}</defs>
  <rect width="100" height="100" fill="url(#sunset)"/>
  <path transform="translate(-1.4 0)" fill="#fff" d="${B_PATH}"/>
</svg>`;

/** Android's adaptive foreground. The B sits inside the safe circle, or a launcher crops it. */
const iconForeground = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g transform="translate(50 50) scale(0.62) translate(-50 -50)">
    <path transform="translate(-1.4 0)" fill="#fff" d="${B_PATH}"/>
  </g>
</svg>`;

const iconBackground = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>${gradient}</defs><rect width="100" height="100" fill="url(#sunset)"/>
</svg>`;

/** The mark, small, centred on the app's own background — what a launch looks like. */
const splash = (bg) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${bg}"/>
  <g transform="translate(50 50) scale(0.17) translate(-50 -50)">
    ${fullMark.replace(/<\/?svg[^>]*>/g, "").replace(/<defs>[\s\S]*?<\/defs>/, "")}
  </g>
  <defs>${gradient}</defs>
</svg>`;

const render = async (name, svg, size, flatten) => {
  let pipeline = sharp(Buffer.from(svg), { density: 600 }).resize(size, size);
  // iOS rejects an icon with an alpha channel outright, so those are flattened onto the gradient's
  // own warm tone rather than left transparent.
  if (flatten) pipeline = pipeline.flatten({ background: flatten });
  await pipeline.png().toFile(`${OUT}/${name}.png`);
  return `${name}.png ${(statSync(`${OUT}/${name}.png`).size / 1024).toFixed(0)}kB`;
};

const done = await Promise.all([
  render("icon-only", iconSquare, 1024, SUNSET_1),
  render("icon-foreground", iconForeground, 1024),
  render("icon-background", iconBackground, 1024, SUNSET_1),
  render("splash", splash(CREAM), 2732, CREAM),
  render("splash-dark", splash(NIGHT), 2732, NIGHT),
]);
console.log(done.join("\n"));
