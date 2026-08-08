import { useState } from "react";
import { useStore } from "../state/StoreProvider";
import { balances, excludedReceipts, exclusionReason, paidTotals, settle, shareTotals, type ExclusionReason } from "../lib/settle";
import { isFullyAssigned } from "../lib/split";
import { formatCents } from "../lib/money";
import { settledMessage, summaryText } from "../lib/summary";
import { shareOrCopy } from "../lib/share";
import type { View } from "../App";

export function SettleScreen({ tripId, go }: { tripId: string; go: (v: View) => void }) {
  const { data } = useStore();
  const [feedback, setFeedback] = useState<"" | "copied" | "failed">("");
  const trip = data.trips.find((t) => t.id === tripId);
  if (!trip) return null;

  const paid = paidTotals(trip);
  const shares = shareTotals(trip);
  const transfers = settle(balances(trip));
  const name = (id: string) => trip.people.find((p) => p.id === id)?.name ?? "?";
  const hasUnassigned = trip.receipts.some((r) => !isFullyAssigned(r));
  const excluded = excludedReceipts(trip);
  const reasonText: Record<ExclusionReason, string> = {
    "no-payer": "nobody is marked as paying",
    "unknown-payer": "a payer isn't in this trip any more",
    "negative-amount": "an amount is negative",
  };

  async function share() {
    const outcome = await shareOrCopy(summaryText(trip!));
    if (outcome === "shared") return;
    setFeedback(outcome);
    setTimeout(() => setFeedback(""), 2000);
  }

  return (
    <div>
      <div className="topbar">
        <button className="btn btn-ghost" aria-label="Back" onClick={() => go({ screen: "trip", tripId })}>←</button>
        <h1 className="screen-title">Settle up</h1>
      </div>

      {hasUnassigned && (
        <div className="banner-warn">⚠️ Some receipts have unassigned items — their cost currently falls on the payer.</div>
      )}

      {excluded.length > 0 && (
        <div className="banner-warn">
          ⚠️ Not counted yet:{" "}
          {excluded
            .slice(0, 3)
            .map((r) => {
              const reason = exclusionReason(r, trip);
              return `${r.storeName || "Receipt"} — ${reason ? reasonText[reason] : "needs fixing"}`;
            })
            .join("; ")}
          {excluded.length > 3 ? `; and ${excluded.length - 3} more` : ""}. Open{" "}
          {excluded.length === 1 ? "it" : "them"} from the trip screen and fix the warning at the bottom
          (tap ✏️ Edit items first if the receipt opens on the assigning screen).
        </div>
      )}

      <div className="card">
        <h3>Each person's share</h3>
        {trip.people.map((p) => (
          <div key={p.id} className="row" style={{ padding: "6px 0" }}>
            <span className="chip" style={{ background: p.color, cursor: "default" }}>{p.name}</span>
            <span>
              <b>{formatCents(shares[p.id] ?? 0, trip.currency)}</b>
              <span className="muted"> · paid {formatCents(paid[p.id] ?? 0, trip.currency)}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>To settle</h3>
        {transfers.length === 0 ? (
          <p>{settledMessage(trip)}</p>
        ) : (
          transfers.map((t, idx) => (
            <div key={idx} className="row" style={{ padding: "6px 0" }}>
              <span>💸 {name(t.from)} → {name(t.to)}</span>
              <b>{formatCents(t.amount, trip.currency)}</b>
            </div>
          ))
        )}
      </div>

      {feedback === "copied" && <div className="banner-good">Copied to clipboard ✓</div>}
      {feedback === "failed" && <div className="banner-warn">Couldn't share on this device.</div>}
      <div className="footerbar">
        <button className="btn btn-primary" onClick={share}>📤 Share summary</button>
      </div>
    </div>
  );
}
