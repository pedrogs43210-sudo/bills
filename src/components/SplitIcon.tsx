import { iconFor, type SplitIcon as Icon } from "../lib/splitIcons";

/**
 * A split's icon, drawn.
 *
 * Takes the stored emoji rather than an icon object, because the emoji is what every caller
 * actually has — `trip.emoji`, `split.emoji` off the server, a row in an export file. Looking it up
 * here means no screen has to know that the mapping exists, and an unrecognised glyph degrades to
 * the neutral receipt instead of leaving a gap in a list.
 *
 * `aria-hidden` by default, and that is deliberate rather than lazy: everywhere this appears the
 * split's name is already sitting next to it, so announcing "dinner, Algarve" adds a word that is
 * not on the screen and is not the answer to anything. The picker is the one place the icon IS the
 * only content, and it passes its own label on the button around this.
 *
 * Stroke width is not scaled with size. The design file draws the whole set at 2 on a 24 grid and
 * says so; letting it drift per size is how a family stops looking like one.
 */
export function SplitIcon({
  emoji,
  size = 20,
  className,
  title,
}: {
  emoji: string | undefined | null;
  /** Rendered width and height, in px. The set is drawn to survive 16. */
  size?: number;
  className?: string;
  /** Supply only where the icon is the sole content and nothing beside it names the split. */
  title?: string;
}) {
  const icon: Icon = iconFor(emoji);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {icon.shapes.map((s, i) =>
        s.kind === "circle" ? (
          <circle key={i} cx={s.cx} cy={s.cy} r={s.r} />
        ) : (
          <path key={i} d={s.d} />
        )
      )}
    </svg>
  );
}
