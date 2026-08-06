import type { Payment, Receipt } from "../types";

export function paymentsTotal(receipt: Receipt): number {
  return receipt.payments.reduce((s, p) => s + p.amount, 0);
}

/** Person id of the largest payment; ties go to the lowest id so results are deterministic. */
export function primaryPayerId(receipt: Receipt): string | null {
  let best: Payment | null = null;
  for (const p of receipt.payments) {
    const better =
      best === null || p.amount > best.amount || (p.amount === best.amount && p.personId < best.personId);
    if (better) best = p;
  }
  return best === null ? null : best.personId;
}

/** A lone payer always paid the whole receipt — keeps the common case correct with no user effort. */
export function withSyncedSinglePayment(receipt: Receipt): Receipt {
  if (receipt.payments.length !== 1) return receipt;
  const only = receipt.payments[0];
  if (only.amount === receipt.printedTotal) return receipt;
  return { ...receipt, payments: [{ ...only, amount: receipt.printedTotal }] };
}

/** Equal split whose amounts sum exactly to `total`; leftover cents go to the earliest payers. */
export function splitEvenly(total: number, personIds: string[]): Payment[] {
  const ids = [...new Set(personIds)];
  if (ids.length === 0) return [];
  const base = Math.trunc(total / ids.length);
  let leftover = total - base * ids.length;
  const step = leftover >= 0 ? 1 : -1;
  return ids.map((id) => {
    let amount = base;
    if (leftover !== 0) {
      amount += step;
      leftover -= step;
    }
    return { personId: id, amount };
  });
}
