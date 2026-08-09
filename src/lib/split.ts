import type { Item, Person, Receipt } from "../types";
import { primaryPayerId } from "./payments";

/**
 * The lines that take part in the money. One definition, used by the split maths, the
 * "items match the total" check and the assign screen's outstanding count, so those three
 * can never disagree about which lines count.
 */
export function countedItems(receipt: Receipt): Item[] {
  return receipt.items.filter((i) => !i.informational);
}

/** Sum of the lines that count, which is what a receipt's total should match. */
export function countedItemsTotal(receipt: Receipt): number {
  return countedItems(receipt).reduce((s, i) => s + i.lineTotal, 0);
}

export function isItemAssigned(item: Item): boolean {
  const a = item.assignment;
  if (a.kind === "unassigned") return false;
  if (a.kind === "people") return a.personIds.length > 0;
  if (a.kind === "units") {
    const units = Object.values(a.shares).reduce((s, u) => s + u, 0);
    return units === item.quantity && units > 0;
  }
  return true; // everyone
}

export function isFullyAssigned(receipt: Receipt): boolean {
  // An informational line has nobody to assign, so requiring it would make the receipt
  // impossible to finish.
  return countedItems(receipt).every(isItemAssigned);
}

/** Exact (possibly fractional) cent shares of a receipt's assigned items. */
function exactShares(receipt: Receipt, people: Person[]): Map<string, number> {
  const shares = new Map<string, number>();
  const memberIds = new Set(people.map((p) => p.id));
  for (const p of people) shares.set(p.id, 0);
  const add = (id: string, amount: number) => {
    if (!memberIds.has(id)) return; // unknown ids (corrupt/imported data) — payer absorbs via printedTotal step
    shares.set(id, (shares.get(id) ?? 0) + amount);
  };

  // Skip informational lines explicitly rather than relying on them being unassigned: a
  // discount line can carry an assignment inherited before it was marked informational, and
  // that stale assignment would otherwise credit a discount that was already in the prices.
  for (const item of countedItems(receipt)) {
    const a = item.assignment;
    if (a.kind === "everyone") {
      for (const p of people) add(p.id, item.lineTotal / people.length);
    } else if (a.kind === "people" && a.personIds.length > 0) {
      for (const id of a.personIds) add(id, item.lineTotal / a.personIds.length);
    } else if (a.kind === "units") {
      for (const [id, units] of Object.entries(a.shares)) {
        add(id, (item.lineTotal * units) / item.quantity);
      }
    }
  }
  return shares;
}

/**
 * Round fractional cent shares to integers that sum to round(total).
 * Largest fractional remainder gets the leftover cents first; ties favor tieBreakId.
 */
export function roundLargestRemainder(
  exact: Map<string, number>,
  tieBreakId?: string
): Map<string, number> {
  const entries = [...exact.entries()];
  const target = Math.round(entries.reduce((s, [, v]) => s + v, 0));
  const parts = entries.map(([id, v]) => ({ id, floor: Math.floor(v), rem: v - Math.floor(v) }));
  let leftover = target - parts.reduce((s, p) => s + p.floor, 0);

  const byRemainder = [...parts].sort((x, y) => {
    if (y.rem !== x.rem) return y.rem - x.rem;
    if (x.id === tieBreakId) return -1;
    if (y.id === tieBreakId) return 1;
    return x.id < y.id ? -1 : 1;
  });

  const result = new Map(parts.map((p) => [p.id, p.floor]));
  for (const p of byRemainder) {
    if (leftover <= 0) break;
    result.set(p.id, (result.get(p.id) ?? 0) + 1);
    leftover--;
  }
  return result;
}

/**
 * Integer-cent share per person for one receipt. Sums exactly to printedTotal:
 * assigned items are rounded with largest-remainder, and the biggest payer absorbs
 * any difference between the item sum and the printed total (spec §6).
 * A receipt with no payments, or whose biggest payer is not a trip member, has no
 * absorber and so does not sum to printedTotal; such receipts are excluded from
 * trip maths by `countableReceipts` in settle.ts.
 */
export function receiptShares(receipt: Receipt, people: Person[]): Record<string, number> {
  const payer = primaryPayerId(receipt);
  const isMember = payer !== null && people.some((p) => p.id === payer);
  const rounded = roundLargestRemainder(exactShares(receipt, people), isMember ? payer : undefined);
  const assignedSum = [...rounded.values()].reduce((s, v) => s + v, 0);
  const diff = receipt.printedTotal - assignedSum;
  if (isMember) rounded.set(payer, (rounded.get(payer) ?? 0) + diff);
  return Object.fromEntries(rounded);
}
