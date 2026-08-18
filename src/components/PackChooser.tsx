import { useState } from "react";
import { awaitCredits } from "../lib/awaitCredits";
import { fetchQuota, lastKnownQuota } from "../lib/scan";
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
export function PackChooser({
  onBought,
  compact = false,
}: {
  onBought?: (scansAdded: number) => void;
  /**
   * For the offer sheet, where vertical space is the constraint and attention is the point.
   *
   * Drops the heading, which would repeat the sheet's own title back at the reader, and the Restore
   * button, which is for the rare person setting up a new phone and has no business sitting next to
   * a primary action at the moment somebody is deciding whether to spend €2.99. Restore still lives
   * on the paywall screen and in Settings, where a person looking for it will actually be.
   */
  compact?: boolean;
}) {
  const [chosen, setChosen] = useState<Pack>(featuredPack());
  const bestValue = bestValuePack();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<PurchaseOutcome | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [slow, setSlow] = useState(false);
  const buyable = canBuy();

  async function run(action: () => Promise<PurchaseOutcome>) {
    setBusy(true);
    setOutcome(null);
    setWaiting(false);
    setSlow(false);
    /* Captured BEFORE the purchase, and that ordering is the whole of it.
       The wait below asks "is the balance higher than it was", so the baseline has to predate the
       money moving. Read afterwards, any quota refresh landing in between sets the baseline to the
       NEW total — after which the balance can never rise above itself, the wait runs to its
       timeout, and somebody whose scans already arrived is told they are delayed. */
    const before = lastKnownQuota()?.credits ?? 0;
    try {
      const result = await action();
      setOutcome(result);
      if (result.kind === "bought") {
        /* Google has the money; the scans do not exist yet. They arrive when RevenueCat's webhook
           reaches the Worker — a second usually, longer if a delivery is retried. Until this
           existed the screen showed the old count, which is the worst state in the app: somebody's
           money has left their account and nothing has visibly happened. */
        setWaiting(true);
        const landed = await awaitCredits(before, fetchQuota);
        setWaiting(false);
        setSlow(landed.kind === "slow");
        onBought?.(result.scansAdded);
      }
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
      {!compact && <h3>Scan packs</h3>}

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
      {!compact && (
        <button
          className="btn btn-ghost"
          style={{ width: "100%", marginTop: "var(--s2)" }}
          disabled={busy}
          onClick={() => run(restorePurchases)}
        >
          Already bought some? Restore
        </button>
      )}

      {outcome && outcome.kind !== "bought" && (
        <div className={outcome.kind === "cancelled" ? "banner-warn" : "banner-warn"} role="status">
          {outcome.kind === "cancelled"
            ? "No problem — nothing was charged."
            : "why" in outcome
              ? outcome.why
              : "That didn't work."}
        </div>
      )}
      {waiting && (
        <div className="banner-good" role="status">
          Payment received — adding your scans…
        </div>
      )}

      {/* Not an error, and worded so it cannot be read as one. The money is not at risk and the
          scans are coming; only the confirmation is slower than the app would like. The address is
          here because this is the one screen where somebody may genuinely need to write to a human
          about money. */}
      {slow && !waiting && (
        <div className="banner-warn" role="status">
          Your payment went through and your scans are on their way — they can take a minute to
          appear. Reopen Billy shortly, and if they still aren't here write to
          hello@splitwithbilly.com and they'll be added by hand.
        </div>
      )}

      {outcome?.kind === "bought" && !waiting && !slow && (
        <div className="banner-good" role="status">
          Added {outcome.scansAdded} scans. Thank you — that keeps Billy running.
        </div>
      )}
    </div>
  );
}
