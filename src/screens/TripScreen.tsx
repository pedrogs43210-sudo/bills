import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/StoreProvider";
import { personHasEntries } from "../state/reducer";
import { newId } from "../lib/ids";
import { formatCents } from "../lib/money";
import { isFullyAssigned } from "../lib/split";
import { loadApiKey } from "../lib/storage";
import { downscaleToBase64Jpeg } from "../lib/image";
import { scanReceipt, ScanError } from "../lib/scan";
import type { View } from "../App";
import type { Receipt } from "../types";

export function TripScreen({ tripId, go }: { tripId: string; go: (v: View) => void }) {
  const { data, dispatch } = useStore();
  const trip = data.trips.find((t) => t.id === tripId);
  const [personName, setPersonName] = useState("");
  const [scanState, setScanState] = useState<"idle" | "busy" | "error">("idle");
  const [scanMessage, setScanMessage] = useState("");
  const lastPhoto = useRef<File | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
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
      const receipt: Receipt = {
        id: newId(),
        storeName: result.storeName,
        date: result.date ?? new Date().toISOString().slice(0, 10),
        paidBy: trip!.people[0].id,
        items: result.items.map((i) => ({
          id: newId(),
          name: i.name,
          quantity: Math.max(1, Math.round(i.quantity)),
          lineTotal: Math.round(i.lineTotal),
          assignment: { kind: "unassigned" as const },
        })),
        printedTotal: Math.round(result.printedTotal),
        status: "review",
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
                  style={{ border: "none", background: "none", cursor: "pointer", padding: "8px 10px", margin: "-8px -6px -8px 4px", fontSize: 16 }}
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
            <span className="muted" style={{ display: "block" }}>paid by {payerName(r.paidBy)} · {r.date}</span>
          </span>
          <span className="muted">{badge(r)}</span>
        </button>
      ))}

      {scanState === "error" && (
        <div className="banner-warn">
          ⚠️ {scanMessage}{" "}
          <button className="btn btn-ghost" onClick={() => lastPhoto.current && handlePhoto(lastPhoto.current)}>
            Try again
          </button>
        </div>
      )}

      <div className="footerbar">
        <label className="btn btn-primary" style={{ display: "block", textAlign: "center", opacity: trip.people.length === 0 ? 0.45 : 1, marginBottom: 8 }}>
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
