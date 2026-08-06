import { useEffect, useState } from "react";
import { useStore } from "../state/StoreProvider";
import { newId } from "../lib/ids";
import { formatCents, parseToCents } from "../lib/money";
import type { View } from "../App";
import type { Item, Payment, Receipt } from "../types";
import { paymentsTotal, splitEvenly, withSyncedSinglePayment } from "../lib/payments";

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

  const payments = receipt.payments;
  const payTotal = paymentsTotal(receipt);
  const isMember = (personId: string) => trip.people.some((p) => p.id === personId);
  const unknownPayer = payments.some((p) => !isMember(p.personId));
  const negativeAmount = payments.some((p) => p.amount < 0);
  // A lone payer's amount is implicit (it tracks the total) so it always covers; the
  // settle maths let that payer absorb any difference, so the receipt still contributes
  // exactly printedTotal. Anything that would make settlement silently drop the whole
  // receipt — nobody paying, an unknown payer, a negative amount — must not count as covered.
  const covered =
    payments.length > 0 &&
    !unknownPayer &&
    !negativeAmount &&
    (payments.length === 1 || payTotal === receipt.printedTotal);
  const negativeTotal = receipt.printedTotal < 0;
  const personName = (id: string) => trip.people.find((p) => p.id === id)?.name ?? "?";

  const setPayments = (next: Payment[]) => update(withSyncedSinglePayment({ ...receipt, payments: next }));

  /** People selectable in one row: the current payer, plus anyone not already paying. */
  const selectablePeople = (currentId: string) =>
    trip.people.filter((p) => p.id === currentId || !payments.some((pay) => pay.personId === p.id));

  // A function declaration (unlike the const arrow helpers above) isn't narrowed by the
  // `if (!trip || !receipt) return null;` guard above — TS treats it as callable from
  // anywhere in scope, so the assertions here are genuinely needed.
  function addPayer() {
    const next = trip!.people.find((p) => !payments.some((pay) => pay.personId === p.id));
    if (!next) return;
    setPayments(splitEvenly(receipt!.printedTotal, [...payments.map((p) => p.personId), next.id]));
  }

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
        <button
          className="btn btn-ghost"
          aria-label="Delete receipt"
          onClick={() => {
            if (window.confirm("Delete this receipt? This can't be undone.")) {
              dispatch({ type: "deleteReceipt", tripId, receiptId });
              go({ screen: "trip", tripId });
            }
          }}
        >
          🗑
        </button>
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
        <h3 style={{ marginTop: 8 }}>Paid by</h3>
        {payments.length === 0 ? (
          <div className="row" style={{ padding: "4px 0" }}>
            <select
              aria-label="Payer 1"
              value=""
              onChange={(e) => setPayments([{ personId: e.target.value, amount: receipt.printedTotal }])}
            >
              <option value="" disabled>Nobody yet — pick a payer</option>
              {trip.people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        ) : (
          payments.map((pay, index) => (
            <div key={pay.personId} className="row" style={{ padding: "4px 0" }}>
              <select
                aria-label={`Payer ${index + 1}`}
                value={isMember(pay.personId) ? pay.personId : ""}
                onChange={(e) =>
                  setPayments(payments.map((p) => (p.personId === pay.personId ? { ...p, personId: e.target.value } : p)))
                }
              >
                {!isMember(pay.personId) && <option value="" disabled>Nobody yet — pick a payer</option>}
                {selectablePeople(pay.personId).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {payments.length > 1 && (
                <>
                  <MoneyInput
                    label={`Payer ${index + 1} amount`}
                    cents={pay.amount}
                    onChange={(c) =>
                      setPayments(payments.map((p) => (p.personId === pay.personId ? { ...p, amount: c } : p)))
                    }
                  />
                  <button
                    className="btn btn-ghost"
                    aria-label={`Remove payer ${index + 1}`}
                    onClick={() => setPayments(payments.filter((p) => p.personId !== pay.personId))}
                  >
                    🗑
                  </button>
                </>
              )}
            </div>
          ))
        )}
        <div className="row" style={{ marginTop: 8 }}>
          {payments.length > 0 && (
            <button className="btn" disabled={payments.length >= trip.people.length} onClick={addPayer}>
              ＋ Add another payer
            </button>
          )}
          {payments.length > 1 && (
            <button
              className="btn"
              onClick={() => setPayments(splitEvenly(receipt.printedTotal, payments.map((p) => p.personId)))}
            >
              Split evenly
            </button>
          )}
        </div>
        {payments.length > 1 && (
          <div role="status" className={covered ? "banner-good" : "banner-warn"} style={{ marginTop: 8 }}>
            Payers cover {formatCents(payTotal, trip.currency)} of {formatCents(receipt.printedTotal, trip.currency)}
            {covered ? " ✓" : ` — tap Split evenly, or edit the amounts, so ${payments.map((p) => personName(p.personId)).join(" + ")} add up.`}
          </div>
        )}
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
        <MoneyInput
          label="Receipt total"
          cents={receipt.printedTotal}
          onChange={(c) => update(withSyncedSinglePayment({ ...receipt, printedTotal: c }))}
        />
      </div>

      {diff === 0 ? (
        <div className="banner-good">✓ Matches the receipt total ({formatCents(itemSum, trip.currency)})</div>
      ) : (
        <div className="banner-warn">
          ⚠️ Items sum to {formatCents(itemSum, trip.currency)} — off by {formatCents(diff, trip.currency)}.{" "}
          {itemSum >= 0 && (
            <>
              <button
                className="btn btn-ghost"
                onClick={() => update(withSyncedSinglePayment({ ...receipt, printedTotal: itemSum }))}
              >
                Use {formatCents(itemSum, trip.currency)}
              </button>{" "}
            </>
          )}
          or fix a line — otherwise the biggest payer absorbs the difference.
        </div>
      )}

      {negativeTotal && (
        <div className="banner-warn">
          ⚠️ A receipt total can't be negative — check the item prices.
        </div>
      )}
      {/* For a lone payer the amount always mirrors the total (withSyncedSinglePayment), so
          when the total is already negative this would just repeat the same warning. */}
      {negativeAmount && !(payments.length === 1 && negativeTotal) && (
        <div className="banner-warn">⚠️ A payer's amount can't be negative — check the amounts.</div>
      )}
      {unknownPayer && (
        <div className="banner-warn">⚠️ Someone who paid isn't in this trip any more — pick who paid.</div>
      )}

      <div className="footerbar">
        <button
          className="btn btn-primary"
          disabled={receipt.items.length === 0 || !covered || negativeTotal}
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
