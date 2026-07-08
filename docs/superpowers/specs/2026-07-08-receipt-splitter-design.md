# Receipt Splitter — Design Spec

**Date:** 2026-07-08
**Status:** Approved pending user review
**Name:** Bills

## 1. What it is

A mobile web app for splitting grocery receipts among friends on holiday. One person pays at the store; back home, they photograph the receipt, the app extracts the items with AI, the group assigns each item to one person, several people, or everyone, and the app computes what each person owes — across all receipts of the trip — plus the minimal payments to settle up.

## 2. Decisions made during brainstorming

| Question | Decision |
|---|---|
| Platform | Mobile web app (installable via "Add to Home Screen"); no app store |
| Scanning | AI vision — Claude API reads the photo and returns structured items |
| Collaboration model | One phone is the ledger; the payer/organizer scans and assigns; results shared as text |
| Scope | Whole-trip: a trip holds members and multiple receipts, possibly with different payers |
| Quantity lines | Splittable — e.g. "3× juice" can go 2 units to Ana, 1 to Bruno |
| Architecture | Fully static, serverless; data on-device; Claude API called directly from the browser |
| Assignment UX | Item-by-item: tap an item, then tap person chips / "Everyone" |
| Visual style | "Sunny holiday" — warm sunset palette, rounded, playful |

## 3. Non-goals (v1)

