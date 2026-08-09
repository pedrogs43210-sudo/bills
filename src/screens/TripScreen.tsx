import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/StoreProvider";
import { personHasEntries } from "../state/reducer";
import { newId } from "../lib/ids";
import { formatCents } from "../lib/money";
import { countedItems, isFullyAssigned, isItemAssigned } from "../lib/split";
import { isReservedGroupName } from "../lib/groups";
import { Disc } from "../components/chips";
import { loadApiKey } from "../lib/storage";
import { downscaleToBase64Jpeg } from "../lib/image";
import { scanReceipt, scanTotals, ScanError } from "../lib/scan";
import { countsDiscountLines, discountConvention } from "../lib/discounts";
import type { View } from "../App";
import type { Person, Receipt } from "../types";
import { excludedReceipts } from "../lib/settle";

export function TripScreen({ tripId, go }: { tripId: string; go: (v: View) => void }) {
  const { data, dispatch } = useStore();
  const trip = data.trips.find((t) => t.id === tripId);
  const [personName, setPersonName] = useState("");
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [scanState, setScanState] = useState<"idle" | "busy" | "error">("idle");
  const [scanMessage, setScanMessage] = useState("");
  const [groupForm, setGroupForm] = useState<{ id: string | null; name: string; personIds: string[] } | null>(null);
  const lastPhoto = useRef<File | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // groupForm is a snapshot; the friend list can change under it on this very screen.
  // Reconcile it with live data so a removed person can't be saved back into a group.
  useEffect(() => {
    setGroupForm((form) => {
      if (!form || !trip) return form;
      if (trip.people.length < 2) return null; // the Groups card is gated away
      if (form.id !== null && !trip.groups.some((g) => g.id === form.id)) return null; // group pruned away
      const live = form.personIds.filter((id) => trip.people.some((p) => p.id === id));
      return live.length === form.personIds.length ? form : { ...form, personIds: live };
    });
  }, [trip?.people, trip?.groups]);
  if (!trip) return null;

  async function handlePhoto(file: File) {
    lastPhoto.current = file;
    const apiKey = loadApiKey();
    if (!apiKey) {
      go({ screen: "settings" });
      return;
    }
    setScanState("busy");
    try {
      const base64 = await downscaleToBase64Jpeg(file).catch(() => {
        throw new ScanError(
          "unparseable",
          "Couldn't read that photo format — try a JPEG (on iPhone: Settings → Camera → Formats → 'Most Compatible'), or pick a different photo."
        );
      });
      const result = await scanReceipt(apiKey, base64);
      // Work out from the receipt's own arithmetic whether its discounts are separate lines
      // or already inside the item prices. Only in the latter case must they be left out of
      // the maths, or the same discount is subtracted twice.
      const convention = discountConvention(scanTotals(result));
      const discountsAreInformational = !countsDiscountLines(convention);
      const receipt: Receipt = {
        id: newId(),
        storeName: result.storeName,
        date: result.date ?? new Date().toISOString().slice(0, 10),
        payments: [{ personId: trip!.people[0].id, amount: Math.round(result.paidTotal) }],
        items: result.items.map((i) => ({
          id: newId(),
          name: i.name,
          quantity: Math.max(1, Math.round(i.quantity)),
          lineTotal: Math.round(i.lineTotal),
          assignment: { kind: "unassigned" as const },
          ...(i.kind === "discount" ? { discountLine: true } : {}),
          ...(i.kind === "discount" && discountsAreInformational ? { informational: true } : {}),
        })),
        printedTotal: Math.round(result.paidTotal),
        status: "review",
        discountConvention: convention,
      };
      const currency = /^[A-Za-z]{3}$/.test(result.currency) ? result.currency.toUpperCase() : "";
      if (trip!.receipts.length === 0 && currency) {
        dispatch({ type: "setCurrency", tripId, currency });
      }
      dispatch({ type: "addReceipt", tripId, receipt });
      if (!alive.current) return; // user left this screen — keep the data, skip the navigation
      setScanState("idle");
      go({ screen: "receipt", tripId, receiptId: receipt.id });
    } catch (err) {
      if (!alive.current) return;
      setScanState("error");
      setScanMessage(
        err instanceof ScanError ? err.message : "Something went wrong reading the photo."
      );
      if (err instanceof ScanError && err.reason === "bad-key") {
        setScanMessage("The API key was rejected — check it in Settings.");
      }
    }
  }

  function addPerson() {
    const name = personName.trim();
    if (!name) return;
    dispatch({ type: "addPerson", tripId, personId: newId(), name });
    setPersonName("");
  }

  function commitRename(personId: string) {
    const name = editName.trim();
    const current = trip!.people.find((p) => p.id === personId)?.name;
    if (name && name !== current) {
      dispatch({ type: "renamePerson", tripId, personId, name });
    }
    setEditingPersonId(null);
  }

  function saveGroup() {
    if (!groupForm) return;
    const name = groupForm.name.trim();
    if (!name || groupForm.personIds.length === 0 || nameRejected) return;
    if (groupForm.id === null) {
      dispatch({ type: "addGroup", tripId, groupId: newId(), name, personIds: groupForm.personIds });
    } else {
      dispatch({ type: "updateGroup", tripId, groupId: groupForm.id, name, personIds: groupForm.personIds });
    }
    setGroupForm(null);
  }

  function deleteGroup() {
    if (!groupForm || groupForm.id === null) return;
    if (window.confirm("Delete this group? Assignments you already made stay as they are.")) {
      dispatch({ type: "deleteGroup", tripId, groupId: groupForm.id });
      setGroupForm(null);
    }
  }

  function toggleGroupPerson(personId: string) {
    if (!groupForm) return;
    const on = groupForm.personIds.includes(personId);
    setGroupForm({
      ...groupForm,
      personIds: on ? groupForm.personIds.filter((id) => id !== personId) : [...groupForm.personIds, personId],
    });
  }

  function addManualReceipt() {
    const receipt: Receipt = {
      id: newId(),
      storeName: "",
      date: new Date().toISOString().slice(0, 10),
      payments: [{ personId: trip!.people[0].id, amount: 0 }],
      items: [],
      printedTotal: 0,
      status: "review",
      totalIsAuto: true, // nothing was printed, so the items are the total
    };
    dispatch({ type: "addReceipt", tripId, receipt });
    go({ screen: "receipt", tripId, receiptId: receipt.id });
  }

  const duplicateName =
    groupForm !== null &&
    groupForm.name.trim() !== "" &&
    trip.groups.some(
      (g) => g.id !== groupForm.id && g.name.trim().toLowerCase() === groupForm.name.trim().toLowerCase()
    );
  const reservedName = groupForm !== null && isReservedGroupName(groupForm.name);
  const nameRejected = duplicateName || reservedName;

  const payerName = (id: string) => trip.people.find((p) => p.id === id)?.name ?? "?";
  const payerNames = (r: Receipt) => r.payments.map((pay) => payerName(pay.personId)).join(" + ") || "?";
  /**
   * The payers' faces, then their names. The discs are the fast read down a list of receipts;
   * the names stay because this is money and a 22px circle is not proof of anything.
   */
  const payerDiscs = (r: Receipt) => {
    const payers = r.payments
      .map((pay) => trip!.people.find((p) => p.id === pay.personId))
      .filter((p): p is Person => !!p);
    return (
      <>
        {payers.length > 0 && (
          <span className="disc-stack" style={{ verticalAlign: "middle", marginRight: 6 }}>
            {payers.map((p) => (
              <Disc key={p.id} person={p} small />
            ))}
          </span>
        )}
        paid by {payerNames(r)} ·{" "}
      </>
    );
  };
  const excludedIds = new Set(excludedReceipts(trip).map((r) => r.id));
  const badge = (r: Receipt) =>
    excludedIds.has(r.id) ? "⚠️ not counted" :
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
          {trip.people.map((p) =>
            p.id === editingPersonId ? (
              <input
                key={p.id}
                aria-label={`Rename ${p.name}`}
                autoFocus
                style={{ width: 120, display: "inline-block", margin: "3px 6px 3px 0" }}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(p.id);
                  if (e.key === "Escape") setEditingPersonId(null);
                }}
                onBlur={() => commitRename(p.id)}
              />
            ) : (
              <span key={p.id} className="chip chip-person" style={{ background: p.color, borderColor: "transparent", cursor: "default" }}>
                <Disc person={p} />
                <button
                  style={{ all: "unset", cursor: "pointer" }}
                  aria-label={`Rename ${p.name}`}
                  onClick={() => {
                    setEditingPersonId(p.id);
                    setEditName(p.name);
                  }}
                >
                  {p.name}
                </button>
                {!personHasEntries(trip, p.id) && (
                  <button
                    aria-label={`Remove ${p.name}`}
                    style={{ border: "none", background: "none", cursor: "pointer", padding: "8px 10px", margin: "-8px -6px -8px 4px", fontSize: 16 }}
                    onClick={() => dispatch({ type: "removePerson", tripId, personId: p.id })}
                  >
                    ×
                  </button>
                )}
              </span>
            )
          )}
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

      {trip.people.length >= 2 && (
        <div className="card">
          <h3>Groups</h3>
          <p className="muted">Save the sets of people who share things, then assign in one tap.</p>
          <div>
            {trip.groups.map((g) => (
              <button
                key={g.id}
                className={`chip chip-group${g.id === groupForm?.id ? " selected" : ""}`}
                onClick={() => setGroupForm({ id: g.id, name: g.name, personIds: g.personIds })}
              >
                <span className="disc-stack">
                  {trip.people
                    .filter((p) => g.personIds.includes(p.id))
                    .slice(0, 4)
                    .map((p) => (
                      <Disc key={p.id} person={p} small />
                    ))}
                </span>
                {g.name} · {g.personIds.length}
              </button>
            ))}
          </div>
          {groupForm === null ? (
            <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={() => setGroupForm({ id: null, name: "", personIds: [] })}>
              ＋ New group
            </button>
          ) : (
            <div style={{ marginTop: 8 }}>
              <input
                aria-label="Group name"
                placeholder="Group name"
                maxLength={24}
                value={groupForm.name}
                onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && saveGroup()}
              />
              {duplicateName && (
                <span className="muted" style={{ display: "block", color: "var(--warn)" }}>
                  There's already a group with that name.
                </span>
              )}
              {reservedName && (
                <span className="muted" style={{ display: "block", color: "var(--warn)" }}>
                  "Everyone" is already the button that picks the whole trip — pick another name.
                </span>
              )}
              <div style={{ marginTop: 6 }}>
                {trip.people.map((p) => {
                  const on = groupForm.personIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      className={`chip ${on ? "selected" : ""}`}
                      style={{ background: p.color }}
                      aria-label={`${on ? "Remove" : "Add"} ${p.name} ${on ? "from" : "to"} group`}
                      onClick={() => toggleGroupPerson(p.id)}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button
                  className="btn"
                  disabled={!groupForm.name.trim() || groupForm.personIds.length === 0 || nameRejected}
                  onClick={saveGroup}
                >
                  Save group
                </button>
                <button className="btn btn-ghost" onClick={() => setGroupForm(null)}>Cancel</button>
                {groupForm.id !== null && (
                  <button className="btn btn-ghost" style={{ color: "var(--warn)" }} onClick={deleteGroup}>
                    Delete group
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {trip.receipts.map((r) => {
        const counted = countedItems(r);
        const assigned = counted.filter(isItemAssigned).length;
        const excluded = excludedIds.has(r.id);
        return (
          <button
            key={r.id}
            className={`card tap-card${excluded ? " card-todo" : ""}`}
            onClick={() => go({ screen: "receipt", tripId, receiptId: r.id })}
          >
            <span className="row" style={{ alignItems: "flex-start" }}>
              <span style={{ minWidth: 0 }}>
                <b>{r.storeName || "Receipt"}</b>
                <span className="label" style={{ display: "block" }}>
                  {payerDiscs(r)}
                  {r.date}
                </span>
              </span>
              <span className="money-2">{formatCents(r.printedTotal, trip.currency)}</span>
            </span>
            {/* Rule 3 — the same track and fraction as the assign footer and the trip summary. */}
            <span className="row" style={{ marginTop: 8, gap: "var(--s3)" }}>
              {/* An excluded receipt never goes green, however well its items are assigned: a
                  full green bar beside "not counted" says finished next to something that
                  contributes nothing. Amber means there is work left, and there is. */}
              <span
                className={`track${
                  !excluded && counted.length > 0 && assigned === counted.length
                    ? " done"
                    : excluded || assigned === 0
                      ? " none"
                      : ""
                }`}
                style={{ flex: 1 }}
              >
                <span style={{ width: counted.length === 0 ? "0%" : `${(assigned / counted.length) * 100}%` }} />
              </span>
              <span className="micro" style={excluded ? { color: "var(--note)" } : undefined}>{badge(r)}</span>
            </span>
          </button>
        );
      })}

      {scanState === "error" && (
        <div className="banner-warn">
          ⚠️ {scanMessage}{" "}
          <button className="btn btn-ghost" onClick={() => lastPhoto.current && handlePhoto(lastPhoto.current)}>
            Try again
          </button>
        </div>
      )}

      <button
        className="btn btn-ghost"
        style={{ width: "100%", color: "var(--warn)" }}
        onClick={() => {
          if (window.confirm(`Delete trip "${trip.name}" and all its receipts? This can't be undone.`)) {
            dispatch({ type: "deleteTrip", tripId });
            go({ screen: "trips" });
          }
        }}
      >
        🗑 Delete trip
      </button>

      <div className="footerbar">
        <label className="btn btn-primary" style={{ opacity: trip.people.length === 0 ? 0.45 : 1, marginBottom: 8 }}>
          {scanState === "busy" ? "🧾✨ Reading receipt…" : "📸 Scan receipt"}
          <input
            hidden
            type="file"
            accept="image/*"
            aria-label="Scan receipt"
            disabled={trip.people.length === 0 || scanState === "busy"}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handlePhoto(f);
              e.target.value = "";
            }}
          />
        </label>
        <div className="row">
          <button className="btn" style={{ flex: 1 }} disabled={trip.people.length === 0} onClick={addManualReceipt}>
            ✍️ Add items by hand
          </button>
          <button className="btn" style={{ flex: 1 }} disabled={trip.receipts.length === 0} onClick={() => go({ screen: "settle", tripId })}>
            💸 Settle up
          </button>
        </div>
      </div>
    </div>
  );
}
