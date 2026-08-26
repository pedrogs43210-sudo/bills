import { useRef } from "react";
import { useReservedBottom } from "../lib/useReservedBottom";
import { Mark } from "./Mark";

/**
 * Which tab is showing — or "none".
 *
 * The camera is a root and carries the bar, but it is not a tab: the view underneath it is still
 * the splits list, so without this Splits sat highlighted on the one screen the app opens on,
 * pointing at somewhere the user was not.
 */
export type TabName = "splits" | "profile" | "none";

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
/**
 * Below this many scans left, the Profile tab carries a badge.
 *
 * Two rather than one, deliberately. The price is not shown until the paywall, so the badge is the
 * first warning somebody gets — and at one remaining it would appear and be spent in the same
 * session, which is a notification rather than a warning. At two there is always a scan left after
 * you have been told.
 */
export const BADGE_BELOW = 2;

export function TabBar({
  current,
  scansLeft = null,
  onSplits,
  onScan,
  onProfile,
}: {
  current: TabName;
  /** Null when there is no counter — no proxy configured, or a subscriber with no cap. */
  scansLeft?: number | null;
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
        <span className="tab-icon" aria-hidden="true">
          {/* The mark at 20px wide — the compact drawing, see components/Mark.tsx. Single-colour
              and inherited, so the selected state costs no extra rule: a short bar pinned to accent
              would leave half the mark ignoring the state it is there to show. The sheet is
              explicit that no gradient tile appears inside the product — the app already is it. */}
          <Mark size={20} />
        </span>
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
        style={{ position: "relative" }}
        onClick={onProfile}
      >
        <span className="tab-icon" aria-hidden="true">
          {/* A head and shoulders. The 🙂 emoji read as a reaction rather than as a destination —
              and on some phones as a yellow disc bright enough to outweigh the selected tab. */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="3.6" />
            <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" />
          </svg>
        </span>
        {/* A count, not an alert. Filled ink rather than red, because nothing has gone wrong —
            there are scans left, and Profile is where they can be topped up. Announced to a screen
            reader through the tab's accessible name below, since a bare numeral read out on its own
            says nothing about what it counts. */}
        {scansLeft !== null && scansLeft <= BADGE_BELOW && (
          <span className="tab-badge" aria-hidden="true">{scansLeft}</span>
        )}
        Profile
        {scansLeft !== null && scansLeft <= BADGE_BELOW && (
          <span className="sr-only">{`, ${scansLeft} scan${scansLeft === 1 ? "" : "s"} left`}</span>
        )}
      </button>
    </div>
  );
}
