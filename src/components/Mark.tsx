/**
 * Billy's mark: a till receipt with a torn foot and three knocked-out lines.
 *
 * Drawn from one 64-unit master — body x20→50, y8→52, top corners r6 — as a single path with
 * `fill-rule: evenodd`, so the lines are holes in the paper rather than shapes on top of it. That
 * matters more than it sounds: a hole takes whatever colour is behind it, which is what lets the
 * same drawing work as a themed monochrome launcher icon, as ink on white, and as a knock-out on the
 * sunset gradient without three separate files.
 *
 * THREE DRAWINGS, NOT ONE SCALED. A mark that reads at 160px turns to mush at 16px, so each size
 * band gets geometry drawn for it. Never scale `detail` down to a favicon; pick the band instead —
 * `markFor(size)` does it, and every caller should go through <Mark>.
 */

/** Which drawing a given rendered size wants. */
export type MarkSize = "detail" | "compact" | "micro";

/**
 * A — 32px and up. Five teeth at a 3-unit half-pitch, landing exactly on both bottom corners, and
 * three lines at 2.5 radius.
 */
const DETAIL =
  "M20 8H44a6 6 0 0 1 6 6v34l-3 4-3-4-3 4-3-4-3 4-3-4-3 4-3-4-3 4-3-4V14a6 6 0 0 1 6-6Z " +
  "M28 19h14a2.5 2.5 0 0 1 0 5H28a2.5 2.5 0 0 1 0-5z " +
  "M28 27h9a2.5 2.5 0 0 1 0 5h-9a2.5 2.5 0 0 1 0-5z " +
  "M28 35h14a2.5 2.5 0 0 1 0 5H28a2.5 2.5 0 0 1 0-5z";

/**
 * B — 20 to 28px. Three fatter teeth and fatter lines: at this size the five fine teeth start to
 * alias into a grey smear, and a 2.5-radius line loses its ends.
 */
const COMPACT =
  "M20 8H44a6 6 0 0 1 6 6v34l-5 4-5-4-5 4-5-4-5 4-5-4V14a6 6 0 0 1 6-6Z " +
  "M28 18h14a3 3 0 0 1 0 6H28a3 3 0 0 1 0-6z " +
  "M28 27h8a3 3 0 0 1 0 6h-8a3 3 0 0 1 0-6z " +
  "M28 36h14a3 3 0 0 1 0 6H28a3 3 0 0 1 0-6z";

/**
 * C — 16px and below. Two lines instead of three. Three lines at this size are three grey pixels
 * with nothing between them, and the thing stops reading as paper at all.
 */
const MICRO =
  "M20 8H44a6 6 0 0 1 6 6v34l-5 4-5-4-5 4-5-4-5 4-5-4V14a6 6 0 0 1 6-6Z " +
  "M28 21h13a3.5 3.5 0 0 1 0 7H28a3.5 3.5 0 0 1 0-7z " +
  "M28 32h7a3.5 3.5 0 0 1 0 7h-7a3.5 3.5 0 0 1 0-7z";

export const MARK_PATHS: Record<MarkSize, string> = {
  detail: DETAIL,
  compact: COMPACT,
  micro: MICRO,
};

/** The band a rendered pixel size belongs to. Below 16px the mark should not be used at all. */
export function markFor(size: number): MarkSize {
  if (size <= 16) return "micro";
  if (size < 32) return "compact";
  return "detail";
}

/**
 * The mark, at a size, in a colour.
 *
 * `color` defaults to `currentColor` so the mark inherits whatever it sits in — which is how the
 * tab bar gets a selected and an unselected state out of one element and no extra CSS.
 *
 * There is deliberately no `tile` prop and no gradient anywhere in here. The gradient tile belongs
 * to the launcher, the store listing and the splash screen; inside the product the app already *is*
 * the app, and a badge of itself on every screen is noise.
 */
export function Mark({
  size = 24,
  color = "currentColor",
  title,
  className,
  style,
}: {
  size?: number;
  color?: string;
  /** Given only where the mark carries meaning on its own. Decorative uses stay out of the tree. */
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path fill={color} fillRule="evenodd" d={MARK_PATHS[markFor(size)]} />
    </svg>
  );
}
