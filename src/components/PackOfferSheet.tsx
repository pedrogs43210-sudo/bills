import { useEffect, useRef } from "react";
import { PackChooser } from "./PackChooser";

/**
 * The offer, as a sheet that slides up from the bottom.
 *
 * It appears *after* a scan has landed, never before one — someone reaching for the camera with
 * friends waiting is the worst possible audience for anything, and the same words a few seconds
 * later are read by somebody who has just watched the app work. That timing is the whole design;
 * the copy is secondary.
 *
 * Everything about it is escapable. Tapping the dimmed area behind it, pressing Escape, the ✕, or
 * "Not now" all do the same thing, and the answer is remembered for as long as the thing being
 * offered about is still in front of them. A sheet that can only be dismissed by choosing an option
 * converts slightly better and is how an app ends up described in a one-star review.
 */
export function PackOfferSheet({
  title,
  blurb,
  onClose,
  onBought,
}: {
  title: string;
  blurb: string;
  onClose: () => void;
  onBought?: (scansAdded: number) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus moves into the sheet so a screen reader announces it, and so Escape has somewhere to
    // be pressed. Without this the reader carries on reading the receipt underneath.
    panel.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    // The page behind must not scroll while a sheet is over it: on a phone the two surfaces fight,
    // and the one that loses is the one the finger is actually on.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="offer-title"
        tabIndex={-1}
        ref={panel}
        /* The backdrop closes; the sheet itself must not, or every tap on a pack would dismiss the
           thing the tap was aimed at. */
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grip" aria-hidden="true" />

        <div className="row" style={{ alignItems: "flex-start" }}>
          <h2 id="offer-title" className="screen-title" style={{ flex: 1, margin: 0 }}>
            {title}
          </h2>
          <button className="btn btn-ghost btn-square" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="muted" style={{ marginTop: "var(--s2)" }}>{blurb}</p>

        <PackChooser onBought={onBought} compact />

        {/* Named "Not now" rather than "No thanks": it is true — the offer comes back when they are
            low again — and a decline nobody has to feel final about is a decline that is easier to
            reverse later. */}
        <button className="btn btn-ghost" style={{ width: "100%" }} onClick={onClose}>
          Not now
        </button>
      </div>
    </div>
  );
}
