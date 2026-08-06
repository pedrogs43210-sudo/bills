# Bills v2 — Design Spec

**Date:** 2026-08-06
**Status:** Approved pending user review
**Builds on:** `docs/superpowers/specs/2026-07-08-receipt-splitter-design.md` (v1, shipped and live on GitHub Pages)

## 1. Why

Three problems found during the first real holiday use of the app:

1. Some receipts print a total that excludes the discounts, so the scanned items (which include negative discount lines) legitimately sum to less than the printed total. The app flags a discrepancy and makes the payer absorb it — the user needs a fast way to say "the items are right, use their sum".
2. Receipts are sometimes paid by two people (part cash, part card). v1 records exactly one payer.
3. The same subsets of people share items over and over, and selecting them individually on every line is tiring.

## 2. Decisions made during brainstorming

| Question | Decision |
|---|---|
| Fixing a wrong total | One-tap button in the mismatch banner that adopts the items' sum. Printed total is kept as a scan cross-check; manual entry still works. |
| Multiple payers | Explicit amount per payer (covers uneven cash/card splits), with a "split evenly" shortcut. |
| Faster assigning | Named groups the user creates and manages (not auto-inferred combos). |
| Data safety | Saved-data version bumped to 2 with an automatic converter, applied on load **and** on import so v1 backup files still work. |

## 3. Non-goals (v2)

- No multi-currency support (still one currency per trip).
- No groups shared across trips (groups belong to a trip, like people).
- No payment-method labels (cash/card/MB Way) — only who paid and how much.
- No group creation from inside the assign screen (create/edit on the trip screen).
- No undo/history.

## 4. Data model changes

```ts
// NEW
export type Payment = { personId: string; amount: number }; // integer cents
export type Group = { id: string; name: string; personIds: string[] };

// CHANGED
export type Receipt = {
  id: string;
  storeName: string;
  date: string;
  payments: Payment[];   // replaces `paidBy: string`
  items: Item[];
  printedTotal: number;
  status: ReceiptStatus;
};

export type Trip = {
  // …unchanged fields…
  groups: Group[];       // new
};

export const SCHEMA_VERSION = 2; // was 1
```

Invariants:

- **A receipt has at least one payment.** A receipt whose `payments` is empty is treated as corrupt data and excluded from all trip math.
- **Payments should sum to `printedTotal`.** The UI enforces this before a receipt can leave the review screen; the math layer additionally guarantees it (§6) so imported or hand-edited data can never break settlement.
- All amounts remain integer cents.

## 5. Migration (v1 → v2)

New module `src/lib/migrate.ts`, exporting `migrateTrip(raw: unknown): Trip`:

- **Receipts:** if `payments` is an array, keep it (already v2). Otherwise, if `paidBy` is a string, produce `payments: [{ personId: paidBy, amount: printedTotal }]`. If neither is present, throw — the caller's corrupt-data path handles it.
- **Trip:** `groups` becomes `[]` when absent or not an array.
- **Version:** the returned trip carries `schemaVersion: 2`.
- Anything not recognisable as a trip (missing `id`/`name`/`people`/`receipts`) throws.

Wiring:

- `loadData()` parses as today, then: rejects data whose `schemaVersion` is **greater** than `SCHEMA_VERSION` (future version — routed to the existing corrupt path: raw string backed up to `bills.data.v1.corrupt`, app starts empty); maps every trip through `migrateTrip`; and when the stored version was older, writes the upgraded data straight back so the conversion happens once.
- `importTrip()` runs the parsed trip through `migrateTrip` before its existing shape validation, so v1 export files (the backups taken before this update) import correctly.
- The `localStorage` key stays `bills.data.v1` — it identifies the app's storage slot, not the schema; the version inside the payload is what matters. Renaming it would orphan existing data.

## 6. Payment maths

New module `src/lib/payments.ts`:

