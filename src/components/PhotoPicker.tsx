/**
 * The condensed camera/gallery pair: take a photo, or pick one you already have.
 *
 * Lifted out of the trip screen unchanged, because scanning now starts in two places — the trip's
 * own footer and the Scan tab, which has no trip yet. Two copies of a control this fiddly is two
 * places for `capture` to go missing.
 *
 * They cannot be one control: `capture` forces the camera and hides the gallery on some browsers,
 * so the photo you already took would be unreachable. Taking the photo is the thing you came to
 * do, so it keeps the primary button; picking an existing one is the rarer path and only needs a
 * 44px square beside it.
 *
 * The labels are the ones the rest of the app already knows this control by, and are load-bearing
 * for anyone using a screen reader: "Scan receipt" for the camera, "Choose a photo of a receipt"
 * for the gallery.
 */
export function PhotoPicker({
  disabled = false,
  onPick,
}: {
  disabled?: boolean;
  onPick: (file: File) => void;
}) {
  /** Cleared after every pick, so choosing the same photo twice still fires a change. */
  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onPick(file);
    e.target.value = "";
  };

  return (
    <div className="row" style={{ marginBottom: 8, gap: "var(--s2)" }}>
      {/* capture="environment" is what actually opens the rear camera. Without it the browser
          shows a generic file picker, which on Android lands in the gallery — so "scan a receipt"
          meant hunting for a photo you had not taken yet. */}
      <label className="btn btn-primary" style={{ opacity: disabled ? 0.45 : 1, flex: 1 }}>
        📸 Scan receipt
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
        className="btn btn-square"
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
