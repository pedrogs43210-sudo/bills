/**
 * Measures the mark inside the generated launcher icons and fails if it is the wrong size.
 *
 * This exists because of a bug that no test could see and no eye would name precisely. The mark was
 * drawn at the correct 58.5% of its source PNG, and @capacitor/assets then wrapped that PNG in an
 * `<inset android:inset="16.7%">` — so it reached the home screen at 39.5% of the tile. Correct by
 * every rule anyone had written down, and visibly lost on a phone.
 *
 * So the check measures the shipped artefact rather than the intent: it finds the ink extents in
 * the real PNG, applies Android's own inset, and compares against the safe-circle ceiling.
 */
import sharp from "sharp";

const INSET = 0.167; // @capacitor/assets' adaptive-icon inset, both sides
const RATIO = 11 / 6; // the mark's aspect

/** Ink bounds of a PNG, as a fraction of its width. */
async function extents(file) {
  const img = sharp(file);
  const { width } = await img.metadata();
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      // Alpha for a transparent foreground; for an opaque tile, anything darker than the gradient.
      const i = (y * info.width + x) * info.channels;
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      // a > 128 rather than > 40: the soft antialiased edge is not the shape, and counting it
      // reads the mark about half a point wider than it was drawn.
      const ink = a > 128 && r < 140 && g < 120 && b < 120;
      const solid = info.channels === 4 && a > 40 && r > 140;
      if (ink || (solid && false)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error(`no mark found in ${file}`);
  return { w: (maxX - minX + 1) / width, h: (maxY - minY + 1) / width, px: maxX - minX + 1, size: width };
}

const fails = [];
const say = (ok, msg) => { console.log(`${ok ? "  ok " : "FAIL "} ${msg}`); if (!ok) fails.push(msg); };

const fg = await extents("android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png");
const onTile = fg.w * (1 - 2 * INSET);
say(Math.abs(onTile - 0.585) < 0.02, `adaptive foreground lands at ${(onTile * 100).toFixed(1)}% of the tile (want 50-60%, drawn at 57%)`);
say(Math.abs(fg.w / fg.h - RATIO) < 0.05, `foreground aspect ${(fg.w / fg.h).toFixed(3)} (want ${RATIO.toFixed(3)})`);

// The safe circle is the thing that actually clips. Half-diagonal of the mark vs radius tile/3.
const halfDiag = (onTile / 2) * Math.hypot(1, 1 / RATIO);
say(halfDiag <= 1 / 3, `mark reaches ${(halfDiag * 100).toFixed(2)}% of the tile from centre (safe circle is 33.33%)`);

const sq = await extents("android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png");
const sqHalfDiag = (sq.w / 2) * Math.hypot(1, 1 / RATIO);
say(sqHalfDiag <= 1 / 3, `legacy square survives a round mask — reaches ${(sqHalfDiag * 100).toFixed(2)}% (safe 33.33%)`);

if (fails.length) {
  console.error(`\n${fails.length} check(s) failed. See scripts/make-assets.mjs.`);
  process.exit(1);
}
console.log("\nlauncher icons measure correctly.");
