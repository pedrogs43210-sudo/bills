export type Person = { id: string; name: string; color: string };

export type Assignment =
  | { kind: "unassigned" }
  | { kind: "everyone" }
  | { kind: "people"; personIds: string[] }
  | { kind: "units"; shares: Record<string, number> };

export type Item = {
  id: string;
  name: string;
  quantity: number; // >= 1
  lineTotal: number; // integer cents, negative allowed (discounts)
  assignment: Assignment;
};

export type ReceiptStatus = "review" | "assigning" | "done";

export type Payment = { personId: string; amount: number }; // integer cents

export type Group = { id: string; name: string; personIds: string[] };

export type Receipt = {
  id: string;
  storeName: string;
  date: string; // ISO yyyy-mm-dd
  payments: Payment[]; // at least one; amounts should sum to printedTotal
  items: Item[];
  printedTotal: number; // integer cents
  status: ReceiptStatus;
};

export type Trip = {
  id: string;
  name: string;
  emoji: string;
  currency: string; // ISO 4217, e.g. "EUR"
  people: Person[];
  groups: Group[];
  receipts: Receipt[];
  createdAt: string; // ISO datetime
  schemaVersion: number;
};

export const SCHEMA_VERSION = 2;

export const PERSON_COLORS = [
  "#FFD9A0", "#FFC4B8", "#C9E8C9", "#BFD9FF", "#E8C9F0", "#F5E6A0", "#B8E8E0", "#F0C9C9",
];
