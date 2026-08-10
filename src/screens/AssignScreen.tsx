import { useState } from "react";
import { useStore } from "../state/StoreProvider";
import { formatCents } from "../lib/money";
import { countedItems, isFullyAssigned, isItemAssigned } from "../lib/split";
import { receiptSummaryText } from "../lib/summary";
import { shareOrCopy } from "../lib/share";
import type { View } from "../App";
import type { Assignment, Item, Person } from "../types";
import { ActionChip, GroupChip, PersonChip, personVars } from "../components/chips";
import { Footerbar } from "../components/Footerbar";

/** Order-insensitive set comparison, for highlighting a group chip that matches the assignment. */
function sameMembers(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
}

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
  const [receiptShared, setReceiptShared] = useState(false);
  const trip = data.trips.find((t) => t.id === tripId);
  const receipt = trip?.receipts.find((r) => r.id === receiptId);
  if (!trip || !receipt) return null;

  const setAssignment = (itemId: string, assignment: Assignment) =>
    dispatch({ type: "setAssignment", tripId, receiptId, itemId, assignment });

  /**
   * Assign an item. A directly-following discount line (negative total) follows along:
   * it inherits when unassigned or still mirroring the parent's previous assignment,
   * and stops following once the user manually diverges it (spec §7).
   */
  function assign(item: Item, assignment: Assignment) {
    setAssignment(item.id, assignment);
    const idx = receipt!.items.findIndex((i) => i.id === item.id);
    const next = receipt!.items[idx + 1];
    // An informational discount is already inside the price above it, so it must not follow
    // anyone: crediting it would subtract the same discount a second time.
    if (!next || next.lineTotal >= 0 || next.informational) return;
    const follows =
      next.assignment.kind === "unassigned" ||
      JSON.stringify(next.assignment) === JSON.stringify(item.assignment);
    if (follows) setAssignment(next.id, assignment);
  }

  /** Trip members for a list of ids, in trip order, so a group's discs read consistently. */
  function membersOf(personIds: string[]): Person[] {
    return trip!.people.filter((p) => personIds.includes(p.id));
  }

  function togglePerson(item: Item, personId: string) {
    const a = item.assignment;
    // "Everyone" shows every name highlighted, so untapping one has to mean
    // "everyone except them" rather than "only them".
    const current =
      a.kind === "people" ? a.personIds : a.kind === "everyone" ? trip!.people.map((p) => p.id) : [];
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

  const countedTotal = countedItems(receipt).length;
  const unassignedCount = countedItems(receipt).filter((i) => !isItemAssigned(i)).length;
  const assignedCount = countedTotal - unassignedCount;

  return (
    <div>
      <div className="topbar">
        <button className="btn btn-ghost" aria-label="Back" onClick={() => go({ screen: "trip", tripId })}>←</button>
        <h1 className="screen-title">Who got what?</h1>
        {/* Icon only, like Back and Share either side of it: an emoji with a word beside it
            read as a third kind of button in a row of two, and pushed the title off centre. */}
        <button
          className="btn btn-ghost"
          aria-label="Edit items"
          title="Edit items"
          onClick={() => {
            dispatch({ type: "setReceiptStatus", tripId, receiptId, status: "review" });
            go({ screen: "receipt", tripId, receiptId });
          }}
        >
          ✏️
        </button>
        <button
          className="btn btn-ghost"
          aria-label="Share receipt"
          onClick={async () => {
            const outcome = await shareOrCopy(receiptSummaryText(trip, receipt));
            if (outcome === "copied") {
              setReceiptShared(true);
              setTimeout(() => setReceiptShared(false), 2000);
            }
          }}
        >
          {receiptShared ? "✅" : "📤"}
        </button>
      </div>

      {receipt.items.map((item) => {
        const open = openItemId === item.id;
        const a = item.assignment;
        const unitsAssigned = a.kind === "units" ? Object.values(a.shares).reduce((s, u) => s + u, 0) : 0;
        // Shown because it is on the paper, but there is nobody to assign it to.
        if (item.informational) {
          return (
            <div key={item.id} className="card card-inactive">
              <span className="row" style={{ display: "flex" }}>
                <span className="label">{item.name}</span>
                <span className="money-2 label">{formatCents(item.lineTotal, trip.currency)}</span>
              </span>
              <span className="micro" style={{ display: "block", marginTop: 2 }}>
                Already in the prices above — not counted
              </span>
            </div>
          );
        }
        return (
          <div key={item.id} className={`card${!isItemAssigned(item) ? " card-todo" : ""}`}>
            <button
              className="tap-block"
              aria-label={`${item.quantity > 1 ? `${item.quantity}× ` : ""}${item.name}, ${formatCents(item.lineTotal, trip.currency)}`}
              onClick={() => {
                setOpenItemId(open ? null : item.id);
                setUnitsMode(false);
              }}
            >
              <span className="row" style={{ display: "flex", alignItems: "flex-start" }}>
                <span style={{ minWidth: 0 }}>{item.name}</span>
                <span className="money-2">{formatCents(item.lineTotal, trip.currency)}</span>
              </span>
              <span className="row" style={{ display: "flex", alignItems: "flex-start", marginTop: 2 }}>
                <span className="muted" style={{ minWidth: 0 }}>{assignmentSummary(item, trip.people)}</span>
                {item.quantity > 1 && (
                  <span className="muted">
                    ×{item.quantity} · {formatCents(Math.round(item.lineTotal / item.quantity), trip.currency)} each
                  </span>
                )}
              </span>
            </button>

            {open && !unitsMode && (
              <div style={{ marginTop: 8 }}>
                {trip.people.map((p) => (
                  // Everyone highlights every name, so a group or Everyone tap can be
                  // narrowed to "all except them" by untapping one.
                  <PersonChip
                    key={p.id}
                    person={p}
                    selected={a.kind === "everyone" || (a.kind === "people" && a.personIds.includes(p.id))}
                    onClick={() => togglePerson(item, p.id)}
                  />
                ))}
                {trip.groups
                  .filter((g) => g.personIds.length > 0)
                  .map((g) => (
                    <GroupChip
                      key={g.id}
                      label={g.name}
                      members={membersOf(g.personIds)}
                      selected={a.kind === "people" && sameMembers(a.personIds, g.personIds)}
                      onClick={() => {
                        // Copy, so later edits to the group can never rewrite this assignment.
                        // The panel stays open: the members light up, so dropping one of them
                        // ("Breakfast except Ana") is the next tap rather than a fresh start.
                        assign(item, { kind: "people", personIds: [...g.personIds] });
                      }}
                    />
                  ))}
                {/* Everyone is a collective noun too, so it takes the group shape and shows
                    the whole trip's faces rather than a generic emoji. */}
                <GroupChip
                  label="Everyone"
                  members={trip.people}
                  selected={a.kind === "everyone"}
                  onClick={() => {
                    // Stays open so a name can be untapped for "everyone except them".
                    assign(item, a.kind === "everyone" ? { kind: "unassigned" } : { kind: "everyone" });
                  }}
                />
                {item.quantity > 1 && (
                  <ActionChip onClick={() => setUnitsMode(true)}>🔢 Split units</ActionChip>
                )}
              </div>
            )}

            {open && unitsMode && (
              <div style={{ marginTop: 8 }}>
                {a.kind !== "units" && a.kind !== "unassigned" && (
                  <span className="muted" style={{ display: "block", marginBottom: 4 }}>
                    Splitting by units replaces the current assignment.
                  </span>
                )}
                {trip.people.map((p) => {
                  const units = a.kind === "units" ? a.shares[p.id] ?? 0 : 0;
                  return (
                    <div key={p.id} className="row" style={{ padding: "4px 0" }}>
                      <span className="chip chip-person" style={{ ...personVars(p), cursor: "default" }}>{p.name}</span>
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

      <Footerbar>
        {/* Rule 3 — the same track and the same fraction as the receipt row and the trip. */}
        <div className={`track${unassignedCount === 0 ? " done" : assignedCount === 0 ? " none" : ""}`}>
          <span style={{ width: countedTotal === 0 ? "0%" : `${(assignedCount / countedTotal) * 100}%` }} />
        </div>
        <div className="muted" style={{ textAlign: "center", margin: "6px 0" }}>
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
      </Footerbar>
    </div>
  );
}
