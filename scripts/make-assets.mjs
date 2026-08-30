/**
 * Draws the source art the phone apps are built from, then hands it to @capacitor/assets.
 *
 * A script rather than five PNGs someone made once in an image editor: when the mark changes, this
 * regenerates every size for both platforms and nobody has to remember which of forty files was
 * hand-tweaked. Run it with `npm run assets`.
 *
 * The geometry here is the same two rectangles as `src/components/Mark.tsx`. That was once three
 * copies — `public/icon.svg` and `public/maskable.svg` were kept by hand — and they had already
 * drifted, so this script now generates those two as well.
 *
 * iOS rejects any icon with an alpha channel, which is why the square is drawn opaque rather than
 * relying on the mask to cover the corners.
 */
import sharp from "sharp";
import { mkdirSync, statSync, writeFileSync } from "node:fs";

const OUT = "assets";
mkdirSync(OUT, { recursive: true });

/*
 * The dark version of the mark, which is now what every tile carries.
 *
 * Not a new palette: these are the values in `:root[data-theme="dark"]` in src/theme.css, so the
 * icon on the home screen is literally the logo the app draws at night — night tile, cream long
 * bar, coral short bar. The launcher was the last place still wearing the sunset gradient after
 * the app itself went flat.
 *
 * Measured on the night tile: cream 14.8:1, coral 7.63:1. The two-colour split is legible here in
 * a way it never was on the gradient, which is the whole reason the old tile put one ink in both
 * bars.
 */
const CREAM = "#FFF8F0";
const NIGHT = "#241A17";
const DARK_INK = "#FBEEE2";
const DARK_ACCENT = "#FF8F73";

/**
 * The mark: two rounded bars, one short. An equals sign that isn't equal.
 *
 * Drawn in the same 64-unit space as everything else, centred on (32, 32) so one transform serves
 * every context. Lengths are 44 and 26 — 63/37, never 50/50, because an even split is the one thing
 * the mark exists to not say. The radius is always half the bar height: a true pill, so the ends
 * never look clipped.
 *
 * `accent` defaults to `fill`, so a single-colour mark is what you get unless you ask for the
 * split — the same defaulting as the Mark component.
 */
const bars = (fill, accent = fill, compact = false) =>
  compact
    ? `<rect x="10" y="18" width="44" height="11" rx="5.5" fill="${fill}"/>` +
      `<rect x="10" y="35" width="24" height="11" rx="5.5" fill="${accent}"/>`
    : `<rect x="10" y="20" width="44" height="9" rx="4.5" fill="${fill}"/>` +
      `<rect x="10" y="35" width="26" height="9" rx="4.5" fill="${accent}"/>`;

/**
 * The mark at a given fraction of the tile's width.
 *
 * The two fractions are geometry, not taste. An 11:6 rectangle 44 units wide has a half-diagonal of
 * √(22² + 12²) = 25.06 units. Android's adaptive icon reserves a safe circle of radius one third of
 * the tile — 21.33 units here — so the mark fits only up to 21.33 / 25.06 = 85.1% of its natural
 * size, which is 58.5% of the tile width. Anything that gets masked is drawn at 57%; anything that
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
 * 108dp tile. Draw the mark at 57% of the PNG and it arrives on the phone at 57 x 0.666 = 38% —
 * measurably correct by the safe-circle rule and visibly lost on a home screen.
 *
 * So the foreground is pre-divided by that inset: 0.57 / 0.666 = 0.855 of the PNG, which is 57% of
 * the tile once Android is done. This number is coupled to @capacitor/assets' inset — if the icon
 * ever looks the wrong size after an upgrade, this is the line to check, and the measurement that
 * catches it is in `npm run assets:check`.
 */
const ANDROID_INSET = 0.167;
const FOREGROUND = MASKED / (1 - 2 * ANDROID_INSET);
const at = (frac, fill = DARK_INK, accent = DARK_ACCENT, compact = false) => {
  const s = (64 * frac) / 44; // 44 is the mark's natural width in the 64-unit box
  return `<g transform="translate(32 32) scale(${s.toFixed(4)}) translate(-32 -32)">${bars(fill, accent, compact)}</g>`;
};

/** Full-bleed square, no rounding and no alpha: the platforms do their own masking. */
const iconSquare = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${NIGHT}"/>
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
  <rect width="64" height="64" fill="${NIGHT}"/>
  ${at(UNMASKED)}
