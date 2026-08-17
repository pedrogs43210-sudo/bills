/**
 * Draws the source art the phone apps are built from, then hands it to @capacitor/assets.
 *
 * A script rather than five PNGs someone made once in an image editor: when the mark changes, this
 * regenerates every size for both platforms and nobody has to remember which of forty files was
 * hand-tweaked. Run it with `npm run assets`.
 *
 * The mark here is the same 64-unit master as `public/icon.svg` and `src/components/Mark.tsx`. Three
 * copies of one path is three chances to drift, and the alternative — importing a .ts module from a
 * build script — costs more than it saves. If one changes, change all three.
 *
 * iOS rejects any icon with an alpha channel, which is why the square is drawn opaque rather than
 * relying on the mask to cover the corners.
 */
import sharp from "sharp";
import { mkdirSync, statSync } from "node:fs";

const OUT = "assets";
mkdirSync(OUT, { recursive: true });

const SUNSET_1 = "#FF7059";
const SUNSET_2 = "#FFB347";
const CREAM = "#FFF8F0";
const NIGHT = "#241A17";
const INK = "#3D2B24";

/**
 * Drawing A — the mark, as one path with fill-rule evenodd.
 *
 * Body x20→50, y8→52, top corners r6, five teeth landing exactly on both bottom corners, and three
 * lines knocked OUT rather than painted on.
 *
 * Knocked out is the load-bearing part: the lines are holes, so they take whatever sits behind them.
 * That is what lets one drawing serve the gradient launcher tile, the flat monochrome themed icon
 * and the white-on-transparent notification icon without three separate files.
 */
const MARK =
  "M20 8H44a6 6 0 0 1 6 6v34l-3 4-3-4-3 4-3-4-3 4-3-4-3 4-3-4-3 4-3-4V14a6 6 0 0 1 6-6Z " +
  "M28 19h14a2.5 2.5 0 0 1 0 5H28a2.5 2.5 0 0 1 0-5z " +
  "M28 27h9a2.5 2.5 0 0 1 0 5h-9a2.5 2.5 0 0 1 0-5z " +
  "M28 35h14a2.5 2.5 0 0 1 0 5H28a2.5 2.5 0 0 1 0-5z";

/** Drawing B — three fatter teeth and fatter lines, for anything that lands small. */
const MARK_COMPACT =
  "M20 8H44a6 6 0 0 1 6 6v34l-5 4-5-4-5 4-5-4-5 4-5-4V14a6 6 0 0 1 6-6Z " +
  "M28 18h14a3 3 0 0 1 0 6H28a3 3 0 0 1 0-6z " +
  "M28 27h8a3 3 0 0 1 0 6h-8a3 3 0 0 1 0-6z " +
  "M28 36h14a3 3 0 0 1 0 6H28a3 3 0 0 1 0-6z";

const gradient = `
  <linearGradient id="sunset" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${SUNSET_1}"/><stop offset="1" stop-color="${SUNSET_2}"/>
  </linearGradient>`;

/**
 * The mark inset to 66% of its box.
 *
 * That number is Android's, not a preference: a 108dp adaptive icon reserves a 72dp safe circle, and
 * 66% keeps the whole mark inside it under every launcher mask — circle, squircle, rounded square.
 * Reused for the store tile and the maskable web icon so all three are the same picture.
 */
const inset = (path = MARK, fill = INK) => `
  <g transform="translate(32 32) scale(0.66) translate(-32 -32)">
    <path fill="${fill}" fill-rule="evenodd" d="${path}"/>
  </g>`;

/** Full-bleed square, no rounding and no alpha: the platforms do their own masking. */
const iconSquare = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>${gradient}</defs>
  <rect width="64" height="64" fill="url(#sunset)"/>
  ${inset()}
</svg>`;

/** Android's adaptive foreground: the mark alone, transparent behind, at the same 66%. */
const iconForeground = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${inset()}</svg>`;

const iconBackground = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>${gradient}</defs><rect width="64" height="64" fill="url(#sunset)"/>
</svg>`;

/**
 * The splash: a gradient disc with the mark knocked out of it, on the app's own background.
 *
 * A disc rather than a rounded tile, because the splash is the one place the icon is not being
 * masked by anything — so it can be the shape it actually wants to be. Drawing B, because at this
 * scale the five fine teeth would alias.
 *
 * The mark is filled with the page colour rather than left transparent: a hole would show the page
 * anyway in light mode and betray the disc's edge in dark, and this way one SVG serves both.
 */
const splash = (bg) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>${gradient}</defs>
  <rect width="100" height="100" fill="${bg}"/>
  <circle cx="50" cy="50" r="11" fill="url(#sunset)"/>
  <g transform="translate(50 50) scale(0.229) translate(-32 -32)">
    <path fill="${bg}" fill-rule="evenodd" d="${MARK_COMPACT}"/>
  </g>
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
