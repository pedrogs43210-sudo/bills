import { scanChip } from "../lib/scanChip";
import type { ScanQuota } from "../lib/scan";

/**
 * The scan control: take a photo, or pick one you already have — and how many scans that leaves.
 *
 * The count lives on the button rather than under it. It used to be a small grey line below the
 * controls, which read as an afterthought bolted onto the thing it describes despite being the
 * app's entire commercial surface. On the button you read "this action, and you have three of
 * them" in one glance.
 *
 * They cannot be one control: `capture` forces the camera and hides the gallery on some browsers,
 * so the photo you already took would be unreachable. Taking the photo is the thing you came to
 * do, so it keeps the primary button; picking an existing one is the rarer path and only needs a
 * 56px square beside it.
 *
 * The labels are the ones the rest of the app already knows this control by, and are load-bearing
 * for anyone using a screen reader: "Scan receipt" for the camera, "Choose a photo of a receipt"
 * for the gallery.
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
  /** Cleared after every pick, so choosing the same photo twice still fires a change. */
  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onPick(file);
    e.target.value = "";
  };

  const chip = scanChip(quota);
  const outOfScans = quota?.left === 0 && onGetMore !== undefined;

  // At zero the button stops offering a thing it cannot do and offers the fix instead. The gallery
  // button leaves entirely rather than sitting there dimmed: importing a photo costs a scan too, so
  // a greyed-out 🖼 would imply a free path that does not exist — and its absence gives the offer
  // the full width it needs.
  if (outOfScans) {
    return (
      <div style={{ marginBottom: 8 }}>
        <button className="btn btn-primary scan-btn" onClick={onGetMore}>
          <span className="scan-btn-label">🎟 Get more scans</span>
          <span className="scan-chip">from €1.99</span>
        </button>
      </div>
    );
  }

  return (
    <div className="row" style={{ marginBottom: 8, gap: "var(--s2)" }}>
      {/* capture="environment" is what actually opens the rear camera. Without it the browser
          shows a generic file picker, which on Android lands in the gallery — so "scan a receipt"
          meant hunting for a photo you had not taken yet. */}
      <label
        className={`btn btn-primary scan-btn${chip ? "" : " scan-btn-bare"}`}
        style={{ opacity: disabled ? 0.45 : 1, flex: 1 }}
      >
        <span className="scan-btn-label">📸 Scan receipt</span>
        {chip && <span className={`scan-chip${chip.tone === "last" ? " scan-chip-last" : ""}`}>{chip.text}</span>}
        <input
          hidden
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="Scan receipt"
          disabled={disabled}
          onChange={take}
        />
      </label>
      <label
        className="btn btn-square scan-square"
        title="Choose a photo you already have"
        style={{ opacity: disabled ? 0.45 : 1 }}
      >
        <span aria-hidden="true">🖼</span>
        <input
          hidden
          type="file"
          accept="image/*"
          aria-label="Choose a photo of a receipt"
          disabled={disabled}
          onChange={take}
        />
      </label>
    </div>
  );
}
