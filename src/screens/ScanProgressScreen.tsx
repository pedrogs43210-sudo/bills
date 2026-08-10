import { useEffect, useState } from "react";
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
    <div>
      <div className="topbar">
        <h1 className="screen-title">Reading the receipt</h1>
      </div>

      <div className="card" style={{ display: "flex", justifyContent: "center", padding: "var(--s6) var(--s4)" }}>
        {/* Decoration: the words below carry the meaning for anyone who cannot see this. */}
        <div className="scanning" aria-hidden="true">
          <div className="scanning-line" style={{ width: "62%" }} />
          <div className="scanning-line" style={{ width: "88%" }} />
          <div className="scanning-line" style={{ width: "74%" }} />
          <div className="scanning-line" style={{ width: "91%" }} />
          <div className="scanning-line" style={{ width: "56%" }} />
          <div className="scanning-line" style={{ width: "80%" }} />
          <div className="scanning-line short" style={{ width: "40%" }} />
          <div className="scanning-sweep" />
        </div>
      </div>

      <div role="status" aria-live="polite" style={{ textAlign: "center" }}>
        <p className="label" style={{ margin: 0 }}>
          Finding the items, the quantities and the prices.
        </p>
        {slow && (
          <p className="micro" style={{ marginTop: "var(--s2)" }}>
            Still going — a long receipt takes a little longer
          </p>
        )}
      </div>

      {/* Reserved for a banner in the native apps. It renders nothing today, and whatever goes
          here must never hold the user once the items are ready. */}
      <AdSlot placement="scan-progress" />

      <div className="footerbar">
        {/* A way out. A scan that has gone wrong should never trap someone on a screen whose
            only content is a moving light. */}
        <button className="btn" style={{ width: "100%" }} onClick={onCancel}>
          Cancel and add by hand
        </button>
      </div>
    </div>
  );
}
