/**
 * Everything about reading a receipt that is not about *who* is calling the model.
 *
 * Shared deliberately: the app scans directly with the user's own key today, and the
 * Cloudflare Worker scans with the app's key on their behalf. The prompt and the schema are
 * load-bearing — they decide which printed total is captured and which lines are discounts —
 * so there must be exactly one copy of them.
 */
import { z } from "zod";
import type { ReceiptTotals } from "./discounts";

/**
 * Sonnet 5, chosen for one reason: **image resolution**.
 *
 * A plain constant, not an env lookup: this module is imported by both the browser app and the
 * Cloudflare Worker, and only one of those has `import.meta.env`. The Worker can still override
 * it per-deploy via its own binding.
 *
 * Haiku 4.5 caps images at 1568px on the long edge. Sonnet 5 is the first Sonnet-tier model with
 * high-resolution vision, at 2576px — and on a creased receipt photographed in a holiday kitchen,
 * resolution *is* accuracy. Haiku was tried on real receipts and misread most of them.
 *
 * Opus 4.8 has the same 2576px ceiling at 2.5x the price, so it is the fallback if Sonnet is ever
 * not good enough rather than the default.
 */
export const SCAN_MODEL = "claude-sonnet-5";

/**
 * The long edge to downscale a photo to before sending it.
 *
 * Matches the model's ceiling: sending more is wasted bytes, sending less throws away the detail
 * that decides whether "1,19" reads as 1.19 or 7.19. At 2576px a receipt costs roughly a cent to
 * read, which is the whole reason a bigger image is worth it.
 */
export const SCAN_IMAGE_MAX_EDGE = 2576;

