import { SCHEMA_VERSION, type Group, type Payment, type Receipt, type Trip } from "../types";

/**
 * Convert one stored receipt to the current shape.
 * v1 receipts carry `paidBy`; v2 receipts carry `payments`.
 */
function migrateReceipt(raw: unknown): Receipt {
  if (!raw || typeof raw !== "object") throw new Error("Unrecognisable receipt");
  const source = { ...(raw as Record<string, unknown>) };
  const printedTotal = typeof source.printedTotal === "number" ? source.printedTotal : 0;

  let payments: Payment[];
  if (Array.isArray(source.payments)) {
    payments = source.payments as Payment[];
  } else if (typeof source.paidBy === "string") {
    payments = [{ personId: source.paidBy, amount: printedTotal }];
  } else {
    throw new Error("Receipt has neither payments nor paidBy");
  }

  delete source.paidBy;
  return { ...(source as unknown as Receipt), printedTotal, payments };
}

/**
 * Convert one stored trip to the current shape. Throws when the input is not
 * recognisably a trip, so callers can route it to their corrupt-data path.
 */
export function migrateTrip(raw: unknown): Trip {
  if (
    !raw ||
    typeof raw !== "object" ||
    typeof (raw as Trip).id !== "string" ||
    typeof (raw as Trip).name !== "string" ||
    !Array.isArray((raw as Trip).people) ||
    !Array.isArray((raw as Trip).receipts)
  ) {
    throw new Error("Not a Bills trip");
  }
  const trip = raw as Trip & { groups?: unknown };
  return {
    ...trip,
    groups: (Array.isArray(trip.groups) ? trip.groups : []) as Group[],
    receipts: (trip.receipts as unknown[]).map(migrateReceipt),
    schemaVersion: SCHEMA_VERSION,
  };
}