- No accounts, login, or cloud sync.
- No real-time multi-user editing (friends don't join live from their phones).
- No multi-currency within a single trip (one currency per trip; scanner detects it on the first receipt).
- No payment integration — the app tells people what to transfer; they use MB Way / bank / cash themselves.

## 4. Architecture

- **Stack:** React + TypeScript + Vite. Single-page app, mobile-first.
- **Hosting:** any free static host (Netlify / GitHub Pages / Vercel static). No backend.
- **Persistence:** `localStorage` (JSON, versioned schema). Receipt photos are **not** persisted — they live in memory only during scan/review; the extracted items are what's saved. Export/import of a whole trip as a JSON file from Settings for backup or moving phones.
- **AI:** Claude API (`@anthropic-ai/sdk`) called directly from the browser using the SDK's browser mode (`dangerouslyAllowBrowser: true`, which sends the official CORS opt-in header). The user's API key is entered once in Settings and stored only in `localStorage`. This is acceptable for a personal app where the key belongs to the phone's owner.
- **PWA touches:** manifest + icon so it installs to the home screen; app shell and stored data work offline (scanning requires internet).

## 5. Data model

```ts
type Trip = {
  id: string;
  name: string;            // "Algarve 2026"
  emoji: string;           // trip icon
  currency: string;        // "EUR" — set from first scan, editable
  people: Person[];
  receipts: Receipt[];
  createdAt: string;       // ISO date
  schemaVersion: number;
};

type Person = { id: string; name: string; color: string };

type Receipt = {
  id: string;
  storeName: string;
  date: string;            // from receipt if readable, else scan date
  paidBy: string;          // Person.id
  items: Item[];
  printedTotal: number;    // cents — the total printed on the receipt
  status: "review" | "assigning" | "done";
};

type Item = {
  id: string;
  name: string;
  quantity: number;        // ≥ 1; may be weight-based lines with quantity 1
  lineTotal: number;       // cents; negative allowed (discount lines)
  assignment: Assignment;
};

type Assignment =
  | { kind: "unassigned" }
  | { kind: "everyone" }                              // split among all trip members
  | { kind: "people"; personIds: string[] }           // whole line split equally among selected
  | { kind: "units"; shares: Record<string, number> } // per-unit split, e.g. {ana: 2, bruno: 1}
```

All money is stored as **integer cents** — no floating-point currency math anywhere.

## 6. Receipt scanning

1. **Capture:** `<input type="file" accept="image/*" capture="environment">` opens the camera; also accepts picking an existing photo.
2. **Downscale in browser:** canvas-resize to max 1568 px on the long edge, JPEG ≈ 0.8 quality, base64. Keeps image tokens (and cost) low with no meaningful accuracy loss for receipts.
3. **API call:** one `messages.parse` request to model **`claude-opus-4-8`** with the image block plus a short instruction, using **structured outputs** (JSON schema via the SDK's Zod helper) so the response is guaranteed to match:

```ts
{
  storeName: string,
  date: string | null,
  currency: string,        // ISO 4217 guess, e.g. "EUR"
  items: Array<{ name: string; quantity: number; lineTotal: number }>, // lineTotal in cents
  printedTotal: number     // cents
}
```

   Prompt rules: item names cleaned up but kept recognizable (original language); discounts returned as their own negative-total lines placed right after the item they discount; deposit/bag fees are normal lines; `printedTotal` is the paid total on the receipt.
4. **Sanity check:** app sums `items[].lineTotal` and compares with `printedTotal`. Mismatch → yellow banner showing the difference on the review screen; user edits lines (add / remove / change price) or accepts anyway.
5. **Review screen:** every field editable; "Looks right →" moves to assigning.

**Cost:** roughly €0.02–0.05 per receipt at Claude Opus 4.8 pricing ($5/M input, $25/M output; ~1.5–2.5K input tokens for image+prompt, well under 1K output). A two-week holiday of shopping costs well under €1.

**Manual fallback:** "Enter items by hand" is always available (same editor as the review screen), so a failed scan or dead battery on credits never blocks the group.

## 7. Assignment (item by item)

- The assign screen lists all items top to bottom; tapping an item expands person chips + an **Everyone** chip beneath it.
- Tap one person → whole line to them. Tap several → equal split among them. Tap Everyone → `everyone`.
- Lines with `quantity > 1` show an optional "split units" control: steppers per person (Ana 2, Bruno 1). Validation: assigned units ≤ quantity; remainder stays unassigned.
- A sticky footer shows "N of M items unassigned"; the settle screen is reachable only when everything is assigned (discount lines default to the same assignment as the line above them, changeable).

## 8. The math

**Per receipt:**
1. Compute each person's exact fractional share in cents (`everyone` → lineTotal / people.length; `people` → lineTotal / personIds.length; `units` → lineTotal × units/quantity).
2. Round each person's receipt share to whole cents using **largest-remainder** so that the rounded shares sum exactly to `printedTotal` (ties broken in the payer's favor, i.e. the payer takes the extra cent).

**Per trip (settle up):**
1. Balance per person = (sum they paid) − (sum of their shares).
2. Minimal transfers via greedy netting: repeatedly match the largest debtor with the largest creditor until all balances are zero. For a handful of friends this yields the intuitive "Bruno → Pedro €12.15" list.

**Invariant (unit-tested):** for every receipt, shares sum to `printedTotal`; for every trip, transfers zero out all balances.

## 9. Share summary

On the settle screen, a **Share** button generates a plain-text summary and opens the native share sheet (`navigator.share`), with clipboard copy as fallback:

```
🏖️ Algarve 2026 — grocery split
3 receipts · €85.40 total

Pedro: €28.40 (paid €54.30)
Ana: €31.75 (paid €31.10)
Bruno: €25.25 (paid €0.00)

To settle:
💸 Bruno → Pedro €12.15
💸 Ana → Pedro €3.90
```

Per-receipt share (one receipt's breakdown) is available from the receipt screen with the same mechanism.

## 10. Screens

1. **Trip list / trip home** — trip cards; inside a trip: member chips (add/rename/remove — removal blocked if the person has assignments), receipt list with payer and status, running balances, "Scan receipt" button.
2. **Scan & review** — camera/photo picker, spinner during AI call, editable item list, total-match check.
3. **Assign** — item-by-item flow of §7.
4. **Settle** — per-person totals, transfer list, Share button.
5. **Settings** — API key (masked, stored locally, "test key" button makes a tiny API call), trip export/import JSON, about/costs note.

**Visual style — "Sunny holiday":** cream background `#FFF8F0`; sunset gradient accents `#FFB347 → #FF7059`; rounded cards (14px radius, soft shadows); person chips in warm pastels (auto-assigned per person); friendly emoji accents (🧾 📸 💸); large touch targets; system font stack with heavy weights for headings. Must look good and be fully usable one-handed on a ~375px-wide phone screen.

## 11. Error handling

| Situation | Behavior |
|---|---|
| No API key set | Scan button routes to Settings with an explainer + link to key-creation instructions |
| 401 (bad key) | "Key doesn't work" message, link to Settings |
| 429 / 5xx / network failure | Friendly retry message; the captured photo is kept in memory so retry is one tap |
| Response refused or nonsense items | Offer manual entry; photo retained |
| Items don't sum to printed total | Non-blocking warning banner with the difference; user edits or accepts |
| Offline | Viewing/assigning/settling stored data works; scan explains it needs internet |
| Storage full / corrupt JSON on load | Never crash: back up the raw string, start with last-good or empty state, tell the user |

## 12. Testing

- **Unit (Vitest):** split math and rounding invariants (property-style: random receipts → shares always sum to total), settlement netting, assignment validation, storage serialization round-trip and schema migration.
- **Component:** review-screen editing and assign-screen interactions with React Testing Library.
- **Scan flow:** API client mocked with recorded structured responses (good receipt, mismatched total, refusal).
- **Manual acceptance:** one real receipt scanned end-to-end on a real phone before calling it done.

## 13. Build order (for the implementation plan)

1. Project scaffold, data model, storage layer (+ tests)
2. Trip & people management UI
3. Split math + settlement (+ tests)
4. Manual item entry → assign → settle flow (app fully usable without AI)
5. Claude scanning (settings/key, capture, downscale, API call, review screen)
6. Share summary, PWA manifest, sunny-holiday polish pass
7. Deploy to static host
