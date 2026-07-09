import { useState } from "react";
import { useStore } from "../state/StoreProvider";
import { balances, paidTotals, settle, shareTotals } from "../lib/settle";
import { isFullyAssigned } from "../lib/split";
import { formatCents } from "../lib/money";
import { summaryText } from "../lib/summary";
import type { View } from "../App";

export function SettleScreen({ tripId, go }: { tripId: string; go: (v: View) => void }) {
  const { data } = useStore();
  const [copied, setCopied] = useState(false);
  const trip = data.trips.find((t) => t.id === tripId);
  if (!trip) return null;

  const paid = paidTotals(trip);
  const shares = shareTotals(trip);
  const transfers = settle(balances(trip));
  const name = (id: string) => trip.people.find((p) => p.id === id)?.name ?? "?";
  const hasUnassigned = trip.receipts.some((r) => !isFullyAssigned(r));

  async function share() {
    const text = summaryText(trip!);
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // user cancelled or share failed — fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <p>All square! 🎉</p>
        ) : (
          transfers.map((t, idx) => (
            <div key={idx} className="row" style={{ padding: "6px 0" }}>
              <span>💸 {name(t.from)} → {name(t.to)}</span>
              <b>{formatCents(t.amount, trip.currency)}</b>
            </div>
          ))
        )}
      </div>

      {copied && <div className="banner-good">Copied to clipboard ✓</div>}
      <div className="footerbar">
        <button className="btn btn-primary" onClick={share}>📤 Share summary</button>
      </div>
    </div>
  );
}
