import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { PROMPT, SCAN_MODEL, ScanResultSchema, normaliseDiscountSigns } from "../../src/lib/receipt";
import {
  decideQuota,
  decideSpend,
  isValidInstallId,
  monthKey,
  peekQuota,
  scanCostMicros,
  FREE_TRIAL_SCANS,
  MAX_SCANS_PER_DAY,
  type QuotaRow,
  type ScanSource,
  type SpendRow,
} from "./quota";

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
  /** Optional override, so the free trial can be tuned without a deploy. */
  FREE_SCANS?: string;
  /** Optional override for the day's ceiling, so it can be raised or dropped to zero in a hurry. */
  MAX_SCANS_PER_DAY?: string;
  /** Optional override, to try a different scanning model without shipping a build. */
  SCAN_MODEL?: string;
}

/**
 * Base64 length cap. A 2576px JPEG at quality 0.9 — what the app now sends, matching the model's
 * resolution ceiling — runs to a couple of megabytes once base64 inflates it by a third. Sized
 * above that and still well under Anthropic's 5MB-per-image limit, so a real receipt is never
 * rejected for being legible.
 */
const MAX_IMAGE_BYTES = 4_000_000;
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
  const row = await env.DB.prepare("SELECT used, credits, last_scan_at FROM installs WHERE install_id = ?")
    .bind(installId)
    .first<{ used: number; credits: number; last_scan_at: number | null }>();
  return row ?? null;
}

/** Today's running total across everybody. Null before the first scan of the day. */
async function readSpend(env: Env, day: string): Promise<SpendRow | null> {
  const row = await env.DB.prepare("SELECT day, scans FROM daily_spend WHERE day = ?")
    .bind(day)
    .first<{ day: string; scans: number }>();
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
    const limit = Number(env.FREE_SCANS ?? FREE_TRIAL_SCANS) || FREE_TRIAL_SCANS;
    // Number("0") is 0 which is falsy, so `||` would quietly turn a deliberate shutdown back into
    // the default. A cap of zero has to mean zero — that is the emergency stop.
    const dayCap = Number.isFinite(Number(env.MAX_SCANS_PER_DAY))
      ? Number(env.MAX_SCANS_PER_DAY)
      : MAX_SCANS_PER_DAY;
    const now = new Date();

    if (request.method === "GET" && url.pathname === "/v1/quota") {
      const [row, subscribed] = await Promise.all([readRow(env, id), isSubscribed(env, id, now.getTime())]);
      const q = peekQuota(row, subscribed, limit);
      return json({ ...q, limit: subscribed ? null : limit, subscribed }, 200, cors);
    }

    if (request.method === "POST" && url.pathname === "/v1/scan") {
      return handleScan(request, env, cors, id, limit, dayCap, now);
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
  dayCap: number,
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

  const decision = decideQuota(row, subscribed, limit);
  if (!decision.allowed) {
    return json(
      { error: "quota-exceeded", used: decision.used, left: 0, limit },
      402, // Payment Required: the one status code that means exactly this
      cors
    );
  }

  // The day's ceiling is checked before the install's allowance is spent, and reported as its own
  // thing: this is the proxy having a busy day, not the person having run out. Sending them to a
  // paywall for it would be a lie.
  const spend = decideSpend(await readSpend(env, dayKeyOf(now)), now, dayCap);
  if (!spend.allowed) {
    return json({ error: "closed-today" }, 503, cors);
  }

  // Reserve the scan before spending anyone's money on it. The conditional UPDATEs are the real
  // enforcement — two requests arriving together both read the same rows, and only one can win the
  // `used < limit` and `scans < cap` checks inside SQLite. The decisions above provide the numbers
  // to report; they do not, by themselves, keep anybody out.
  const claimedDay = await claimDayBudget(env, spend.day, dayCap, now.getTime());
  if (!claimedDay) {
    return json({ error: "closed-today" }, 503, cors);
  }
  const source = decision.source!;
  const reserved = await reserve(env, installId, source, limit, now.getTime());
  if (!reserved) {
    await releaseDayBudget(env, spend.day);
    return json({ error: "quota-exceeded", used: limit, left: 0, limit }, 402, cors);
  }

  const model = env.SCAN_MODEL || SCAN_MODEL;
  const startedAt = Date.now();
  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await client.messages.parse(
      {
        model,
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
      },
      { timeout: 60_000 }
    );

    // Recorded whichever way it went: a scan that was refused or came back unreadable still cost
    // real tokens, and a cost report that only counts the successes understates the bill.
    const ok = response.stop_reason !== "refusal" && Boolean(response.parsed_output);
    await recordScan(env, spend.day, model, response.usage, Date.now() - startedAt, ok);

    if (response.stop_reason === "refusal") {
      await refund(env, installId, source, spend.day);
      return json({ error: "refused" }, 422, cors);
    }
    if (!response.parsed_output) {
      await refund(env, installId, source, spend.day);
      return json({ error: "unparseable" }, 422, cors);
    }

    const result = normaliseDiscountSigns(response.parsed_output);
    // The photo is never written anywhere — not to D1, not to logs.
    return json(
      {
        result,
        used: decision.used,
        left: decision.left,
        credits: decision.credits,
        limit: subscribed ? null : limit,
      },
      200,
      cors
    );
  } catch (err) {
    // Our failure, not theirs: give the scan back rather than charging for a scan they never got.
    await refund(env, installId, source, spend.day);
    await recordScan(env, spend.day, model, undefined, Date.now() - startedAt, false);
    const status = err instanceof Anthropic.APIError ? 502 : 500;
    return json({ error: "scan-failed" }, status, cors);
  }
}

