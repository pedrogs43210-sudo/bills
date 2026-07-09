import { useState } from "react";
import { useStore } from "../state/StoreProvider";
import { formatCents } from "../lib/money";
import { isFullyAssigned, isItemAssigned } from "../lib/split";
import type { View } from "../App";
import type { Assignment, Item, Person } from "../types";

function assignmentSummary(item: Item, people: Person[]): string {
  const a = item.assignment;
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? "?";
  if (a.kind === "everyone") return "👥 Everyone";
  if (a.kind === "people" && a.personIds.length > 0) return a.personIds.map(name).join(", ");
  if (a.kind === "units") {
    const parts = Object.entries(a.shares).filter(([, u]) => u > 0);
    if (parts.length > 0) return parts.map(([id, u]) => `${name(id)} ×${u}`).join(", ");
  }
  return "Tap to assign";
}

export function AssignScreen({ tripId, receiptId, go }: { tripId: string; receiptId: string; go: (v: View) => void }) {
  const { data, dispatch } = useStore();
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [unitsMode, setUnitsMode] = useState(false);
  const trip = data.trips.find((t) => t.id === tripId);
  const receipt = trip?.receipts.find((r) => r.id === receiptId);
  if (!trip || !receipt) return null;

  const setAssignment = (itemId: string, assignment: Assignment) =>
    dispatch({ type: "setAssignment", tripId, receiptId, itemId, assignment });

  /** Assign an item; a directly-following unassigned discount line inherits the same assignment (spec §7). */
  function assign(item: Item, assignment: Assignment) {
    setAssignment(item.id, assignment);
    const idx = receipt!.items.findIndex((i) => i.id === item.id);
    const next = receipt!.items[idx + 1];
    if (next && next.lineTotal < 0 && next.assignment.kind === "unassigned") {
      setAssignment(next.id, assignment);
    }
  }

  function togglePerson(item: Item, personId: string) {
    const a = item.assignment;
    const current = a.kind === "people" ? a.personIds : [];
    const next = current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId];
    assign(item, next.length === 0 ? { kind: "unassigned" } : { kind: "people", personIds: next });
  }

  function bumpUnits(item: Item, personId: string, delta: number) {
    const shares = item.assignment.kind === "units" ? { ...item.assignment.shares } : {};
    const assigned = Object.values(shares).reduce((s, u) => s + u, 0);
    const next = Math.max(0, (shares[personId] ?? 0) + delta);
    if (delta > 0 && assigned >= item.quantity) return; // no over-assignment
    shares[personId] = next;
    if (next === 0) delete shares[personId];
    assign(item, Object.keys(shares).length === 0 ? { kind: "unassigned" } : { kind: "units", shares });
  }

  const unassignedCount = receipt.items.filter((i) => !isItemAssigned(i)).length;

  return (
    <div>
      <div className="topbar">
        <button className="btn btn-ghost" aria-label="Back" onClick={() => go({ screen: "trip", tripId })}>←</button>
        <h1 className="screen-title">Who got what?</h1>
        <button
          className="btn btn-ghost"
          onClick={() => {
            dispatch({ type: "setReceiptStatus", tripId, receiptId, status: "review" });
            go({ screen: "receipt", tripId, receiptId });
          }}
        >
          ✏️ Edit items
        </button>
      </div>

      {receipt.items.map((item) => {
        const open = openItemId === item.id;
        const a = item.assignment;
        const unitsAssigned = a.kind === "units" ? Object.values(a.shares).reduce((s, u) => s + u, 0) : 0;
        return (
          <div key={item.id} className="card" style={!isItemAssigned(item) ? { outline: "2px dashed #ffb347" } : undefined}>
            <button
              style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
              aria-label={`${item.quantity > 1 ? `${item.quantity}× ` : ""}${item.name}, ${formatCents(item.lineTotal, trip.currency)}`}
              onClick={() => {
                setOpenItemId(open ? null : item.id);
                setUnitsMode(false);
              }}
            >
              <span className="row" style={{ display: "flex" }}>
                <span>{item.quantity > 1 ? `${item.quantity}× ` : ""}<span>{item.name}</span></span>
                <b>{formatCents(item.lineTotal, trip.currency)}</b>
              </span>
              <span className="muted" style={{ display: "block" }}>{assignmentSummary(item, trip.people)}</span>
            </button>

            {open && !unitsMode && (
              <div style={{ marginTop: 8 }}>
                {trip.people.map((p) => {
                  const selected = a.kind === "people" && a.personIds.includes(p.id);
                  return (
                    <button key={p.id} className={`chip ${selected ? "selected" : ""}`} style={{ background: p.color }}
                      onClick={() => togglePerson(item, p.id)}>
                      {p.name}
                    </button>
                  );
                })}
                <button className={`chip ${a.kind === "everyone" ? "selected" : ""}`}
                  onClick={() => {
                    assign(item, a.kind === "everyone" ? { kind: "unassigned" } : { kind: "everyone" });
                    setOpenItemId(null);
                  }}>
                  👥 Everyone
                </button>
                {item.quantity > 1 && (
                  <button className="chip" onClick={() => setUnitsMode(true)}>🔢 Split units</button>
                )}
              </div>
            )}

            {open && unitsMode && (
              <div style={{ marginTop: 8 }}>
                {trip.people.map((p) => {
                  const units = a.kind === "units" ? a.shares[p.id] ?? 0 : 0;
                  return (
                    <div key={p.id} className="row" style={{ padding: "4px 0" }}>
                      <span className="chip" style={{ background: p.color, cursor: "default" }}>{p.name}</span>
                      <span>
                        <button className="chip" aria-label={`Fewer units for ${p.name}`} onClick={() => bumpUnits(item, p.id, -1)}>−</button>
                        <b style={{ margin: "0 8px" }}>{units}</b>
                        <button className="chip" aria-label={`More units for ${p.name}`} onClick={() => bumpUnits(item, p.id, +1)}>＋</button>
                      </span>
                    </div>
                  );
                })}
                <div className="muted">{unitsAssigned} of {item.quantity} units assigned</div>
              </div>
            )}
          </div>
        );
      })}

      <div className="footerbar">
        <div className="muted" style={{ textAlign: "center", marginBottom: 6 }}>
          {unassignedCount === 0
            ? "All assigned 🎉"
            : `${unassignedCount} of ${receipt.items.length} items unassigned`}
        </div>
        <button
          className="btn btn-primary"
          disabled={!isFullyAssigned(receipt)}
          onClick={() => {
            dispatch({ type: "setReceiptStatus", tripId, receiptId, status: "done" });
            go({ screen: "settle", tripId });
          }}
        >
          Done → Settle up
        </button>
      </div>
    </div>
  );
}
