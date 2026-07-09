import type { Trip } from "../types";
import { receiptShares } from "./split";

export type Transfer = { from: string; to: string; amount: number };

/** Receipts whose payer is a trip member; others (corrupt/imported data) are excluded from all math. */
function countableReceipts(trip: Trip) {
  const memberIds = new Set(trip.people.map((p) => p.id));
  return trip.receipts.filter((r) => memberIds.has(r.paidBy));
}

export function paidTotals(trip: Trip): Record<string, number> {
  const paid: Record<string, number> = {};
  for (const p of trip.people) paid[p.id] = 0;
  for (const r of countableReceipts(trip)) paid[r.paidBy] += r.printedTotal;
  return paid;
}

export function shareTotals(trip: Trip): Record<string, number> {
  const shares: Record<string, number> = {};
  for (const p of trip.people) shares[p.id] = 0;
  for (const r of countableReceipts(trip)) {
    for (const [id, share] of Object.entries(receiptShares(r, trip.people))) {
      shares[id] = (shares[id] ?? 0) + share;
    }
  }
  return shares;
}

/** paid minus share per person. Positive = is owed money. Sums to zero. */
export function balances(trip: Trip): Record<string, number> {
  const paid = paidTotals(trip);
  const shares = shareTotals(trip);
  const result: Record<string, number> = {};
  for (const p of trip.people) result[p.id] = (paid[p.id] ?? 0) - (shares[p.id] ?? 0);
  return result;
}

/** Greedy netting: repeatedly match the largest debtor with the largest creditor. */
export function settle(bal: Record<string, number>): Transfer[] {
  const creditors = Object.entries(bal)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => ({ id, v }));
  const debtors = Object.entries(bal)
    .filter(([, v]) => v < 0)
    .map(([id, v]) => ({ id, v: -v }));

  const byAmountDesc = (x: { id: string; v: number }, y: { id: string; v: number }) =>
    y.v - x.v || (x.id < y.id ? -1 : 1);

  const transfers: Transfer[] = [];
  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort(byAmountDesc);
    debtors.sort(byAmountDesc);
    const c = creditors[0];
    const d = debtors[0];
    const amount = Math.min(c.v, d.v);
    transfers.push({ from: d.id, to: c.id, amount });
    c.v -= amount;
    d.v -= amount;
    // balance values are integer cents; exact === 0 termination depends on this
    if (c.v === 0) creditors.shift();
    if (d.v === 0) debtors.shift();
  }
  return transfers;
}
