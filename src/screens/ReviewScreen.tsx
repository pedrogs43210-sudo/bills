import { useEffect, useState } from "react";
import { useStore } from "../state/StoreProvider";
import { newId } from "../lib/ids";
import { formatCents, parseToCents } from "../lib/money";
import type { View } from "../App";
import type { Item, Receipt } from "../types";

function MoneyInput({ cents, onChange, label }: { cents: number; onChange: (c: number) => void; label: string }) {
  const [text, setText] = useState((cents / 100).toFixed(2));
  useEffect(() => setText((cents / 100).toFixed(2)), [cents]);
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      style={{ width: 90, textAlign: "right" }}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = parseToCents(text);
        if (parsed !== null) onChange(parsed);
        else setText((cents / 100).toFixed(2));
      }}
    />
  );
}

function QuantityInput({ quantity, onChange, label }: { quantity: number; onChange: (q: number) => void; label: string }) {
  const [text, setText] = useState(String(quantity));
  useEffect(() => setText(String(quantity)), [quantity]);
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      style={{ width: 52, textAlign: "center" }}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const q = parseInt(text, 10);
        if (Number.isFinite(q) && q >= 1 && q !== quantity) onChange(q);
        else setText(String(quantity));
      }}
    />
  );
}

export function ReviewScreen({ tripId, receiptId, go }: { tripId: string; receiptId: string; go: (v: View) => void }) {
  const { data, dispatch } = useStore();
  const trip = data.trips.find((t) => t.id === tripId);
  const receipt = trip?.receipts.find((r) => r.id === receiptId);
  if (!trip || !receipt) return null;

  const update = (r: Receipt) => dispatch({ type: "updateReceipt", tripId, receipt: r });
  const updateItem = (item: Item) =>
    update({ ...receipt, items: receipt.items.map((i) => (i.id === item.id ? item : i)) });

  const itemSum = receipt.items.reduce((s, i) => s + i.lineTotal, 0);
  const diff = receipt.printedTotal - itemSum;

  function addItem() {
    update({
      ...receipt!,
      items: [...receipt!.items, { id: newId(), name: "", quantity: 1, lineTotal: 0, assignment: { kind: "unassigned" } }],
    });
  }

  return (
    <div>
      <div className="topbar">
        <button className="btn btn-ghost" aria-label="Back" onClick={() => go({ screen: "trip", tripId })}>←</button>
        <h1 className="screen-title">Check the receipt</h1>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <input
            placeholder="Store name"
            value={receipt.storeName}
            onChange={(e) => update({ ...receipt, storeName: e.target.value })}
          />
          <input
            type="date"
            style={{ width: 150 }}
            value={receipt.date}
            onChange={(e) => update({ ...receipt, date: e.target.value })}
          />
        </div>
        <label className="muted">
          Paid by{" "}
          <select value={receipt.paidBy} onChange={(e) => update({ ...receipt, paidBy: e.target.value })}>
            {trip.people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="card">
        {receipt.items.map((item) => (
          <div key={item.id} className="item-row row">
            <input
              placeholder="Item name"
              aria-label={`${item.name || "new item"} name`}
              value={item.name}
              onChange={(e) => updateItem({ ...item, name: e.target.value })}
            />
            <QuantityInput
              label={`${item.name} quantity`}
              quantity={item.quantity}
              onChange={(q) => updateItem({ ...item, quantity: q, assignment: { kind: "unassigned" } })}
            />
            <MoneyInput label={`${item.name} price`} cents={item.lineTotal} onChange={(c) => updateItem({ ...item, lineTotal: c })} />
            <button
              className="btn btn-ghost"
              aria-label="Remove item"
              onClick={() => update({ ...receipt, items: receipt.items.filter((i) => i.id !== item.id) })}
            >
              🗑
            </button>
          </div>
        ))}
        <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={addItem}>＋ Add item</button>
      </div>

      <div className="card row">
        <b>Receipt total</b>
        <MoneyInput label="Receipt total" cents={receipt.printedTotal} onChange={(c) => update({ ...receipt, printedTotal: c })} />
      </div>

      {diff === 0 ? (
        <div className="banner-good">✓ Matches the receipt total ({formatCents(itemSum, trip.currency)})</div>
      ) : (
        <div className="banner-warn">
          ⚠️ Items sum to {formatCents(itemSum, trip.currency)} — off by {formatCents(diff, trip.currency)}. Fix a line or continue and the payer absorbs the difference.
        </div>
      )}

      <div className="footerbar">
        <button
          className="btn btn-primary"
          disabled={receipt.items.length === 0}
          onClick={() => {
            dispatch({ type: "setReceiptStatus", tripId, receiptId, status: "assigning" });
            go({ screen: "receipt", tripId, receiptId });
          }}
        >
          Looks right →
        </button>
      </div>
    </div>
  );
}
