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
      quantity: z.number().int(),
      lineTotal: z.number().int(),
    })
  ),
  printedTotal: z.number().int(),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

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
  return response.parsed_output;
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
