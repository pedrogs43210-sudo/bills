import type { View } from "../App";
import type { ScanQuota } from "../lib/scan";
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
  tripId: string;
  quota: ScanQuota | null;
  go: (v: View) => void;
}) {
  const limit = quota?.limit ?? null;

  return (
    <div>
      <div className="topbar">
        <button className="btn btn-ghost" aria-label="Back" onClick={() => go({ screen: "trip", tripId })}>←</button>
        <h1 className="screen-title">Out of free scans</h1>
      </div>

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
          <span className="note-head">Billy is free. Reading a receipt isn't. </span>
          Every photo goes off to be read by an AI service, and that costs a few cents each time —
          so scanning is the one part that has to be paid for. Everything else stays free.
        </div>
      </div>

      <PackChooser />

      {/* The way out has to be genuinely useful, not a consolation prize. Adding items by hand is
          the whole app minus the camera, and anyone who leaves believing otherwise never returns. */}
      <div className="card">
        <h3>Everything else still works</h3>
        <p className="label" style={{ marginTop: 0 }}>
          Type the items in yourself and the app does the rest — the splitting, the groups, the
          rounding, who owes whom. That part is free and always will be, with no limit on it.
        </p>
        <button className="btn" style={{ width: "100%" }} onClick={() => go({ screen: "trip", tripId })}>
          ✍️ Add a receipt by hand
        </button>
      </div>
    </div>
  );
}
