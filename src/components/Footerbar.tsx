import { useEffect, useRef } from "react";

/**
 * The fixed bar of actions at the bottom of a screen, which reserves its own space.
 *
 * The page used to reserve a hard-coded 140px for it. That was a guess, and the trip screen's bar
 * grew to 172px — so the last receipt and "Delete trip" sat permanently underneath it, unreachable
 * no matter how far you scrolled. A number in the stylesheet cannot know how tall the bar is on
 * each screen, so the bar measures itself and the page pads to match.
 */
export function Footerbar({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () => document.documentElement.style.setProperty("--footer-h", `${el.offsetHeight}px`);
    publish();

    // Re-measured on change, because the bar's height is not fixed: the scans-left counter
    // appears, a warning wraps to two lines, a button's label changes length.
    if (typeof ResizeObserver === "undefined") return () => document.documentElement.style.removeProperty("--footer-h");
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--footer-h");
    };
  });

  return (
    <div className="footerbar" ref={ref}>
      {children}
    </div>
  );
}
