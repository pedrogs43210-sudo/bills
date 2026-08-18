import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/StoreProvider";
import { personHasEntries } from "../state/reducer";
import { newId } from "../lib/ids";
import { formatCents } from "../lib/money";
import { countedItems, isFullyAssigned, isItemAssigned } from "../lib/split";
import { isReservedGroupName } from "../lib/groups";
import { currencyOptions, currencySymbol } from "../lib/currencies";
import { Disc, personVars } from "../components/chips";
import { Footerbar } from "../components/Footerbar";
import { PhotoPicker } from "../components/PhotoPicker";
import { ScanProgressScreen, SCAN_DONE_MS } from "./ScanProgressScreen";
import { loadApiKey } from "../lib/storage";
import { downscaleToBase64Jpeg } from "../lib/image";
import { fetchQuota, lastKnownQuota, scanReceipt, scanTotals, ScanError, usingProxy, type ScanFailure, type ScanQuota } from "../lib/scan";
import { ScanFailedScreen } from "./ScanFailedScreen";
import { countsDiscountLines, discountConvention } from "../lib/discounts";
import { offerAfter, shouldOffer } from "../lib/promo";
import type { View } from "../App";
import type { Person, Receipt } from "../types";
import { excludedReceipts } from "../lib/settle";

export function TripScreen({ tripId, go }: { tripId: string; go: (v: View) => void }) {
  const { data, dispatch } = useStore();
  const trip = data.trips.find((t) => t.id === tripId);
  const [personName, setPersonName] = useState("");
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [scanState, setScanState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [scanMessage, setScanMessage] = useState("");
  const [scanFailure, setScanFailure] = useState<ScanFailure | null>(null);
  const [groupForm, setGroupForm] = useState<{ id: string | null; name: string; personIds: string[] } | null>(null);
  const [quota, setQuota] = useState<ScanQuota | null>(lastKnownQuota());
  const lastPhoto = useRef<File | null>(null);
  // Set when the user cancels the wait: the receipt is still saved, but the navigation is not.
  const abandoned = useRef(false);
  const alive = useRef(true);
  // Asked for on arrival rather than on tap: the scan control is a file input, so the camera
  // opens the instant it is touched. Knowing the answer beforehand is what makes it possible to
  // show the paywall *before* someone photographs a receipt that would be thrown away.
  useEffect(() => {
    if (!usingProxy()) return;
    let stale = false;
    void fetchQuota().then((q) => {
      if (!stale && q) setQuota(q);
    });
    return () => {
      stale = true;
    };
  }, []);
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

  // The scan takes five to twenty seconds. It gets a screen of its own rather than a button
  // whose label changed, which reads as a hang on the app's one impressive moment.
  // A failure gets its own screen for the same reason the wait does: a banner under a trip list
  // says what broke, but not what to do about it, and "try again" is the wrong advice for a photo
  // the model could not read.
  if (scanState === "error") {
    return (
      <ScanFailedScreen
        reason={scanFailure}
        message={scanMessage}
        canRetry={lastPhoto.current !== null}
        onRetry={() => {
          const photo = lastPhoto.current;
          setScanState("idle");
          if (photo) void handlePhoto(photo);
        }}
        onAddByHand={() => {
          setScanState("idle");
          addManualReceipt();
        }}
        onSettings={() => {
          setScanState("idle");
          go({ screen: "profile" });
        }}
        onBack={() => setScanState("idle")}
      />
    );
  }

  if (scanState === "busy" || scanState === "done") {
    return (
      <ScanProgressScreen
        done={scanState === "done"}
        onCancel={() => {
          // The request carries on — its result is still stored if it lands — but the user is
          // no longer held on a screen whose only content is a moving light.
          abandoned.current = true;
          setScanState("idle");
        }}
      />
    );
  }

  async function handlePhoto(file: File) {
    lastPhoto.current = file;
    const apiKey = loadApiKey();
    // Only the user's-own-key path needs a key. With a proxy configured, sending someone to
    // Settings would reinstate the exact wall the proxy exists to remove.
    if (!apiKey && !usingProxy()) {
      go({ screen: "profile" });
      return;
    }
    abandoned.current = false;
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
      // The scanner's currency guess is deliberately ignored. Trips are created in EUR, a
      // misread "USD" turned a Portuguese holiday's money into dollars, and a wrong currency is
      // both alarming and invisible — the digits still look right. If the trip is ever not in
      // euros that is the user's call to make, not a guess from a photograph.
      dispatch({ type: "addReceipt", tripId, receipt });
      if (!alive.current) return; // user left this screen — keep the data, skip the navigation
      const after = lastKnownQuota();
      setQuota(after);
      // The scan that just landed was the last one. Say so on the screen they are about to reach,
      // *after* the items are in front of them — not here, and not before the camera. Someone who
      // has just watched Billy read a crumpled receipt is the best audience it will ever have; the
      // same sentence thirty seconds earlier is an obstacle between them and the thing they came
      // to do.
      if (shouldOffer("last-scan", receipt.id, after)) offerAfter(receipt.id);
      // Same reasoning as leaving the screen: they asked to stop waiting, so the receipt is
      // kept and listed, but they are not dragged into it — and there is nobody to show a tick to.
      if (abandoned.current) {
        setScanState("idle");
        return;
      }
      // A beat on the tick before the items — see ScanProgressScreen.SCAN_DONE_MS.
      setScanState("done");
      await new Promise((r) => setTimeout(r, SCAN_DONE_MS));
      if (!alive.current) return;
      setScanState("idle");
      go({ screen: "receipt", tripId, receiptId: receipt.id });
    } catch (err) {
      if (!alive.current) return;
      if (err instanceof ScanError && err.reason === "out-of-scans") {
        // The allowance went while they were choosing a photo, so send them to the same place
        // they would have gone had we known a moment earlier.
        setScanState("idle");
        setQuota(lastKnownQuota());
        go({ screen: "paywall", tripId });
        return;
      }
      setScanState("error");
      setScanFailure(err instanceof ScanError ? err.reason : null);
      setScanMessage(
        err instanceof ScanError ? err.message : "Something went wrong reading the photo."
      );
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
        {/* Currency lives up here now, as the symbol it sets rather than a labelled row in a card of
            its own. It belongs to the split rather than the phone — the next holiday may be
            somewhere else — but it is chosen once and never touched again, and a full-width picker
            near the bottom gave a decision nobody makes twice the same weight as the receipts.

            A real <select> under an invisible layer, so the phone's own wheel opens: a custom sheet
            would look tidier and be worse, since every Android keyboard and picker already knows
            how to do this one. */}
        <span className="currency-pick">
          <span aria-hidden="true">{currencySymbol(trip.currency)}</span>
          <select
            aria-label={`Currency — currently ${trip.currency}`}
            value={trip.currency}
            onChange={(e) => dispatch({ type: "setCurrency", tripId, currency: e.target.value })}
          >
            {currencyOptions(trip.currency).map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.label}
              </option>
            ))}
          </select>
        </span>
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
              <span key={p.id} className="chip chip-person" style={{ ...personVars(p), cursor: "default" }}>
                <Disc person={p} />
                <button
                  className="chip-inline"
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
                    className="chip-inline chip-inline-end"
                    aria-label={`Remove ${p.name}`}
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
                  "Everyone" is already the button that picks the whole split — pick another name.
                </span>
              )}
              <div style={{ marginTop: 6 }}>
                {trip.people.map((p) => {
                  const on = groupForm.personIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      className={`chip chip-person ${on ? "selected" : ""}`}
                      style={personVars(p)}
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

      {/* One box with its name inside it, like Friends, Groups and Trip settings. The receipts
          were cards of their own under a heading that sat outside — the only section on the screen
          that read differently. They are rows in this card now, each still a whole tap target. */}
      <div className="card">
        <h3>Receipts</h3>
        {trip.receipts.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {trip.people.length === 0
              ? "Add the people you are splitting with first, then scan a receipt."
              : "Nothing yet. Scan one with the camera, or add the items by hand."}
          </p>
        ) : (
          trip.receipts.map((r) => {
            const counted = countedItems(r);
            const assigned = counted.filter(isItemAssigned).length;
            const excluded = excludedIds.has(r.id);
            return (
              <button
                key={r.id}
                /* The amber edge that used to be the card's is now the row's, reaching the box's
                   own edge, so a glance down the list still finds the receipts with work left. */
                className={`receipt-row${excluded ? " receipt-row-todo" : ""}`}
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
          })
        )}
      </div>

      {/* Deleting is the one irreversible thing on this screen, so it gets its own card rather than
          sharing one with a setting. It used to sit inside "Split settings" underneath the currency
          picker, where it read as part of choosing a currency — which is not what it does. */}
      <div className="card">
        <button
          className="btn btn-ghost"
          style={{ width: "100%", color: "var(--warn)" }}
          onClick={() => {
            if (window.confirm(`Delete split "${trip.name}" and all its receipts? This can't be undone.`)) {
              dispatch({ type: "deleteTrip", tripId });
              go({ screen: "trips" });
            }
          }}
        >
          🗑 Delete split
        </button>
      </div>

      <Footerbar>
        {/* Out of scans means a button, not a file input: a file input opens the camera the
            moment it is touched, and the paywall has to come first. */}
        {/* The same pair the Scan tab opens with — see components/PhotoPicker.tsx. Disabled until
            somebody is on the split, because a scanned receipt needs a payer.

            The count rides on the button now. It used to be a separate grey line underneath, which
            read as an afterthought bolted onto the thing it describes despite being the only place
            the price is mentioned before somebody runs out. PhotoPicker also owns the out-of-scans
            state, so the button that cannot scan stops offering to. */}
        <PhotoPicker
          disabled={trip.people.length === 0}
          quota={quota}
          onPick={(f) => void handlePhoto(f)}
          onGetMore={() => go({ screen: "paywall", tripId })}
        />
        <div className="row">
          <button className="btn" style={{ flex: 1 }} disabled={trip.people.length === 0} onClick={addManualReceipt}>
            ✍️ Add items by hand
          </button>
          {/* Only once there is something to be asked about. Inviting friends to tick their items
              on an empty split would send them a link to nothing. */}
          <button
            className="btn"
            style={{ flex: 1 }}
            disabled={trip.receipts.length === 0}
            onClick={() => go({ screen: "invite", tripId })}
          >
            🔗 Invite
          </button>
          <button className="btn" style={{ flex: 1 }} disabled={trip.receipts.length === 0} onClick={() => go({ screen: "settle", tripId })}>
            💸 Settle up
          </button>
        </div>
      </Footerbar>
    </div>
  );
}
