import { PERSON_COLORS, SCHEMA_VERSION } from "../types";
import type { Assignment, Receipt, ReceiptStatus, Trip } from "../types";
import type { AppData } from "../lib/storage";

export type Action =
  | { type: "createTrip"; id: string; name: string; emoji: string }
  | { type: "deleteTrip"; tripId: string }
  | { type: "addPerson"; tripId: string; personId: string; name: string }
  | { type: "renamePerson"; tripId: string; personId: string; name: string }
  | { type: "removePerson"; tripId: string; personId: string }
  | { type: "addReceipt"; tripId: string; receipt: Receipt }
  | { type: "updateReceipt"; tripId: string; receipt: Receipt }
  | { type: "deleteReceipt"; tripId: string; receiptId: string }
  | { type: "setAssignment"; tripId: string; receiptId: string; itemId: string; assignment: Assignment }
  /* Several items to the same people in one go. One action rather than a loop of the single
     one, so the whole selection lands in a single state change and a single save — and so
     that a half-applied selection is not a state the app can be interrupted in. */
  | { type: "setAssignments"; tripId: string; receiptId: string; itemIds: string[]; assignment: Assignment }
  | { type: "setReceiptStatus"; tripId: string; receiptId: string; status: ReceiptStatus }
  | { type: "setCurrency"; tripId: string; currency: string }
  | { type: "importTrip"; trip: Trip }
  | { type: "addGroup"; tripId: string; groupId: string; name: string; personIds: string[] }
  | { type: "updateGroup"; tripId: string; groupId: string; name: string; personIds: string[] }
  | { type: "deleteGroup"; tripId: string; groupId: string };

/** True if removing this person would orphan data (they paid, are assigned, or an everyone-split exists). */
export function personHasEntries(trip: Trip, personId: string): boolean {
  return trip.receipts.some(
    (r) =>
      r.payments.some((pay) => pay.personId === personId) ||
      r.items.some((i) => {
        const a = i.assignment;
        if (a.kind === "everyone") return true;
        if (a.kind === "people") return a.personIds.includes(personId);
        if (a.kind === "units") return personId in a.shares;
        return false;
      })
  );
}

function mapTrip(data: AppData, tripId: string, fn: (t: Trip) => Trip): AppData {
  return { ...data, trips: data.trips.map((t) => (t.id === tripId ? fn(t) : t)) };
}

function mapReceipt(trip: Trip, receiptId: string, fn: (r: Receipt) => Receipt): Trip {
  return { ...trip, receipts: trip.receipts.map((r) => (r.id === receiptId ? fn(r) : r)) };
}

export function reducer(data: AppData, action: Action): AppData {
  switch (action.type) {
    case "createTrip":
      return {
        ...data,
        trips: [
          ...data.trips,
          {
            id: action.id, name: action.name, emoji: action.emoji, currency: "EUR",
            people: [], groups: [], receipts: [], createdAt: new Date().toISOString(),
            schemaVersion: SCHEMA_VERSION,
          },
        ],
      };
    case "deleteTrip":
      return { ...data, trips: data.trips.filter((t) => t.id !== action.tripId) };
    case "addPerson":
      return mapTrip(data, action.tripId, (t) => {
        const used = new Set(t.people.map((p) => p.color));
        const color =
          PERSON_COLORS.find((c) => !used.has(c)) ??
          PERSON_COLORS[t.people.length % PERSON_COLORS.length];
        return {
          ...t,
          people: [...t.people, { id: action.personId, name: action.name, color }],
        };
      });
    case "renamePerson":
      return mapTrip(data, action.tripId, (t) => ({
        ...t,
        people: t.people.map((p) => (p.id === action.personId ? { ...p, name: action.name } : p)),
      }));
    case "removePerson":
      return mapTrip(data, action.tripId, (t) =>
        personHasEntries(t, action.personId)
          ? t // blocked — UI should disable the button; reducer is the last line of defense
          : {
              ...t,
              people: t.people.filter((p) => p.id !== action.personId),
              // group membership is not a money entry, so it never blocks removal — it just prunes
              groups: t.groups
                .map((g) => ({ ...g, personIds: g.personIds.filter((id) => id !== action.personId) }))
                .filter((g) => g.personIds.length > 0),
            }
      );
    case "addReceipt":
      return mapTrip(data, action.tripId, (t) => ({ ...t, receipts: [...t.receipts, action.receipt] }));
    case "updateReceipt":
      return mapTrip(data, action.tripId, (t) => mapReceipt(t, action.receipt.id, () => action.receipt));
    case "deleteReceipt":
      return mapTrip(data, action.tripId, (t) => ({
        ...t,
        receipts: t.receipts.filter((r) => r.id !== action.receiptId),
      }));
    case "setAssignment":
      return mapTrip(data, action.tripId, (t) =>
        mapReceipt(t, action.receiptId, (r) => ({
          ...r,
          items: r.items.map((i) => (i.id === action.itemId ? { ...i, assignment: action.assignment } : i)),
        }))
      );
    case "setAssignments": {
      const ids = new Set(action.itemIds);
      if (ids.size === 0) return data;
      return mapTrip(data, action.tripId, (t) =>
        mapReceipt(t, action.receiptId, (r) => ({
          ...r,
          items: r.items.map((i) => (ids.has(i.id) ? { ...i, assignment: action.assignment } : i)),
        }))
      );
    }
    case "setReceiptStatus":
      return mapTrip(data, action.tripId, (t) =>
        mapReceipt(t, action.receiptId, (r) => ({ ...r, status: action.status }))
      );
    case "setCurrency":
      return mapTrip(data, action.tripId, (t) => ({ ...t, currency: action.currency }));
    case "importTrip": {
      const exists = data.trips.some((t) => t.id === action.trip.id);
      return {
        ...data,
        trips: exists
          ? data.trips.map((t) => (t.id === action.trip.id ? action.trip : t))
          : [...data.trips, action.trip],
      };
    }
    case "addGroup":
      return mapTrip(data, action.tripId, (t) => ({
        ...t,
        groups: [...t.groups, { id: action.groupId, name: action.name, personIds: action.personIds }],
      }));
    case "updateGroup":
      return mapTrip(data, action.tripId, (t) => ({
        ...t,
        groups: t.groups.map((g) =>
          g.id === action.groupId ? { ...g, name: action.name, personIds: action.personIds } : g
        ),
      }));
    case "deleteGroup":
      return mapTrip(data, action.tripId, (t) => ({
        ...t,
        groups: t.groups.filter((g) => g.id !== action.groupId),
      }));
  }
}
