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

export function ScanProgressScreen({ onCancel }: { onCancel: () => void }) {
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

      <div className="scan-stage">
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
            <div className="scanning-sweep" />
          </div>
          {/* The brackets stay: this is the same instrument, still pointed at the same receipt. */}
          <span className="viewfinder-bracket viewfinder-tl" />
          <span className="viewfinder-bracket viewfinder-tr" />
          <span className="viewfinder-bracket viewfinder-bl" />
          <span className="viewfinder-bracket viewfinder-br" />
        </div>

        <div role="status" aria-live="polite" style={{ textAlign: "center", maxWidth: 216 }}>
          <p className="label" style={{ margin: 0 }}>
            Finding the items, the quantities and the prices.
          </p>
          {slow && (
            <p className="micro" style={{ marginTop: "var(--s2)" }}>
              Still going — a long receipt takes a little longer
            </p>
          )}
        </div>
      </div>

      {/* Reserved for a banner in the native apps. It renders nothing today, and whatever goes
          here must never hold the user once the items are ready. */}
      <AdSlot placement="scan-progress" />

      <Footerbar>
        {/* A way out. A scan that has gone wrong should never trap someone on a screen whose
            only content is a moving light. */}
        <button className="btn" style={{ width: "100%" }} onClick={onCancel}>
          Cancel and add by hand
        </button>
      </Footerbar>
    </div>
  );
}