export const ScanResultSchema = z.object({
  /**
   * How much of the receipt could actually be read.
   *
   * Asked for because nothing else can tell us. A blurry or half-cropped photo does not make the
   * model refuse and does not produce output that fails the schema — it produces confident, valid,
   * wrong numbers, which is the single most damaging thing this app can return. Both automatic
   * refund paths miss it, so the person paid a scan for a receipt they now have to check line by
   * line, and may not.
   *
   * "unreadable" is a refund and a retake. "partial" is charged — there is a usable result — but
   * the review screen says so loudly rather than presenting a guess as a reading.
   */
  readQuality: z.enum(["good", "partial", "unreadable"]),
  /** One short phrase for the person, present only when readQuality is not "good". */
  readProblem: z.string().nullable(),
  storeName: z.string(),
  date: z.string().nullable(),
  /** ISO 4217 as printed, or null when the receipt shows no currency at all. */
  currency: z.string().nullable(),
  items: z.array(
    z.object({
      name: z.string(),
      quantity: z.number().int(),
      lineTotal: z.number().int(),
      /**
       * Whether this line is something bought or a discount applied to the line above it.
       * Asked for explicitly because the two are indistinguishable by shape, and whether a
       * discount counts towards the split depends on the store's convention — see
       * `discountConvention` in ./discounts.
       */
      kind: z.enum(["item", "discount"]),
    })
  ),
  /**
   * What was actually paid — the "valor a pagar" / "total a pagar" figure. Named to stop the
   * model choosing between two printed totals: a Pingo Doce receipt shows both a pre-discount
   * TOTAL and the amount paid, and capturing the wrong one is the bug that started all this.
   */
  paidTotal: z.number().int(),
  /** The pre-discount subtotal when the receipt prints one separately, else null. */
  preDiscountTotal: z.number().int().nullable(),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;
export type ScanItem = ScanResult["items"][number];


export const PROMPT = `Read this receipt or restaurant bill photo.

The receipt may be in ANY language, script or currency — Portuguese, Spanish, Italian, French,
German, English, Greek, Turkish, Japanese, Arabic, anything. Every word list below is a set of
EXAMPLES, never the whole set. Identify each line by what it MEANS and WHERE it sits on the
receipt, not by matching a word you have seen before. When a label is in a language or wording not
listed, apply the same rule you would to its English equivalent.

The "items" array is ONLY the shopping: the lines for things bought, and the discount lines that
apply to them. It is NOT a transcript of the receipt.

A restaurant bill charges for things beyond the food, and those ARE part of what the table owes:
service charge, cover charge, corkage, a printed tip or gratuity, a delivery fee. Put each of them
in "items" as its own line with "kind":"item", keeping the printed name. They are not payment
lines — the diners consumed them and will divide them. Examples, non-exhaustive: SERVICE CHARGE /
SERVICE / GRATUITY / TIP / COVER / CORKAGE / DELIVERY (English), SERVIÇO / TAXA DE SERVIÇO /
GORJETA / COUVERT (Portuguese), SERVICIO / CUBIERTO (Spanish), SERVIZIO / COPERTO (Italian),
SERVICE COMPRIS / COUVERT (French), BEDIENUNG / TRINKGELD (German), サービス料 (Japanese).
A tip written on by hand after printing usually cannot be read — do not guess at one.

NEVER put a total, subtotal, tax line, payment line or change line in "items". Those are the
figures printed after the shopping, usually with a rule above them, and they belong in
"paidTotal" and "preDiscountTotal" and nowhere else. Examples across languages, non-exhaustive:
TOTAL / SUBTOTAL / TOTAL DUE / AMOUNT DUE / BALANCE / CHANGE / CASH / CARD / VAT / TAX (English),
TOTAL A PAGAR / VALOR A PAGAR / A PAGAR / TROCO / IVA / NUMERARIO / MULTIBANCO (Portuguese),
TOTAL A PAGAR / IMPORTE / EFECTIVO / TARJETA / CAMBIO (Spanish), TOTALE / DA PAGARE / CONTANTI /
RESTO (Italian), MONTANT / ESPECES / CARTE / RENDU (French), SUMME / GESAMT / ZU ZAHLEN /
BAR / RUCKGELD / MWST (German), 合計 / 小計 / お預り / お釣り (Japanese). If you are unsure
whether a line is an item or a total, leave it out — a missing item is easy for the person to add,
a duplicated total silently multiplies what everybody owes.

Before anything else, judge whether the photograph can actually be read, and report it in
"readQuality":
- "good": the lines and prices are legible. Report this when the receipt is readable even if it is
  creased, faded, at an angle or photographed in poor light — those are normal and you can cope.
- "partial": you can read most of it, but some lines or figures are genuinely illegible, or part of
  the receipt is cut off by the edge of the frame. Return everything you CAN read.
- "unreadable": you cannot reliably read the prices — too blurred, too dark, too small in frame,
  badly out of focus, or the photograph is not a receipt at all.
Set "readProblem" to one short phrase naming what is wrong, in English, addressed to the person
holding the phone: "the photo is blurred", "the bottom of the receipt is cut off", "it is too dark
to read the prices", "that does not look like a receipt". Null when "readQuality" is "good".

Judge this honestly and independently of how much you managed to extract. Guessing at a price you
cannot see is far worse than saying you cannot see it: a wrong number here is split between friends
and argued about later, and nobody checks a total that looks plausible.

For each shopping line, in the order they appear:
- "name": the printed name, kept in its ORIGINAL language and script. Do not translate it: the
  person reading it knows what they bought and needs to recognise it on the paper. Lightly clean
  up obvious scanning noise only.
- "quantity": integer number of units on the line (1 for weight-priced lines).
- "lineTotal": the amount printed on that line, in integer cents of the receipt's own currency.
  Receipts write decimals as either "1,19" or "1.19", and some group thousands the other way
  round ("1.234,56" or "1,234.56") — read the number the way that receipt writes numbers. For a
  currency with no minor unit (such as JPY), multiply the printed figure by 100.
- "kind": "item" for something bought, "discount" for a discount applied to the line above it.
  A discount line is typically indented under its item, often in brackets, and reduces what was
  paid. Examples, non-exhaustive: DESCONTO / POUPANCA / CARTAO / TALAO DESCONTO (Portuguese),
  DESCUENTO / AHORRO (Spanish), SCONTO (Italian), REMISE / REDUCTION (French), RABATT (German),
  DISCOUNT / SAVINGS / COUPON / OFFER / PROMO (English), 割引 (Japanese).
  Report the amount as printed, whether or not the receipt shows a minus sign — do not decide the
  sign yourself. Bottle deposits and bag fees are "item", not "discount". A refund or corrected
  line is an "item" with a negative lineTotal.
- "paidTotal": the amount ACTUALLY PAID, in integer cents. Many receipts print two totals: a
  pre-discount subtotal and the amount finally due after discounts. Always report the amount
  finally due, never the pre-discount one. When only one total is printed, that is the amount paid.
- "preDiscountTotal": the pre-discount subtotal, in integer cents, only when the receipt prints
  one as a separate figure from the amount paid. Otherwise null.
- "currency": ISO 4217 code of the currency actually printed on the receipt, read from its symbol
  or code (€ EUR, £ GBP, $ USD, CHF, zł PLN, kr SEK/NOK/DKK, ¥ JPY, ₺ TRY, and so on). If no
  currency is shown anywhere, use null rather than guessing.
- "date": purchase date as YYYY-MM-DD if printed, else null. Receipts write dates in many orders
  (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD) — use the shop's own convention where the digits make it
  unambiguous, and prefer DD/MM when they do not.
Do not invent lines. Read the printed digits — never round, estimate, or carry a figure across
from another line. Before you answer, check that no entry in "items" is a total, that any service
charge, cover or printed tip IS in "items", and that the items plausibly add up to either
"paidTotal" or "preDiscountTotal".`;

/**
 * Force every discount line negative. Continente prints discounts unsigned, so the model is
 * told to copy what the paper says rather than guess — which means the sign has to be settled
 * here. It matters more than it looks: a discount left positive can coincidentally satisfy the
 * "discounts are separate lines" test and pick the wrong convention with total confidence.
 * Item lines are never touched, because a refund is legitimately negative.
 */
export function normaliseDiscountSigns(result: ScanResult): ScanResult {
  return {
    ...result,
    items: result.items.map((i) =>
      i.kind === "discount" && i.lineTotal > 0 ? { ...i, lineTotal: -i.lineTotal } : i
    ),
  };
}

/** Split a scan into the three totals `discountConvention` needs. */
export function scanTotals(result: ScanResult): ReceiptTotals {
  let itemsTotal = 0;
  let discountsTotal = 0;
  for (const line of result.items) {
    if (line.kind === "discount") discountsTotal += line.lineTotal;
    else itemsTotal += line.lineTotal;
  }
  return { itemsTotal, discountsTotal, paidTotal: result.paidTotal };
}

/**
 * What a scan noticed that the receipt should remember: how well it read, and a currency that
 * disagrees with the split's.
 *
 * A function rather than two inline spreads at each call site. There are two of those — the quick
 * scan in the router and the scan on a split's own screen — and a field added to one and forgotten
 * in the other is a warning that appears on some receipts and not others for no reason anybody
 * could work out.
 */
export function scanNotes(
  result: ScanResult,
  tripCurrency: string
): { readQuality?: "partial"; readProblem?: string; scannedCurrency?: string } {
  const printed = (result.currency ?? "").trim().toUpperCase();
  return {
    ...(result.readQuality === "partial" ? { readQuality: "partial" as const } : {}),
    ...(result.readQuality === "partial" && result.readProblem
      ? { readProblem: result.readProblem }
      : {}),
    // Only when it actually disagrees. Recording a match would put a "currency?" question on every
    // receipt scanned at home, which is how a useful prompt becomes wallpaper.
    ...(printed && printed !== tripCurrency.toUpperCase() ? { scannedCurrency: printed } : {}),
  };
}
