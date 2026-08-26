/**
 * Billy's mark: two rounded bars, one short.
 *
 * It is an equals sign that isn't equal — the product's argument rather than a picture of a
 * receipt. Everything the app renders comes from two rectangles and one crop; there is no path to
 * hand-edit and nothing to redraw per size. A size change is a width attribute.
 *
 * TWO DRAWINGS, ONE IDEA. At 16px an 11:6 mark leaves each bar 2.4px tall — a hairline that
 * vanishes on a low-density screen. The compact variant thickens the bars and shortens the gap for
 * the same width, so the idea survives small. `markFor(width)` picks; every caller goes through
 * <Mark>.
 *
 * The mark is WIDE, not square. `size` is its width and the height follows from the ratio — a
 * caller that reserves a square box will get a bar floating in whitespace.
 */

/** Which drawing a given rendered width wants. */
export type MarkSize = "regular" | "compact";

/**
 * The two drawings, as crops of one 64-unit master.
 *
 * Bars are 44×9 and 26×9 at radius 4.5 — a true pill, so the ends never look clipped. The lengths
 * are 63/37, never 50/50: an even split contradicts the product. The gap is 6 units, two thirds of
 * a bar height; below 5 they merge at 16px.
 */
export const MARK_GEOMETRY: Record<
  MarkSize,
  { viewBox: string; ratio: number; long: Bar; short: Bar }
> = {
  /** 11:6. Above 24px. */
  regular: {
    viewBox: "10 20 44 24",
    ratio: 24 / 44,
    long: { x: 10, y: 20, w: 44, h: 9 },
    short: { x: 10, y: 35, w: 26, h: 9 },
  },
  /** 11:7 — same idea, same ratio of lengths, only the weight changes. 24px and below. */
  compact: {
    viewBox: "10 18 44 28",
    ratio: 28 / 44,
    long: { x: 10, y: 18, w: 44, h: 11 },
    short: { x: 10, y: 35, w: 24, h: 11 },
  },
};

type Bar = { x: number; y: number; w: number; h: number };

/**
 * The band a rendered width belongs to.
 *
 * 24 is the threshold from the sheet, and it is a measurement rather than a preference: at 16px the
 * regular bars are 2.4px and the compact ones 3.6px.
 */
export function markFor(size: number): MarkSize {
  return size <= 24 ? "compact" : "regular";
}

/**
 * The mark, at a width, in one or two colours.
 *
 * `color` is the long bar and defaults to `currentColor`, so the mark inherits whatever it sits in
 * — which is how the tab bar gets a selected and an unselected state out of one element and no
 * extra CSS. `accent` is the short bar and defaults to the long one, so single-colour is what you
 * get unless you ask for the split.
 *
 * The two-colour split lives on flat cream and flat dark ONLY. On the sunset gradient both bars are
 * ink: cream measures 2.58:1 at the coral end and 1.69:1 at the amber, while ink holds 4.92:1 and
 * 7.51:1 across the whole sweep. That is why there is no `tile` prop here and no gradient anywhere
 * in this file — the gradient belongs to the launcher, the store and the splash, and inside the
 * product the app already is the app.
 */
export function Mark({
  size = 24,
  color = "currentColor",
  accent,
  title,
  className,
  style,
}: {
  /** WIDTH in px. Height follows from the ratio — the mark is 11:6, not square. */
  size?: number;
  /** The long bar. */
  color?: string;
  /** The short bar. Omit for a single-colour mark. Never used for the wordmark — 3.67:1. */
  accent?: string;
  /** Given only where the mark carries meaning on its own. Decorative uses stay out of the tree. */
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const g = MARK_GEOMETRY[markFor(size)];
  return (
    <svg
      width={size}
      height={Math.round(size * g.ratio * 100) / 100}
      viewBox={g.viewBox}
      className={className}
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <rect x={g.long.x} y={g.long.y} width={g.long.w} height={g.long.h} rx={g.long.h / 2} fill={color} />
      <rect
        x={g.short.x}
        y={g.short.y}
        width={g.short.w}
        height={g.short.h}
        rx={g.short.h / 2}
        fill={accent ?? color}
      />
    </svg>
  );
}
