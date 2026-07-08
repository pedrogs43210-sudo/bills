# Bills — Receipt Splitter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build "Bills" — a serverless mobile web app that scans grocery receipts with the Claude API, lets one person assign items to friends (or everyone), and computes per-person totals and minimal settle-up transfers across a whole trip.

**Architecture:** Static React + TypeScript + Vite SPA; all data in `localStorage` as integer cents; Claude API called directly from the browser with a user-supplied key (`dangerouslyAllowBrowser`) using structured outputs. Pure logic (split math, settlement, storage, summary) lives in `src/lib/` and is unit-tested; screens are thin React components over a tested reducer.

**Tech Stack:** React 18, TypeScript, Vite, Vitest + React Testing Library (jsdom), `@anthropic-ai/sdk` (model `claude-opus-4-8`, structured outputs via `zodOutputFormat`), `zod`.

**Spec:** `docs/superpowers/specs/2026-07-08-receipt-splitter-design.md`

---

## File structure

```
C:\Bills app\
├── index.html                      # SPA entry, viewport + manifest link
├── package.json / tsconfig.json / vite.config.ts
├── public/
│   ├── manifest.webmanifest        # PWA install metadata
│   └── icon.svg                    # app icon (🧾 on sunset gradient)
└── src/
    ├── main.tsx                    # React bootstrap
    ├── App.tsx                     # screen switching (no router lib) + StoreProvider
    ├── theme.css                   # sunny-holiday design system (CSS variables + components)
    ├── types.ts                    # Trip/Person/Receipt/Item/Assignment (spec §5)
    ├── test-setup.ts               # jest-dom matchers
    ├── lib/
    │   ├── ids.ts                  # id generation
    │   ├── money.ts                # cents ↔ string (format/parse)
    │   ├── split.ts                # per-receipt shares, largest-remainder rounding (spec §8)
    │   ├── settle.ts               # balances + greedy transfer netting (spec §8)
    │   ├── summary.ts              # share-sheet text (spec §9)
    │   ├── storage.ts              # localStorage load/save, export/import, corruption guard
    │   ├── image.ts                # downscale photo → base64 JPEG (spec §6)
    │   └── scan.ts                 # Claude API client + zod schema (spec §6)
    ├── state/
    │   ├── reducer.ts              # pure app reducer (all mutations)
    │   └── StoreProvider.tsx       # context + persistence effect
    └── screens/
        ├── TripListScreen.tsx      # trip cards + create trip
        ├── TripScreen.tsx          # members, receipts, scan/manual buttons
        ├── ReviewScreen.tsx        # editable items + total check (scan result or manual)
        ├── AssignScreen.tsx        # item-by-item assignment
        ├── SettleScreen.tsx        # totals, transfers, share button
        └── SettingsScreen.tsx      # API key, export/import
```

Dependency direction: `screens → state → lib → types`. Nothing in `lib/` touches React or the DOM except `image.ts` (canvas) and `scan.ts` (network).

Conventions used throughout:
- **All money is integer cents.** Only `money.ts` converts to/from display strings.
- Tests import from `vitest` explicitly (`import { describe, it, expect } from "vitest"`), no globals.
- Run all commands from the repo root `C:\Bills app`.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/theme.css`, `src/test-setup.ts`, `src/lib/smoke.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "bills",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Install dependencies (writes versions into package.json)**

Run:
```bash
npm install react react-dom zod @anthropic-ai/sdk
npm install -D typescript vite @vitejs/plugin-react vitest jsdom @types/react @types/react-dom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```
Expected: both commands exit 0; `node_modules/` created.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
  },
});
```

- [ ] **Step 5: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#FF7059" />
    <title>Bills 🧾</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `src/main.tsx`, `src/App.tsx`, `src/theme.css`, `src/test-setup.ts`**

`src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./theme.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`src/App.tsx` (placeholder — replaced in Task 7):
```tsx
export default function App() {
  return <h1>Bills 🧾</h1>;
}
```

`src/theme.css` (placeholder — filled in Task 7):
```css
body { margin: 0; font-family: system-ui, sans-serif; }
```

`src/test-setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 7: Write smoke test `src/lib/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs tests", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Verify test runner and dev build work**

Run: `npm test`
Expected: `1 passed`.

Run: `npm run build`
Expected: exits 0, `dist/` created.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS + Vitest project"
```

---

### Task 2: Data types, ids, and money utilities

**Files:**
- Create: `src/types.ts`, `src/lib/ids.ts`, `src/lib/money.ts`
- Test: `src/lib/money.test.ts`
- Delete: `src/lib/smoke.test.ts`

- [ ] **Step 1: Create `src/types.ts` (from spec §5)**

```ts
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

export type Receipt = {
  id: string;
  storeName: string;
  date: string; // ISO yyyy-mm-dd
  paidBy: string; // Person.id
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
  receipts: Receipt[];
  createdAt: string; // ISO datetime
  schemaVersion: number;
};

export const SCHEMA_VERSION = 1;

export const PERSON_COLORS = [
  "#FFD9A0", "#FFC4B8", "#C9E8C9", "#BFD9FF", "#E8C9F0", "#F5E6A0", "#B8E8E0", "#F0C9C9",
];
```

- [ ] **Step 2: Create `src/lib/ids.ts`**

```ts
export function newId(): string {
  return crypto.randomUUID();
}
```

- [ ] **Step 3: Write failing tests `src/lib/money.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { formatCents, parseToCents } from "./money";

describe("formatCents", () => {
  it("formats euros with symbol", () => {
    expect(formatCents(5430, "EUR")).toMatch(/54[.,]30/);
  });
  it("formats negative amounts", () => {
    expect(formatCents(-249, "EUR")).toMatch(/2[.,]49/);
  });
});

