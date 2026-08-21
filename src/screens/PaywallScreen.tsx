import { useState } from "react";
import type { View } from "../App";
import { fetchQuota, type ScanQuota } from "../lib/scan";
import { PackChooser } from "../components/PackChooser";

/**
 * What appears when the free scans are gone.
 *
 * It is shown *before* the camera opens, never after: nobody should photograph a receipt only
 * to be told the photo will be thrown away.
 *
 * The tone is the whole design here. The free scans do not come back — they are a trial, not an
 * allowance — so this screen cannot promise a reset, and pretending otherwise would just move the
 * disappointment to the first of the month. What it can do is tell the truth about why scanning
 * costs something when the rest of the app does not, and make the free path sound like the real
 * thing it is rather than a consolation prize.
 *
 * Buying here has to change what the screen says. Someone who has just paid and is still looking
 * at "Out of free scans" will reasonably conclude it did not work — so a purchase refreshes the
 * count from the server and turns the screen into a way back to the camera they were reaching for.
 *
 * The pack chooser sits above the free path rather than below it. That ordering is the honest one:
 * this is the screen where we ask for money, and burying the ask under the alternative would be a
 * different kind of dishonesty — the coy kind. The alternative is right underneath, described as
 * the real thing it is.
 */
export function PaywallScreen({
  tripId,
  quota,
  go,
}: {
  /**
   * Optional, because the Scan tab can reach this wall with nothing behind it: the scan is refused
   * before any split exists, which is the whole point of creating nothing until it succeeds. Every
   * way off this screen therefore has to work with no split to return to.
   */
  tripId?: string;
  quota: ScanQuota | null;
  go: (v: View) => void;
}) {
  const [bought, setBought] = useState(false);
  /** Back to the split they came from, or to the list, which is where a new one starts. */
  const whereBack: View = tripId ? { screen: "trip", tripId } : { screen: "trips" };

  /**
   * A purchase happened. Re-ask the server what this install now has — the client is never the
   * authority on that — and let the screen become an exit rather than a wall.
   */
  function afterBuying() {
    setBought(true);
    void fetchQuota();
  }

  return (
    <div>
      <div className="topbar">
        <button className="btn btn-ghost" aria-label="Back" onClick={() => go(whereBack)}>←</button>
        {/* Their goal, not Billy's accounting. "Out of free scans" opens with bad news about a
            limit the reader did not choose, at the one moment they are most motivated — standing
            somewhere with a receipt in hand and people waiting. "Keep scanning" names the thing
            they were already trying to do. */}
        <h1 className="screen-title">{bought ? "You're all set" : "Keep scanning"}</h1>
      </div>

      {bought ? (
        <>
          <div className="note note-good" role="status">
            <span className="note-dot" aria-hidden="true">✓</span>
            <div>
              <span className="note-head">Your scans are ready. </span>
              They never expire, so anything you don't use is waiting for the next receipt.
            </div>
          </div>
          {/* They came here trying to photograph something. Send them back to it — to the split
              they were scanning into, or, when there was none, to the list, where the Scan tab
              they started from is sitting at the bottom of the screen. */}
          <button className="btn btn-primary" onClick={() => go(whereBack)}>
            📸 Back to scanning
          </button>
        </>
      ) : (
        <>
          {/* What a scan is worth, in the only currency that matters here: the five minutes of
              typing it saves, at a table, in front of people. Feature copy — "AI-powered receipt
              understanding" — describes the machine. This describes the evening. */}
          <p className="paywall-pitch">
            A photo becomes a finished split in about ten seconds. Typing a long receipt in by hand
            takes about five.
          </p>

          {/* Counted the same way as everywhere else — what is left — but a line rather than a
              hero. At the paywall the number is almost always zero, and a giant 0 is the worst
              anchor on the screen; the heading already carries the news. Above zero it is genuinely
              useful, so that is when it appears. */}
          {quota !== null && (quota.left ?? 0) > 0 && (
            <p className="paywall-left">
              {quota.left} {quota.left === 1 ? "scan" : "scans"} left
            </p>
          )}

          <PackChooser onBought={afterBuying} firstPack={quota?.firstPack ?? false} />
        </>
      )}

      {/* The way out stays, and stays honest — everything except the camera really is free and
          unlimited, and anyone who leaves believing otherwise never comes back. What changes is its
          weight: as a card with a full-width button it was the equal of the purchase on a screen
          with one job. A link is still a door; it is just no longer a rival. */}
      {!bought && (
        <p className="paywall-out">
          Rather not?{" "}
          <button className="linklike" onClick={() => go(whereBack)}>
            Add this receipt by hand
          </button>{" "}
          — free, and always will be.
        </p>
      )}
    </div>
  );
}
