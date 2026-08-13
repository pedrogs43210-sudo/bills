import { useState } from "react";
import { PACKS, bestValuePack, displayPerScan, displayPrice, featuredPack, type Pack } from "../lib/packs";
import { buyPack, canBuy, restorePurchases, whyCannotBuy, type PurchaseOutcome } from "../lib/purchase";

/**
 * Choosing a pack of scans and paying for it.
 *
 * Lives in one component because it appears in two places — the wall someone hits mid-holiday, and
 * Settings, where they can top up before one. Two copies of a payment screen is two chances to
 * word the price differently.
 *
 * Three deliberate choices:
 *
 * - **One option is pre-selected, and one is labelled, and they are not the same one.** A row of
 *   equal options makes someone do arithmetic at the moment they least want to. The pre-selected
 *   pack is the easy yes; the label goes on whichever pack genuinely costs least per scan, worked
 *   out from the prices rather than written down, so it cannot drift into being untrue.
 * - **"Scans never expire" is stated, because it is true and it is the fear.** Nobody wants to buy
 *   twenty of something that evaporates before the next receipt.
 * - **When buying is impossible the prices still show.** They are useful information either way;
 *   what changes is the button, which is disabled and says plainly that packs are not ready yet
 *   rather than pretending to work.
 */
export function PackChooser({ onBought }: { onBought?: (scansAdded: number) => void }) {
  const [chosen, setChosen] = useState<Pack>(featuredPack());
  const bestValue = bestValuePack();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<PurchaseOutcome | null>(null);
  const buyable = canBuy();

  async function run(action: () => Promise<PurchaseOutcome>) {
    setBusy(true);
    setOutcome(null);
    try {
      const result = await action();
      setOutcome(result);
      if (result.kind === "bought") onBought?.(result.scansAdded);
    } catch {
      // A thrown error from a payment sheet is still just "it did not work" to the person holding
      // the phone. What must never happen is a spinner that never stops.
      setOutcome({ kind: "failed", why: "That didn't go through. Nothing has been charged." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>Scan packs</h3>

      <div role="radiogroup" aria-label="Scan packs">
        {PACKS.map((pack) => {
          const selected = pack.id === chosen.id;
          return (
            <button
              key={pack.id}
              className={`pack${selected ? " pack-selected" : ""}`}
              role="radio"
              aria-checked={selected}
              onClick={() => setChosen(pack)}
            >
              <span className="row">
                <span>
                  <b>{pack.scans} scans</b>
                  {pack.id === bestValue.id && <span className="pack-tag">Best value</span>}
                  {/* .muted, not .micro: micro is uppercased, and a shouted price — "€0.15 EACH" —
                      reads like a warning rather than like value. */}
                  <span className="muted" style={{ display: "block", marginTop: 2 }}>
                    {displayPerScan(pack)} each
                  </span>
                </span>
                <span className="money-1">{displayPrice(pack)}</span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="muted" style={{ margin: "var(--s3) 0" }}>
        Scans never expire — they wait for your next receipt.
      </p>

      {buyable ? (
        <button className="btn btn-primary" disabled={busy} onClick={() => run(() => buyPack(chosen))}>
          {busy ? "One moment…" : `Buy ${chosen.scans} scans — ${displayPrice(chosen)}`}
        </button>
      ) : (
        <>
          <button className="btn" disabled style={{ width: "100%" }}>
            Buy {chosen.scans} scans — {displayPrice(chosen)}
          </button>
          <p className="muted" style={{ margin: "var(--s2) 0 0", textAlign: "center" }}>
            {whyCannotBuy()}
          </p>
        </>
      )}

      {/* Quiet on purpose. Both stores require it to exist, but it is for the rare person moving to
          a new phone — it must not compete with the thing most people are here to do. */}
      <button
        className="btn btn-ghost"
        style={{ width: "100%", marginTop: "var(--s2)" }}
        disabled={busy}
        onClick={() => run(restorePurchases)}
      >
        Already bought some? Restore
      </button>

      {outcome && outcome.kind !== "bought" && (
        <div className={outcome.kind === "cancelled" ? "banner-warn" : "banner-warn"} role="status">
          {outcome.kind === "cancelled"
            ? "No problem — nothing was charged."
            : "why" in outcome
              ? outcome.why
              : "That didn't work."}
        </div>
      )}
      {outcome?.kind === "bought" && (
        <div className="banner-good" role="status">
          Added {outcome.scansAdded} scans. Thank you — that keeps Billy running.
        </div>
      )}
    </div>
  );
}
