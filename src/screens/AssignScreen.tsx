import { useEffect, useState } from "react";
import { useStore } from "../state/StoreProvider";
import { formatCents } from "../lib/money";
import { countedItems, isFullyAssigned, isItemAssigned } from "../lib/split";
import { receiptSummaryText } from "../lib/summary";
import { shareOrCopy } from "../lib/share";
import type { View } from "../App";
import type { Assignment, Item, Person } from "../types";
import { ActionChip, GroupChip, PersonChip, personVars } from "../components/chips";
import { Footerbar } from "../components/Footerbar";
import { assignTargets, sameMembers, sharedAssignment, sharedPeople, togglePersonFor } from "../lib/assigning";
import { useLongPress } from "../lib/useLongPress";
import { onBackIntercept } from "../lib/backIntercept";

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
  /** The items picked out by holding one and tapping the rest. Empty means ordinary tapping. */
  const [picked, setPicked] = useState<string[]>([]);
  const trip = data.trips.find((t) => t.id === tripId);
  const receipt = trip?.receipts.find((r) => r.id === receiptId);

  // Holding an item by mistake has to be undoable with the gesture people already use for undo,
  // so back clears the selection before it means "leave the receipt".
  const picking = picked.length > 0;
  useEffect(
    () =>
      onBackIntercept(() => {
        if (picked.length === 0) return false;
        setPicked([]);
        return true;
      }),
    [picked.length]
  );

  // The bar grows into a panel of chips when a selection starts, and on a long receipt that can
  // cover the very item just held. Nudge it back into sight rather than leaving someone looking at
  // a gap where the thing they picked used to be.
  useEffect(() => {
    if (picked.length !== 1) return;
    const card = document.querySelector(".card-picked");
    const bar = document.querySelector(".footerbar");
    if (!card || !bar) return;
    const hidden = card.getBoundingClientRect().bottom - bar.getBoundingClientRect().top;
    if (hidden > 0) window.scrollBy({ top: hidden + 12, behavior: "smooth" });
  }, [picked.length]);

  if (!trip || !receipt) return null;

  /**
   * Assign one or more items, in a single change.
   *
   * A directly-following discount line comes along for the ride — it inherits while unassigned or
   * still mirroring its parent, and stops following once someone assigns it by hand (spec §7).
   * Which items that means is worked out from the receipt as it is now, before anything is
   * written, so a selection of ten behaves exactly as ten separate taps would have.
   */
  function assignMany(items: Item[], assignment: Assignment) {
    const itemIds = assignTargets(receipt!, items.map((i) => i.id));
    dispatch({ type: "setAssignments", tripId, receiptId, itemIds, assignment });
  }

  const assign = (item: Item, assignment: Assignment) => assignMany([item], assignment);

  /** Trip members for a list of ids, in trip order, so a group's discs read consistently. */
  function membersOf(personIds: string[]): Person[] {
    return trip!.people.filter((p) => personIds.includes(p.id));
  }

  /**
   * The names, the saved groups and Everyone — the one panel of chips.
   *
   * Written once and given a list of items, so one item and a selection of twelve are the same
   * code and cannot drift apart. A chip lights up only when *every* item in the list has that
   * assignment, which is the honest reading when there is more than one.
   */
  function chipPanel(items: Item[], options?: { units?: Item }) {
    const shared = sharedAssignment(items);
    const people = sharedPeople(items, trip!.people);
    const unitsItem = options?.units;
    return (
      <>
        {trip!.people.map((p) => (
          // Everyone highlights every name, so a group or Everyone tap can be narrowed to
          // "all except them" by untapping one.
          <PersonChip key={p.id} person={p} selected={people.includes(p.id)} onClick={() => togglePerson(items, p.id)} />
        ))}
        {trip!.groups
          .filter((g) => g.personIds.length > 0)
          .map((g) => (
            <GroupChip
              key={g.id}
              label={g.name}
              members={membersOf(g.personIds)}
              selected={shared?.kind === "people" && sameMembers(shared.personIds, g.personIds)}
              onClick={() => {
                // Copy, so later edits to the group can never rewrite this assignment. The panel
                // stays open: the members light up, so dropping one of them ("Breakfast except
                // Ana") is the next tap rather than a fresh start.
                assignMany(items, { kind: "people", personIds: [...g.personIds] });
              }}
            />
          ))}
        {/* Everyone is a collective noun too, so it takes the group shape and shows the whole
            trip's faces rather than a generic emoji. */}
        <GroupChip
          label="Everyone"
          members={trip!.people}
          selected={shared?.kind === "everyone"}
          onClick={() => {
            // Stays open so a name can be untapped for "everyone except them".
            assignMany(items, shared?.kind === "everyone" ? { kind: "unassigned" } : { kind: "everyone" });
          }}
        />
        {/* Units are a property of one line's quantity, so this appears for a single item only. */}
        {unitsItem && unitsItem.quantity > 1 && (
          <ActionChip onClick={() => setUnitsMode(true)}>🔢 Split units</ActionChip>
        )}
      </>
    );
  }

  /**
   * Tap a name. One item or a whole selection go through the same rule: "Everyone" shows every
   * name highlighted, so untapping one means "everyone except them" rather than "only them".
   */
  function togglePerson(items: Item[], personId: string) {
    assignMany(items, togglePersonFor(items, personId, trip!.people));
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

  /* Only lines that can be assigned to somebody can be picked: an informational discount is
     already inside the prices above it and belongs to nobody. */
  const pickable = receipt.items.filter((i) => !i.informational);
  const pickedItems = pickable.filter((i) => picked.includes(i.id));
  const pickedTotal = pickedItems.reduce((sum, i) => sum + i.lineTotal, 0);
  /* Picked items that are not assigned the same way are the one thing the chips cannot show
     honestly, so the panel says it in words rather than highlighting one of the two truths. */
  const pickedDiffer = pickedItems.length > 1 && sharedAssignment(pickedItems) === null;

  function togglePicked(item: Item) {
    setPicked((current) =>
      current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]
    );
  }

  /* Hold to pick, tap to open — or, once anything is picked, tap to pick as well, because a
     selection you cannot add to with a tap is a selection of one. */
  const press = useLongPress<Item>(
    (item) => {
      setOpenItemId(null);
      setUnitsMode(false);
      togglePicked(item);
    },
    (item) => {
      if (picking) {
        togglePicked(item);
        return;
      }
      setOpenItemId(openItemId === item.id ? null : item.id);
      setUnitsMode(false);
    }
  );

  return (
    <div>
      {/* While items are picked the bar belongs to the selection: leaving it is the first thing
          back should do, and editing or sharing the receipt mid-selection means nothing. */}
      {picking ? (
        <div className="topbar">
          <button className="btn btn-ghost" aria-label="Cancel selection" onClick={() => setPicked([])}>✕</button>
          <h1 className="screen-title">{picked.length} selected</h1>
          <button
            className="btn btn-ghost"
            aria-label="Select every item"
            title="Select every item"
            onClick={() => setPicked(pickable.map((i) => i.id))}
          >
            ☑
          </button>
        </div>
      ) : (
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
      )}

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
        const isPicked = picked.includes(item.id);
        return (
          <div
            key={item.id}
            className={`card${!isItemAssigned(item) ? " card-todo" : ""}${isPicked ? " card-picked" : ""}`}
          >
            {isPicked && <span className="card-tick" aria-hidden="true">✓</span>}
            <button
              className="tap-block"
              aria-label={`${item.quantity > 1 ? `${item.quantity}× ` : ""}${item.name}, ${formatCents(item.lineTotal, trip.currency)}`}
              /* A toggle only while a selection is running; the rest of the time it is a button
                 that opens a panel, and announcing it as pressed would be a lie. */
              aria-pressed={picking ? isPicked : undefined}
              {...press(item)}
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
              <div style={{ marginTop: 8 }}>{chipPanel([item], { units: item })}</div>
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

      {/* The bar carries whichever job is in hand: the receipt's progress, or the selection's
          people. Same place, same chips as a single item — there is nothing new to learn. */}
      <Footerbar>
        {picking ? (
          <>
            {/* What is picked and the way out share one row: the panel of chips below is tall
                enough already without two more lines above it. */}
            <div className="row" style={{ marginBottom: "var(--s2)" }}>
              <span style={{ minWidth: 0 }}>
                <b>
                  {picked.length} item{picked.length === 1 ? "" : "s"}
                </b>{" "}
                · <span className="money-2">{formatCents(pickedTotal, trip.currency)}</span>
              </span>
              {/* Thumb-height, because the ✕ that does the same thing is in the far top corner. */}
              <button className="btn" style={{ flex: "none" }} onClick={() => setPicked([])}>
                Done
              </button>
            </div>
            {pickedDiffer && (
              <div className="muted" style={{ marginBottom: "var(--s2)" }}>
                These aren't assigned the same way yet — the first name you tap sets it for all {picked.length}.
              </div>
            )}
            {/* Capped, because eight people and three groups would otherwise be a panel taller
                than the list it is meant to be assigning. */}
            <div className="chip-scroll">{chipPanel(pickedItems)}</div>
          </>
        ) : (
          <>
            {/* Rule 3 — the same track and the same fraction as the receipt row and the trip. */}
            <div className={`track${unassignedCount === 0 ? " done" : assignedCount === 0 ? " none" : ""}`}>
              <span style={{ width: countedTotal === 0 ? "0%" : `${(assignedCount / countedTotal) * 100}%` }} />
            </div>
            <div className="muted" style={{ textAlign: "center", margin: "6px 0 2px" }}>
              {unassignedCount === 0
                ? "All assigned 🎉"
                : `${unassignedCount} of ${receipt.items.length} items unassigned`}
            </div>
            {/* The gesture is invisible otherwise, and this is the one place someone is looking
                while wondering whether they have to do this twelve times. */}
            {pickable.length > 1 && (
              <div className="muted" style={{ textAlign: "center", marginBottom: "var(--s2)" }}>
                Hold an item to pick several at once
              </div>
            )}
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
          </>
        )}
      </Footerbar>
    </div>
  );
}
