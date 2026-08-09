import type { Receipt, Trip } from "../types";
import { receiptShares } from "./split";
import { paymentsTotal, primaryPayerId } from "./payments";

export type Transfer = { from: string; to: string; amount: number };

export type ExclusionReason = "no-payer" | "unknown-payer" | "negative-amount";

/** A receipt counts when someone paid, everyone who paid is a member, and no amount is negative. */
function isCountable(receipt: Receipt, memberIds: Set<string>): boolean {
  return (
    receipt.payments.length > 0 &&
    receipt.payments.every((p) => memberIds.has(p.personId) && p.amount >= 0)
  );
}

/**
 * Receipts that count towards trip maths. A receipt is skipped when:
 *  - it has no payments, or any payment is from a non-member — either would let
 *    money escape the people-only balance loop and break the zero-sum invariant;
 *  - any payment amount is negative — nobody can pay a negative amount, so the
 *    receipt is corrupt data and its credits would be meaningless (zero-sum would
 *    actually survive this one; we exclude it because the numbers would be nonsense).
 */
export function countableReceipts(trip: Trip) {
  const memberIds = new Set(trip.people.map((p) => p.id));
  return trip.receipts.filter((r) => isCountable(r, memberIds));
}

/**
 * Receipts left out of the trip maths — malformed payments the user needs to fix.
 * In practice the reachable cause is a negative receipt total: ReviewScreen's
 * `withSyncedSinglePayment` mirrors it onto the lone payment, which then fails the
 * amount >= 0 check above.
 */
export function excludedReceipts(trip: Trip): Receipt[] {
  const memberIds = new Set(trip.people.map((p) => p.id));
  return trip.receipts.filter((r) => !isCountable(r, memberIds));
}

/** Why a receipt is left out of the maths, or null when it counts. Drives what we tell the user. */
export function exclusionReason(receipt: Receipt, trip: Trip): ExclusionReason | null {
  const memberIds = new Set(trip.people.map((p) => p.id));
  if (isCountable(receipt, memberIds)) return null;
  if (receipt.payments.length === 0) return "no-payer";
  if (receipt.payments.some((p) => !memberIds.has(p.personId))) return "unknown-payer";
  return "negative-amount";
}

export function paidTotals(trip: Trip): Record<string, number> {
  const paid: Record<string, number> = {};
  for (const p of trip.people) paid[p.id] = 0;
  for (const r of countableReceipts(trip)) {
    const payer = primaryPayerId(r); // countableReceipts guarantees this is a trip member
    for (const pay of r.payments) paid[pay.personId] += pay.amount;
    // The review screen requires payments to cover the total exactly, so a mismatch
    // only arrives via imported or hand-edited data. The biggest payer absorbs it in
    // either direction, which keeps every receipt contributing exactly printedTotal.
    // An overshoot can therefore credit that payer a negative amount — accepted:
    // the numbers stay balanced, and the receipt is still editable so the user can fix it.
    const shortfall = r.printedTotal - paymentsTotal(r);
    if (shortfall !== 0 && payer !== null) paid[payer] += shortfall;
  }
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
