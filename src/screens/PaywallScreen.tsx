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
  const limit = quota?.limit ?? null;
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
        <h1 className="screen-title">{bought ? "You're all set" : "Out of free scans"}</h1>
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
          {quota !== null && (
            <div className="card" style={{ textAlign: "center" }}>
              <span className="hero">{quota.used}</span>
              <span className="micro">
                {limit === null ? "scans used" : `of ${limit} free scans used`}
              </span>
            </div>
          )}

          <div className="note" role="status">
            <span className="note-dot" aria-hidden="true">!</span>
            <div>
              <span className="note-head">Scans are the only paid part. </span>
              Splitting, settling, sharing and adding items by hand all stay free, for as long as
              you use Billy.
            </div>
          </div>

          <PackChooser onBought={afterBuying} />
        </>
      )}

      {/* The way out has to be genuinely useful, not a consolation prize. Adding items by hand is
          the whole app minus the camera, and anyone who leaves believing otherwise never returns. */}
      <div className="card">
        <h3>Everything else still works</h3>
        <p className="label" style={{ marginTop: 0 }}>
          Type the items in yourself and the app does the rest — the splitting, the groups, the
          rounding, who owes whom. That part is free and always will be, with no limit on it.
        </p>
        <button className="btn" style={{ width: "100%" }} onClick={() => go(whereBack)}>
          ✍️ Add a receipt by hand
        </button>
      </div>
    </div>
  );
}