describe("parseToCents", () => {
  it("parses dot decimals", () => expect(parseToCents("54.30")).toBe(5430));
  it("parses comma decimals", () => expect(parseToCents("54,30")).toBe(5430));
  it("parses integers", () => expect(parseToCents("7")).toBe(700));
  it("parses negatives", () => expect(parseToCents("-0,50")).toBe(-50));
  it("parses single decimal digit", () => expect(parseToCents("2.5")).toBe(250));
  it("rejects garbage", () => expect(parseToCents("abc")).toBeNull());
  it("rejects >2 decimals", () => expect(parseToCents("1.234")).toBeNull());
  it("rejects empty", () => expect(parseToCents("")).toBeNull());
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './money'` (or similar).

- [ ] **Step 5: Implement `src/lib/money.ts`**

```ts
export function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function parseToCents(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}
```

- [ ] **Step 6: Run tests to verify they pass, delete smoke test**

Run: `npm test`
Expected: all money tests PASS.

```bash
rm src/lib/smoke.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: data model types, id and money utilities"
```

---

### Task 3: Split math (receipt shares + rounding)

**Files:**
- Create: `src/lib/split.ts`
- Test: `src/lib/split.test.ts`

- [ ] **Step 1: Write failing tests `src/lib/split.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { receiptShares, roundLargestRemainder, isItemAssigned, isFullyAssigned } from "./split";
import type { Item, Person, Receipt, Assignment } from "../types";

const people: Person[] = [
  { id: "pedro", name: "Pedro", color: "#FFD9A0" },
  { id: "ana", name: "Ana", color: "#FFC4B8" },
  { id: "bruno", name: "Bruno", color: "#C9E8C9" },
];

let n = 0;
function item(lineTotal: number, assignment: Assignment, quantity = 1): Item {
  return { id: `i${n++}`, name: `item${n}`, quantity, lineTotal, assignment };
}

function receipt(items: Item[], printedTotal: number, paidBy = "pedro"): Receipt {
  return { id: "r1", storeName: "Lidl", date: "2026-07-08", paidBy, items, printedTotal, status: "assigning" };
}

describe("receiptShares", () => {
  it("gives a solo item entirely to its person", () => {
    const r = receipt([item(249, { kind: "people", personIds: ["pedro"] })], 249);
    expect(receiptShares(r, people)).toEqual({ pedro: 249, ana: 0, bruno: 0 });
  });

  it("splits an everyone item equally", () => {
    const r = receipt([item(300, { kind: "everyone" })], 300);
    expect(receiptShares(r, people)).toEqual({ pedro: 100, ana: 100, bruno: 100 });
  });

  it("splits a shared item among selected people only", () => {
    const r = receipt([item(500, { kind: "people", personIds: ["ana", "bruno"] })], 500);
    expect(receiptShares(r, people)).toEqual({ pedro: 0, ana: 250, bruno: 250 });
  });

  it("splits quantity lines by units", () => {
    // 3 juices for 450: Ana 2 units (300), Bruno 1 unit (150)
    const r = receipt([item(450, { kind: "units", shares: { ana: 2, bruno: 1 } }, 3)], 450);
    expect(receiptShares(r, people)).toEqual({ pedro: 0, ana: 300, bruno: 150 });
  });

  it("rounds so shares sum exactly to the printed total, payer wins ties", () => {
    // 100 among 3 → 33.33... each; payer (pedro) takes the extra cent
    const r = receipt([item(100, { kind: "everyone" })], 100);
    const s = receiptShares(r, people);
    expect(s.pedro + s.ana + s.bruno).toBe(100);
    expect(s.pedro).toBe(34);
  });

  it("payer absorbs a difference between item sum and printed total", () => {
    // items sum 200 but receipt says 210 (accepted mismatch) → payer pays the extra 10
    const r = receipt([item(200, { kind: "people", personIds: ["ana"] })], 210);
    expect(receiptShares(r, people)).toEqual({ pedro: 10, ana: 200, bruno: 0 });
  });

  it("handles negative discount lines", () => {
    const r = receipt(
      [item(500, { kind: "people", personIds: ["ana"] }), item(-100, { kind: "people", personIds: ["ana"] })],
      400
    );
    expect(receiptShares(r, people)).toEqual({ pedro: 0, ana: 400, bruno: 0 });
  });

  it("shares always sum to printedTotal (random receipts)", () => {
    for (let run = 0; run < 200; run++) {
      const items: Item[] = [];
      let sum = 0;
      const count = 1 + Math.floor(Math.random() * 8);
      for (let k = 0; k < count; k++) {
        const cents = Math.floor(Math.random() * 2000) + 1;
        sum += cents;
        const kinds: Assignment[] = [
          { kind: "everyone" },
          { kind: "people", personIds: ["pedro", "ana"] },
          { kind: "people", personIds: ["bruno"] },
          { kind: "units", shares: { pedro: 1, ana: 2 } },
        ];
        const a = kinds[Math.floor(Math.random() * kinds.length)];
        items.push(item(cents, a, a.kind === "units" ? 3 : 1));
      }
      const r = receipt(items, sum);
      const shares = receiptShares(r, people);
      const total = Object.values(shares).reduce((x, y) => x + y, 0);
      expect(total).toBe(sum);
    }
  });
});

describe("roundLargestRemainder", () => {
  it("distributes leftover cents to largest remainders first", () => {
    const exact = new Map([["a", 33.4], ["b", 33.3], ["c", 33.3]]);
    const rounded = roundLargestRemainder(exact);
    expect([...rounded.values()].reduce((x, y) => x + y, 0)).toBe(100);
    expect(rounded.get("a")).toBe(34);
  });
});

describe("assignment completeness", () => {
  it("unassigned item is not assigned", () => {
    expect(isItemAssigned(item(100, { kind: "unassigned" }))).toBe(false);
  });
  it("people assignment needs at least one person", () => {
    expect(isItemAssigned(item(100, { kind: "people", personIds: [] }))).toBe(false);
  });
  it("units assignment must cover the full quantity", () => {
    expect(isItemAssigned(item(100, { kind: "units", shares: { ana: 2 } }, 3))).toBe(false);
    expect(isItemAssigned(item(100, { kind: "units", shares: { ana: 2, bruno: 1 } }, 3))).toBe(true);
  });
  it("isFullyAssigned requires every item assigned", () => {
    const r = receipt([item(100, { kind: "everyone" }), item(50, { kind: "unassigned" })], 150);
    expect(isFullyAssigned(r)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './split'`.

- [ ] **Step 3: Implement `src/lib/split.ts`**

```ts
import type { Item, Person, Receipt } from "../types";

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
  return receipt.items.every(isItemAssigned);
}

/** Exact (possibly fractional) cent shares of a receipt's assigned items. */
function exactShares(receipt: Receipt, people: Person[]): Map<string, number> {
  const shares = new Map<string, number>();
  for (const p of people) shares.set(p.id, 0);
  const add = (id: string, amount: number) => shares.set(id, (shares.get(id) ?? 0) + amount);

  for (const item of receipt.items) {
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
 * assigned items are rounded with largest-remainder, and the payer absorbs any
 * difference between the item sum and the printed total (spec §8).
 */
export function receiptShares(receipt: Receipt, people: Person[]): Record<string, number> {
  const rounded = roundLargestRemainder(exactShares(receipt, people), receipt.paidBy);
  const assignedSum = [...rounded.values()].reduce((s, v) => s + v, 0);
  const diff = receipt.printedTotal - assignedSum;
  rounded.set(receipt.paidBy, (rounded.get(receipt.paidBy) ?? 0) + diff);
  return Object.fromEntries(rounded);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all split tests PASS (including the 200-receipt invariant loop).

- [ ] **Step 5: Commit**

```bash
git add src/lib/split.ts src/lib/split.test.ts
git commit -m "feat: receipt share math with largest-remainder rounding"
```

---

### Task 4: Settlement (balances + minimal transfers)

**Files:**
- Create: `src/lib/settle.ts`
- Test: `src/lib/settle.test.ts`

- [ ] **Step 1: Write failing tests `src/lib/settle.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { balances, settle, paidTotals, shareTotals } from "./settle";
import type { Person, Receipt, Trip } from "../types";

const people: Person[] = [
  { id: "pedro", name: "Pedro", color: "#FFD9A0" },
  { id: "ana", name: "Ana", color: "#FFC4B8" },
  { id: "bruno", name: "Bruno", color: "#C9E8C9" },
];

function trip(receipts: Receipt[]): Trip {
  return {
    id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
    people, receipts, createdAt: "2026-07-08T00:00:00Z", schemaVersion: 1,
  };
}

function everyoneReceipt(total: number, paidBy: string): Receipt {
  return {
    id: `r-${paidBy}-${total}`, storeName: "Lidl", date: "2026-07-08", paidBy,
    items: [{ id: "i1", name: "stuff", quantity: 1, lineTotal: total, assignment: { kind: "everyone" } }],
    printedTotal: total, status: "done",
  };
}

describe("balances", () => {
  it("is paid minus share, summing to zero", () => {
    const t = trip([everyoneReceipt(300, "pedro")]);
    const b = balances(t);
    expect(b).toEqual({ pedro: 200, ana: -100, bruno: -100 });
    expect(Object.values(b).reduce((x, y) => x + y, 0)).toBe(0);
  });

  it("nets multiple receipts with different payers", () => {
    const t = trip([everyoneReceipt(300, "pedro"), everyoneReceipt(300, "ana")]);
    expect(balances(t)).toEqual({ pedro: 100, ana: 100, bruno: -200 });
  });

  it("exposes paid and share totals for the settle screen", () => {
    const t = trip([everyoneReceipt(300, "pedro")]);
    expect(paidTotals(t)).toEqual({ pedro: 300, ana: 0, bruno: 0 });
    expect(shareTotals(t)).toEqual({ pedro: 100, ana: 100, bruno: 100 });
  });
});

describe("settle", () => {
  it("returns no transfers when everyone is even", () => {
    expect(settle({ pedro: 0, ana: 0 })).toEqual([]);
  });

  it("settles a single debt", () => {
    expect(settle({ pedro: 200, ana: -200 })).toEqual([{ from: "ana", to: "pedro", amount: 200 }]);
  });

  it("settles multiple debtors to one creditor", () => {
    expect(settle({ pedro: 200, ana: -100, bruno: -100 })).toEqual([
      { from: "ana", to: "pedro", amount: 100 },
      { from: "bruno", to: "pedro", amount: 100 },
    ]);
  });

  it("zeroes out any balance set (random)", () => {
    for (let run = 0; run < 100; run++) {
      const b: Record<string, number> = {};
      let sum = 0;
      for (const id of ["a", "b", "c", "d"]) {
        const v = Math.floor(Math.random() * 4000) - 2000;
        b[id] = v;
        sum += v;
      }
      b["e"] = -sum; // force zero-sum
      const transfers = settle(b);
      const after = { ...b };
      for (const t of transfers) {
        after[t.from] += t.amount;
        after[t.to] -= t.amount;
        expect(t.amount).toBeGreaterThan(0);
      }
      for (const v of Object.values(after)) expect(v).toBe(0);
      // never more transfers than people-1
      expect(transfers.length).toBeLessThanOrEqual(4);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './settle'`.

- [ ] **Step 3: Implement `src/lib/settle.ts`**

```ts
import type { Trip } from "../types";
import { receiptShares } from "./split";

export type Transfer = { from: string; to: string; amount: number };

export function paidTotals(trip: Trip): Record<string, number> {
  const paid: Record<string, number> = {};
  for (const p of trip.people) paid[p.id] = 0;
  for (const r of trip.receipts) paid[r.paidBy] = (paid[r.paidBy] ?? 0) + r.printedTotal;
  return paid;
}

export function shareTotals(trip: Trip): Record<string, number> {
  const shares: Record<string, number> = {};
  for (const p of trip.people) shares[p.id] = 0;
  for (const r of trip.receipts) {
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
    if (c.v === 0) creditors.shift();
    if (d.v === 0) debtors.shift();
  }
  return transfers;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all settle tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settle.ts src/lib/settle.test.ts
git commit -m "feat: trip balances and greedy settle-up transfers"
```

---

### Task 5: Storage layer

**Files:**
- Create: `src/lib/storage.ts`
- Test: `src/lib/storage.test.ts`

- [ ] **Step 1: Write failing tests `src/lib/storage.test.ts`**

jsdom provides a working `localStorage`.

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { loadData, saveData, emptyData, exportTrip, importTrip, loadApiKey, saveApiKey } from "./storage";
import type { Trip } from "../types";

const trip: Trip = {
  id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
  people: [{ id: "p1", name: "Pedro", color: "#FFD9A0" }],
  receipts: [], createdAt: "2026-07-08T00:00:00Z", schemaVersion: 1,
};

beforeEach(() => localStorage.clear());

describe("loadData / saveData", () => {
  it("returns empty data when nothing stored", () => {
    expect(loadData()).toEqual(emptyData());
  });

  it("round-trips data", () => {
    saveData({ schemaVersion: 1, trips: [trip] });
    expect(loadData().trips[0].name).toBe("Algarve");
  });

  it("never crashes on corrupt JSON — backs it up and starts empty", () => {
    localStorage.setItem("bills.data.v1", "{not json!!");
    expect(loadData()).toEqual(emptyData());
    expect(localStorage.getItem("bills.data.v1.corrupt")).toBe("{not json!!");
  });

  it("treats wrong-shaped JSON as corrupt", () => {
    localStorage.setItem("bills.data.v1", JSON.stringify({ hello: "world" }));
    expect(loadData()).toEqual(emptyData());
  });
});

describe("api key", () => {
  it("round-trips the key", () => {
    saveApiKey("sk-ant-test");
    expect(loadApiKey()).toBe("sk-ant-test");
  });
  it("defaults to empty string", () => {
    expect(loadApiKey()).toBe("");
  });
});

describe("export / import", () => {
  it("round-trips a trip", () => {
    const json = exportTrip(trip);
    expect(importTrip(json).name).toBe("Algarve");
  });
  it("rejects non-trip JSON", () => {
    expect(() => importTrip(JSON.stringify({ foo: 1 }))).toThrow();
  });
  it("rejects invalid JSON", () => {
    expect(() => importTrip("nope")).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './storage'`.

- [ ] **Step 3: Implement `src/lib/storage.ts`**

```ts
import { SCHEMA_VERSION, type Trip } from "../types";

const DATA_KEY = "bills.data.v1";
const API_KEY_KEY = "bills.apiKey";

export type AppData = { schemaVersion: number; trips: Trip[] };

export function emptyData(): AppData {
  return { schemaVersion: SCHEMA_VERSION, trips: [] };
}

export function loadData(): AppData {
  const raw = localStorage.getItem(DATA_KEY);
  if (raw === null) return emptyData();
  try {
    const parsed = JSON.parse(raw) as AppData;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.trips)) {
      throw new Error("bad shape");
    }
    return parsed;
  } catch {
    // Never lose user data: keep the raw string for manual recovery.
    localStorage.setItem(`${DATA_KEY}.corrupt`, raw);
    return emptyData();
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

export function loadApiKey(): string {
  return localStorage.getItem(API_KEY_KEY) ?? "";
}

export function saveApiKey(key: string): void {
  localStorage.setItem(API_KEY_KEY, key.trim());
}

export function exportTrip(trip: Trip): string {
  return JSON.stringify({ app: "bills", schemaVersion: trip.schemaVersion, trip }, null, 2);
}

export function importTrip(json: string): Trip {
  const parsed = JSON.parse(json) as { trip?: Trip };
  const trip = parsed?.trip;
  if (
    !trip ||
    typeof trip.name !== "string" ||
    !Array.isArray(trip.people) ||
    !Array.isArray(trip.receipts)
  ) {
    throw new Error("Not a Bills trip export");
  }
  return trip;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all storage tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/lib/storage.test.ts
git commit -m "feat: localStorage persistence with corruption guard and trip export/import"
```

---

### Task 6: App state reducer + store provider

**Files:**
- Create: `src/state/reducer.ts`, `src/state/StoreProvider.tsx`
- Test: `src/state/reducer.test.ts`

- [ ] **Step 1: Write failing tests `src/state/reducer.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { reducer, personHasEntries, type Action } from "./reducer";
import { emptyData, type AppData } from "../lib/storage";
import type { Receipt, Trip } from "../types";

function run(actions: Action[], start: AppData = emptyData()): AppData {
  return actions.reduce(reducer, start);
}

const baseReceipt: Receipt = {
  id: "r1", storeName: "Lidl", date: "2026-07-08", paidBy: "p1",
  items: [{ id: "i1", name: "Juice", quantity: 3, lineTotal: 450, assignment: { kind: "unassigned" } }],
  printedTotal: 450, status: "review",
};

describe("trips and people", () => {
  it("creates a trip with defaults", () => {
    const data = run([{ type: "createTrip", id: "t1", name: "Algarve", emoji: "🏖️" }]);
    expect(data.trips).toHaveLength(1);
    expect(data.trips[0]).toMatchObject({ id: "t1", name: "Algarve", currency: "EUR", people: [], receipts: [] });
  });

  it("adds people with distinct cycling colors", () => {
    const data = run([
      { type: "createTrip", id: "t1", name: "Algarve", emoji: "🏖️" },
      { type: "addPerson", tripId: "t1", personId: "p1", name: "Pedro" },
      { type: "addPerson", tripId: "t1", personId: "p2", name: "Ana" },
    ]);
    const [a, b] = data.trips[0].people;
    expect(a.name).toBe("Pedro");
    expect(a.color).not.toBe(b.color);
  });

  it("removes a person with no entries, blocks one with entries", () => {
    const start = run([
      { type: "createTrip", id: "t1", name: "Algarve", emoji: "🏖️" },
      { type: "addPerson", tripId: "t1", personId: "p1", name: "Pedro" },
      { type: "addPerson", tripId: "t1", personId: "p2", name: "Ana" },
      { type: "addReceipt", tripId: "t1", receipt: baseReceipt }, // paidBy p1
    ]);
    const afterBlocked = reducer(start, { type: "removePerson", tripId: "t1", personId: "p1" });
    expect(afterBlocked.trips[0].people).toHaveLength(2); // unchanged — p1 paid a receipt
    const afterOk = reducer(start, { type: "removePerson", tripId: "t1", personId: "p2" });
    expect(afterOk.trips[0].people.map((p) => p.id)).toEqual(["p1"]);
  });

  it("deletes a trip", () => {
    const data = run([
      { type: "createTrip", id: "t1", name: "Algarve", emoji: "🏖️" },
      { type: "deleteTrip", tripId: "t1" },
    ]);
    expect(data.trips).toHaveLength(0);
  });
});

describe("receipts and assignments", () => {
  const start = run([
    { type: "createTrip", id: "t1", name: "Algarve", emoji: "🏖️" },
    { type: "addPerson", tripId: "t1", personId: "p1", name: "Pedro" },
    { type: "addReceipt", tripId: "t1", receipt: baseReceipt },
  ]);

  it("adds and replaces receipts", () => {
    const edited = { ...baseReceipt, storeName: "Continente" };
    const data = reducer(start, { type: "updateReceipt", tripId: "t1", receipt: edited });
    expect(data.trips[0].receipts[0].storeName).toBe("Continente");
  });

  it("sets an item assignment", () => {
    const data = reducer(start, {
      type: "setAssignment", tripId: "t1", receiptId: "r1", itemId: "i1",
      assignment: { kind: "everyone" },
    });
    expect(data.trips[0].receipts[0].items[0].assignment).toEqual({ kind: "everyone" });
  });

  it("sets receipt status and trip currency", () => {
    let data = reducer(start, { type: "setReceiptStatus", tripId: "t1", receiptId: "r1", status: "done" });
    data = reducer(data, { type: "setCurrency", tripId: "t1", currency: "GBP" });
    expect(data.trips[0].receipts[0].status).toBe("done");
    expect(data.trips[0].currency).toBe("GBP");
  });

  it("deletes a receipt", () => {
    const data = reducer(start, { type: "deleteReceipt", tripId: "t1", receiptId: "r1" });
    expect(data.trips[0].receipts).toHaveLength(0);
  });
});

describe("personHasEntries", () => {
  const trip: Trip = {
    id: "t1", name: "A", emoji: "x", currency: "EUR",
    people: [{ id: "p1", name: "Pedro", color: "#fff" }, { id: "p2", name: "Ana", color: "#eee" }],
    receipts: [{
      ...baseReceipt,
      items: [{ id: "i1", name: "Juice", quantity: 1, lineTotal: 100, assignment: { kind: "people", personIds: ["p2"] } }],
    }],
    createdAt: "", schemaVersion: 1,
  };
  it("true for payer and for assigned person", () => {
    expect(personHasEntries(trip, "p1")).toBe(true); // paid
    expect(personHasEntries(trip, "p2")).toBe(true); // assigned
  });
  it("true for everyone-assignments", () => {
    const t = { ...trip, receipts: [{ ...trip.receipts[0], paidBy: "p2", items: [{ id: "i1", name: "x", quantity: 1, lineTotal: 100, assignment: { kind: "everyone" as const } }] }] };
    expect(personHasEntries(t, "p1")).toBe(true);
  });
});

describe("importTrip action", () => {
  it("appends a new trip and replaces an existing one by id", () => {
    const t1: Trip = { id: "t1", name: "Old", emoji: "x", currency: "EUR", people: [], receipts: [], createdAt: "", schemaVersion: 1 };
    let data = run([], { schemaVersion: 1, trips: [t1] });
    data = reducer(data, { type: "importTrip", trip: { ...t1, name: "New" } });
    expect(data.trips).toHaveLength(1);
    expect(data.trips[0].name).toBe("New");
    data = reducer(data, { type: "importTrip", trip: { ...t1, id: "t2", name: "Other" } });
    expect(data.trips).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './reducer'`.

- [ ] **Step 3: Implement `src/state/reducer.ts`**

```ts
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
  | { type: "setReceiptStatus"; tripId: string; receiptId: string; status: ReceiptStatus }
  | { type: "setCurrency"; tripId: string; currency: string }
  | { type: "importTrip"; trip: Trip };

/** True if removing this person would orphan data (they paid, are assigned, or an everyone-split exists). */
export function personHasEntries(trip: Trip, personId: string): boolean {
  return trip.receipts.some(
    (r) =>
      r.paidBy === personId ||
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
            people: [], receipts: [], createdAt: new Date().toISOString(),
            schemaVersion: SCHEMA_VERSION,
          },
        ],
      };
    case "deleteTrip":
      return { ...data, trips: data.trips.filter((t) => t.id !== action.tripId) };
    case "addPerson":
      return mapTrip(data, action.tripId, (t) => ({
        ...t,
        people: [
          ...t.people,
          { id: action.personId, name: action.name, color: PERSON_COLORS[t.people.length % PERSON_COLORS.length] },
        ],
      }));
    case "renamePerson":
      return mapTrip(data, action.tripId, (t) => ({
        ...t,
        people: t.people.map((p) => (p.id === action.personId ? { ...p, name: action.name } : p)),
      }));
    case "removePerson":
      return mapTrip(data, action.tripId, (t) =>
        personHasEntries(t, action.personId)
          ? t // blocked — UI should disable the button; reducer is the last line of defense
          : { ...t, people: t.people.filter((p) => p.id !== action.personId) }
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
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all reducer tests PASS.

- [ ] **Step 5: Implement `src/state/StoreProvider.tsx`** (covered by screen tests in later tasks)

```tsx
import { createContext, useContext, useEffect, useReducer } from "react";
import type { Dispatch, ReactNode } from "react";
import { loadData, saveData, type AppData } from "../lib/storage";
import { reducer, type Action } from "./reducer";

const StoreContext = createContext<{ data: AppData; dispatch: Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, undefined, loadData);
  useEffect(() => {
    saveData(data);
  }, [data]);
  return <StoreContext.Provider value={{ data, dispatch }}>{children}</StoreContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
```

- [ ] **Step 6: Verify the whole suite still passes and the app compiles**

Run: `npm test && npm run build`
Expected: all tests PASS; build exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/state
git commit -m "feat: app state reducer with persistence provider"
```

---

### Task 7: Theme, app shell, trip list & trip screens

**Files:**
- Modify: `src/theme.css`, `src/App.tsx`
- Create: `src/screens/TripListScreen.tsx`, `src/screens/TripScreen.tsx`
- Test: `src/screens/trips.test.tsx`

- [ ] **Step 1: Replace `src/theme.css` with the sunny-holiday design system**

```css
:root {
  --bg: #fff8f0;
  --card: #ffffff;
  --ink: #3d2b24;
  --muted: #9c8577;
  --sunset1: #ffb347;
  --sunset2: #ff7059;
  --accent: #ff7059;
  --good: #2e9e6b;
  --warn: #b7791f;
  --radius: 14px;
  --shadow: 0 2px 10px rgba(61, 43, 36, 0.08);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
#root { max-width: 480px; margin: 0 auto; padding: 16px 16px 110px; min-height: 100vh; }
h1, h2, h3 { font-weight: 800; margin: 0 0 8px; }
.screen-title { font-size: 24px; flex: 1; }
.card { background: var(--card); border-radius: var(--radius); box-shadow: var(--shadow); padding: 14px; margin-bottom: 10px; }
.btn {
  border: none; border-radius: var(--radius); padding: 14px 18px;
  font-size: 16px; font-weight: 700; cursor: pointer; background: #f0e4d8; color: var(--ink);
}
.btn-primary { background: linear-gradient(90deg, var(--sunset2), var(--sunset1)); color: #fff; width: 100%; }
.btn-ghost { background: transparent; color: var(--accent); padding: 8px; }
.btn:disabled { opacity: 0.45; cursor: default; }
.chip {
  display: inline-block; border: none; border-radius: 999px; padding: 6px 12px;
  margin: 3px 6px 3px 0; font-size: 14px; font-weight: 600; cursor: pointer;
  background: #f0e4d8; color: var(--ink);
}
.chip.selected { outline: 3px solid var(--sunset2); }
.row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.muted { color: var(--muted); font-size: 13px; }
input, select {
  font-size: 16px; padding: 10px; border: 1px solid #e5d5c5; border-radius: 10px;
  background: #fff; width: 100%; color: var(--ink);
}
.banner-warn { background: #fff3d6; border-radius: 10px; padding: 10px; color: var(--warn); font-size: 14px; margin-bottom: 10px; }
.banner-good { background: #e2f5ea; border-radius: 10px; padding: 10px; color: var(--good); font-size: 14px; margin-bottom: 10px; }
.topbar { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.footerbar {
  position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
  width: 100%; max-width: 480px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: linear-gradient(transparent, var(--bg) 35%);
}
.item-row { padding: 10px 0; border-bottom: 1px dashed #eadbcb; }
.item-row:last-child { border-bottom: none; }
```

- [ ] **Step 2: Replace `src/App.tsx` with the screen switcher**

`ReviewScreen`, `AssignScreen`, `SettleScreen`, `SettingsScreen` don't exist yet — create placeholder files in this step so the app compiles; later tasks replace them.

```tsx
import { useState } from "react";
import { StoreProvider, useStore } from "./state/StoreProvider";
import { TripListScreen } from "./screens/TripListScreen";
import { TripScreen } from "./screens/TripScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { AssignScreen } from "./screens/AssignScreen";
import { SettleScreen } from "./screens/SettleScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

export type View =
  | { screen: "trips" }
  | { screen: "trip"; tripId: string }
  | { screen: "receipt"; tripId: string; receiptId: string }
  | { screen: "settle"; tripId: string }
  | { screen: "settings" };

function Router() {
  const [view, setView] = useState<View>({ screen: "trips" });
  const { data } = useStore();

  if (view.screen === "trips") return <TripListScreen go={setView} />;
  if (view.screen === "settings") return <SettingsScreen go={setView} />;

  const trip = data.trips.find((t) => t.id === view.tripId);
  if (!trip) return <TripListScreen go={setView} />; // trip was deleted

  if (view.screen === "trip") return <TripScreen tripId={trip.id} go={setView} />;
  if (view.screen === "settle") return <SettleScreen tripId={trip.id} go={setView} />;

  const receipt = trip.receipts.find((r) => r.id === view.receiptId);
  if (!receipt) return <TripScreen tripId={trip.id} go={setView} />;
  return receipt.status === "review" ? (
    <ReviewScreen tripId={trip.id} receiptId={receipt.id} go={setView} />
  ) : (
    <AssignScreen tripId={trip.id} receiptId={receipt.id} go={setView} />
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Router />
    </StoreProvider>
  );
}
```

Placeholder screens (each in its own file under `src/screens/`, replaced in Tasks 8–11 — same minimal shape for all four):

```tsx
// src/screens/ReviewScreen.tsx  (same pattern for AssignScreen, SettleScreen)
import type { View } from "../App";
export function ReviewScreen(_props: { tripId: string; receiptId: string; go: (v: View) => void }) {
  return <p>TODO Task 8</p>;
}
```

```tsx
// src/screens/SettleScreen.tsx
import type { View } from "../App";
export function SettleScreen(_props: { tripId: string; go: (v: View) => void }) {
  return <p>TODO Task 10</p>;
}
```

```tsx
// src/screens/SettingsScreen.tsx
import type { View } from "../App";
export function SettingsScreen(_props: { go: (v: View) => void }) {
  return <p>TODO Task 11</p>;
}
```

- [ ] **Step 3: Write failing tests `src/screens/trips.test.tsx`**

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";

beforeEach(() => localStorage.clear());

describe("trip management", () => {
  it("creates a trip and lands on the trip screen", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByPlaceholderText(/trip name/i), "Algarve 2026");
    await user.click(screen.getByRole("button", { name: /create trip/i }));
    expect(screen.getByText(/algarve 2026/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/add friend/i)).toBeInTheDocument();
  });

  it("adds friends and persists across remount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.type(screen.getByPlaceholderText(/trip name/i), "Algarve");
    await user.click(screen.getByRole("button", { name: /create trip/i }));
    await user.type(screen.getByPlaceholderText(/add friend/i), "Pedro");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.type(screen.getByPlaceholderText(/add friend/i), "Ana");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("Pedro")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();

    unmount();
    render(<App />); // fresh mount reads localStorage
    expect(screen.getByText(/algarve/i)).toBeInTheDocument();
  });

  it("disables adding receipts until there is at least one person", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByPlaceholderText(/trip name/i), "Algarve");
    await user.click(screen.getByRole("button", { name: /create trip/i }));
    expect(screen.getByRole("button", { name: /add items by hand/i })).toBeDisabled();
    await user.type(screen.getByPlaceholderText(/add friend/i), "Pedro");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("button", { name: /add items by hand/i })).toBeEnabled();
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find `./screens/TripListScreen` (and friends).

- [ ] **Step 5: Implement `src/screens/TripListScreen.tsx`**

```tsx
import { useState } from "react";
import { useStore } from "../state/StoreProvider";
import { newId } from "../lib/ids";
import type { View } from "../App";

const EMOJIS = ["🏖️", "⛰️", "🏙️", "🎿", "🏕️", "🎉"];

export function TripListScreen({ go }: { go: (v: View) => void }) {
  const { data, dispatch } = useStore();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = newId();
    dispatch({ type: "createTrip", id, name: trimmed, emoji });
    setName("");
    go({ screen: "trip", tripId: id });
  }

  return (
    <div>
      <div className="topbar">
        <h1 className="screen-title">Bills 🧾</h1>
        <button className="btn btn-ghost" aria-label="Settings" onClick={() => go({ screen: "settings" })}>
          ⚙️
        </button>
      </div>

      {data.trips.map((t) => (
        <button
          key={t.id}
          className="card row"
          style={{ width: "100%", border: "none", cursor: "pointer", textAlign: "left" }}
          onClick={() => go({ screen: "trip", tripId: t.id })}
        >
          <span style={{ fontSize: 18 }}>
            {t.emoji} <b>{t.name}</b>
          </span>
          <span className="muted">
            {t.people.length} 👥 · {t.receipts.length} 🧾
          </span>
        </button>
      ))}

      <div className="card">
        <h3>New trip</h3>
        <input placeholder="Trip name" value={name} onChange={(e) => setName(e.target.value)} />
        <div style={{ margin: "10px 0" }}>
          {EMOJIS.map((e) => (
            <button key={e} className={`chip ${e === emoji ? "selected" : ""}`} onClick={() => setEmoji(e)}>
              {e}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={create}>
          Create trip
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Implement `src/screens/TripScreen.tsx`**

The scan button is added in Task 12 — for now the trip screen offers manual receipts only.

```tsx
import { useState } from "react";
import { useStore } from "../state/StoreProvider";
import { personHasEntries } from "../state/reducer";
import { newId } from "../lib/ids";
import { formatCents } from "../lib/money";
import { isFullyAssigned } from "../lib/split";
import type { View } from "../App";
import type { Receipt } from "../types";

export function TripScreen({ tripId, go }: { tripId: string; go: (v: View) => void }) {
  const { data, dispatch } = useStore();
  const trip = data.trips.find((t) => t.id === tripId);
  const [personName, setPersonName] = useState("");
  if (!trip) return null;

  function addPerson() {
    const name = personName.trim();
    if (!name) return;
    dispatch({ type: "addPerson", tripId, personId: newId(), name });
    setPersonName("");
  }

  function addManualReceipt() {
    const receipt: Receipt = {
      id: newId(),
      storeName: "",
      date: new Date().toISOString().slice(0, 10),
      paidBy: trip!.people[0].id,
      items: [],
      printedTotal: 0,
      status: "review",
    };
    dispatch({ type: "addReceipt", tripId, receipt });
    go({ screen: "receipt", tripId, receiptId: receipt.id });
  }

  const payerName = (id: string) => trip.people.find((p) => p.id === id)?.name ?? "?";
  const badge = (r: Receipt) =>
    r.status === "done" ? "✅ done" : r.status === "review" ? "📝 checking" : isFullyAssigned(r) ? "✅ assigned" : "👉 assigning";

  return (
    <div>
      <div className="topbar">
        <button className="btn btn-ghost" aria-label="Back" onClick={() => go({ screen: "trips" })}>←</button>
        <h1 className="screen-title">{trip.emoji} {trip.name}</h1>
      </div>

      <div className="card">
        <h3>Friends</h3>
        <div>
          {trip.people.map((p) => (
            <span key={p.id} className="chip" style={{ background: p.color, cursor: "default" }}>
              {p.name}
              {!personHasEntries(trip, p.id) && (
                <button
                  aria-label={`Remove ${p.name}`}
                  style={{ border: "none", background: "none", cursor: "pointer", marginLeft: 4 }}
                  onClick={() => dispatch({ type: "removePerson", tripId, personId: p.id })}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input
            placeholder="Add friend…"
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPerson()}
          />
          <button className="btn" onClick={addPerson}>Add</button>
        </div>
      </div>

      {trip.receipts.map((r) => (
        <button
          key={r.id}
          className="card row"
          style={{ width: "100%", border: "none", cursor: "pointer", textAlign: "left" }}
          onClick={() => go({ screen: "receipt", tripId, receiptId: r.id })}
        >
          <span>
            🧾 <b>{r.storeName || "Receipt"}</b> · {formatCents(r.printedTotal, trip.currency)}
            <div className="muted">paid by {payerName(r.paidBy)} · {r.date}</div>
          </span>
          <span className="muted">{badge(r)}</span>
        </button>
      ))}

      <div className="footerbar">
        <button className="btn" style={{ width: "100%", marginBottom: 8 }} disabled={trip.people.length === 0} onClick={addManualReceipt}>
          ✍️ Add items by hand
        </button>
        <button className="btn btn-primary" disabled={trip.receipts.length === 0} onClick={() => go({ screen: "settle", tripId })}>
          💸 Settle up
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 8: Manual sanity check**

Run: `npm run dev` and open the printed URL (phone-width in devtools). Create a trip, add friends, remove a friend, confirm the sunny theme renders.
Expected: no console errors; layout usable at 375px width.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: app shell, sunny theme, trip list and trip screens"
```

---

### Task 8: Review screen (editable items + total check, doubles as manual entry)

**Files:**
- Modify: `src/screens/ReviewScreen.tsx` (replace placeholder)
- Test: `src/screens/review.test.tsx`

- [ ] **Step 1: Write failing tests `src/screens/review.test.tsx`**

Seed `localStorage` with a trip in review status, render `App`, and drive the UI.

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { saveData } from "../lib/storage";
import type { Trip } from "../types";

function seedTrip(): Trip {
  return {
    id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
    people: [
      { id: "p1", name: "Pedro", color: "#ffd9a0" },
      { id: "p2", name: "Ana", color: "#ffc4b8" },
    ],
    receipts: [{
      id: "r1", storeName: "Lidl", date: "2026-07-08", paidBy: "p1",
      items: [
        { id: "i1", name: "Fries", quantity: 1, lineTotal: 249, assignment: { kind: "unassigned" } },
        { id: "i2", name: "Juice", quantity: 3, lineTotal: 450, assignment: { kind: "unassigned" } },
      ],
      printedTotal: 699, status: "review",
    }],
    createdAt: "2026-07-08T00:00:00Z", schemaVersion: 1,
  };
}

beforeEach(() => {
  localStorage.clear();
  saveData({ schemaVersion: 1, trips: [seedTrip()] });
});

async function openReceipt(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(/algarve/i));
  await user.click(screen.getByText(/lidl/i));
}

describe("review screen", () => {
  it("shows items and a matching total", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openReceipt(user);
    expect(screen.getByDisplayValue("Fries")).toBeInTheDocument();
    expect(screen.getByText(/matches/i)).toBeInTheDocument();
  });

  it("warns when items do not sum to the printed total", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openReceipt(user);
    const price = screen.getByLabelText("Fries price");
    await user.clear(price);
    await user.type(price, "3.00");
    await user.tab(); // blur commits
    expect(screen.getByText(/off by/i)).toBeInTheDocument();
  });

  it("adds and removes items", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openReceipt(user);
    await user.click(screen.getByRole("button", { name: /add item/i }));
    expect(screen.getAllByPlaceholderText(/item name/i)).toHaveLength(3);
    await user.click(screen.getAllByRole("button", { name: /remove item/i })[2]);
    expect(screen.getAllByPlaceholderText(/item name/i)).toHaveLength(2);
  });

  it("moves to assigning on confirm", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openReceipt(user);
    await user.click(screen.getByRole("button", { name: /looks right/i }));
    expect(screen.getByText(/who got what/i)).toBeInTheDocument(); // AssignScreen placeholder heading (Task 9)
  });
});
```

> Note: the last test needs the `AssignScreen` placeholder to render the heading `Who got what?` — update the placeholder to `return <h2>Who got what?</h2>;` as part of this task so the navigation is testable before Task 9.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: review tests FAIL (placeholder screen has no items UI).

- [ ] **Step 3: Implement `src/screens/ReviewScreen.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useStore } from "../state/StoreProvider";
import { newId } from "../lib/ids";
import { formatCents, parseToCents } from "../lib/money";
import type { View } from "../App";
import type { Item, Receipt } from "../types";

function MoneyInput({ cents, onChange, label }: { cents: number; onChange: (c: number) => void; label: string }) {
  const [text, setText] = useState((cents / 100).toFixed(2));
  useEffect(() => setText((cents / 100).toFixed(2)), [cents]);
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      style={{ width: 90, textAlign: "right" }}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = parseToCents(text);
        if (parsed !== null) onChange(parsed);
        else setText((cents / 100).toFixed(2));
      }}
    />
  );
}

export function ReviewScreen({ tripId, receiptId, go }: { tripId: string; receiptId: string; go: (v: View) => void }) {
  const { data, dispatch } = useStore();
  const trip = data.trips.find((t) => t.id === tripId);
  const receipt = trip?.receipts.find((r) => r.id === receiptId);
  if (!trip || !receipt) return null;

  const update = (r: Receipt) => dispatch({ type: "updateReceipt", tripId, receipt: r });
  const updateItem = (item: Item) =>
    update({ ...receipt, items: receipt.items.map((i) => (i.id === item.id ? item : i)) });

  const itemSum = receipt.items.reduce((s, i) => s + i.lineTotal, 0);
  const diff = receipt.printedTotal - itemSum;

  function addItem() {
    update({
      ...receipt!,
      items: [...receipt!.items, { id: newId(), name: "", quantity: 1, lineTotal: 0, assignment: { kind: "unassigned" } }],
    });
  }

  return (
    <div>
      <div className="topbar">
        <button className="btn btn-ghost" aria-label="Back" onClick={() => go({ screen: "trip", tripId })}>←</button>
        <h1 className="screen-title">Check the receipt</h1>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <input
            placeholder="Store name"
            value={receipt.storeName}
            onChange={(e) => update({ ...receipt, storeName: e.target.value })}
          />
          <input
            type="date"
            style={{ width: 150 }}
            value={receipt.date}
            onChange={(e) => update({ ...receipt, date: e.target.value })}
          />
        </div>
        <label className="muted">
          Paid by{" "}
          <select value={receipt.paidBy} onChange={(e) => update({ ...receipt, paidBy: e.target.value })}>
            {trip.people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="card">
        {receipt.items.map((item) => (
          <div key={item.id} className="item-row row">
            <input
              placeholder="Item name"
              aria-label={`${item.name || "new item"} name`}
              value={item.name}
              onChange={(e) => updateItem({ ...item, name: e.target.value })}
            />
            <input
              aria-label={`${item.name} quantity`}
              inputMode="numeric"
              style={{ width: 52, textAlign: "center" }}
              value={item.quantity}
              onChange={(e) => {
                const q = parseInt(e.target.value, 10);
                if (Number.isFinite(q) && q >= 1) updateItem({ ...item, quantity: q, assignment: { kind: "unassigned" } });
              }}
            />
            <MoneyInput label={`${item.name} price`} cents={item.lineTotal} onChange={(c) => updateItem({ ...item, lineTotal: c })} />
            <button
              className="btn btn-ghost"
              aria-label="Remove item"
              onClick={() => update({ ...receipt, items: receipt.items.filter((i) => i.id !== item.id) })}
            >
              🗑
            </button>
          </div>
        ))}
        <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={addItem}>＋ Add item</button>
      </div>

      <div className="card row">
        <b>Receipt total</b>
        <MoneyInput label="Receipt total" cents={receipt.printedTotal} onChange={(c) => update({ ...receipt, printedTotal: c })} />
      </div>

      {diff === 0 ? (
        <div className="banner-good">✓ Items match the receipt total ({formatCents(itemSum, trip.currency)})</div>
      ) : (
        <div className="banner-warn">
          ⚠️ Items sum to {formatCents(itemSum, trip.currency)} — off by {formatCents(diff, trip.currency)}. Fix a line or continue and the payer absorbs the difference.
        </div>
      )}

      <div className="footerbar">
        <button
          className="btn btn-primary"
          disabled={receipt.items.length === 0}
          onClick={() => {
            dispatch({ type: "setReceiptStatus", tripId, receiptId, status: "assigning" });
            go({ screen: "receipt", tripId, receiptId });
          }}
        >
          Looks right →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update the `AssignScreen` placeholder heading**

In `src/screens/AssignScreen.tsx`, change the placeholder to:

```tsx
import type { View } from "../App";
export function AssignScreen(_props: { tripId: string; receiptId: string; go: (v: View) => void }) {
  return <h2>Who got what?</h2>;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all review tests PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: review screen with editable items and total check"
```

---

### Task 9: Assign screen (item by item)

**Files:**
- Modify: `src/screens/AssignScreen.tsx` (replace placeholder), `src/screens/SettleScreen.tsx` (placeholder heading only)
- Test: `src/screens/assign.test.tsx`

- [ ] **Step 1: Write failing tests `src/screens/assign.test.tsx`**

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { saveData } from "../lib/storage";
import type { Trip } from "../types";

function seedTrip(): Trip {
  return {
    id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
    people: [
      { id: "p1", name: "Pedro", color: "#ffd9a0" },
      { id: "p2", name: "Ana", color: "#ffc4b8" },
      { id: "p3", name: "Bruno", color: "#c9e8c9" },
    ],
    receipts: [{
      id: "r1", storeName: "Lidl", date: "2026-07-08", paidBy: "p1",
      items: [
        { id: "i1", name: "Fries", quantity: 1, lineTotal: 249, assignment: { kind: "unassigned" } },
        { id: "i2", name: "Juice", quantity: 3, lineTotal: 450, assignment: { kind: "unassigned" } },
      ],
      printedTotal: 699, status: "assigning",
    }],
    createdAt: "2026-07-08T00:00:00Z", schemaVersion: 1,
  };
}

beforeEach(() => {
  localStorage.clear();
  saveData({ schemaVersion: 1, trips: [seedTrip()] });
});

async function openAssign(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText(/algarve/i));
  await user.click(screen.getByText(/lidl/i));
}

describe("assign screen", () => {
  it("shows unassigned count and disables done", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    expect(screen.getByText(/2 of 2 items unassigned/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /done/i })).toBeDisabled();
  });

  it("assigns an item to one person by tapping their chip", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Fries"));
    await user.click(screen.getByRole("button", { name: "Pedro" }));
    expect(screen.getByText(/1 of 2 items unassigned/i)).toBeInTheDocument();
  });

  it("toggles a second person into an equal split, and out again", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Fries"));
    await user.click(screen.getByRole("button", { name: "Pedro" }));
    await user.click(screen.getByRole("button", { name: "Ana" }));
    expect(screen.getByText(/Pedro, Ana/)).toBeInTheDocument(); // summary line
    await user.click(screen.getByRole("button", { name: "Ana" }));
    await user.click(screen.getByRole("button", { name: "Pedro" }));
    expect(screen.getByText(/2 of 2 items unassigned/i)).toBeInTheDocument();
  });

  it("assigns to everyone", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Fries"));
    await user.click(screen.getByRole("button", { name: /everyone/i }));
    expect(screen.getByText(/👥 Everyone/)).toBeInTheDocument();
  });

  it("splits quantity lines by units", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Juice"));
    await user.click(screen.getByRole("button", { name: /split units/i }));
    // steppers: give Ana 2, Bruno 1
    await user.click(screen.getByRole("button", { name: "More units for Ana" }));
    await user.click(screen.getByRole("button", { name: "More units for Ana" }));
    await user.click(screen.getByRole("button", { name: "More units for Bruno" }));
    expect(screen.getByText(/3 of 3 units assigned/i)).toBeInTheDocument();
  });

  it("enables done when everything is assigned, then reaches settle", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Fries"));
    await user.click(screen.getByRole("button", { name: /everyone/i }));
    await user.click(screen.getByText("Juice"));
    await user.click(screen.getByRole("button", { name: /everyone/i }));
    const done = screen.getByRole("button", { name: /done/i });
    expect(done).toBeEnabled();
    await user.click(done);
    expect(screen.getByText(/settle up/i)).toBeInTheDocument(); // SettleScreen placeholder heading
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: assign tests FAIL (placeholder has no chips).

- [ ] **Step 3: Implement `src/screens/AssignScreen.tsx`**

```tsx
import { useState } from "react";
import { useStore } from "../state/StoreProvider";
import { formatCents } from "../lib/money";
import { isFullyAssigned, isItemAssigned } from "../lib/split";
import type { View } from "../App";
import type { Assignment, Item, Person } from "../types";

function assignmentSummary(item: Item, people: Person[]): string {
  const a = item.assignment;
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? "?";
  if (a.kind === "everyone") return "👥 Everyone";
  if (a.kind === "people" && a.personIds.length > 0) return a.personIds.map(name).join(", ");
  if (a.kind === "units") {
    const parts = Object.entries(a.shares).filter(([, u]) => u > 0);
    if (parts.length > 0) return parts.map(([id, u]) => `${name(id)} ×${u}`).join(", ");
  }
  return "Tap to assign";
}

export function AssignScreen({ tripId, receiptId, go }: { tripId: string; receiptId: string; go: (v: View) => void }) {
  const { data, dispatch } = useStore();
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [unitsMode, setUnitsMode] = useState(false);
  const trip = data.trips.find((t) => t.id === tripId);
  const receipt = trip?.receipts.find((r) => r.id === receiptId);
  if (!trip || !receipt) return null;

  const setAssignment = (itemId: string, assignment: Assignment) =>
    dispatch({ type: "setAssignment", tripId, receiptId, itemId, assignment });

  function togglePerson(item: Item, personId: string) {
    const a = item.assignment;
    const current = a.kind === "people" ? a.personIds : [];
    const next = current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId];
    setAssignment(item.id, next.length === 0 ? { kind: "unassigned" } : { kind: "people", personIds: next });
  }

  function bumpUnits(item: Item, personId: string, delta: number) {
    const shares = item.assignment.kind === "units" ? { ...item.assignment.shares } : {};
    const assigned = Object.values(shares).reduce((s, u) => s + u, 0);
    const next = Math.max(0, (shares[personId] ?? 0) + delta);
    if (delta > 0 && assigned >= item.quantity) return; // no over-assignment
    shares[personId] = next;
    if (next === 0) delete shares[personId];
    setAssignment(item.id, Object.keys(shares).length === 0 ? { kind: "unassigned" } : { kind: "units", shares });
  }

  const unassignedCount = receipt.items.filter((i) => !isItemAssigned(i)).length;

  return (
    <div>
      <div className="topbar">
        <button className="btn btn-ghost" aria-label="Back" onClick={() => go({ screen: "trip", tripId })}>←</button>
        <h1 className="screen-title">Who got what?</h1>
        <button
          className="btn btn-ghost"
          onClick={() => {
            dispatch({ type: "setReceiptStatus", tripId, receiptId, status: "review" });
            go({ screen: "receipt", tripId, receiptId });
          }}
        >
          ✏️ Edit items
        </button>
      </div>

      {receipt.items.map((item) => {
        const open = openItemId === item.id;
        const a = item.assignment;
        const unitsAssigned = a.kind === "units" ? Object.values(a.shares).reduce((s, u) => s + u, 0) : 0;
        return (
          <div key={item.id} className="card" style={!isItemAssigned(item) ? { outline: "2px dashed #ffb347" } : undefined}>
            <button
              style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
              onClick={() => {
                setOpenItemId(open ? null : item.id);
                setUnitsMode(false);
              }}
            >
              <div className="row">
                <span>{item.quantity > 1 ? `${item.quantity}× ` : ""}{item.name}</span>
                <b>{formatCents(item.lineTotal, trip.currency)}</b>
              </div>
              <div className="muted">{assignmentSummary(item, trip.people)}</div>
            </button>

            {open && !unitsMode && (
              <div style={{ marginTop: 8 }}>
                {trip.people.map((p) => {
                  const selected = a.kind === "people" && a.personIds.includes(p.id);
                  return (
                    <button key={p.id} className={`chip ${selected ? "selected" : ""}`} style={{ background: p.color }}
                      onClick={() => togglePerson(item, p.id)}>
                      {p.name}
                    </button>
                  );
                })}
                <button className={`chip ${a.kind === "everyone" ? "selected" : ""}`}
                  onClick={() => setAssignment(item.id, a.kind === "everyone" ? { kind: "unassigned" } : { kind: "everyone" })}>
                  👥 Everyone
                </button>
                {item.quantity > 1 && (
                  <button className="chip" onClick={() => setUnitsMode(true)}>🔢 Split units</button>
                )}
              </div>
            )}

            {open && unitsMode && (
              <div style={{ marginTop: 8 }}>
                {trip.people.map((p) => {
                  const units = a.kind === "units" ? a.shares[p.id] ?? 0 : 0;
                  return (
                    <div key={p.id} className="row" style={{ padding: "4px 0" }}>
                      <span className="chip" style={{ background: p.color, cursor: "default" }}>{p.name}</span>
                      <span>
                        <button className="chip" aria-label={`Fewer units for ${p.name}`} onClick={() => bumpUnits(item, p.id, -1)}>−</button>
                        <b style={{ margin: "0 8px" }}>{units}</b>
                        <button className="chip" aria-label={`More units for ${p.name}`} onClick={() => bumpUnits(item, p.id, +1)}>＋</button>
                      </span>
                    </div>
                  );
                })}
                <div className="muted">{unitsAssigned} of {item.quantity} units assigned</div>
              </div>
            )}
          </div>
        );
      })}

      <div className="footerbar">
        <div className="muted" style={{ textAlign: "center", marginBottom: 6 }}>
          {unassignedCount === 0
            ? "All assigned 🎉"
            : `${unassignedCount} of ${receipt.items.length} items unassigned`}
        </div>
        <button
          className="btn btn-primary"
          disabled={!isFullyAssigned(receipt)}
          onClick={() => {
            dispatch({ type: "setReceiptStatus", tripId, receiptId, status: "done" });
            go({ screen: "settle", tripId });
          }}
        >
          Done → Settle up
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Make discount lines follow the item above (spec §7)**

Add this test to `src/screens/assign.test.tsx` (it fails first — seed data gets a discount line):

```tsx
  it("a discount line defaults to the assignment of the line above it", async () => {
    const t = seedTrip();
    t.receipts[0].items = [
      { id: "i1", name: "Fries", quantity: 1, lineTotal: 249, assignment: { kind: "unassigned" } },
      { id: "d1", name: "Desconto Fries", quantity: 1, lineTotal: -50, assignment: { kind: "unassigned" } },
    ];
    t.receipts[0].printedTotal = 199;
    saveData({ schemaVersion: 1, trips: [t] });
    const user = userEvent.setup();
    render(<App />);
    await openAssign(user);
    await user.click(screen.getByText("Fries"));
    await user.click(screen.getByRole("button", { name: "Pedro" }));
    // both the item and its discount are now assigned
    expect(screen.getByText(/all assigned/i)).toBeInTheDocument();
  });
```

In `src/screens/AssignScreen.tsx`, add an `assign` helper below `setAssignment` and route every assignment change through it:

```tsx
  /** Assign an item; a directly-following unassigned discount line inherits the same assignment (spec §7). */
  function assign(item: Item, assignment: Assignment) {
    setAssignment(item.id, assignment);
    const idx = receipt!.items.findIndex((i) => i.id === item.id);
    const next = receipt!.items[idx + 1];
    if (next && next.lineTotal < 0 && next.assignment.kind === "unassigned") {
      setAssignment(next.id, assignment);
    }
  }
```

Then update the three call sites:
- in `togglePerson`, replace the final `setAssignment(item.id, …)` line with `assign(item, next.length === 0 ? { kind: "unassigned" } : { kind: "people", personIds: next });`
- the **Everyone** chip's `onClick` becomes `assign(item, a.kind === "everyone" ? { kind: "unassigned" } : { kind: "everyone" })`
- in `bumpUnits`, replace the final `setAssignment(item.id, …)` line with `assign(item, Object.keys(shares).length === 0 ? { kind: "unassigned" } : { kind: "units", shares });`

(The discount line itself remains individually re-assignable by tapping it.)

Run: `npm test` — Expected: the new test passes, previous assign tests still pass.

- [ ] **Step 5: Update `src/screens/SettleScreen.tsx` placeholder heading**

```tsx
import type { View } from "../App";
export function SettleScreen(_props: { tripId: string; go: (v: View) => void }) {
  return <h2>Settle up</h2>;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: all assign tests PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: item-by-item assign screen with everyone and unit splits"
```

---

### Task 10: Summary text + settle screen with share button

**Files:**
- Create: `src/lib/summary.ts`
- Modify: `src/screens/SettleScreen.tsx` (replace placeholder)
- Test: `src/lib/summary.test.ts`, `src/screens/settle.test.tsx`

- [ ] **Step 1: Write failing tests `src/lib/summary.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { summaryText } from "./summary";
import type { Trip } from "../types";

const trip: Trip = {
  id: "t1", name: "Algarve 2026", emoji: "🏖️", currency: "EUR",
  people: [
    { id: "pedro", name: "Pedro", color: "#ffd9a0" },
    { id: "ana", name: "Ana", color: "#ffc4b8" },
  ],
  receipts: [{
    id: "r1", storeName: "Lidl", date: "2026-07-08", paidBy: "pedro",
    items: [{ id: "i1", name: "stuff", quantity: 1, lineTotal: 1000, assignment: { kind: "everyone" } }],
    printedTotal: 1000, status: "done",
  }],
  createdAt: "", schemaVersion: 1,
};

describe("summaryText", () => {
  it("contains the header, per-person lines and transfers", () => {
    const text = summaryText(trip);
    expect(text).toContain("🏖️ Algarve 2026");
    expect(text).toContain("1 receipt");
    expect(text).toMatch(/Pedro: .*5[.,]00.* \(paid .*10[.,]00.*\)/);
    expect(text).toMatch(/💸 Ana → Pedro .*5[.,]00/);
  });

  it("says all square when balanced", () => {
    const even: Trip = { ...trip, receipts: [] };
    expect(summaryText(even)).toContain("All square! 🎉");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './summary'`.

- [ ] **Step 3: Implement `src/lib/summary.ts`**

```ts
import type { Trip } from "../types";
import { balances, paidTotals, settle, shareTotals } from "./settle";
import { formatCents } from "./money";

export function summaryText(trip: Trip): string {
  const paid = paidTotals(trip);
  const shares = shareTotals(trip);
  const transfers = settle(balances(trip));
  const name = (id: string) => trip.people.find((p) => p.id === id)?.name ?? "?";
  const total = trip.receipts.reduce((s, r) => s + r.printedTotal, 0);
  const fmt = (c: number) => formatCents(c, trip.currency);

  const lines = [
    `${trip.emoji} ${trip.name} — grocery split`,
    `${trip.receipts.length} receipt${trip.receipts.length === 1 ? "" : "s"} · ${fmt(total)} total`,
    "",
    ...trip.people.map((p) => `${p.name}: ${fmt(shares[p.id] ?? 0)} (paid ${fmt(paid[p.id] ?? 0)})`),
    "",
  ];
  if (transfers.length > 0) {
    lines.push("To settle:");
    for (const t of transfers) lines.push(`💸 ${name(t.from)} → ${name(t.to)} ${fmt(t.amount)}`);
  } else {
    lines.push("All square! 🎉");
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run summary tests to verify they pass**

Run: `npm test`
Expected: summary tests PASS.

- [ ] **Step 5: Write failing tests `src/screens/settle.test.tsx`**

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { saveData } from "../lib/storage";
import type { Trip } from "../types";

function seedTrip(): Trip {
  return {
    id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
    people: [
      { id: "p1", name: "Pedro", color: "#ffd9a0" },
      { id: "p2", name: "Ana", color: "#ffc4b8" },
    ],
    receipts: [{
      id: "r1", storeName: "Lidl", date: "2026-07-08", paidBy: "p1",
      items: [{ id: "i1", name: "stuff", quantity: 1, lineTotal: 1000, assignment: { kind: "everyone" } }],
      printedTotal: 1000, status: "done",
    }],
    createdAt: "", schemaVersion: 1,
  };
}

beforeEach(() => {
  localStorage.clear();
  saveData({ schemaVersion: 1, trips: [seedTrip()] });
});

describe("settle screen", () => {
  it("shows per-person totals and transfers", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText(/algarve/i));
    await user.click(screen.getByRole("button", { name: /settle up/i }));
    expect(screen.getByText("Pedro")).toBeInTheDocument();
    expect(screen.getByText(/Ana → Pedro/)).toBeInTheDocument();
  });

  it("copies the summary when Web Share is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText(/algarve/i));
    await user.click(screen.getByRole("button", { name: /settle up/i }));
    await user.click(screen.getByRole("button", { name: /share/i }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Algarve"));
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });

  it("warns when a receipt still has unassigned items", async () => {
    const t = seedTrip();
    t.receipts[0].items[0].assignment = { kind: "unassigned" };
    t.receipts[0].status = "assigning";
    saveData({ schemaVersion: 1, trips: [t] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText(/algarve/i));
    await user.click(screen.getByRole("button", { name: /settle up/i }));
    expect(screen.getByText(/unassigned items/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run settle-screen tests to verify they fail**

Run: `npm test`
Expected: settle screen tests FAIL (placeholder).

- [ ] **Step 7: Implement `src/screens/SettleScreen.tsx`**

```tsx
import { useState } from "react";
import { useStore } from "../state/StoreProvider";
import { balances, paidTotals, settle, shareTotals } from "../lib/settle";
import { isFullyAssigned } from "../lib/split";
import { formatCents } from "../lib/money";
import { summaryText } from "../lib/summary";
import type { View } from "../App";

export function SettleScreen({ tripId, go }: { tripId: string; go: (v: View) => void }) {
  const { data } = useStore();
  const [copied, setCopied] = useState(false);
  const trip = data.trips.find((t) => t.id === tripId);
  if (!trip) return null;

  const paid = paidTotals(trip);
  const shares = shareTotals(trip);
  const transfers = settle(balances(trip));
  const name = (id: string) => trip.people.find((p) => p.id === id)?.name ?? "?";
  const hasUnassigned = trip.receipts.some((r) => !isFullyAssigned(r));

  async function share() {
    const text = summaryText(trip!);
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // user cancelled or share failed — fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="topbar">
        <button className="btn btn-ghost" aria-label="Back" onClick={() => go({ screen: "trip", tripId })}>←</button>
        <h1 className="screen-title">Settle up</h1>
      </div>

      {hasUnassigned && (
        <div className="banner-warn">⚠️ Some receipts have unassigned items — their cost currently falls on the payer.</div>
      )}

      <div className="card">
        <h3>Each person's share</h3>
        {trip.people.map((p) => (
          <div key={p.id} className="row" style={{ padding: "6px 0" }}>
            <span className="chip" style={{ background: p.color, cursor: "default" }}>{p.name}</span>
            <span>
              <b>{formatCents(shares[p.id] ?? 0, trip.currency)}</b>
              <span className="muted"> · paid {formatCents(paid[p.id] ?? 0, trip.currency)}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>To settle</h3>
        {transfers.length === 0 ? (
          <p>All square! 🎉</p>
        ) : (
          transfers.map((t, idx) => (
            <div key={idx} className="row" style={{ padding: "6px 0" }}>
              <span>💸 {name(t.from)} → {name(t.to)}</span>
              <b>{formatCents(t.amount, trip.currency)}</b>
            </div>
          ))
        )}
      </div>

      {copied && <div className="banner-good">Copied to clipboard ✓</div>}
      <div className="footerbar">
        <button className="btn btn-primary" onClick={share}>📤 Share summary</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 9: Per-receipt share (spec §9)**

Add this test to `src/lib/summary.test.ts`:

```ts
import { receiptSummaryText } from "./summary";

describe("receiptSummaryText", () => {
  it("breaks one receipt down per person", () => {
    const text = receiptSummaryText(trip, trip.receipts[0]);
    expect(text).toContain("🧾 Lidl");
    expect(text).toMatch(/Pedro: .*5[.,]00/);
    expect(text).toMatch(/paid by Pedro/i);
  });
});
```

Add to `src/lib/summary.ts`:

```ts
import type { Receipt } from "../types";
import { receiptShares } from "./split";

export function receiptSummaryText(trip: Trip, receipt: Receipt): string {
  const shares = receiptShares(receipt, trip.people);
  const fmt = (c: number) => formatCents(c, trip.currency);
  const payer = trip.people.find((p) => p.id === receipt.paidBy)?.name ?? "?";
  return [
    `🧾 ${receipt.storeName || "Receipt"} · ${receipt.date}`,
    `${fmt(receipt.printedTotal)} paid by ${payer}`,
    "",
    ...trip.people
      .filter((p) => (shares[p.id] ?? 0) !== 0)
      .map((p) => `${p.name}: ${fmt(shares[p.id] ?? 0)}`),
  ].join("\n");
}
```

(Merge the imports with the existing ones at the top of `summary.ts`.)

In `src/screens/AssignScreen.tsx`, add a share button to the topbar (after the ✏️ Edit items button), sharing this receipt's breakdown with the same share-or-copy mechanism:

```tsx
<button
  className="btn btn-ghost"
  aria-label="Share receipt"
  onClick={async () => {
    const text = receiptSummaryText(trip, receipt);
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* fall through */ }
    }
    await navigator.clipboard.writeText(text);
  }}
>
  📤
</button>
```

with the import `import { receiptSummaryText } from "../lib/summary";` added at the top.

Run: `npm test` — Expected: new summary test passes, everything else stays green.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: settle screen with trip and per-receipt share summaries"
```

---

### Task 11: Image downscale, Claude scan client, settings screen

**Files:**
- Create: `src/lib/image.ts`, `src/lib/scan.ts`
- Modify: `src/screens/SettingsScreen.tsx` (replace placeholder)
- Test: `src/lib/scan.test.ts`, `src/screens/settings.test.tsx`

- [ ] **Step 1: Create `src/lib/image.ts`** (no unit test — canvas is unavailable in jsdom; verified manually in Task 12)

```ts
/** Downscale a photo to a base64 JPEG string (no data: prefix). ~1568px keeps AI cost low (spec §6). */
export async function downscaleToBase64Jpeg(file: File, maxEdge = 1568): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}
```

- [ ] **Step 2: Write failing tests `src/lib/scan.test.ts`**

The SDK is mocked at the module boundary; the real `zodOutputFormat` helper is used as-is.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const parseMock = vi.fn();
const createMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {}
  class AuthenticationError extends APIError {}
  const Anthropic = vi.fn().mockImplementation(() => ({
    messages: { parse: parseMock, create: createMock },
  })) as unknown as { new (...args: unknown[]): unknown; APIError: unknown; AuthenticationError: unknown };
  Anthropic.APIError = APIError;
  Anthropic.AuthenticationError = AuthenticationError;
  return { default: Anthropic };
});

import Anthropic from "@anthropic-ai/sdk";
import { scanReceipt, verifyApiKey, ScanError } from "./scan";

const goodOutput = {
  storeName: "Lidl",
  date: "2026-07-08",
  currency: "EUR",
  items: [{ name: "Sumo laranja", quantity: 3, lineTotal: 450 }],
  printedTotal: 450,
};

beforeEach(() => {
  parseMock.mockReset();
  createMock.mockReset();
});

describe("scanReceipt", () => {
  it("returns the parsed structured output", async () => {
    parseMock.mockResolvedValue({ stop_reason: "end_turn", parsed_output: goodOutput });
    const result = await scanReceipt("sk-ant-x", "base64data");
    expect(result.items[0].name).toBe("Sumo laranja");
    // sends the image and asks the right model
    const req = parseMock.mock.calls[0][0];
    expect(req.model).toBe("claude-opus-4-8");
    expect(req.messages[0].content[0]).toMatchObject({ type: "image" });
  });

  it("throws no-key without calling the API", async () => {
    await expect(scanReceipt("", "img")).rejects.toMatchObject({ reason: "no-key" });
    expect(parseMock).not.toHaveBeenCalled();
  });

  it("maps refusals", async () => {
    parseMock.mockResolvedValue({ stop_reason: "refusal", parsed_output: null });
    await expect(scanReceipt("sk", "img")).rejects.toMatchObject({ reason: "refused" });
  });

  it("maps missing parsed output", async () => {
    parseMock.mockResolvedValue({ stop_reason: "end_turn", parsed_output: null });
    await expect(scanReceipt("sk", "img")).rejects.toMatchObject({ reason: "unparseable" });
  });

  it("maps auth errors to bad-key", async () => {
    parseMock.mockRejectedValue(new (Anthropic as any).AuthenticationError("401"));
    await expect(scanReceipt("sk", "img")).rejects.toMatchObject({ reason: "bad-key" });
  });

  it("maps other API errors to network", async () => {
    parseMock.mockRejectedValue(new (Anthropic as any).APIError("529"));
    await expect(scanReceipt("sk", "img")).rejects.toMatchObject({ reason: "network" });
  });
});

describe("verifyApiKey", () => {
  it("true when a tiny request succeeds", async () => {
    createMock.mockResolvedValue({});
    expect(await verifyApiKey("sk")).toBe(true);
  });
  it("false on auth error", async () => {
    createMock.mockRejectedValue(new (Anthropic as any).AuthenticationError("401"));
    expect(await verifyApiKey("sk")).toBe(false);
  });
  it("false immediately for empty key", async () => {
    expect(await verifyApiKey("")).toBe(false);
    expect(createMock).not.toHaveBeenCalled();
  });
  it("throws ScanError on network problems", async () => {
    createMock.mockRejectedValue(new Error("offline"));
    await expect(verifyApiKey("sk")).rejects.toBeInstanceOf(ScanError);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './scan'`.

- [ ] **Step 4: Implement `src/lib/scan.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export const ScanResultSchema = z.object({
  storeName: z.string(),
  date: z.string().nullable(),
  currency: z.string(),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number(),
      lineTotal: z.number(),
    })
  ),
  printedTotal: z.number(),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

export type ScanFailure = "no-key" | "bad-key" | "refused" | "unparseable" | "network";

export class ScanError extends Error {
  constructor(public reason: ScanFailure, message: string) {
    super(message);
    this.name = "ScanError";
  }
}

const PROMPT = `Read this grocery receipt photo.
Return every purchased line as an item:
- "name": the printed item name, lightly cleaned up but kept in its original language.
- "quantity": integer number of units on the line (1 for weight-priced lines).
- "lineTotal": what the line cost, in integer cents. Discounts are their own items with a NEGATIVE lineTotal, placed immediately after the item they discount. Bottle deposits and bag fees are normal items.
- "printedTotal": the total amount paid, in integer cents.
- "currency": ISO 4217 code of the receipt's currency (e.g. "EUR").
- "date": purchase date as YYYY-MM-DD if printed, else null.
Do not invent items. Skip loyalty-point, VAT-breakdown, and payment-method lines.`;

function makeClient(apiKey: string) {
  // Official browser mode: the SDK sends the CORS opt-in header for us.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

export async function scanReceipt(apiKey: string, imageBase64: string): Promise<ScanResult> {
  if (!apiKey) throw new ScanError("no-key", "No API key configured");
  const client = makeClient(apiKey);
  let response;
  try {
    response = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(ScanResultSchema) },
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new ScanError("bad-key", "The API key was rejected");
    if (err instanceof Anthropic.APIError) throw new ScanError("network", "The scanning service had a problem — try again");
    throw new ScanError("network", "Could not reach the scanning service — are you online?");
  }
  if (response.stop_reason === "refusal") throw new ScanError("refused", "The scan was refused — try a clearer photo");
  if (!response.parsed_output) throw new ScanError("unparseable", "Could not read the receipt — try again or enter items by hand");
  return response.parsed_output;
}

/** Tiny round-trip to check a key. true = works, false = rejected; throws ScanError when unreachable. */
export async function verifyApiKey(apiKey: string): Promise<boolean> {
  if (!apiKey) return false;
  const client = makeClient(apiKey);
  try {
    await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    return true;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return false;
    throw new ScanError("network", "Could not reach the API");
  }
}
```

- [ ] **Step 5: Run scan tests to verify they pass**

Run: `npm test`
Expected: scan tests PASS.

- [ ] **Step 6: Write failing tests `src/screens/settings.test.tsx`**

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { loadApiKey, exportTrip } from "../lib/storage";
import type { Trip } from "../types";

beforeEach(() => localStorage.clear());

describe("settings screen", () => {
  it("saves the API key locally", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.type(screen.getByLabelText(/anthropic api key/i), "sk-ant-test123");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(loadApiKey()).toBe("sk-ant-test123");
    expect(screen.getByText(/saved/i)).toBeInTheDocument();
  });

  it("imports a trip from an export file", async () => {
    const trip: Trip = {
      id: "t9", name: "Madeira", emoji: "⛰️", currency: "EUR",
      people: [], receipts: [], createdAt: "", schemaVersion: 1,
    };
    const file = new File([exportTrip(trip)], "madeira.bills.json", { type: "application/json" });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.upload(screen.getByLabelText(/import trip/i), file);
    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(await screen.findByText(/madeira/i)).toBeInTheDocument();
  });

  it("rejects a non-trip file", async () => {
    const file = new File(["{}"], "junk.json", { type: "application/json" });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.upload(screen.getByLabelText(/import trip/i), file);
    expect(await screen.findByText(/isn't a bills trip/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run settings tests to verify they fail**

Run: `npm test`
Expected: settings tests FAIL (placeholder).

- [ ] **Step 8: Implement `src/screens/SettingsScreen.tsx`**

```tsx
import { useState } from "react";
import { useStore } from "../state/StoreProvider";
import { exportTrip, importTrip, loadApiKey, saveApiKey } from "../lib/storage";
import { verifyApiKey } from "../lib/scan";
import type { View } from "../App";

type KeyStatus = "idle" | "saved" | "checking" | "ok" | "bad" | "unknown";

const KEY_STATUS_TEXT: Record<KeyStatus, string> = {
  idle: "",
  saved: "Saved ✓",
  checking: "Checking…",
  ok: "Key works ✓",
  bad: "Key rejected — double-check it",
  unknown: "Couldn't check — are you online?",
};

export function SettingsScreen({ go }: { go: (v: View) => void }) {
  const { data, dispatch } = useStore();
  const [key, setKey] = useState(loadApiKey());
  const [keyStatus, setKeyStatus] = useState<KeyStatus>("idle");
  const [importError, setImportError] = useState("");

  async function testKey() {
    setKeyStatus("checking");
    try {
      setKeyStatus((await verifyApiKey(key.trim())) ? "ok" : "bad");
    } catch {
      setKeyStatus("unknown");
    }
  }

  function download(tripId: string) {
    const trip = data.trips.find((t) => t.id === tripId);
    if (!trip) return;
    const blob = new Blob([exportTrip(trip)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${trip.name.replace(/\W+/g, "-") || "trip"}.bills.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function handleImport(file: File) {
    try {
      dispatch({ type: "importTrip", trip: importTrip(await file.text()) });
      setImportError("");
    } catch {
      setImportError("That file isn't a Bills trip export.");
    }
  }

  return (
    <div>
      <div className="topbar">
        <button className="btn btn-ghost" aria-label="Back" onClick={() => go({ screen: "trips" })}>←</button>
        <h1 className="screen-title">Settings</h1>
      </div>

      <div className="card">
        <h3>Scanning</h3>
        <p className="muted">
          Receipt scanning uses your own Anthropic API key. Create one at console.anthropic.com → API keys,
          load a few euros of credit, and paste it here. It never leaves this phone. A scan costs a few cents.
        </p>
        <label className="muted" htmlFor="apikey">Anthropic API key</label>
        <input
          id="apikey"
          type="password"
          placeholder="sk-ant-…"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setKeyStatus("idle");
          }}
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button
            className="btn"
            onClick={() => {
              saveApiKey(key);
              setKeyStatus("saved");
            }}
          >
            Save
          </button>
          <button className="btn" onClick={testKey}>Test key</button>
        </div>
        {keyStatus !== "idle" && <p className="muted">{KEY_STATUS_TEXT[keyStatus]}</p>}
      </div>

      <div className="card">
        <h3>Backup</h3>
        {data.trips.map((t) => (
          <div key={t.id} className="row" style={{ padding: "4px 0" }}>
            <span>{t.emoji} {t.name}</span>
            <button className="btn" onClick={() => download(t.id)}>Export</button>
          </div>
        ))}
        <label className="muted" htmlFor="import">Import trip</label>
        <input
          id="import"
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImport(f);
            e.target.value = "";
          }}
        />
        {importError && <div className="banner-warn">{importError}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: Claude scan client, image downscaling and settings screen"
```

---

### Task 12: Wire scanning into the trip screen, PWA polish, deploy

**Files:**
- Modify: `src/screens/TripScreen.tsx`, `index.html`
- Create: `public/manifest.webmanifest`, `public/icon.svg`, `README.md`
- Test: `src/screens/scan-flow.test.tsx`

- [ ] **Step 1: Write failing tests `src/screens/scan-flow.test.tsx`**

Mock only `scanReceipt` and the canvas downscaler; keep the real `ScanError`.

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { saveData, saveApiKey } from "../lib/storage";
import { ScanError } from "../lib/scan";
import type { Trip } from "../types";

vi.mock("../lib/image", () => ({
  downscaleToBase64Jpeg: vi.fn().mockResolvedValue("fakebase64"),
}));
vi.mock("../lib/scan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/scan")>();
  return { ...actual, scanReceipt: vi.fn() };
});

import { scanReceipt } from "../lib/scan";

function seedTrip(): Trip {
  return {
    id: "t1", name: "Algarve", emoji: "🏖️", currency: "EUR",
    people: [{ id: "p1", name: "Pedro", color: "#ffd9a0" }],
    receipts: [], createdAt: "", schemaVersion: 1,
  };
}

beforeEach(() => {
  localStorage.clear();
  saveData({ schemaVersion: 1, trips: [seedTrip()] });
  saveApiKey("sk-ant-test");
  vi.mocked(scanReceipt).mockReset();
});

const photo = new File(["x"], "receipt.jpg", { type: "image/jpeg" });

describe("scan flow", () => {
  it("scans a photo into a review-ready receipt", async () => {
    vi.mocked(scanReceipt).mockResolvedValue({
      storeName: "Lidl", date: "2026-07-08", currency: "EUR",
      items: [{ name: "Sumo laranja", quantity: 3, lineTotal: 450 }],
      printedTotal: 450,
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText(/algarve/i));
    await user.upload(screen.getByLabelText(/scan receipt/i), photo);
    // lands on the review screen with the scanned items
    expect(await screen.findByDisplayValue("Sumo laranja")).toBeInTheDocument();
    expect(screen.getByText(/matches/i)).toBeInTheDocument();
  });

  it("shows a friendly error with retry when scanning fails", async () => {
    vi.mocked(scanReceipt).mockRejectedValue(new ScanError("network", "The scanning service had a problem — try again"));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText(/algarve/i));
    await user.upload(screen.getByLabelText(/scan receipt/i), photo);
    expect(await screen.findByText(/had a problem/i)).toBeInTheDocument();
    // retry uses the kept photo
    vi.mocked(scanReceipt).mockResolvedValue({
      storeName: "Lidl", date: null, currency: "EUR",
      items: [{ name: "Pão", quantity: 1, lineTotal: 119 }],
      printedTotal: 119,
    });
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByDisplayValue("Pão")).toBeInTheDocument();
  });

  it("sends you to settings when no key is saved", async () => {
    localStorage.removeItem("bills.apiKey");
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText(/algarve/i));
    await user.upload(screen.getByLabelText(/scan receipt/i), photo);
    expect(await screen.findByLabelText(/anthropic api key/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: scan-flow tests FAIL (no scan button yet).

- [ ] **Step 3: Add scanning to `src/screens/TripScreen.tsx`**

Add these imports at the top:

```tsx
import { useRef } from "react";
import { loadApiKey } from "../lib/storage";
import { downscaleToBase64Jpeg } from "../lib/image";
import { scanReceipt, ScanError } from "../lib/scan";
```

Add state and the handler inside the component (after the existing `personName` state):

```tsx
const [scanState, setScanState] = useState<"idle" | "busy" | "error">("idle");
const [scanMessage, setScanMessage] = useState("");
const lastPhoto = useRef<File | null>(null);

async function handlePhoto(file: File) {
  lastPhoto.current = file;
  const apiKey = loadApiKey();
  if (!apiKey) {
    go({ screen: "settings" });
    return;
  }
  setScanState("busy");
  try {
    const base64 = await downscaleToBase64Jpeg(file);
    const result = await scanReceipt(apiKey, base64);
    const receipt: Receipt = {
      id: newId(),
      storeName: result.storeName,
      date: result.date ?? new Date().toISOString().slice(0, 10),
      paidBy: trip!.people[0].id,
      items: result.items.map((i) => ({
        id: newId(),
        name: i.name,
        quantity: Math.max(1, Math.round(i.quantity)),
        lineTotal: Math.round(i.lineTotal),
        assignment: { kind: "unassigned" as const },
      })),
      printedTotal: Math.round(result.printedTotal),
      status: "review",
    };
    if (trip!.receipts.length === 0 && result.currency) {
      dispatch({ type: "setCurrency", tripId, currency: result.currency });
    }
    dispatch({ type: "addReceipt", tripId, receipt });
    setScanState("idle");
    go({ screen: "receipt", tripId, receiptId: receipt.id });
  } catch (err) {
    setScanState("error");
    setScanMessage(
      err instanceof ScanError ? err.message : "Something went wrong reading the photo."
    );
    if (err instanceof ScanError && err.reason === "bad-key") {
      setScanMessage("The API key was rejected — check it in Settings.");
    }
  }
}
```

Replace the existing `footerbar` block with:

```tsx
{scanState === "error" && (
  <div className="banner-warn">
    ⚠️ {scanMessage}{" "}
    <button className="btn btn-ghost" onClick={() => lastPhoto.current && handlePhoto(lastPhoto.current)}>
      Try again
    </button>
  </div>
)}

<div className="footerbar">
  <label className="btn btn-primary" style={{ display: "block", textAlign: "center", opacity: trip.people.length === 0 ? 0.45 : 1, marginBottom: 8 }}>
    {scanState === "busy" ? "🧾✨ Reading receipt…" : "📸 Scan receipt"}
    <input
      hidden
      type="file"
      accept="image/*"
      capture="environment"
      aria-label="Scan receipt"
      disabled={trip.people.length === 0 || scanState === "busy"}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void handlePhoto(f);
        e.target.value = "";
      }}
    />
  </label>
  <div className="row">
    <button className="btn" style={{ flex: 1 }} disabled={trip.people.length === 0} onClick={addManualReceipt}>
      ✍️ Add items by hand
    </button>
    <button className="btn" style={{ flex: 1 }} disabled={trip.receipts.length === 0} onClick={() => go({ screen: "settle", tripId })}>
      💸 Settle up
    </button>
  </div>
</div>
```

> The Task 7 test queried the by-hand button with `getByRole("button", ...)` and the settle button — both remain buttons, so those tests stay green.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS (scan-flow, plus the older suites).

- [ ] **Step 5: Add PWA manifest and icon**

`public/manifest.webmanifest`:

```json
{
  "name": "Bills",
  "short_name": "Bills",
  "description": "Split holiday grocery receipts with friends",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#FFF8F0",
  "theme_color": "#FF7059",
  "icons": [{ "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }]
}
```

`public/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFB347"/>
      <stop offset="1" stop-color="#FF7059"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="22" fill="url(#g)"/>
  <text x="50" y="66" font-size="48" text-anchor="middle">🧾</text>
</svg>
```

Add inside `<head>` of `index.html`:

```html
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/icon.svg" />
```

- [ ] **Step 6: Create `README.md`**

```markdown
# Bills 🧾

Split holiday grocery receipts with friends. Snap a photo, let AI read the items,
tap who got what, and see who owes whom.

## Run locally

```bash
npm install
npm run dev          # open on your phone: npm run dev -- --host
npm test             # unit + component tests
npm run build        # production build in dist/
```

## Scanning setup (one time)

1. Create an API key at https://console.anthropic.com → API keys.
2. Add a few euros of credit (Billing). A scanned receipt costs a few cents.
3. In the app: ⚙️ Settings → paste the key → Save → Test key.

The key and all trip data stay in your phone's browser storage. Use
Settings → Export for backups.

## Deploy

Any static host works. Easiest: `npm run build`, then drag the `dist/`
folder onto https://app.netlify.com/drop — you get a URL to bookmark on
your phone ("Add to Home Screen" makes it feel like a native app).
```

- [ ] **Step 7: Full verification**

Run: `npm test && npm run build`
Expected: all tests PASS, build succeeds.

- [ ] **Step 8: Manual acceptance test (spec §12) — on a real phone**

1. `npm run dev -- --host` and open the LAN URL on a phone (same Wi-Fi), or deploy `dist/` first.
2. Settings → paste real API key → Test key → "Key works ✓".
3. Create a trip, add 3 friends.
4. Scan a real grocery receipt → items appear → total matches (or fix a line).
5. Assign: one item to one person, one shared by two, one to Everyone, one quantity-split.
6. Settle: totals look right, transfers make sense, Share opens the share sheet with the summary text.
7. Kill the browser, reopen — everything is still there.

Expected: full flow works end-to-end; note any receipt formats the scanner struggles with.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: receipt scanning flow, PWA manifest and README"
```

- [ ] **Step 10: Deploy**

```bash
npm run build
```

Then drag `dist/` onto https://app.netlify.com/drop (no account config needed) and verify the deployed URL on a phone. Record the URL in the README ("Live at: …") and commit:

```bash
git add README.md
git commit -m "docs: add deployed URL"
```

---

## Done criteria

- All Vitest suites green; `npm run build` clean.
- Manual acceptance (Task 12 Step 8) passed on a real phone with a real receipt.
- Deployed URL reachable and installable ("Add to Home Screen").

