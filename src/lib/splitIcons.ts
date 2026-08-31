/**
 * The eleven split types, drawn rather than borrowed.
 *
 * These replace the platform emoji the picker used to show. Emoji render differently on every
 * phone, which made the one thing the app could not control the look of also the first thing on
 * every split — and the old set was six holidays out of seven, so somebody splitting a Tuesday
 * dinner had to pick a beach.
 *
 * GENERATED from `Billy Split Icons.dc.html`. The paths were extracted twice — once from the
 * rendered artboard, once from the data array behind it — and the two readings were compared
 * before this file was written, because a hand-copied path does not fail a test. It just draws
 * something slightly wrong that nobody notices until it ships.
 *
 * THE EMOJI IS STILL THE STORED VALUE, and that is the whole trick. A split's icon has to travel
 * into places an SVG cannot go: the summary pasted into a group chat, the invite message, and the
 * payload a guest's phone reads off the server. So nothing about storage changed — `trip.emoji` is
 * what it always was — and the icon is looked up FROM the emoji at render time. No schema bump, no
 * migration, and every split anybody already has keeps working.
 *
 * Every icon shares one wrapper: viewBox 0 0 24 24, no fill, currentColor stroke at 2, round caps
 * and joins. Only the shapes differ. See components/SplitIcon.tsx.
 */

export type IconShape =
  | { kind: "path"; d: string }
  | { kind: "circle"; cx: number; cy: number; r: number };

export type SplitIcon = {
  /** Stable key, kebab-case, as named in the design file. */
  name: string;
  /** The twin that goes into plain text. Unique across the set — it is also the lookup key. */
  emoji: string;
  /** What this one is for, in the words the picker reads out. */
  label: string;
  shapes: IconShape[];
};

/**
 * In the designer's order, which is deliberate: a restaurant bill and a supermarket shop are the
 * two commonest reasons to open Billy and they lead. The old set opened with a receipt and put
 * neither of them anywhere.
 */
