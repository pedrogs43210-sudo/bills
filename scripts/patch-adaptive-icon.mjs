/**
 * Adds the Android 13 themed-icon layer, which @capacitor/assets does not generate.
 *
 * A `<monochrome>` drawable lets the launcher recolour the icon to match the user's wallpaper
 * palette. Without one, Billy is the only icon on a themed home screen still wearing its own
 * colours — which looks like an app that has not been updated in two years.
 *
 * This runs AFTER capacitor-assets, deliberately: that tool rewrites ic_launcher.xml on every run,
 * so a hand-edited `<monochrome>` line survives exactly until the next `npm run assets`. Patching
 * it from a script is the only version that stays true.
 *
 * The mark can be a themed icon at all only because it is two solid shapes. The old receipt was a
 * knock-out — its lines were holes that took the colour behind them — and a hole has nothing to
 * show through once the background layer is discarded, which is exactly what theming does.
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const RES = "android/app/src/main/res";
const DENSITIES = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];

/*
 * The monochrome layer is sized to match the FOREGROUND capacitor-assets just wrote, per density,
 * rather than to a density table of our own.
 *
 * Hardcoding one was the first attempt and it was wrong: the obvious arithmetic for xxxhdpi is a
 * 108dp tile at 4x = 432px, and capacitor-assets actually writes 192. Three layers of one icon
 * disagreeing on their pixel size is the kind of thing that renders fine until one launcher
 * resamples differently from another. Reading the sibling file cannot drift.
 */
const written = [];
for (const density of DENSITIES) {
  const dir = `${RES}/mipmap-${density}`;
  const sibling = `${dir}/ic_launcher_foreground.png`;
  if (!existsSync(sibling)) continue;
  const { width } = await sharp(sibling).metadata();
  await sharp("assets/icon-monochrome.png").resize(width, width).png().toFile(`${dir}/ic_launcher_monochrome.png`);
  written.push(`${density} ${width}px`);
}

/**
 * Wrapped in the same 16.7% inset as the other two layers.
 *
 * Not decoration: the monochrome PNG is drawn at the same pre-divided scale as the foreground, so
 * without the matching inset the themed icon would come out a third larger than the normal one and
 * overflow the safe circle.
 */
const MONO = `    <monochrome>
        <inset android:drawable="@mipmap/ic_launcher_monochrome" android:inset="16.7%" />
    </monochrome>
`;

const patched = [];
for (const name of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
  const file = `${RES}/mipmap-anydpi-v26/${name}`;
  if (!existsSync(file)) continue;
  let xml = readFileSync(file, "utf8");
  if (xml.includes("<monochrome")) continue; // already there — idempotent
  xml = xml.replace("</adaptive-icon>", `${MONO}</adaptive-icon>`);
  writeFileSync(file, xml);
  patched.push(name);
}

console.log(`monochrome: ${written.join(", ")}`);
console.log(`patched: ${patched.length ? patched.join(", ") : "already present"}`);
