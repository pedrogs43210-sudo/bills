import type { View } from "../App";
import type { ScanQuota } from "../lib/scan";

/**
 * What appears when this month's scans are gone.
 *
 * It is shown *before* the camera opens, never after: nobody should photograph a receipt only
 * to be told the photo will be thrown away.
 *
 * There is no Subscribe button yet, on purpose. In-app purchases arrive with the native build,
 * and a button that cannot take money — or a price that cannot be paid — would be a worse
 * experience than an honest one. The job of this screen today is to say what happened, say what
 * still works, and let someone carry on.
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
  const nextMonth = firstOfNextMonth(new Date());

  return (
    <div>
      <div className="topbar">
        <button className="btn btn-ghost" aria-label="Back" onClick={() => go({ screen: "trip", tripId })}>←</button>
        <h1 className="screen-title">Out of scans</h1>
      </div>

      {quota !== null && (
        <div className="card" style={{ textAlign: "center" }}>
          <span className="hero">{quota.used}</span>
          <span className="micro">
            {limit === null ? "scans used this month" : `of ${limit} scans used this month`}
          </span>
        </div>
      )}

      <div className="note" role="status">
        <span className="note-dot" aria-hidden="true">!</span>
        <div>
          <span className="note-head">Scanning is back on {nextMonth}. </span>
          Unlimited scanning is coming as a subscription — it isn't ready to buy yet, so nothing
          is being asked of you today.
        </div>
      </div>

      {/* The way out has to be genuinely useful, not a consolation prize. Adding items by hand is
          the whole app minus the camera, and anyone who leaves believing otherwise never returns. */}
      <div className="card">
        <h3>Everything else still works</h3>
        <p className="label" style={{ marginTop: 0 }}>
          Type the items in yourself and the app does the rest — the splitting, the groups, the
          rounding, who owes whom. That part is free and always will be, with no limit on it.
        </p>
        <button className="btn btn-primary" onClick={() => go({ screen: "trip", tripId })}>
          ✍️ Add a receipt by hand
        </button>
      </div>
    </div>
  );
}

/** "1 September" — the day the allowance comes back, in the reader's own language. */
function firstOfNextMonth(now: Date): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  try {
    return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", timeZone: "UTC" }).format(next);
  } catch {
    return next.toISOString().slice(0, 10);
  }
}
