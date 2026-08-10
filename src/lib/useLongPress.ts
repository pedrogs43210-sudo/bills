import { useEffect, useRef } from "react";

/** How long a press has to be held. Long enough not to fire while scrolling, short enough to feel
 *  like a decision rather than a wait — the same 500ms Android itself uses. */
const HOLD_MS = 500;

/** How far a finger may drift and still count as a press rather than a scroll. */
const SLOP_PX = 10;

export type LongPressHandlers = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
};

/**
 * Hold to do one thing, tap to do another.
 *
 * The awkward part of a long press is not the timer, it is the tap that follows it: the finger
 * lifting after a hold fires a click too, so without swallowing it a hold would select an item
 * *and* open its panel. That is what `held` is for.
 *
 * Pointer events rather than touch events, so a mouse holds as well — which is how this gets
 * tested, and how it behaves for anyone using the web version on a laptop.
 *
 * Returns a factory rather than handlers, because a list of items shares one press: only one
 * finger can be down at a time, so one timer is the whole state. Spread `press(item)` onto each
 * row and the item under the finger is captured when the press begins.
 */
export function useLongPress<T>(
  onHold: (target: T) => void,
  onTap: (target: T) => void
): (target: T) => LongPressHandlers {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const from = useRef<{ x: number; y: number } | null>(null);
  const held = useRef(false);

  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    from.current = null;
  };

  // A press interrupted by unmounting — navigating away mid-hold — must not fire afterwards.
  useEffect(() => clear, []);

  return (target: T) => ({
    onPointerDown: (e) => {
      // Only the primary button, and never a second finger landing on an already-pressed row.
      if (e.button !== 0 || timer.current !== null) return;
      from.current = { x: e.clientX, y: e.clientY };
      held.current = false;
      timer.current = setTimeout(() => {
        timer.current = null;
        held.current = true;
        onHold(target);
      }, HOLD_MS);
    },
    onPointerMove: (e) => {
      if (!from.current) return;
      if (Math.abs(e.clientX - from.current.x) > SLOP_PX || Math.abs(e.clientY - from.current.y) > SLOP_PX) clear();
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    // Android pops its own text-selection menu on a long press, and a desktop browser opens the
    // context menu. Either would land on top of the selection just made.
    onContextMenu: (e) => e.preventDefault(),
    onClick: (e) => {
      if (held.current) {
        // The click that ends a hold. Swallowed, or holding an item would also open it.
        held.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      onTap(target);
    },
  });
}
