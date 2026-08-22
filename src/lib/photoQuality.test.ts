import { describe, it, expect } from "vitest";
import {
  assessGray,
  describeProblems,
  laplacianVariance,
  percentile,
  toGrayscale,
  BLURRY_BELOW,
  DARK_BELOW,
} from "./photoQuality";

const W = 60;
const H = 60;

/** A stand-in for a receipt: bright paper with dark horizontal lines of "print" across it. */
function sharpReceipt(paper = 230, ink = 30): Uint8ClampedArray {
  const g = new Uint8ClampedArray(W * H).fill(paper);
  for (let y = 4; y < H - 4; y += 4) {
    for (let x = 4; x < W - 4; x++) g[y * W + x] = ink;
  }
  return g;
}

/** The same receipt with the print smeared out — what a shaken camera produces. */
function blurred(src: Uint8ClampedArray, passes = 6): Uint8ClampedArray {
  let cur = src;
  for (let p = 0; p < passes; p++) {
    const next = new Uint8ClampedArray(cur.length);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        next[i] = (cur[i - W] + cur[i - 1] + cur[i] + cur[i + 1] + cur[i + W]) / 5;
      }
    }
    // Edges are left as they were; the interior is what gets measured.
    for (let i = 0; i < cur.length; i++) if (next[i] === 0) next[i] = cur[i];
    cur = next;
  }
  return cur;
}

describe("reading the pixels", () => {
  it("turns colour into luma with green weighted heaviest", () => {
    // Rec. 601: green carries most of the perceived brightness, which is why a green square reads
    // far lighter than a blue one of the same numeric value.
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
    const [r, g, b] = toGrayscale(rgba, 3, 1);
    expect(g).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(b);
  });

  it("finds percentiles rather than the mean", () => {
    // Ninety per cent black, ten per cent white: the mean is ~25 and says "dark", but the paper —
    // the p90 — is white. This is the restaurant-table case the mean gets wrong.
    const g = new Uint8ClampedArray(100).fill(0);
    for (let i = 90; i < 100; i++) g[i] = 255;
    expect(percentile(g, 0.5)).toBe(0);
    expect(percentile(g, 0.95)).toBe(255);
  });

  it("scores a flat image at zero, having no edges at all", () => {
    expect(laplacianVariance(new Uint8ClampedArray(W * H).fill(128), W, H)).toBe(0);
  });
});

describe("judging a photo", () => {
  it("passes a sharp, well-lit receipt", () => {
    expect(assessGray(sharpReceipt(), W, H).problems).toEqual([]);
  });

  it("catches a blurred one", () => {
    const q = assessGray(blurred(sharpReceipt()), W, H);
    expect(q.problems).toContain("blurry");
    expect(q.sharpness).toBeLessThan(BLURRY_BELOW);
  });

  it("catches one taken in the dark", () => {
    // Same print, same focus, a twentieth of the light.
    const q = assessGray(sharpReceipt(40, 5), W, H);
    expect(q.problems).toContain("dark");
    expect(q.paper).toBeLessThan(DARK_BELOW);
  });

  it("does not call a bright receipt dark just because the ink is black", () => {
    // The mean of this image is well under any sane darkness threshold; the paper is not.
    const q = assessGray(sharpReceipt(245, 0), W, H);
    expect(q.problems).not.toContain("dark");
  });

  it("describes a blurred photo as blurred and nothing else", () => {
    // Blur destroys contrast as a side effect. Reporting both would be one problem told twice, and
    // the advice for the second one would send somebody hunting for a lamp they do not need.
    const q = assessGray(blurred(sharpReceipt()), W, H);
    expect(q.problems).not.toContain("flat");
  });

  it("turns every problem into advice, and silence into silence", () => {
    expect(describeProblems([])).toBe("");
    for (const p of ["blurry", "dark", "flat"] as const) {
      expect(describeProblems([p]).length).toBeGreaterThan(20);
    }
    // Blurry and dark together get their own sentence rather than two stitched end to end.
    expect(describeProblems(["blurry", "dark"])).toMatch(/blurred and dark/i);
  });

  it("never tells somebody what is wrong with the receipt, only with the picture", () => {
    // The check measures pixels. It has not earned a claim about whether the paper is readable,
    // and saying so would be both wrong and insulting when the measurement misfires.
    for (const p of ["blurry", "dark", "flat"] as const) {
      expect(describeProblems([p])).not.toMatch(/unreadable|cannot be read|illegible/i);
    }
  });
});
