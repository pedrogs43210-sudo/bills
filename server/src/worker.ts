import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { PROMPT, SCAN_MODEL, ScanResultSchema, normaliseDiscountSigns } from "../../src/lib/receipt";
import { decideQuota, isValidInstallId, peekQuota, FREE_SCANS_PER_MONTH, type QuotaRow } from "./quota";

/**
 * The scan proxy.
 *
 * It exists because the app currently asks every user to create their own Anthropic API key,
 * which no member of the public will ever do. One key lives here instead, and the server counts
 * what each install uses — the only place that count can live, since localStorage.clear() is
 * otherwise an infinite supply of free scans.
 *
 * It deliberately knows nothing about trips, receipts or who owes whom. That stays on the phone.
 */

export interface Env {
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  /** Comma-separated list of origins allowed to call this. */
  ALLOWED_ORIGINS: string;
  /**
   * A shared secret the app sends. Honest about what this is: a token shipped inside a client
   * can be extracted, so it stops casual drive-by use of the endpoint and nothing more. Real
   * assurance arrives with App Attest / Play Integrity once there is a native build to attest.
   */
  APP_TOKEN: string;
  /** Optional override, so the free allowance can be tuned without a deploy. */
  FREE_SCANS?: string;
}

/** A downscaled 1568px JPEG lands around 200 KB; this is generous and still bounded. */
const MAX_IMAGE_BYTES = 1_500_000;
/** Two scans a second is a script, not a person photographing a receipt. */
const MIN_SCAN_INTERVAL_MS = 2000;

type Json = Record<string, unknown>;

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
  const ok = origin !== null && allowed.includes(origin);
  return {
    "access-control-allow-origin": ok ? origin! : allowed[0] ?? "",
    "access-control-allow-headers": "content-type, x-install-id, x-app-token",
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

function json(body: Json, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Reads the install's counter row. Returns null when this install has never scanned. */
async function readRow(env: Env, installId: string): Promise<QuotaRow & { last_scan_at: number | null } | null> {
  const row = await env.DB.prepare("SELECT month, used, last_scan_at FROM installs WHERE install_id = ?")
    .bind(installId)
    .first<{ month: string; used: number; last_scan_at: number | null }>();
  return row ?? null;
}

/**
 * Subscribers are not capped. Nothing writes to this table yet — in-app purchases land later —
 * so today this is always false, and it is a lookup rather than a hard-coded `false` so that
 * inserting a verified receipt is the only thing needed to switch it on.
 */
async function isSubscribed(env: Env, installId: string, now: number): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT status, current_period_end FROM subscriptions WHERE install_id = ?"
  )
    .bind(installId)
    .first<{ status: string; current_period_end: number | null }>();
  if (!row) return false;
  const live = row.status === "active" || row.status === "grace";
  // A missing period end means "no known expiry" rather than "expired", so a store notification
  // that arrives without one does not cut off someone who has paid.
  return live && (row.current_period_end === null || row.current_period_end > now);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin");
    const cors = corsHeaders(origin, env);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const installId = request.headers.get("x-install-id");
    const appToken = request.headers.get("x-app-token");

    if (env.APP_TOKEN && appToken !== env.APP_TOKEN) {
      return json({ error: "forbidden" }, 403, cors);
    }
    if (!isValidInstallId(installId)) {
      return json({ error: "bad-install-id" }, 400, cors);
    }
    const id = installId!;
    const limit = Number(env.FREE_SCANS ?? FREE_SCANS_PER_MONTH) || FREE_SCANS_PER_MONTH;
    const now = new Date();

    if (request.method === "GET" && url.pathname === "/v1/quota") {
      const [row, subscribed] = await Promise.all([readRow(env, id), isSubscribed(env, id, now.getTime())]);
      const q = peekQuota(row, now, subscribed, limit);
      return json({ ...q, limit: subscribed ? null : limit, subscribed }, 200, cors);
    }

    if (request.method === "POST" && url.pathname === "/v1/scan") {
      return handleScan(request, env, cors, id, limit, now);
    }

    return json({ error: "not-found" }, 404, cors);
  },
};