| Function | Behaviour |
|---|---|
| `paymentsTotal(receipt)` | Sum of `payments[].amount`. |
| `primaryPayerId(receipt)` | Person id of the largest payment; ties broken by lowest `personId` (lexicographic) for determinism; `null` when there are no payments. |
| `withSyncedSinglePayment(receipt)` | If there is exactly one payment, returns the receipt with that payment's `amount` set to `printedTotal`; otherwise returns it unchanged. Keeps the single-payer case correct with zero user effort. Applied on **every** change to `printedTotal` (typing a total, the one-tap items'-sum fix, and receipt creation), not only on the button. |
| `splitEvenly(printedTotal, personIds)` | Equal split using the existing `roundLargestRemainder` helper, so the returned payments sum **exactly** to `printedTotal`. |

Changes to existing maths (spec v1 §8 otherwise unchanged):

- `split.ts` — `receiptShares` used `receipt.paidBy` for the rounding tie-break and as the absorber of any item-sum vs printed-total difference. Both become `primaryPayerId(receipt)`; when it is `null`, no absorber is applied (the receipt is already excluded from trip maths).
- `settle.ts` — `paidTotals` credits each payment to its person. For each countable receipt, any difference between `printedTotal` and `paymentsTotal` is credited to the primary payer, so **every receipt contributes exactly `printedTotal` of "paid"** and trip balances still sum to zero.
- `settle.ts` — `countableReceipts` now excludes a receipt when `payments` is empty or **any** payment references a non-member, mirroring the v1 rule that protected the zero-sum invariant.
- `reducer.ts` — `personHasEntries` treats a person as having entries when any receipt payment references them (replacing the `paidBy` check). Group membership does **not** count as an entry.

## 7. Screens

### Review screen (`ReviewScreen.tsx`)

**Total fix.** The mismatch banner gains a button reading `Use <items' sum>` which sets `printedTotal` to the items' sum (and, through `withSyncedSinglePayment`, keeps a lone payer's amount in step). The banner then shows the existing green "✓ Matches" state.

**Payments.** The single `Paid by` select becomes a payments list:

- **One payer (default):** a person select, no amount field. The amount is implicit and always equals `printedTotal`. This is v1 behaviour with no extra taps.
- **`+ Add another payer`:** adds a row for the first person not already paying and re-splits the total across all payers via `splitEvenly`, so coverage stays satisfied immediately and the user only has to adjust if the real split was uneven. Each row then shows a person select, an editable amount (same blur-commit money input as item prices), and a remove button. A `Split evenly` button re-splits the total across the current payers. The button is disabled when every person in the trip is already a payer.
- The same person cannot appear in two rows: each select lists the current payer plus only people who are not paying yet.
- **Coverage line:** `Payers cover €X of €Y` — green tick when equal, warning styling when not.
- Dropping back to a single payer restores the implicit-amount behaviour.
- **`Looks right →` is disabled while payments do not cover the total exactly**, with the coverage line as the explanation. This is stricter than the items check (which is only a warning) because settlement is only trustworthy when payments reconcile.
- A payer can never silently vanish from a receipt: `personHasEntries` already blocks removing a person who appears in any receipt's payments, so the stale-payer case only arises from imported or hand-edited data (handled in §8).

**Delete receipt** and every other v1 behaviour are unchanged.

### Trip screen (`TripScreen.tsx`)

- Receipt rows read `paid by Pedro` for one payer and `paid by Pedro + Ana` for several (all payer names joined by `+`).
- New **Groups** section below Friends, shown only when the trip has at least two people:
  - Existing groups render as chips showing name and member count (e.g. `👥 Breakfast · 3`); tapping a chip opens it for editing.
  - `+ New group` opens an inline form: name input, person toggle chips, `Save` / `Cancel`. Save is disabled until the group has a name and at least one member.
  - The edit form is the same form pre-filled, plus `Delete group` (with a confirmation, matching the trip/receipt delete pattern).
- Removing a friend prunes them from every group; a group left with no members is deleted.

### Assign screen (`AssignScreen.tsx`)

