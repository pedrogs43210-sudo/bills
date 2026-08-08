import { SCHEMA_VERSION, type Group, type Payment, type Person, type Receipt, type Trip } from "../types";
import { unreserveGroupName } from "./groups";

const KNOWN_CONVENTIONS = new Set(["discounts-separate", "discounts-included", "no-discounts", "mismatch"]);

/**
 * Convert one stored receipt to the current shape.
 * v1 receipts carry `paidBy`; v2 receipts carry `payments`.
 */
function migrateReceipt(raw: unknown): Receipt {
  if (!raw || typeof raw !== "object") throw new Error("Unrecognisable receipt");
  const source = { ...(raw as Record<string, unknown>) };
  if (!Number.isInteger(source.printedTotal)) {
    throw new Error("Receipt total is not a whole number of cents");
  }
  const printedTotal = source.printedTotal as number;

  let payments: Payment[];
  if (Array.isArray(source.payments)) {
    // Entries are load-bearing for the money maths, so drop anything unusable.
    // An empty result is allowed: spec §8 keeps such a receipt visible and editable
    // while settlement excludes it.
    const usable = source.payments.filter(
      (p): p is Payment =>
        !!p &&
        typeof p === "object" &&
        typeof (p as Payment).personId === "string" &&
        Number.isInteger((p as Payment).amount)
    );
    // Duplicate rows for the same person are hand-edited/imported mistakes: keep the
    // first entry only, so the review screen never renders two rows for one person.
    const seen = new Set<string>();
    payments = usable.filter((p) => (seen.has(p.personId) ? false : (seen.add(p.personId), true)));
  } else if (typeof source.paidBy === "string") {
    payments = [{ personId: source.paidBy, amount: printedTotal }];
  } else {
    throw new Error("Receipt has neither payments nor paidBy");
  }

  delete source.paidBy;

  // `informational` decides whether a line counts towards the split, so only a literal true
  // may set it. Anything else is dropped, which means counted — the behaviour every receipt
  // had before the flag existed, and the safer way to be wrong.
  if (Array.isArray(source.items)) {
    source.items = source.items.map((raw) => {
      if (!raw || typeof raw !== "object") return raw;
      const item = { ...(raw as Record<string, unknown>) };
      if (item.informational !== true) delete item.informational;
      // Same rule for the discount marker: it decides what the convention toggle may touch,
      // so a stray value must not turn an ordinary item into one the toggle can silently
      // drop from the maths.
      if (item.discountLine !== true) delete item.discountLine;
      return item;
    });
  }
  // Only ever read back to explain a decision on screen, so an unrecognised value is dropped
  // rather than trusted.
  if (!KNOWN_CONVENTIONS.has(source.discountConvention as string)) delete source.discountConvention;

  return { ...(source as unknown as Receipt), printedTotal, payments };
}

/** Groups are a convenience layer; drop anything unusable rather than risk a crash or a ghost member. */
function migrateGroups(raw: unknown, people: Person[]): Group[] {
  if (!Array.isArray(raw)) return [];
  const memberIds = new Set(people.map((p) => p?.id));
  return raw
    .filter(
      (g): g is Group =>
        !!g &&
        typeof g === "object" &&
        typeof (g as Group).id === "string" &&
        typeof (g as Group).name === "string" &&
        (g as Group).name.trim().length > 0 &&
        Array.isArray((g as Group).personIds)
    )
    .map((g) => {
      // Duplicate rows for the same person are hand-edited/imported mistakes: keep the
      // first entry only, mirroring how migrateReceipt de-dupes payments.
      const seen = new Set<string>();
      const personIds: string[] = [];
      for (const id of g.personIds) {
        if (typeof id === "string" && memberIds.has(id) && !seen.has(id)) {
          seen.add(id);
          personIds.push(id);
        }
      }
      // A group named "Everyone" would be indistinguishable from the assign screen's own
      // Everyone chip, so rename it rather than discard members the user chose deliberately.
      return { ...g, name: unreserveGroupName(g.name), personIds };
    })
    .filter((g) => g.personIds.length > 0); // an emptied group is deleted, matching the prune rule
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
    groups: migrateGroups(trip.groups, (trip.people ?? []) as Person[]),
    receipts: (trip.receipts as unknown[]).map(migrateReceipt),
    schemaVersion: SCHEMA_VERSION,
  };
}
