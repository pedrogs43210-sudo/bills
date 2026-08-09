# Draft notes — receipt discount conventions (next cycle, not yet a spec)

**Captured:** 2026-08-06, from the user's second round of real-world use.
**Status:** design intent only. Needs its own brainstorm → spec → plan cycle after v2 ships.

## The problem

Portuguese supermarket chains print discounts in two incompatible ways, and they look
identical to a scanner: an indented bracketed amount under an item line.

**Pingo Doce — item prices are pre-discount, discounts are separate lines:**

```
Batatas fritas          2.49
Sumo laranja            4.50
   (Desconto           -0.50)
TOTAL                   6.99     <- sum of full prices
VALOR A PAGAR           6.49     <- actually paid
```

**Continente — item prices already include the discount, brackets are informational:**

```
Sumo laranja            4.00     <- already reduced from 4.50
   (Desconto            0.50)    <- already reflected above
TOTAL A PAGAR           4.00
```

Counting the Continente bracket as a line item double-subtracts it. Ignoring the
Pingo Doce bracket leaves the receipt over-stated. The bracket's sign is not a
reliable signal (Continente prints it unsigned).

This is also the **root cause of the bug the user first reported**: on receipts that
print two totals, the scanner captured `TOTAL` (pre-discount) rather than
`VALOR A PAGAR`. The v2 one-tap "use the items' sum" button mitigates the symptom;
capturing the right total fixes the cause.

## The insight: the receipt's own arithmetic disambiguates

With `I` = sum of item lines as printed, `D` = sum of bracketed discounts (as
negative), `P` = amount actually paid:

| Convention | Test that holds |
|---|---|
| Discounts are separate lines (Pingo Doce) | `I + D === P` |
| Discounts already applied (Continente) | `I === P` |

Both hold only when `D === 0`, which is harmless. If neither holds exactly, something
was misread — that is a genuine warning case, not a convention question. No store
list, no user judgement, no per-chain configuration required.

## Proposed shape

1. **Scanner returns more, guesses less.** Tag each line as a real item or a discount
   note; report `printedTotal` as the amount *paid* (explicitly the "a pagar" figure);
   capture a separate pre-discount subtotal when the receipt prints one. The current
   single-total schema forces the model to guess which printed figure is which.
2. **Reconcile after the scan** using the table above: keep the discount lines, drop
   them from the maths, or (neither matches) keep everything and flag it.
3. **State the assumption, let the user overrule it.** One plain sentence on the review
   screen — e.g. "These prices already include the discounts, so I left the 3 discount
   lines out" — with a toggle that recomputes instantly. The user sees the decision
   before assigning anything.

Deliberately **not** doing per-store memory initially: if the arithmetic works, the
store name is irrelevant. Frequent use of the toggle would prove that assumption wrong.

## Validation requirement

Synthetic receipts can only prove the arithmetic. The user must scan several real
Pingo Doce and Continente receipts and report what the app got wrong — that is the
only evidence that matters for this feature.
