import { useEffect, useState } from "react";
import { Footerbar } from "../components/Footerbar";
import { AdSlot } from "../components/AdSlot";

/**
 * The five to twenty seconds while a receipt is being read.
 *
 * This is the app's one genuinely impressive moment — a crumpled receipt becomes a tidy list —
 * and until now it was a button whose label changed, which reads as a hang. So it gets a screen:
 * a receipt with a light sweeping down it, and words that say what is happening.
 *
 * No progress bar. Nothing here knows how far along the model is, and a bar that fills at an
 * invented rate is a lie that gets caught every time it stalls at 90%.
 */

/** After this long the wait stops feeling normal, so the screen acknowledges it. */
const PATIENCE_MS = 9000;

/**
 * How long the tick stays up before the items appear.
 *
 * Short on purpose. This is a full stop, not a celebration — somebody has just waited eight seconds
 * and the reward for waiting is their receipt, not a longer wait with a nicer picture on it. Long
 * enough to register that it worked, too short to be in the way.
 *
 * Exported so the screens that navigate away hold for exactly as long as the animation runs, rather
 * than two numbers drifting apart until the tick is cut off half-drawn.
 */
export const SCAN_DONE_MS = 1150;

export function ScanProgressScreen({ onCancel, done = false }: { onCancel: () => void; done?: boolean }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), PATIENCE_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    /* The same frame the Scan screen puts in the middle, with the sweep running down it — so the
       photograph you just took appears to be the thing being read, rather than the app cutting to an
       unrelated card. Same class, same no-scroll shell, same optical centring; only the contents of
       the paper change. */
    <div className="scan-screen">
      <div className="topbar">
        <h1 className="screen-title">Reading the receipt</h1>
      </div>

      <div className={`scan-stage${done ? " scan-stage-done" : ""}`}>
        <div className="viewfinder">
          {/* Decoration: the words below carry the meaning for anyone who cannot see this. */}
          <div className="viewfinder-paper" aria-hidden="true">
            <span className="viewfinder-line viewfinder-line-head" style={{ width: "58%" }} />
            <span className="viewfinder-line" style={{ width: "34%", marginBottom: 4 }} />
            {["88%", "74%", "84%", "56%", "80%", "68%"].map((w, i) => (
              <span key={i} className="viewfinder-line" style={{ width: w }} />
            ))}
            <span
              className="viewfinder-line viewfinder-line-head"
              style={{ width: "44%", marginTop: "auto", height: 8 }}
            />
            {/* The sweep stops the moment it worked. A light still travelling over a receipt that
                has already been read says the app has not noticed it finished. */}
            {!done && <div className="scanning-sweep" />}
            {done && (
              <span className="scan-tick" aria-hidden="true">
                {/* A ring thrown outwards from the tick and gone. It is the only part of the
                    sequence that is pure celebration — it carries no information — which is why it
                    is over in a third of a second and never blocks the way forward. */}
                <span className="scan-tick-ring" />
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  {/* Drawn rather than faded in: the stroke travels the way a hand would, which is
                      what makes it read as a mark being made instead of an icon appearing. */}
                  <path className="scan-tick-path" d="M4 12.5l5.2 5.2L20 6.8" />
                </svg>
              </span>
            )}
          </div>
          {/* The brackets stay: this is the same instrument, still pointed at the same receipt. */}
          <span className="viewfinder-bracket viewfinder-tl" />
          <span className="viewfinder-bracket viewfinder-tr" />
          <span className="viewfinder-bracket viewfinder-bl" />
          <span className="viewfinder-bracket viewfinder-br" />
        </div>

        <div role="status" aria-live="polite" style={{ textAlign: "center", maxWidth: 216 }}>
          {done ? (
            <p className="label scan-got-it" style={{ margin: 0, fontFamily: "var(--brand)", fontWeight: 700, fontSize: "17px", color: "var(--good-strong)" }}>
              Got it
            </p>
          ) : (
            <>
              <p className="label" style={{ margin: 0 }}>
                Finding the items, the quantities and the prices.
              </p>
              {slow && (
                <p className="micro" style={{ marginTop: "var(--s2)" }}>
                  Still going — a long receipt takes a little longer
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Reserved for a banner in the native apps. It renders nothing today, and whatever goes
          here must never hold the user once the items are ready. */}
      <AdSlot placement="scan-progress" />

      <Footerbar>
        {/* A way out. A scan that has gone wrong should never trap someone on a screen whose
            only content is a moving light. Gone once it has worked: there is nothing left to
            cancel, and offering it for the last beat invites a mis-tap that throws away a scan
            somebody has already paid for. */}
        {!done && (
          <button className="btn" style={{ width: "100%" }} onClick={onCancel}>
            Cancel and add by hand
          </button>
        )}
      </Footerbar>
    </div>
  );
}