- Group chips render after the person chips and before `👥 Everyone`, styled distinctly (name + `👥` prefix) so they are not mistaken for people. Groups with no members are hidden.
- Tapping a group chip assigns the item to `{ kind: "people", personIds: [...group members] }`, routed through the existing `assign()` helper so a following discount line still follows along.
- A group chip shows selected when the item's assignment is `people` and its person set equals the group's set, order-insensitively.
- Everything else (per-unit splitting, Everyone, the units notice, per-receipt share, footer count, Done gating) is unchanged.

### Summary text (`summary.ts`)

- `receiptSummaryText` shows `€54.30 paid by Pedro` for one payer and `€54.30 paid by Pedro (€30.00) + Ana (€24.30)` for several.
- `summaryText` (trip level) is unchanged in shape: its per-person `(paid €X)` figures already come from `paidTotals`, which now accounts for multiple payers.

## 8. Error handling

| Situation | Behaviour |
|---|---|
| Stored data is v1 | Converted silently on load and written back once. |
| Imported file is a v1 export | Converted during import. |
| Stored data claims a newer version than the app | Existing corrupt path from v1 §11: the raw string is backed up to `bills.data.v1.corrupt` and the app starts empty rather than guessing at an unknown shape. |
| A receipt has no payments (corrupt/imported) | Excluded from trip totals and settlement; still visible and editable so the user can fix it. |
| A payment references a person no longer in the trip | Whole receipt excluded from trip maths (preserves zero-sum); still editable. |
| Payments do not cover the total | Review screen blocks `Looks right →`; if such data arrives anyway, the primary payer is credited the difference so balances still reconcile. |
| Group loses all members | Group deleted. |

## 9. Testing

- **`migrate.test.ts`** — v1 trip with one and several receipts converts (payer becomes a single payment for the full printed total, `groups: []`, version 2); an already-v2 trip passes through unchanged; a v1 export round-trips through `importTrip`; unrecognisable input throws.
- **`payments.test.ts`** — `paymentsTotal`; `primaryPayerId` (largest wins, tie → lowest id, empty → `null`); `withSyncedSinglePayment` (syncs one, leaves several alone); `splitEvenly` sums exactly to the total for random totals and payer counts (property-style, mirroring the v1 rounding tests).
- **`split.test.ts`** — a multi-payer receipt's shares still sum exactly to `printedTotal`; the primary payer absorbs the item-sum difference.
- **`settle.test.ts`** — two payers on one receipt are credited their own amounts and balances sum to zero; a receipt with a non-member payment is excluded; payments short of the total still yield zero-sum balances via the primary-payer credit.
- **`reducer.test.ts`** — group add/update/delete; `removePerson` prunes group membership and deletes emptied groups; `personHasEntries` recognises payers through `payments`.
- **Screen tests** — review screen: one-tap total fix, adding a second payer, split evenly, blocked `Looks right →` while coverage is short; trip screen: create/edit/delete a group, multi-payer row text; assign screen: group chip assigns and highlights.
- **Regression** — the full v1 suite (114 tests) must stay green apart from fixtures updated for the new receipt shape.

## 10. Build order (for the implementation plan)

1. Types, `migrate.ts`, storage/import wiring (+ tests) — protects existing data first.
2. `payments.ts` helpers (+ tests).
3. `split.ts` / `settle.ts` / `personHasEntries` updated for payments (+ tests); v1 fixtures migrated.
4. Review screen: one-tap total fix, payments UI, coverage gating.
5. Groups: reducer actions and trip-screen management UI.
6. Assign-screen group chips, multi-payer display text in trip screen and summary.
7. Whole-app review, merge to `main` (auto-deploys to GitHub Pages).

## 11. Deployment note

The app is live at `https://pedrogs43210-sudo.github.io/bills/` and the service worker uses `autoUpdate`, so merging to `main` publishes the update and installed phones pick it up on next launch. Users should export a backup from Settings before the update as a belt-and-braces measure, even though migration is automatic and tested.
