import { useState } from "react";
import { useStore } from "../state/StoreProvider";
import { personHasEntries } from "../state/reducer";
import { newId } from "../lib/ids";
import { formatCents } from "../lib/money";
import { isFullyAssigned } from "../lib/split";
import type { View } from "../App";
import type { Receipt } from "../types";

export function TripScreen({ tripId, go }: { tripId: string; go: (v: View) => void }) {
  const { data, dispatch } = useStore();
  const trip = data.trips.find((t) => t.id === tripId);
  const [personName, setPersonName] = useState("");
  if (!trip) return null;

  function addPerson() {
    const name = personName.trim();
    if (!name) return;
    dispatch({ type: "addPerson", tripId, personId: newId(), name });
    setPersonName("");
  }

  function addManualReceipt() {
    const receipt: Receipt = {
      id: newId(),
      storeName: "",
      date: new Date().toISOString().slice(0, 10),
      paidBy: trip!.people[0].id,
      items: [],
      printedTotal: 0,
      status: "review",
    };
    dispatch({ type: "addReceipt", tripId, receipt });
    go({ screen: "receipt", tripId, receiptId: receipt.id });
  }

  const payerName = (id: string) => trip.people.find((p) => p.id === id)?.name ?? "?";
  const badge = (r: Receipt) =>
    r.status === "done" ? "✅ done" : r.status === "review" ? "📝 checking" : isFullyAssigned(r) ? "✅ assigned" : "👉 assigning";

  return (
    <div>
      <div className="topbar">
        <button className="btn btn-ghost" aria-label="Back" onClick={() => go({ screen: "trips" })}>←</button>
        <h1 className="screen-title">{trip.emoji} {trip.name}</h1>
      </div>

      <div className="card">
        <h3>Friends</h3>
        <div>
          {trip.people.map((p) => (
            <span key={p.id} className="chip" style={{ background: p.color, cursor: "default" }}>
              {p.name}
              {!personHasEntries(trip, p.id) && (
                <button
                  aria-label={`Remove ${p.name}`}
                  style={{ border: "none", background: "none", cursor: "pointer", marginLeft: 4 }}
                  onClick={() => dispatch({ type: "removePerson", tripId, personId: p.id })}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input
            placeholder="Add friend…"
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPerson()}
          />
          <button className="btn" onClick={addPerson}>Add</button>
        </div>
      </div>

      {trip.receipts.map((r) => (
        <button
          key={r.id}
          className="card row"
          style={{ width: "100%", border: "none", cursor: "pointer", textAlign: "left" }}
          onClick={() => go({ screen: "receipt", tripId, receiptId: r.id })}
        >
          <span>
            🧾 <b>{r.storeName || "Receipt"}</b> · {formatCents(r.printedTotal, trip.currency)}
            <div className="muted">paid by {payerName(r.paidBy)} · {r.date}</div>
          </span>
          <span className="muted">{badge(r)}</span>
        </button>
      ))}

      <div className="footerbar">
        <button className="btn" style={{ width: "100%", marginBottom: 8 }} disabled={trip.people.length === 0} onClick={addManualReceipt}>
          ✍️ Add items by hand
        </button>
        <button className="btn btn-primary" disabled={trip.receipts.length === 0} onClick={() => go({ screen: "settle", tripId })}>
          💸 Settle up
        </button>
      </div>
    </div>
  );
}
