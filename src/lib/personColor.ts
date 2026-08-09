/**
 * A person's identity colour, in two parts.
 *
 * The stored pastel in `PERSON_COLORS` never changes: it is saved per person, so a new palette
 * would reach new people only and split an existing group's colours in half. It stays the chip
 * field, with `--ink` on top.
 *
 * The disc is derived from that same stored hex — darker and more saturated, carrying the
 * person's initial in white. That is what makes identity survive colour blindness, a bright
 * kitchen window and a 22px avatar in a settle row, and it is why the old `outline: 3px solid`
 * selected state could go: a fill can be made legible across eight pastels, an outline could not.
 *
 * Derived rather than stored, so no migration and no chance of the two drifting apart.
 */

type Rgb = { r: number; g: number; b: number };

function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex({ r, g, b }: Rgb): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1).toUpperCase()}`;
}

function rgbToHsl({ r, g, b }: Rgb) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return { r: channel(h + 1 / 3) * 255, g: channel(h) * 255, b: channel(h - 1 / 3) * 255 };
}

/** Relative luminance, for the contrast check the disc has to pass. */
function luminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours. */
export function contrastRatio(a: string, b: string): number {
  const ca = parseHex(a), cb = parseHex(b);
  if (!ca || !cb) return 1;
  const la = luminance(ca), lb = luminance(cb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Fallback disc for a colour we can't read — the app's own ink, never an invisible disc. */
const FALLBACK_DISC = "#3D2B24";

/**
 * The discs the designer chose, used verbatim. Deriving these produced technically-readable but
 * harsher colours — a pure `#AD1D00` siren red where the design has a muted `#A8452F` terracotta
 * — and the designer's five sit in a deliberate 5.1–6.6 contrast band rather than ranging from
 * 4.8 to 8.6. Taste beats arithmetic here, so the arithmetic only covers what taste didn't.
 */
const SPECIFIED_DISCS: Record<string, string> = {
  "#FFD9A0": "#7E5410",
  "#FFC4B8": "#A8452F",
  "#C9E8C9": "#3F7A44",
  "#BFD9FF": "#3C6BB5",
  "#E8C9F0": "#8A4CA0",
};

/**
 * The disc colour for a stored pastel: the designer's own where they specified one, otherwise
 * the same hue at a moderate saturation, darkened until it clears white text.
 *
 * Tuned to land in the same band as the specified five rather than at maximum saturation, so a
 * ninth pastel added later joins the family instead of shouting over it. The 4.5:1 floor is a
 * guarantee — the initial in this disc is the only thing telling two people apart on a 22px
 * avatar, so an unreadable one is a person nobody can identify.
 */
export function personDisc(storedHex: string): string {
  const rgb = parseHex(storedHex);
  if (!rgb) return FALLBACK_DISC;
  const specified = SPECIFIED_DISCS[toHex(rgb)];
  if (specified) return specified;

  const { h, s } = rgbToHsl(rgb);
  const saturation = Math.min(0.62, Math.max(0.3, s * 0.6));
  for (let l = 0.46; l >= 0.18; l -= 0.01) {
    const candidate = toHex(hslToRgb(h, saturation, l));
    if (contrastRatio(candidate, "#FFFFFF") >= 5.2) return candidate;
  }
  // Nothing in that range was dark enough — push on to the readability floor.
  for (let l = 0.18; l >= 0.1; l -= 0.01) {
    const candidate = toHex(hslToRgb(h, saturation, l));
    if (contrastRatio(candidate, "#FFFFFF") >= 4.5) return candidate;
  }
  return FALLBACK_DISC;
}

/** The initial shown in the disc. Falls back to "?" so an unnamed person still gets a mark. */
export function personInitial(name: string): string {
  const first = name.trim()[0];
  return first ? first.toUpperCase() : "?";
}
