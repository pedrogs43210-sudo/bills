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

/**
 * Ink bounds of a PNG, as a fraction of its width.
 *
 * Deliberately knows nothing about what colour the mark is. The first version tested for dark
 * pixels — `r < 140 && g < 120 && b < 120` — which was true of an ink mark on a light gradient and
 * became false the moment the tile went dark and the mark went cream. It did not report a wrong
 * size; it reported no mark at all, which is at least a loud failure, but a measuring tool that has
 * to be re-tuned every time the palette moves is one that will eventually be re-tuned wrongly.
 *
 * So: the background is whatever the corner pixel is, and the mark is whatever differs from it by
 * more than half the largest difference in the image. That holds for light-on-dark, dark-on-light,
 * and any tile colour someone picks later.
 */
async function extents(file) {
  const img = sharp(file);
  const { width } = await img.metadata();
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => {
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };

  /*
   * Which of the two shapes this file is, decided by how much of it is opaque rather than by what
   * is in the corner. Both files have a transparent corner — the launcher square is a rounded tile,
   * not a full bleed — so reading the corner as "background" made the alpha test select the entire
   * tile and report the mark at 91% of its width.
   *
   *   ic_launcher_foreground.png   ~23% opaque   the mark alone, on nothing
   *   ic_launcher.png              ~84% opaque   the mark on a rounded night tile
   *
   * Nothing sits between those, and nothing plausibly could: a bare mark cannot fill half a tile
   * without failing the safe-circle check three lines below.
   */
  let opaque = 0;
  for (let i = 3; i < data.length; i += info.channels) if (data[i] > 128) opaque++;
  const bare = opaque / (info.width * info.height) < 0.5;

  // On a tile, the background is the commonest opaque colour — the tile covers far more of the
  // file than the mark does. Quantised so antialiasing does not split it into a thousand near
  // neighbours, none of which is a majority.
  let br = 0, bg = 0, bb = 0, furthest = 0;
  if (!bare) {
    const tally = new Map();
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const [r, g, b, a] = px(x, y);
        if (a <= 128) continue;
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
    }
    let best = -1, key = 0;
    for (const [k, n] of tally) if (n > best) { best = n; key = k; }
    br = ((key >> 10) & 31) << 3;
    bg = ((key >> 5) & 31) << 3;
    bb = (key & 31) << 3;
  }
  const distance = (r, g, b) => Math.max(Math.abs(r - br), Math.abs(g - bg), Math.abs(b - bb));

  // On a tile the mark's edge is a gradual blend into the background, so the threshold is half of
  // the furthest any pixel actually gets. Half the real distance is the shape's edge; a fixed
  // number would read the mark wider or narrower as contrast changed.
  if (!bare) {
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const [r, g, b, a] = px(x, y);
        if (a <= 128) continue;
        const d = distance(r, g, b);
        if (d > furthest) furthest = d;
      }
    }
  }

  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const [r, g, b, a] = px(x, y);
      // a > 128 rather than > 40: the soft antialiased edge is not the shape, and counting it
      // reads the mark about half a point wider than it was drawn.
      const isMark = bare ? a > 128 : a > 128 && distance(r, g, b) > furthest / 2;
      if (isMark) {
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
// Centred on MASKED in make-assets.mjs, not on the 58.5% ceiling: the ceiling is the most the
// geometry allows, the constant is what we actually draw, and an assertion should track the latter.
say(Math.abs(onTile - 0.57) < 0.02, `adaptive foreground lands at ${(onTile * 100).toFixed(1)}% of the tile (drawn at 57%)`);
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