async function handleScan(
  request: Request,
  env: Env,
  cors: Record<string, string>,
  installId: string,
  limit: number,
  now: Date
): Promise<Response> {
  let body: { imageBase64?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "bad-json" }, 400, cors);
  }
  const imageBase64 = body.imageBase64;
  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    return json({ error: "no-image" }, 400, cors);
  }
  if (imageBase64.length > MAX_IMAGE_BYTES) {
    return json({ error: "image-too-large" }, 413, cors);
  }

  const [row, subscribed] = await Promise.all([
    readRow(env, installId),
    isSubscribed(env, installId, now.getTime()),
  ]);

  if (row?.last_scan_at && now.getTime() - row.last_scan_at < MIN_SCAN_INTERVAL_MS) {
    return json({ error: "too-fast" }, 429, cors);
  }

  const decision = decideQuota(row, now, subscribed, limit);
  if (!decision.allowed) {
    return json(
      { error: "quota-exceeded", used: decision.used, left: 0, limit, month: decision.month },
      402, // Payment Required: the one status code that means exactly this
      cors
    );
  }

  // Reserve the scan before spending anyone's money on it. The conditional UPDATE is the real
  // enforcement — two requests arriving together both read the same row, and only one can win
  // the `used < limit` check inside SQLite. decideQuota above provides the numbers to report.
  const reserved = await reserve(env, installId, decision.month, subscribed, limit, now.getTime());
  if (!reserved) {
    return json({ error: "quota-exceeded", used: limit, left: 0, limit, month: decision.month }, 402, cors);
  }

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await client.messages.parse(
      {
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
      },
      { timeout: 60_000 }
    );

    if (response.stop_reason === "refusal") {
      await refund(env, installId, decision.month);
      return json({ error: "refused" }, 422, cors);
    }
    if (!response.parsed_output) {
      await refund(env, installId, decision.month);
      return json({ error: "unparseable" }, 422, cors);
    }

    const result = normaliseDiscountSigns(response.parsed_output);
    const left = subscribed ? null : Math.max(0, limit - decision.used);
    // The photo is never written anywhere — not to D1, not to logs.
    return json({ result, used: decision.used, left, limit: subscribed ? null : limit }, 200, cors);
  } catch (err) {
    // Our failure, not theirs: give the scan back rather than charging for a scan they never got.
    await refund(env, installId, decision.month);
    const status = err instanceof Anthropic.APIError ? 502 : 500;
    return json({ error: "scan-failed" }, status, cors);
  }
}

/**
 * Claim one scan atomically. Creates the row on first use and resets the counter when the stored
 * month is older than this one, then increments only if the cap still allows it.
 */
async function reserve(
  env: Env,
  installId: string,
  month: string,
  subscribed: boolean,
  limit: number,
  nowMs: number
): Promise<boolean> {
  await env.DB.prepare(
    `INSERT INTO installs (install_id, month, used, created_at)
     VALUES (?1, ?2, 0, ?3)
     ON CONFLICT(install_id) DO UPDATE SET
       used = CASE WHEN installs.month <> ?2 THEN 0 ELSE installs.used END,
       month = ?2`
  )
    .bind(installId, month, nowMs)
    .run();

  const result = await env.DB.prepare(
    `UPDATE installs SET used = used + 1, last_scan_at = ?3
     WHERE install_id = ?1 AND month = ?2 AND (?4 = 1 OR used < ?5)`
  )
    .bind(installId, month, nowMs, subscribed ? 1 : 0, limit)
    .run();

  return (result.meta?.changes ?? 0) === 1;
}

/** Give a reserved scan back, never below zero. */
async function refund(env: Env, installId: string, month: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE installs SET used = MAX(0, used - 1) WHERE install_id = ?1 AND month = ?2"
  )
    .bind(installId, month)
    .run();
}
