import { useEffect, useRef, useState } from "react";
import { scanChip } from "../lib/scanChip";
import type { ScanQuota } from "../lib/scan";

/**
 * The scan control: one button, and how many scans it leaves.
 *
 * The count lives on the button rather than under it. It used to be a small grey line below the
 * controls, which read as an afterthought bolted onto the thing it describes despite being the
 * app's entire commercial surface. On the button you read "this action, and you have three of
 * them" in one glance.
 *
 * The two sources — camera and gallery — cannot be one input: `capture` forces the camera and
 * hides the gallery on some browsers, so a photo you had already taken would be unreachable. They
 * used to be two controls on the screen, the second a permanent line of text reading "Choose a
 * photo — uses a scan", which put a caveat about pricing on the home screen of a scanning app and
 * made the rarer path as loud as the common one. Now the button asks, once, after it is pressed:
 * one thing to tap, and the choice arrives at the moment it is a real choice.
 *
 * The sheet's two options are still labels wrapping their own file inputs, because opening a
 * camera needs a direct user gesture on the input's own label — routing it through a click handler
 * would be blocked on iOS.
 */
export function PhotoPicker({
  disabled = false,
  quota = null,
  onPick,
  onGetMore,
}: {
  disabled?: boolean;
  quota?: ScanQuota | null;
  onPick: (file: File) => void;
  /** Where "get more scans" goes. Without it the out-of-scans button is not offered. */
  onGetMore?: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);

  /** Cleared after every pick, so choosing the same photo twice still fires a change. */
  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setAsking(false);
    if (file) onPick(file);
    e.target.value = "";
  };

  // Escape closes it, and focus moves in when it opens: the sheet covers the only other control on
  // the screen, so leaving focus behind it would strand a keyboard entirely.
  useEffect(() => {
    if (!asking) return;
    sheet.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAsking(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asking]);

  const chip = scanChip(quota);
  const outOfScans = quota?.left === 0 && onGetMore !== undefined;

  // At zero the button stops offering a thing it cannot do and offers the fix instead — before the
  // camera opens, rather than after a photo has been taken and the server has refused it.
  if (outOfScans) {
    return (
      <div style={{ marginBottom: 8 }}>
        <button className="btn btn-primary scan-btn scan-btn-bare" onClick={onGetMore}>
          <span className="scan-btn-label">🎟 Get more scans</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        className={`btn btn-primary scan-btn${chip ? "" : " scan-btn-bare"}`}
        style={{ opacity: disabled ? 0.45 : 1 }}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={asking}
        onClick={() => setAsking(true)}
      >
        <span className="scan-btn-label">📸 Scan receipt</span>
        {chip && <span className={`scan-chip${chip.tone === "last" ? " scan-chip-last" : ""}`}>{chip.text}</span>}
      </button>

      {asking && (
        /* The sheet goes INSIDE the backdrop, not beside it. .sheet-backdrop is the fixed,
           full-screen flex container and .sheet is its child — the sheet carries no position of its
           own, so as a sibling it stayed in normal flow underneath and the backdrop ate every tap:
           the options were visible, dimmed, and completely dead. */
        <div className="sheet-backdrop" onClick={() => setAsking(false)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Where is the receipt?"
            tabIndex={-1}
            ref={sheet}
            /* The backdrop closes; the sheet itself must not, or the tap that picks an option would
               dismiss the thing it was aimed at. */
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-grip" aria-hidden="true" />
            <h3 style={{ marginTop: 0 }}>Where is the receipt?</h3>

            {/* capture="environment" is what actually opens the rear camera. Without it the browser
                shows a generic file picker, which on Android lands in the gallery — so "take a
                photo" would mean hunting for one you had not taken yet. */}
            <label className="btn btn-primary" style={{ width: "100%" }}>
              📸 Take a photo
              <input hidden type="file" accept="image/*" capture="environment" aria-label="Take a photo of the receipt" onChange={take} />
            </label>

            <label className="btn btn-secondary" style={{ width: "100%", marginTop: "var(--s2)" }}>
              🖼 Choose from gallery
              <input hidden type="file" accept="image/*" aria-label="Choose a photo of a receipt" onChange={take} />
            </label>

            <button className="btn btn-ghost" style={{ width: "100%", marginTop: "var(--s2)" }} onClick={() => setAsking(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
