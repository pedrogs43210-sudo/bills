# v3 — Discount conventions

**Source:** `docs/superpowers/specs/2026-08-06-discount-conventions-notes.md`
**Started:** 2026-08-08. Independent of the design refresh and of any backend.

## The problem, in one line

Pingo Doce prints item prices **before** discount and lists the discount separately; Continente
prints item prices **after** discount and shows the discount as information only. The two look
identical to a scanner — an indented bracketed amount under an item — but counting the
Continente bracket subtracts a discount that was already applied.

## The insight being implemented

With `I` = sum of item lines as printed, `D` = sum of discount lines (normalised negative),
`P` = the amount actually paid:

| Test that holds | Convention | What to do |
|---|---|---|
| `I + D === P` | discounts are separate lines | count the discount lines |
| `I === P` | discounts already applied | keep the lines visible, leave them out of the maths |
| both (only possible when `D === 0`) | no discounts | nothing to decide |
| neither | something was misread | say so, change nothing |

No store list, no per-chain configuration, no user judgement required in the normal case.

## Tasks

- [ ] **1. The reconciliation maths** — a pure module that takes the three totals and returns
      which convention the receipt follows. No UI, no scanner changes. Fully unit-testable
      today with synthetic numbers.

- [ ] **2. Scanner returns more and guesses less** — tag each line as a real item or a discount
      note; report `printedTotal` as the amount *paid* (the "a pagar" figure explicitly); capture
      the pre-discount subtotal separately when the receipt prints one. Normalise discount
      amounts to negative regardless of how the receipt signs them. The current single-total
      schema forces the model to guess which printed figure is which, which is the root cause of
      the bug originally reported.

- [ ] **3. Apply the decision after a scan** — mark the discount lines as counted or
      informational according to Task 1's verdict, so the split maths uses the right item sum.
      Requires an `Item` flag; must migrate cleanly and must not disturb existing receipts.

- [ ] **4. Say it in one plain sentence, and let it be overruled** — on the review screen, e.g.
      "These prices already include the discounts, so I left the 3 discount lines out", with a
      toggle that recomputes instantly. The user sees the decision before assigning anything.
      The `mismatch` case gets a warning instead, and changes nothing on its own.

- [ ] **5. Validate against real receipts** — **needs the user.** Several real Pingo Doce and
      Continente receipts scanned, with a note of anything the app got wrong. Synthetic numbers
      can only prove the arithmetic; they cannot prove the scanner tags lines correctly.

Deliberately **not** doing per-store memory: if the arithmetic works, the store name is
irrelevant. Frequent use of the override would disprove that, and is the signal to revisit.

## Order

1 → 2 → 3 → 4 → 5. Task 1 is pure and safe. Tasks 2–4 touch the scan path, so nothing there
ships until Task 5 has run against real paper.
