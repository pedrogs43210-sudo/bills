import { useRef } from "react";
import { useReservedBottom } from "../lib/useReservedBottom";

/**
 * The fixed bar of actions at the bottom of a screen, which reserves its own space.
 *
 * The page used to reserve a hard-coded 140px for it. That was a guess, and the trip screen's bar
 * grew to 172px — so the last receipt and "Delete trip" sat permanently underneath it, unreachable
 * no matter how far you scrolled. The bar measures itself instead; see lib/useReservedBottom.ts.
 */
export function Footerbar({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useReservedBottom(ref);

  return (
    <div className="footerbar" ref={ref}>
      {children}
    </div>
  );
}
