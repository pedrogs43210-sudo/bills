import { useEffect, type RefObject } from "react";

/**
 * Reserves room at the bottom of the page for something fixed that sits there.
 *
 * The element measures itself and publishes its height as `--footer-h`, which `#root`'s bottom
 * padding is derived from. A number in the stylesheet cannot know how tall a bar is on six
 * different screens — that guess is what left "Delete trip" permanently underneath one — and it
 * cannot know that one screen has a 56px round button instead.
 *
 * One publisher per screen. Everything fixed at the bottom of a screen is either the bar or the
 * button, never both, so there is nothing to add up.
 */
export function useReservedBottom(ref: RefObject<HTMLElement | null>, extra = 0): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () => document.documentElement.style.setProperty("--footer-h", `${el.offsetHeight + extra}px`);
    publish();

    // Re-measured on change, because these heights are not fixed: the scans-left counter appears,
    // a warning wraps to two lines, a button's label changes length.
    if (typeof ResizeObserver === "undefined") return () => document.documentElement.style.removeProperty("--footer-h");
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--footer-h");
    };
  });
}
