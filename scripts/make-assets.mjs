/**
 * Draws the source art the phone apps are built from, then hands it to @capacitor/assets.
 *
 * A script rather than five PNGs someone made once in an image editor: when the mark changes, this
 * regenerates every size for both platforms and nobody has to remember which of forty files was
 * hand-tweaked. Run it with `npm run assets`.
 *
 * The geometry here is the same two rectangles as `public/icon.svg` and `src/components/Mark.tsx`.
 * Three copies of one drawing is three chances to drift, and the alternative — importing a .ts
 * module from a build script — costs more than it saves. If one changes, change all three.
 *
 * iOS rejects any icon with an alpha channel, which is why the square is drawn opaque rather than
 * relying on the mask to cover the corners.
 */
import sharp from "sharp";
import { mkdirSync, statSync, writeFileSync } from "node:fs";

const OUT = "assets";
mkdirSync(OUT, { recursive: true });

const SUNSET_1 = "#FF7059";
const SUNSET_2 = "#FFB347";
const CREAM = "#FFF8F0";
const NIGHT = "#241A17";
const INK = "#3D2B24";

/**
 * The mark: two rounded bars, one short. An equals sign that isn't equal.
 *
 * Drawn in the same 64-unit space as everything else, centred on (32, 32) so one transform serves
 * every context. Lengths are 44 and 26 — 63/37, never 50/50, because an even split is the one thing
 * the mark exists to not say. The radius is always half the bar height: a true pill, so the ends
 * never look clipped.
 */
const bars = (fill, compact = false) =>
  compact
    ? `<rect x="10" y="18" width="44" height="11" rx="5.5" fill="${fill}"/>` +
      `<rect x="10" y="35" width="24" height="11" rx="5.5" fill="${fill}"/>`
    : `<rect x="10" y="20" width="44" height="9" rx="4.5" fill="${fill}"/>` +
      `<rect x="10" y="35" width="26" height="9" rx="4.5" fill="${fill}"/>`;

const gradient = `
  <linearGradient id="sunset" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${SUNSET_1}"/><stop offset="1" stop-color="${SUNSET_2}"/>
  </linearGradient>`;

/**
 * The mark at a given fraction of the tile's width.
 *
 * The two fractions are geometry, not taste. An 11:6 rectangle 44 units wide has a half-diagonal of
 * √(22² + 12²) = 25.06 units. Android's adaptive icon reserves a safe circle of radius one third of
 * the tile — 21.33 units here — so the mark fits only up to 21.33 / 25.06 = 85.1% of its natural
 * size, which is 58.5% of the tile width. Anything that gets masked is drawn at 58%; anything that
 * is never masked is drawn at 72%.
 *
 * This is the number the old square mark got wrong when it inherited 66%: a square's half-diagonal
 * is shorter, so 66% was safe for it and would clip the corners off this one under a circle mask.
 *
 * MASKED is 57 rather than the 58.5 the arithmetic allows. 58.5 is a maximum, and sitting exactly
 * on a maximum means antialiasing, PNG rounding, or a launcher that insets a hair differently all
 * put you over it — with clipped corners as the failure. The 1.5 points are invisible side by side
 * and are the difference between "correct" and "correct with room".
 */
const MASKED = 0.57;
const UNMASKED = 0.72;

/**
 * The adaptive foreground is drawn BIGGER than the mark should end up, because Android shrinks it.
 *
 * @capacitor/assets writes an ic_launcher.xml that wraps both layers in
 * `<inset android:inset="16.7%">`, so the PNG you hand it fills only the middle 66.6% of the
 * 108dp tile. Draw the mark at 58.5% of the PNG and it arrives on the phone at 58.5 x 0.666 =
 * 39.5% — measurably correct by the safe-circle rule and visibly lost on a home screen.
 *
 * So the foreground is pre-divided by that inset: 0.585 / 0.666 = 0.878 of the PNG, which is 58.5%
 * of the tile once Android is done. This number is coupled to @capacitor/assets' inset — if the
 * icon ever looks the wrong size after an upgrade, this is the line to check, and the measurement
 * that catches it is in `npm run assets:check`.
 */
const ANDROID_INSET = 0.167;
const FOREGROUND = MASKED / (1 - 2 * ANDROID_INSET);
const at = (frac, fill = INK, compact = false) => {
  const s = (64 * frac) / 44; // 44 is the mark's natural width in the 64-unit box
  return `<g transform="translate(32 32) scale(${s.toFixed(4)}) translate(-32 -32)">${bars(fill, compact)}</g>`;
};

/** Full-bleed square, no rounding and no alpha: the platforms do their own masking. */
const iconSquare = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>${gradient}</defs>
  <rect width="64" height="64" fill="url(#sunset)"/>
  ${at(MASKED)}
</svg>`;

/**
 * The store listing, which nothing masks — so the mark takes the full 72%.
 *
 * Separate from iconSquare precisely because that one DOES get masked: @capacitor/assets turns it
 * into ic_launcher_round.png as well, and an 11:6 mark at 72% reaches 26.24 against the circle's
 * 21.33 and loses its corners.
 */
const playStore = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>${gradient}</defs>
  <rect width="64" height="64" fill="url(#sunset)"/>
  ${at(UNMASKED)}
</svg>`;

/** Android's adaptive foreground: the mark alone, transparent behind, at the masked 58%. */
const iconForeground = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${at(FOREGROUND)}</svg>`;

const iconBackground = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>${gradient}</defs><rect width="64" height="64" fill="url(#sunset)"/>
</svg>`;

/**
 * Android 13 themed icons: one colour, no tile, and the system recolours it.
 *
 * Possible at all only because the mark is two solid shapes rather than a knock-out — there is no
 * hole here that needs a background to show through.
 */
const iconMonochrome = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${at(FOREGROUND, "#000000")}</svg>`;

/**
 * The splash: the mark on the app's own background, both bars ink on the gradient disc.
 *
 * Both bars ink is a rule rather than a choice. Cream on this gradient measures 2.58:1 at the coral
 * end and 1.69:1 at the amber; ink holds 4.92:1 and 7.51:1 across the whole sweep. The two-colour
 * split lives on flat cream and flat dark only.
 */
const splash = (bg) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>${gradient}</defs>
  <rect width="100" height="100" fill="${bg}"/>
  <g transform="translate(50 50) scale(0.28) translate(-32 -32)">
    <rect x="6" y="6" width="52" height="52" rx="13" fill="url(#sunset)"/>
    ${at(0.62)}
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

/**
 * The favicon, written as SVG rather than rendered.
 *
 * Flat #b83e1a on transparent, compact drawing, no tile — a gradient chip at 16px is a smudge, and
 * the accent proper is 3.67:1 where this needs to survive as a shape against an unknown browser
 * chrome. #b83e1a is the same hue at 5.33:1.
 */
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 18 44 28">${bars("#b83e1a", true)}</svg>\n`;
writeFileSync("public/favicon.svg", favicon);

const done = await Promise.all([
  render("icon-only", iconSquare, 1024, SUNSET_1),
  render("icon-foreground", iconForeground, 1024),
  render("icon-background", iconBackground, 1024, SUNSET_1),
  render("icon-monochrome", iconMonochrome, 1024),
  render("play-512", playStore, 512, SUNSET_1),
  render("splash", splash(CREAM), 2732, CREAM),
  render("splash-dark", splash(NIGHT), 2732, NIGHT),
]);
console.log(done.join("\n"), "\npublic/favicon.svg");