</svg>`;

/** Android's adaptive foreground: the mark alone, transparent behind, at the masked 57%. */
const iconForeground = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${at(FOREGROUND)}</svg>`;

const iconBackground = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${NIGHT}"/>
</svg>`;

/**
 * Android 13 themed icons: one colour, no tile, and the system recolours it.
 *
 * Possible at all only because the mark is two solid shapes rather than a knock-out — there is no
 * hole here that needs a background to show through. Both bars are one colour by definition: the
 * launcher is going to replace it with a wallpaper tint anyway.
 */
const iconMonochrome = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${at(FOREGROUND, "#000000", "#000000")}</svg>`;

/**
 * The splash: the app's own icon, on the app's own background.
 *
 * One drawing for both themes, and the difference falls out rather than being specified. On cream
 * you see a night tile carrying the mark; on night the tile melts into the page behind it and what
 * is left is the mark, alone. Both are right, and neither needed a second code path.
 *
 * The old version put both bars in ink on a gradient disc, because cream measured 2.58:1 against
 * the coral end of that gradient. On a flat night tile cream reads 14.8:1, so the two-colour split
 * the app uses everywhere else finally works here too.
 */
const splash = (bg) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${bg}"/>
  <g transform="translate(50 50) scale(0.28) translate(-32 -32)">
    <rect x="6" y="6" width="52" height="52" rx="13" fill="${NIGHT}"/>
    ${at(0.62)}
  </g>
</svg>`;

const render = async (name, svg, size, flatten) => {
  let pipeline = sharp(Buffer.from(svg), { density: 600 }).resize(size, size);
  // iOS rejects an icon with an alpha channel outright, so those are flattened onto the tile's own
  // colour rather than left transparent.
  if (flatten) pipeline = pipeline.flatten({ background: flatten });
  await pipeline.png().toFile(`${OUT}/${name}.png`);
  return `${name}.png ${(statSync(`${OUT}/${name}.png`).size / 1024).toFixed(0)}kB`;
};

/**
 * The favicon, written as SVG rather than rendered.
 *
 * Flat #b83e1a on transparent, compact drawing, no tile — a night tile at 16px is a dark smudge,
 * and the accent proper is 3.67:1 where this needs to survive as a shape against unknown browser
 * chrome. #b83e1a is the same hue at 5.33:1, and it is the colour the app's own buttons now use.
 */
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 18 44 28">${bars("#b83e1a", "#b83e1a", true)}</svg>\n`;
writeFileSync("public/favicon.svg", favicon);

/*
 * The PWA icons, generated rather than kept by hand.
 *
 * These were two more copies of the same drawing, and they had already drifted: maskable.svg was
 * drawn at 58.5% where this script uses 57%. 58.5 is the arithmetic maximum, and sitting exactly on
 * a maximum is how corners get clipped by a launcher that rounds a hair differently. Generating
 * them from the same MASKED and UNMASKED constants as everything else means the drift cannot
 * return.
 */
const svgDoc = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Billy">\n` +
  `  <!-- Generated by scripts/make-assets.mjs. Do not edit by hand; run \`npm run assets\`. -->\n` +
  `${body}\n</svg>\n`;

// Tiled and rounded; nothing masks it, so the mark takes the full 72%.
writeFileSync(
  "public/icon.svg",
  svgDoc(`  <rect width="64" height="64" rx="15.4" fill="${NIGHT}"/>\n  ${at(UNMASKED)}`)
);
// Full bleed, no baked radius — the mask supplies the shape, so the mark drops to the masked size.
writeFileSync(
  "public/maskable.svg",
  svgDoc(`  <rect width="64" height="64" fill="${NIGHT}"/>\n  ${at(MASKED)}`)
);

const done = await Promise.all([
  render("icon-only", iconSquare, 1024, NIGHT),
  render("icon-foreground", iconForeground, 1024),
  render("icon-background", iconBackground, 1024, NIGHT),
  render("icon-monochrome", iconMonochrome, 1024),
  render("play-512", playStore, 512, NIGHT),
  render("splash", splash(CREAM), 2732, CREAM),
  render("splash-dark", splash(NIGHT), 2732, NIGHT),
]);
console.log(done.join("\n"), "\npublic/favicon.svg public/icon.svg public/maskable.svg");
