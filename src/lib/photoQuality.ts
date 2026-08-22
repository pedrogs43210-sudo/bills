/**
 * Is this photograph worth spending a scan on?
 *
 * Asked on the phone, before anything is uploaded, because the two later defences both failed:
 *
 * - The schema cannot catch it. A blurred receipt produces a structurally perfect result.
 * - Asking the model to grade its own legibility does not work either. It is trained to be
 *   helpful and will extract *something* rather than admit it cannot see — which is exactly the
 *   behaviour you do not want from the one component you were relying on to say "I cannot see".
 *   Tested on a deliberately bad photo, it read it confidently and returned false numbers.
 *
 * So the honest check is arithmetic on the pixels, and it runs here: free, instant, offline, and
 * it saves the API call rather than paying for a wrong answer.
 *
 * Everything below is deliberately classical — no model, no network. The whole file is about four
 * numbers.
 */

/** What we measured, and what looked wrong about it. */
export type PhotoQuality = {
  /** Variance of the Laplacian: how much fine detail survives. Low means blurred. */
  sharpness: number;
  /** How bright the paper is — the 90th percentile, not the mean. See `percentile` below. */
  paper: number;
  /** Ink against paper: p90 − p10. A receipt with no contrast has nothing to read. */
  contrast: number;
  /** Severe enough to be worth stopping for. Empty means go ahead. */
  problems: PhotoProblem[];
};

export type PhotoProblem = "blurry" | "dark" | "flat";

/**
 * The size every photo is measured at, whatever the phone produced.
 *
 * This is load-bearing and easy to miss: the variance of the Laplacian scales with resolution, so
 * the same receipt measured at 4000px and at 800px gives wildly different numbers. Without a fixed
 * working size the thresholds below would mean one thing on a flagship and another on a cheap
 * handset, which is worse than having no check at all.
 */
export const QUALITY_EDGE = 900;

/**
 * Thresholds, and an honest note about them.
 *
 * These are starting values, not measurements. The right numbers can only come from real photos of
 * real receipts on real phones, so they are set to reject only what is *clearly* unusable, and
 * every rejection can be overridden by the person holding the phone. A false "too blurry" on a
 * readable receipt is far more damaging than letting a marginal one through: one is an app that
 * refuses to do its job, the other is a scan and a review screen that already warns about totals
 * that do not add up.
 *
 * If these need tuning, the measured numbers are shown on the retake screen — which is deliberate,
 * so a bad call can be reported with figures rather than adjectives.
 */
export const BLURRY_BELOW = 55;
export const DARK_BELOW = 85;
export const FLAT_BELOW = 32;

/** Rec. 601 luma. The green channel dominates because human vision does. */
export function toGrayscale(rgba: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
    gray[p] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  }
  return gray;
}

/**
 * The n-th percentile brightness, via a 256-bin histogram.
 *
 * Percentiles rather than the mean, because the mean is exactly the trap: a pale receipt lying on
 * a dark restaurant table averages out to something reasonable while the paper itself is unlit.
 * The 90th percentile is the paper, the 10th is the ink, and the gap between them is whether there
 * is anything to read.
 */
export function percentile(gray: Uint8ClampedArray, n: number): number {
  const bins = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) bins[gray[i]]++;
  const target = gray.length * n;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += bins[v];
    if (seen >= target) return v;
  }
  return 255;
}

/**
 * Variance of the Laplacian — the standard sharpness measure.
 *
 * The kernel is the discrete second derivative:
 *
 *      0  1  0
 *      1 -4  1
 *      0  1  0
 *
 * It responds to rapid changes in brightness, which is what an edge is. A sharp photograph of
 * printed text is almost entirely edges and scores high; blur smears them and the variance
 * collapses. Borders are skipped rather than clamped — a one-pixel frame cannot move the variance
 * of a 900px image, and handling it would only add a branch to the hot loop.
 */
export function laplacianVariance(gray: Uint8ClampedArray, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v =
        gray[i - width] + gray[i - 1] + gray[i + 1] + gray[i + width] - 4 * gray[i];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/**
 * Judge already-grayscale pixels. Pure, so it can be tested without a canvas.
 *
 * Note what is deliberately NOT here: receipt detection, cropping, deskewing, glare analysis. Each
 * is a real technique and each would need its own tuning and its own failure modes, to catch cases
 * far rarer than "the photo is blurred" and "the room was dark". Those two are what actually
 * happens at a restaurant table at night, and they are two numbers away.
 */
export function assessGray(gray: Uint8ClampedArray, width: number, height: number): PhotoQuality {
  const sharpness = laplacianVariance(gray, width, height);
  const paper = percentile(gray, 0.9);
  const ink = percentile(gray, 0.1);
  const contrast = paper - ink;

  const problems: PhotoProblem[] = [];
  if (sharpness < BLURRY_BELOW) problems.push("blurry");
  if (paper < DARK_BELOW) problems.push("dark");
  // Reported only when the photo is otherwise sharp. A blurred image has poor contrast *because*
  // it is blurred, and telling somebody their receipt is both blurry and flat is one problem
  // described twice.
  if (contrast < FLAT_BELOW && sharpness >= BLURRY_BELOW) problems.push("flat");

  return { sharpness, paper, contrast, problems };
}

/** One short sentence naming what to do about it, for the retake screen. */
export function describeProblems(problems: PhotoProblem[]): string {
  if (problems.includes("blurry") && problems.includes("dark")) {
    return "It came out blurred and dark — rest the phone on the table and turn a light on if you can.";
  }
  if (problems.includes("blurry")) {
    return "It came out blurred. Hold still a moment before tapping, or rest the phone on the table.";
  }
  if (problems.includes("dark")) {
    return "There wasn't quite enough light on the paper. A brighter spot, or your phone's torch, usually fixes it.";
  }
  if (problems.includes("flat")) {
    return "The print is very faint against the paper. More light, or a little closer, should bring it out.";
  }
  return "";
}
