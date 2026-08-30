/**
 * Measures the mark inside the generated launcher icons and fails if it is the wrong size.
 *
 * This exists because of a bug that no test could see and no eye would name precisely, and it has
 * now been wrong in both directions — which is the actual lesson.
 *
 * First the mark was drawn at 58.5% of its source PNG and looked lost on a home screen. The fix
 * was to pre-divide by @capacitor/assets' `<inset android:inset="16.7%">`, and this file was
 * written to confirm it — by multiplying the inset back out and comparing against a safe circle of
 * radius one third. Both numbers were right and the comparison was meaningless: the safe-circle
 * rule is a fraction of the 108dp TILE, the artwork lives in the 72dp WINDOW that is all anyone
 * ever sees, and the check reported 56.9% for a mark that was filling 85.6% of the visible icon
 * and touching the edges of the squircle.
 *
 * So it measures in the window's frame now, and it reads the inset out of the generated XML rather
 * than assuming it — because the assumption is the part that silently went stale. A measurement is
 * only as good as the frame you state it in.
 */
import sharp from "sharp";
import { readFileSync } from "node:fs";

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

/*
 * Is the foreground inset, and by how much? Read, not assumed.
 *
 * This is the question the whole check turns on, and getting it wrong is what let an icon that
 * touched the edges of the squircle report itself as 56.9%. @capacitor/assets wraps each layer in
 * `<inset android:inset="16.7%">`, which scales the PNG down to the 72dp window that is actually
 * visible — so with the inset, the PNG *is* the visible icon and a fraction of one is a fraction of
 * the other. Without it, the PNG is the full 108dp layer and only its middle 66.6% is ever seen.
 *
 * Reading it from the generated XML means an upgrade that changes or drops the inset changes this
 * measurement, instead of quietly invalidating the assumption it was built on.
 */
const xml = readFileSync("android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml", "utf8");
const foregroundBlock = /<foreground>[\s\S]*?<\/foreground>/.exec(xml)?.[0] ?? "";
const insetPct = /android:inset="([\d.]+)%"/.exec(foregroundBlock);
const inset = insetPct ? Number(insetPct[1]) / 100 : 0;
say(
  Math.abs(inset - INSET) < 0.001,
  `foreground is inset ${(inset * 100).toFixed(1)}% in ic_launcher.xml (expected ${(INSET * 100).toFixed(1)}%)`
);

const fg = await extents("android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png");
/*
 * The mark as a fraction of the VISIBLE icon — the only frame a person ever sees.
 *
 * With the inset, the artwork was scaled onto the visible window, so the PNG fraction is already
 * the answer. Without it, the artwork spans the full layer and the visible window is the middle
 * 66.6% of it, so the mark occupies proportionally more of what is shown.
 */
const VISIBLE_OF_LAYER = 1 - 2 * INSET;
const onIcon = inset > 0 ? fg.w : fg.w / VISIBLE_OF_LAYER;
say(Math.abs(onIcon - 0.57) < 0.03, `mark fills ${(onIcon * 100).toFixed(1)}% of the visible icon (drawn at 57%)`);
say(Math.abs(fg.w / fg.h - RATIO) < 0.05, `foreground aspect ${(fg.w / fg.h).toFixed(3)} (want ${RATIO.toFixed(3)})`);

/*
 * Two ceilings, and the looser one is not the one that matters.
 *
 * A circular mask inscribed in the visible window has radius 50% of it, so nothing may reach
 * further than that or it is literally clipped. But an icon that merely avoids being clipped still
 * looks wrong: at 85.6% the mark cleared the circle by arithmetic and read as touching the edges.
 * So the second bar is comfort — real launcher icons leave the outer fifth alone.
 */
const halfDiag = (onIcon / 2) * Math.hypot(1, 1 / RATIO);
say(halfDiag <= 0.5, `mark reaches ${(halfDiag * 100).toFixed(1)}% of the visible icon from centre (clipped past 50%)`);
say(halfDiag <= 0.40, `mark leaves ${((0.5 - halfDiag) * 100).toFixed(1)} points of breathing room inside the mask (want 10+)`);

const sq = await extents("android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png");
// The legacy square is not inset by anything: the PNG is the whole icon on the launchers that use
// it, so its own width is already the visible fraction.
const sqHalfDiag = (sq.w / 2) * Math.hypot(1, 1 / RATIO);
say(sqHalfDiag <= 0.5, `legacy square survives a round mask — reaches ${(sqHalfDiag * 100).toFixed(1)}% (clipped past 50%)`);

if (fails.length) {
  console.error(`\n${fails.length} check(s) failed. See scripts/make-assets.mjs.`);
  process.exit(1);
}
console.log("\nlauncher icons measure correctly.");