export const SPLIT_ICONS: SplitIcon[] = [
  {
    name: "dinner",
    emoji: "🍽️",
    label: "a restaurant bill",
    /* Fork, plate, knife. Fitting all three needs a smaller plate: r3.7, with exactly 1.3u of air on each side of it. Ink spans 2.3 to 21.7, so it still balances on x12. */
    shapes: [{ kind: "circle", cx: 13.7, cy: 12, r: 3.7 }, { kind: "path", d: "M3.3 4.5v4.4a1.7 1.7 0 0 0 3.4 0V4.5" }, { kind: "path", d: "M5 10.6V19.5" }, { kind: "path", d: "M20.7 4.5v15" }],
  },
  {
    name: "groceries",
    emoji: "🛒",
    label: "a supermarket shop",
    /* Tapered basket, not a rectangle — that taper is what separates it from a suitcase at 16px. */
    shapes: [{ kind: "path", d: "M4 8.6h16l-1.4 10.2a1.6 1.6 0 0 1-1.6 1.3H7a1.6 1.6 0 0 1-1.6-1.3Z" }, { kind: "path", d: "M8.6 8.6V6.5a3.4 3.4 0 0 1 6.8 0v2.1" }],
  },
  {
    name: "drinks",
    emoji: "🍷",
    label: "a bar tab",
    /* Wine glass over a tumbler: the stem and foot give it a silhouette no other icon shares. */
    shapes: [{ kind: "path", d: "M7.8 4.5h8.4v3.6a4.2 4.2 0 0 1-8.4 0Z" }, { kind: "path", d: "M12 12.3v6.2" }, { kind: "path", d: "M8.6 19.5h6.8" }],
  },
  {
    name: "home",
    emoji: "🏠",
    label: "a flatshare",
    /* One path, no door or window — the roof pitch alone distinguishes it from city. */
    shapes: [{ kind: "path", d: "M3.8 10.6 12 4.2l8.2 6.4v8.2a1.2 1.2 0 0 1-1.2 1.2H5a1.2 1.2 0 0 1-1.2-1.2Z" }],
  },
  {
    name: "beach",
    emoji: "🏖️",
    label: "a seaside holiday",
    /* Sun plus water. Two humps at 5.3u spacing; three would fill in at 16px. */
    shapes: [{ kind: "circle", cx: 15.8, cy: 7.6, r: 3.3 }, { kind: "path", d: "M3.4 16.4c2.1 0 3.2 1.7 5.3 1.7s3.2-1.7 5.3-1.7 3.2 1.7 5.3 1.7" }],
  },
  {
    name: "mountains",
    emoji: "⛰️",
    label: "hiking, peaks",
    /* Two peaks, closed at the baseline. Unequal heights so it never reads as a chevron pair. */
    shapes: [{ kind: "path", d: "M2.6 19.2 9.2 8.6l4.1 6.5 2.4-3.5 5.7 7.6Z" }],
  },
  {
    name: "city",
    emoji: "🏙️",
    label: "a city break",
    /* Two flat-topped blocks on a ground line. No windows — dots under 2u fill at 16px. */
    shapes: [{ kind: "path", d: "M4 20V9.6a1 1 0 0 1 1-1h4.4a1 1 0 0 1 1 1V20" }, { kind: "path", d: "M13.6 20v-6.6a1 1 0 0 1 1-1H19a1 1 0 0 1 1 1V20" }, { kind: "path", d: "M2.6 20h18.8" }],
  },
  {
    name: "ski",
    emoji: "🎿",
    label: "a winter trip",
    /* Crossed skis with upturned tips. A snowcapped peak would have collided with mountains. */
    shapes: [{ kind: "path", d: "M6.4 20.4 15.2 4.6c.7-1.2 1.9-1.5 2.7-.9" }, { kind: "path", d: "M17.6 20.4 8.8 4.6c-.7-1.2-1.9-1.5-2.7-.9" }],
  },
  {
    name: "camping",
    emoji: "⛺",
    label: "tents, festivals",
    /* Tent with a centre seam. Wider base angle than mountains so the two never twin. */
    shapes: [{ kind: "path", d: "M2.8 19.6 12 5l9.2 14.6Z" }, { kind: "path", d: "M12 5.8v13.8" }],
  },
  {
    name: "travel",
    emoji: "✈️",
    label: "a flight or road trip",
    /* Plane as a delta with a fuselage line. Replaced a suitcase, which twinned with groceries. */
    shapes: [{ kind: "path", d: "M12 3.6 4.6 20.4l7.4-4 7.4 4Z" }, { kind: "path", d: "M12 3.6v12.8" }],
  },
  {
    name: "receipt",
    emoji: "🧾",
    label: "the neutral default",
    /* The brand mark as an icon. Walls at 5.4 and 18.6, symmetric about x12, and four 3.3u teeth that close exactly on the left wall. The two inner lines are 6.8 and 4.0, which is the 63/37 of the brand mark itself. */
    shapes: [{ kind: "path", d: "M7 3.6h10a1.6 1.6 0 0 1 1.6 1.6v12.4l-3.3 2.6-3.3-2.6-3.3 2.6-3.3-2.6V5.2a1.6 1.6 0 0 1 1.6-1.6Z" }, { kind: "path", d: "M8.6 8.4h6.8" }, { kind: "path", d: "M8.6 11.8h4" }],
  },
];

/** The one used when nothing else fits, and the fallback for anything unrecognised. */
export const DEFAULT_ICON: SplitIcon = SPLIT_ICONS[SPLIT_ICONS.length - 1];

/**
 * Emoji that used to be offered and no longer are.
 *
 * Splits created before this set existed still carry these, and they are stored on the phone and
 * on the server — so they have to keep resolving to something sensible forever. 🏕️ was the old
 * camping glyph; 🎉 was a party popper that the new set drops entirely, and a party is a dinner or
 * a bar tab often enough that the neutral default is the honest answer rather than a guess.
 */
const LEGACY: Record<string, string> = {
  "\u{1F3D5}\u{FE0F}": "camping",
  "\u{1F389}": "receipt",
};

const BY_EMOJI = new Map<string, SplitIcon>(SPLIT_ICONS.map((i) => [i.emoji, i]));
const BY_NAME = new Map<string, SplitIcon>(SPLIT_ICONS.map((i) => [i.name, i]));

/**
 * The icon for a stored emoji.
 *
 * Never throws and never returns undefined: this is called while rendering a split somebody made
 * on a build that does not exist yet, or on a phone whose export file was edited by hand. An
 * unknown glyph gets the neutral receipt rather than a hole in the row.
 */
export function iconFor(emoji: string | undefined | null): SplitIcon {
  if (!emoji) return DEFAULT_ICON;
  const direct = BY_EMOJI.get(emoji);
  if (direct) return direct;
  const legacy = LEGACY[emoji];
  if (legacy) return BY_NAME.get(legacy) ?? DEFAULT_ICON;
  return DEFAULT_ICON;
}
