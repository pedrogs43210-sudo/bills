import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { normaliseDiscountSigns, PROMPT, SCAN_MODEL, ScanResultSchema } from "./receipt";
import type { ScanResult } from "./receipt";
import { installId } from "./installId";

// Re-exported so callers and tests keep importing "the scanner" from one place.
export { PROMPT, SCAN_MODEL, ScanResultSchema, normaliseDiscountSigns, scanTotals } from "./receipt";
export type { ScanItem, ScanResult } from "./receipt";

export type ScanFailure =
  | "no-key"
  | "bad-key"
  | "refused"
  | "unparseable"
  | "network"
  | "out-of-scans"
  /** The proxy hit its own ceiling for the day. Nothing the person did, and nothing they can buy
   *  their way out of — so it must never be mistaken for having run out of their own scans. */
  | "busy";

/**
 * Where scanning happens.
 *
 * With a proxy configured the app sends the photo to our own server, which holds one key and
 * counts what each install uses — so a stranger can scan without ever hearing the words "API
 * key". Without one, the app falls back to the user's own key, which is how the published web
 * app works today. Both paths exist so deploying the proxy is a switch, not a cutover.
 */
export const scanProxyUrl: string = (import.meta.env?.VITE_SCAN_PROXY_URL ?? "").replace(/\/$/, "");
const appToken: string = import.meta.env?.VITE_APP_TOKEN ?? "";
export const usingProxy = (): boolean => scanProxyUrl !== "";

/** What the proxy said about this install's allowance, when it said anything. */
export type ScanQuota = {
  used: number;
  /** Free trial scans plus bought ones, together. Null for a subscriber, who has no cap. */
  left: number | null;
  limit: number | null;
  /** Of `left`, how many were paid for — so the app can avoid calling a bought scan free. */
  credits: number;
};
let lastQuota: ScanQuota | null = null;
export const lastKnownQuota = (): ScanQuota | null => lastQuota;

export class ScanError extends Error {
  constructor(public reason: ScanFailure, message: string) {
    super(message);
    this.name = "ScanError";
  }
}


function makeClient(apiKey: string) {
  // Official browser mode: the SDK sends the CORS opt-in header for us.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

export async function scanReceipt(apiKey: string, imageBase64: string): Promise<ScanResult> {
  if (usingProxy()) return scanViaProxy(imageBase64);
  if (!apiKey) throw new ScanError("no-key", "No API key configured");
  const client = makeClient(apiKey);
  let response;
  try {
    response = await client.messages.parse({
      model: SCAN_MODEL,
      // Sonnet 5 thinks by default, and max_tokens caps thinking + output together: a long
      // receipt could spend the budget reasoning and truncate mid-list. Transcribing a receipt
      // needs no deliberation, so it is off, and the ceiling is generous for a 60-item shop.
      thinking: { type: "disabled" },
      max_tokens: 16000,
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


/** The proxy's error codes, mapped to something the review screen can already say out loud. */
const PROXY_ERRORS: Record<string, { reason: ScanFailure; message: string }> = {
  "quota-exceeded": { reason: "out-of-scans", message: "That's your free scans used up." },
  "closed-today": { reason: "busy", message: "Billy is having a busy day — scanning is back tomorrow." },
  refused: { reason: "refused", message: "The scan was refused — try a clearer photo" },
  unparseable: { reason: "unparseable", message: "Could not read the receipt — try again or enter items by hand" },
  "image-too-large": { reason: "unparseable", message: "That photo was too big to read — try again." },
  forbidden: { reason: "bad-key", message: "This copy of the app couldn't be verified." },
};

async function scanViaProxy(imageBase64: string): Promise<ScanResult> {
  let response: Response;
  try {
    response = await fetch(`${scanProxyUrl}/v1/scan`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-install-id": installId(),
        ...(appToken ? { "x-app-token": appToken } : {}),
      },
      body: JSON.stringify({ imageBase64 }),
    });
  } catch {
    throw new ScanError("network", "Could not reach the scanning service — are you online?");
  }

  let body: {
    result?: unknown;
    error?: string;
    used?: number;
    left?: number | null;
    limit?: number | null;
    credits?: number;
  };
  try {
    body = await response.json();
  } catch {
    throw new ScanError("network", "The scanning service had a problem — try again");
  }

  // Remember the allowance even on a refusal: the paywall needs it, and a failed scan still
  // tells us where this install stands.
  if (typeof body.used === "number") {
    lastQuota = {
      used: body.used,
      left: body.left ?? null,
      limit: body.limit ?? null,
      credits: body.credits ?? 0,
    };
  }

  if (!response.ok) {
    const known = body.error ? PROXY_ERRORS[body.error] : undefined;
    if (known) throw new ScanError(known.reason, known.message);
    throw new ScanError("network", "The scanning service had a problem — try again");
  }

  // Validate rather than trust: this is another computer's JSON, and every field of it is about
  // to become money on someone's screen.
  const parsed = ScanResultSchema.safeParse(body.result);
  if (!parsed.success) {
    throw new ScanError("unparseable", "Could not read the receipt — try again or enter items by hand");
  }
  return normaliseDiscountSigns(parsed.data);
}

/** Free scans left, straight from the server. Null when there is no proxy to ask. */
export async function fetchQuota(): Promise<ScanQuota | null> {
  if (!usingProxy()) return null;
  try {
    const response = await fetch(`${scanProxyUrl}/v1/quota`, {
      headers: { "x-install-id": installId(), ...(appToken ? { "x-app-token": appToken } : {}) },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as ScanQuota;
    lastQuota = {
      used: body.used,
      left: body.left ?? null,
      limit: body.limit ?? null,
      credits: body.credits ?? 0,
    };
    return lastQuota;
  } catch {
    return null; // the counter is a nicety; never block the app on it
  }
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
