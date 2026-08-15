import { useEffect, useState } from "react";
import { Footerbar } from "../components/Footerbar";
import { useStore } from "../state/StoreProvider";
import { newId } from "../lib/ids";
import { formatCents, parseToCents } from "../lib/money";
import type { View } from "../App";
import type { Item, Payment, Receipt } from "../types";
import { paymentsTotal, splitEvenly, withSyncedSinglePayment } from "../lib/payments";
import { countedItemsTotal } from "../lib/split";
import { applyConvention, conventionSentence } from "../lib/discounts";

function MoneyInput({ cents, onChange, label }: { cents: number; onChange: (c: number) => void; label: string }) {
  const [text, setText] = useState((cents / 100).toFixed(2));
  useEffect(() => setText((cents / 100).toFixed(2)), [cents]);
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      className="money-field"
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

  /**
   * Save an edit. While the total is automatic it is re-derived from the items, so a
   * hand-typed receipt adds itself up; the lone payer's amount follows either way.
   */
  const update = (r: Receipt) => {
    const synced = r.totalIsAuto
      ? { ...r, printedTotal: countedItemsTotal(r) }
      : r;
    dispatch({ type: "updateReceipt", tripId, receipt: withSyncedSinglePayment(synced) });
  };
  const updateItem = (item: Item) =>
    update({ ...receipt, items: receipt.items.map((i) => (i.id === item.id ? item : i)) });

  const itemSum = countedItemsTotal(receipt);
  const diff = receipt.printedTotal - itemSum;
  // The convention band speaks about the discount lines the scanner found, so a receipt typed
  // by hand — which has no discount lines and no verdict — says nothing at all.
  const discountLines = receipt.items.filter((i) => i.discountLine);
  const countingDiscounts = !discountLines.some((i) => i.informational);

  const payments = receipt.payments;
  const payTotal = paymentsTotal(receipt);
  const isMember = (personId: string) => trip.people.some((p) => p.id === personId);
  const unknownPayer = payments.some((p) => !isMember(p.personId));
  const negativeAmount = payments.some((p) => p.amount < 0);
  // A lone payer's amount is implicit (it tracks the total) so it always covers; the
  // settle maths let that payer absorb any difference, so the receipt still contributes
  // exactly printedTotal. Anything that would make settlement silently drop the whole
  // receipt — nobody paying, an unknown payer, a negative amount — must not count as covered.
  const arithmeticOk = payments.length === 1 || payTotal === receipt.printedTotal;
  const covered = payments.length > 0 && !unknownPayer && !negativeAmount && arithmeticOk;
  const negativeTotal = receipt.printedTotal < 0;
  const personName = (id: string) => trip.people.find((p) => p.id === id)?.name ?? "?";

  const setPayments = (next: Payment[]) => update({ ...receipt, payments: next });

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
            {/* Arithmetic can pass while `covered` is still false (a negative or unknown payer) —
                say nothing reassuring here; the banner below names the real blocker. */}
            {arithmeticOk
              ? covered
                ? " ✓"
                : ""
              : ` — tap Split evenly, or edit the amounts, so ${payments.map((p) => personName(p.personId)).join(" + ")} add up.`}
          </div>
        )}
      </div>

      {discountLines.length > 0 && receipt.discountConvention && (
        <div className={receipt.discountConvention === "mismatch" ? "banner-warn" : "banner-good"} role="status">
          {receipt.discountConvention === "mismatch" && "⚠️ "}
          {conventionSentence(receipt.discountConvention, discountLines.length, countingDiscounts)}{" "}
          <button
            className="btn btn-ghost"
            style={{ padding: "2px 6px" }}
            onClick={() =>
              update({
                ...receipt,
                discountConvention: countingDiscounts ? "discounts-included" : "discounts-separate",
                items: applyConvention(receipt.items, countingDiscounts ? "discounts-included" : "discounts-separate"),
              })
            }
          >
            {countingDiscounts ? "Already included →" : "Count them →"}
          </button>
        </div>
      )}

      <div className="card">
        {receipt.items.map((item) => (
          // Two lines rather than four columns: a real item name is "Pecorino sardo stagionato
          // 24 mesi", which had about 90px to live in. The name gets the width; the numbers and
          // the bin sit underneath, where the price can be right-aligned and tabular.
          <div key={item.id} className={`item-row${item.informational ? " item-inactive" : ""}`}>
            <input
              placeholder="Item name"
              aria-label={`${item.name || "new item"} name`}
              value={item.name}
              onChange={(e) => updateItem({ ...item, name: e.target.value })}
            />
            <div className="row" style={{ marginTop: 6 }}>
              <QuantityInput
                label={`${item.name} quantity`}
                quantity={item.quantity}
                onChange={(q) => updateItem({ ...item, quantity: q, assignment: { kind: "unassigned" } })}
              />
              <div className="row" style={{ gap: 0 }}>
                <MoneyInput label={`${item.name} price`} cents={item.lineTotal} onChange={(c) => updateItem({ ...item, lineTotal: c })} />
                <button
                  className="btn btn-ghost"
                  aria-label="Remove item"
                  onClick={() => update({ ...receipt, items: receipt.items.filter((i) => i.id !== item.id) })}
                >
                  🗑
                </button>
              </div>
            </div>
            {item.informational && (
              <span className="micro" style={{ display: "block", marginTop: 2 }}>
                Not counted — already in the prices above
              </span>
            )}
          </div>
        ))}
        <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={addItem}>＋ Add item</button>
      </div>

      <div className="card row">
        <b>Receipt total</b>
        <MoneyInput
          label="Receipt total"
          cents={receipt.printedTotal}
          onChange={(c) => update({ ...receipt, printedTotal: c, totalIsAuto: false })}
        />
      </div>
      {receipt.totalIsAuto && (
        <p className="muted" style={{ margin: "-4px 0 8px" }}>
          Added up from the items — type your own total if the receipt says something different.
        </p>
      )}

      {diff === 0 ? (
        <div className="banner-good">✓ Matches the receipt total ({formatCents(itemSum, trip.currency)})</div>
      ) : (
        <div className="banner-warn">
          ⚠️ Items sum to {formatCents(itemSum, trip.currency)} — off by {formatCents(diff, trip.currency)}.{" "}
          {itemSum >= 0 ? (
            <>
              <button
                className="btn btn-ghost"
                onClick={() => update({ ...receipt, printedTotal: itemSum, totalIsAuto: true })}
              >
                Use {formatCents(itemSum, trip.currency)}
              </button>{" "}
              or fix a line — otherwise the biggest payer absorbs the difference.
            </>
          ) : (
            "Fix a line — otherwise the biggest payer absorbs the difference."
          )}
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
        <div className="banner-warn">
          {payments.length === 1
            ? "⚠️ This receipt's payment amount is negative — re-pick who paid to reset it."
            : "⚠️ A payer's amount can't be negative — check the amounts."}
        </div>
      )}
      {unknownPayer && (
        <div className="banner-warn">⚠️ Someone who paid isn't in this split any more — pick who paid.</div>
      )}

      <Footerbar>
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
      </Footerbar>
    </div>
  );
}
