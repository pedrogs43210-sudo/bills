import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ReceiptTotals } from "./discounts";

export const ScanResultSchema = z.object({
  storeName: z.string(),
  date: z.string().nullable(),
  currency: z.string(),
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

/**
 * Reading a receipt into a list is not work that needs the largest model, and every scan
 * costs real money once the app pays for its own scanning: Haiku is about a fifth the price
 * of Opus per receipt. Its images cap at 1568px on the long edge, which is what
 * downscaleToBase64Jpeg already produces.
 */
const SCAN_MODEL = "claude-haiku-4-5";

export type ScanFailure = "no-key" | "bad-key" | "refused" | "unparseable" | "network";

export class ScanError extends Error {
  constructor(public reason: ScanFailure, message: string) {
    super(message);
    this.name = "ScanError";
  }
}

const PROMPT = `Read this grocery receipt photo.
Return every printed line as an entry, in the order they appear:
- "name": the printed name, lightly cleaned up but kept in its original language.
- "quantity": integer number of units on the line (1 for weight-priced lines).
- "lineTotal": the amount printed on that line, in integer cents.
- "kind": "item" for something bought, "discount" for a discount applied to the line above it.
  Discount lines are usually indented and often in brackets, with wording like "Desconto",
  "Poupança", "Cartão", "Talão desconto". Report the amount as printed, whether or not the
  receipt shows a minus sign — do not decide the sign yourself.
  Bottle deposits and bag fees are "item", not "discount". A refund or corrected line is an
  "item" with a negative lineTotal.
- "paidTotal": the amount ACTUALLY PAID, in integer cents. Many receipts print two totals: a
  pre-discount subtotal (often "TOTAL") and the amount paid (often "VALOR A PAGAR",
  "TOTAL A PAGAR", "A PAGAR"). Always report the amount paid here, never the pre-discount one.
- "preDiscountTotal": the pre-discount subtotal, in integer cents, only when the receipt prints
  one as a separate figure from the amount paid. Otherwise null.
- "currency": ISO 4217 code of the receipt's currency (e.g. "EUR").
- "date": purchase date as YYYY-MM-DD if printed, else null.
Do not invent lines. Skip loyalty-point balances, VAT breakdowns, and payment-method lines.`;

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
      model: SCAN_MODEL,
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
    }, { timeout: 60_000 });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new ScanError("bad-key", "The API key was rejected");
    // Check connection errors BEFORE APIError — APIConnectionError is a subclass of APIError.
    if (err instanceof Anthropic.APIConnectionError) throw new ScanError("network", "Could not reach the scanning service — are you online?");
    if (err instanceof Anthropic.APIError) throw new ScanError("network", "The scanning service had a problem — try again");
    throw new ScanError("network", "Could not reach the scanning service — are you online?");
  }
  if (response.stop_reason === "refusal") throw new ScanError("refused", "The scan was refused — try a clearer photo");
  if (!response.parsed_output) throw new ScanError("unparseable", "Could not read the receipt — try again or enter items by hand");
  return normaliseDiscountSigns(response.parsed_output);
}

/**
 * Force every discount line negative. Continente prints discounts unsigned, so the model is
 * told to copy what the paper says rather than guess — which means the sign has to be settled
 * here. It matters more than it looks: a discount left positive can coincidentally satisfy the
 * "discounts are separate lines" test and pick the wrong convention with total confidence.
 * Item lines are never touched, because a refund is legitimately negative.
 */
function normaliseDiscountSigns(result: ScanResult): ScanResult {
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

/** Tiny round-trip to check a key. true = works, false = rejected; throws ScanError when unreachable. */
export async function verifyApiKey(apiKey: string): Promise<boolean> {
  if (!apiKey) return false;
  const client = makeClient(apiKey);
  try {
    await client.messages.create({
      model: SCAN_MODEL,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    }, { timeout: 15_000 });
    return true;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return false;
    throw new ScanError("network", "Could not reach the API");
  }
}