/** The UTC day, in the shape the daily_spend table is keyed by. */
function dayKeyOf(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Claim one scan from a named bucket, atomically.
 *
 * Creates the row on first use. `used` is a lifetime count and nothing resets it — the month column
 * is written for reporting only, so a glance at the table shows when an install was last active
 * without it being load-bearing.
 *
 * The bucket is passed in rather than worked out here, because `decideQuota` already chose it and
 * two places deciding the same thing is two places to disagree. What this function adds is the part
 * a pure function cannot do: the condition is re-checked *inside* SQLite, so of two requests that
 * both saw one credit remaining, exactly one gets it.
 */
async function reserve(
  env: Env,
  installId: string,
  source: ScanSource,
  limit: number,
  nowMs: number
): Promise<boolean> {
  await env.DB.prepare(
    `INSERT INTO installs (install_id, month, used, created_at)
     VALUES (?1, ?2, 0, ?3)
     ON CONFLICT(install_id) DO UPDATE SET month = ?2`
  )
    .bind(installId, monthKey(new Date(nowMs)), nowMs)
    .run();

  const sql =
    source === "subscription"
      ? `UPDATE installs SET used = used + 1, last_scan_at = ?2 WHERE install_id = ?1`
      : source === "trial"
        ? `UPDATE installs SET used = used + 1, last_scan_at = ?2
           WHERE install_id = ?1 AND used < ?3`
        : `UPDATE installs SET used = used + 1, credits = credits - 1, last_scan_at = ?2
           WHERE install_id = ?1 AND credits > 0`;

  const result = await env.DB.prepare(sql).bind(installId, nowMs, limit).run();
  return (result.meta?.changes ?? 0) === 1;
}

/**
 * Add bought scans to an install.
 *
 * Not reachable from any endpoint, deliberately. It is here so that wiring in-app purchases is a
 * matter of verifying a store receipt and calling this — and so that nobody, reading this file
 * later, is tempted to add a route that takes a number of credits from the client.
 */
export async function grantCredits(env: Env, installId: string, scans: number, nowMs: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO installs (install_id, month, used, credits, created_at)
     VALUES (?1, ?2, 0, ?3, ?4)
     ON CONFLICT(install_id) DO UPDATE SET credits = credits + ?3`
  )
    .bind(installId, monthKey(new Date(nowMs)), Math.max(0, Math.trunc(scans)), nowMs)
    .run();
}

/**
 * Claim one scan from today's budget, atomically.
 *
 * The conditional UPDATE is what actually enforces the ceiling: `decideSpend` can only report
 * what a moment ago looked true, and a hundred simultaneous requests all read the same number.
 * Only `scans < cap` inside SQLite can hold the line.
 */
async function claimDayBudget(env: Env, day: string, cap: number, nowMs: number): Promise<boolean> {
  await env.DB.prepare(
    `INSERT INTO daily_spend (day, scans, updated_at) VALUES (?1, 0, ?2)
     ON CONFLICT(day) DO NOTHING`
  )
    .bind(day, nowMs)
    .run();

  const result = await env.DB.prepare(
    "UPDATE daily_spend SET scans = scans + 1, updated_at = ?3 WHERE day = ?1 AND scans < ?2"
  )
    .bind(day, cap, nowMs)
    .run();

  return (result.meta?.changes ?? 0) === 1;
}

/** Give back a claimed slice of the day's budget, never below zero. */
async function releaseDayBudget(env: Env, day: string): Promise<void> {
  await env.DB.prepare("UPDATE daily_spend SET scans = MAX(0, scans - 1) WHERE day = ?1")
    .bind(day)
    .run();
}

/**
 * Give a scan back after a failure — the install's and the day's, together.
 *
 * They are always claimed as a pair, so they are always returned as a pair; refunding one and not
 * the other would slowly poison whichever counter was left behind.
 *
 * A scan paid for with a credit gets the credit back, not a trial scan. They are worth different
 * amounts to the person who owns them.
 */
async function refund(env: Env, installId: string, source: ScanSource, day: string): Promise<void> {
  const sql =
    source === "credits"
      ? "UPDATE installs SET used = MAX(0, used - 1), credits = credits + 1 WHERE install_id = ?1"
      : "UPDATE installs SET used = MAX(0, used - 1) WHERE install_id = ?1";
  await env.DB.prepare(sql).bind(installId).run();
  await releaseDayBudget(env, day);
}

/**
 * Record what a scan cost, with nothing that says who scanned or when beyond the day.
 *
 * The question this exists to answer is "what does a scan actually cost", which has been guessed at
 * for weeks. It cannot answer "what does this person buy, and when" — there is no install id here
 * and no clock finer than the date, so the table is useless for building a picture of anybody.
 */
async function recordScan(
  env: Env,
  day: string,
  model: string,
  usage: { input_tokens?: number; output_tokens?: number } | undefined,
  ms: number,
  ok: boolean
): Promise<void> {
  const input = usage?.input_tokens ?? 0;
  const output = usage?.output_tokens ?? 0;
  try {
    await env.DB.prepare(
      `INSERT INTO scan_stats (day, model, scans, failures, input_tokens, output_tokens, cost_micros, total_ms)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT(day, model) DO UPDATE SET
         scans = scans + ?3,
         failures = failures + ?4,
         input_tokens = input_tokens + ?5,
         output_tokens = output_tokens + ?6,
         cost_micros = cost_micros + ?7,
         total_ms = total_ms + ?8`
    )
      .bind(day, model, ok ? 1 : 0, ok ? 0 : 1, input, output, scanCostMicros(model, input, output), Math.round(ms))
      .run();
  } catch {
    // Bookkeeping must never be the reason somebody does not get their receipt back.
  }
}
