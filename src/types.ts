/**
 * A note on names. The UI calls these SPLITS; the code calls them TRIPS.
 *
 * Not an oversight. `Trip`, `trips` and `tripId` appear in the JSON on every existing user's phone,
 * so renaming them means a migration — real risk, for a benefit no user can see. The words on
 * screen were the whole point of the rename, and those have changed. See
 * docs/superpowers/specs/2026-08-14-splits-scan-profile-design.md.
 */

import type { DiscountConvention } from "./lib/discounts";

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
  /**
   * True for a line that is printed on the receipt but must not be counted: a discount that
   * the item prices above it already include (Continente's convention). Counting it would
   * subtract the same discount twice. Such a line stays visible — it is on the paper, and
   * hiding it would make the app look like it misread the receipt — but it takes no part in
   * the maths and needs nobody assigned to it. Absent means counted, so every receipt that
   * existed before this flag keeps behaving exactly as it did.
   */
  informational?: boolean;
  /**
   * True for a line the scanner read as a discount rather than something bought. This records
   * what is printed on the paper and never changes; `informational` records the separate
   * decision about whether it counts, which the user can overrule. Both are needed: without
   * this, switching the convention back could only guess which lines were discounts, and a
   * refund is negative too.
   */
  discountLine?: boolean;
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
  /**
   * True while the total is just the items added up, which is how a receipt typed in by
   * hand starts: there is no paper total to copy, so making the user enter one twice is
   * busywork. Typing a total clears this; tapping "Use <sum>" sets it again. Absent on a
   * scanned receipt, whose printed total is what the shop actually charged and must never
   * be quietly rewritten when a misread line is corrected.
   */
  totalIsAuto?: boolean;
  /**
   * Which discount convention the receipt's own arithmetic pointed to when it was scanned,
   * kept so the review screen can say what was decided and offer to overrule it. Absent on a
   * hand-typed receipt and on everything scanned before this existed.
   */
  discountConvention?: DiscountConvention;
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
