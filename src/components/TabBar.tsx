import { useRef } from "react";
import { useReservedBottom } from "../lib/useReservedBottom";

export type TabName = "splits" | "profile";

/**
 * The bottom tab bar for the two root screens: Splits and Profile.
 *
 * Scan sits in the middle but is never "current" and never gets aria-selected="true" — tapping it
 * opens the camera directly (the Instagram-＋ pattern), it does not navigate to a screen of its
 * own, so there is no state in which it could be the selected tab. Marking it selected on tap
 * would claim a screen exists that never does; it stays a false the whole time, deliberately.
 *
 * Reserves its own height via useReservedBottom, exactly as Footerbar does — see
 * lib/useReservedBottom.ts. Only one of the two ever renders on a given screen, so there is never
 * more than one publisher of --footer-h at a time.
 */
export function TabBar({
  current,
  onSplits,
  onScan,
  onProfile,
}: {
  current: TabName;
  onSplits: () => void;
  onScan: () => void;
  onProfile: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useReservedBottom(ref);

  return (
    <div className="tabbar" ref={ref} role="tablist" aria-label="Billy">
      <button
        type="button"
        role="tab"
        aria-selected={current === "splits"}
        className={`tab${current === "splits" ? " selected" : ""}`}
        onClick={onSplits}
      >
        <span className="tab-icon" aria-hidden="true">🧾</span>
        Splits
      </button>

      {/* Labelled like the other two, not left as a bare disc. An unlabelled icon between two
          captioned tabs reads as something that failed to load, and the one control here that
          spends money is the last one that should be a guess. */}
      <button type="button" role="tab" aria-selected="false" className="tab tab-scan" onClick={onScan}>
        <span className="tab-scan-disc" aria-hidden="true">
          {/* A camera viewfinder: four corner brackets and a centre circle. Drawn rather than a
              typed ＋, which at 30px put only 16px of ink inside this 56px circle — and how much
              depended on which font happened to load. */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 8V5a2 2 0 0 1 2-2h3" />
            <path d="M16 3h3a2 2 0 0 1 2 2v3" />
            <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
            <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
            <circle cx="12" cy="12" r="3.5" />
          </svg>
        </span>
        Scan
      </button>

      <button
        type="button"
        role="tab"
        aria-selected={current === "profile"}
        className={`tab${current === "profile" ? " selected" : ""}`}
        onClick={onProfile}
      >
        <span className="tab-icon" aria-hidden="true">🙂</span>
        Profile
      </button>
    </div>
  );
}
