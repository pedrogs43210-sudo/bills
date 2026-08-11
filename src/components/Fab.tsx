import { useRef } from "react";
import { useReservedBottom } from "../lib/useReservedBottom";

/**
 * The round button in the bottom-right corner: the one thing this screen is for.
 *
 * It lives where a thumb already is. Adding a trip used to be a ＋ up in the header, which is the
 * hardest corner of a phone to reach one-handed and the easiest place for a small glyph to be
 * missed.
 *
 * Fixed, but aligned to the app's own column rather than the window, so on a wide screen it sits
 * beside the content instead of drifting off to the far edge — the same centring the bottom bar
 * uses. It reserves its own space too, so the last trip card is never underneath it.
 */
export function Fab({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Plus the gap it stands in, so the reserved space is the button and its own breathing room.
  useReservedBottom(ref, 16);

  return (
    <div className="fab-slot" ref={ref}>
      <button className="fab" aria-label={label} title={label} onClick={onClick}>
        {children}
      </button>
    </div>
  );
}
