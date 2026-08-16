import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { PROMPT, SCAN_MODEL, ScanResultSchema, normaliseDiscountSigns } from "../../src/lib/receipt";
import { interpretEvent } from "./webhook";
import { readClaims, readPublish } from "./shared";
import { isValidShareCode, newShareCode } from "../../src/lib/shareCodes";
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
  /**
   * The shared secret RevenueCat sends on its webhook, set in its dashboard as an Authorization
   * header. The app never sees it, which is the whole point: this is the only door through which
   * anybody gets scans they did not pay for, so it is shut to everything but RevenueCat.
   *
   * Unset means the webhook refuses everything, which is the right way to be misconfigured.
   */
  RC_WEBHOOK_TOKEN?: string;
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

/**
 * How long a shared split lives.
 *
 * Seven days, and this number is load-bearing: the privacy policy says a shared copy is deleted
 * after a week, so raising it silently would make the policy untrue.
 */
const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Json = Record<string, unknown>;

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
  const ok = origin !== null && allowed.includes(origin);
  return {
    "access-control-allow-origin": ok ? origin! : allowed[0] ?? "",
    "access-control-allow-headers": "content-type, x-install-id, x-app-token, x-host-token",
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

    // Before the app-token and install-id checks: this one is called by RevenueCat's servers, not
    // by the app, so it carries neither. It has a secret of its own.
    if (request.method === "POST" && url.pathname === "/v1/purchases/revenuecat") {
      return handlePurchase(request, env, new Date());
    }

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

    // A split other phones can read. Every one of these carries an app token and an install id like
    // any other request — a guest is a Billy install, not a stranger with a browser.
    if (request.method === "POST" && url.pathname === "/v1/splits") {
      return handlePublish(request, env, cors, now);
    }

    const shareMatch = /^\/v1\/splits\/([A-Za-z0-9]+)(\/claims|\/join)?$/.exec(url.pathname);
    if (shareMatch) {
      const code = shareMatch[1].toUpperCase();
      if (!isValidShareCode(code)) return json({ error: "bad-code" }, 400, cors);
      const part = shareMatch[2];
      if (request.method === "GET" && !part) return handleReadSplit(env, cors, code, now);
      if (request.method === "POST" && part === "/join") return handleJoin(request, env, cors, code, id, now);
      if (request.method === "PUT" && part === "/claims") return handleClaims(request, env, cors, code, id, now);
      if (request.method === "GET" && part === "/claims") return handleReadClaims(env, cors, code, now);
      if (request.method === "DELETE" && !part) return handleRevoke(request, env, cors, code);
    }

    return json({ error: "not-found" }, 404, cors);
  },

  /**
   * Delete shared splits nobody came back for.
   *
   * Expiry is also checked on every read, but an abandoned split is never read again — and the
   * privacy policy promises a week, not "a week unless nobody looks".
   */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const now = Date.now();
    // Participants first: orphaning them would leave people's names behind after the split they
    // belonged to had gone, which is the one thing this sweep exists to prevent.
    await env.DB.prepare(
      "DELETE FROM split_participants WHERE code IN (SELECT code FROM shared_splits WHERE expires_at <= ?1)"
    )
      .bind(now)
      .run();
    await env.DB.prepare("DELETE FROM shared_splits WHERE expires_at <= ?1").bind(now).run();
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

/**
 * A purchase notification from RevenueCat.
 *
 * Three things have to be true before anybody is given anything, and they are checked in this
 * order because each is cheaper than the last:
 *
 * 1. the request carries the shared secret, so it came from RevenueCat and not from a phone;
 * 2. the event means a purchase of a product in our own catalogue, so the number of scans comes
 *    from `PACKS` rather than from the message;
 * 3. this exact event has not already been acted on, because webhooks are delivered at least once
 *    and a retry that grants a second pack is free scans for whoever notices.
 *
 * It answers 200 to almost everything. A webhook that returns an error gets retried, and there is
 * no point retrying a message that will never be understood — the body says what was decided, which
 * is what makes RevenueCat's delivery log readable during setup.
 */
async function handlePurchase(request: Request, env: Env, now: Date): Promise<Response> {
  const plain = { "content-type": "application/json; charset=utf-8" };

  // No secret configured means the door is shut, not open. Being misconfigured should fail closed.
  const expected = env.RC_WEBHOOK_TOKEN;
  const offered = request.headers.get("authorization");
  if (!expected || offered !== expected) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: plain });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad-json" }), { status: 400, headers: plain });
  }

  const outcome = interpretEvent(body);
  if (outcome.kind === "ignore") {
    return new Response(JSON.stringify({ ok: true, ignored: outcome.why }), { status: 200, headers: plain });
  }

  const scans = outcome.kind === "grant" ? outcome.scans : -outcome.scans;

  // The insert IS the idempotency check: the event id is the primary key, so a replay collides and
  // changes nothing. Doing it before the grant means a retry that arrives while the first is still
  // running loses the race rather than doubling the pack.
  const claimed = await env.DB.prepare(
    `INSERT INTO processed_events (event_id, install_id, product_id, scans, processed_at)
     VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(event_id) DO NOTHING`
  )
    .bind(outcome.eventId, outcome.installId, outcome.productId, scans, now.getTime())
    .run();

  if ((claimed.meta?.changes ?? 0) !== 1) {
    return new Response(JSON.stringify({ ok: true, ignored: "already processed" }), {
      status: 200,
      headers: plain,
    });
  }

  if (outcome.kind === "grant") {
    await grantCredits(env, outcome.installId, outcome.scans, now.getTime());
  } else {
    // A refund takes back what is left, never more. Somebody who bought twenty, used five and was
    // refunded keeps nothing, but they do not go into debt either — a negative balance would follow
    // them into a future purchase and quietly eat scans they had paid for again.
    await env.DB.prepare(
      "UPDATE installs SET credits = MAX(0, credits - ?2) WHERE install_id = ?1"
    )
      .bind(outcome.installId, outcome.scans)
      .run();
  }

  return new Response(JSON.stringify({ ok: true, applied: outcome.kind, scans: outcome.scans }), {
    status: 200,
    headers: plain,
  });
}

/* ---------- Shared splits ----------
 *
 * A split published so the other people at the table can read it and say what they had. The server
 * is a postbox, not a record: the host's phone stays the source of truth, this copy exists for a
 * week so four phones can look at one list, and then it is deleted.
 *
 * Nothing here spends money. Guests never scan — a link sitting in a group chat that can spend the
 * host's balance is a hole — so the expensive path is untouched by everything below.
 */

/**
 * Publish a split so other phones can read it.
 *
 * Returns a `hostToken` exactly once. It is the only thing that can later update or revoke this
 * split: a guest holding the code can read it and write their own claims, and nothing else.
 */
async function handlePublish(
  request: Request,
  env: Env,
  cors: Record<string, string>,
  now: Date
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad-json" }, 400, cors);
  }

  const read = readPublish(body);
  if (!read.ok) return json({ error: "bad-split", why: read.why }, 400, cors);

  const asked = body as { code?: unknown; hostToken?: unknown };
  const nowMs = now.getTime();
  const expiresAt = nowMs + SHARE_TTL_MS;

  // Updating an existing share rather than creating a second one: the host scanned another receipt
  // and republished. The token is checked in the UPDATE's WHERE clause, so a guest who has seen the
  // code cannot rewrite the receipts.
  if (isValidShareCode(asked.code) && typeof asked.hostToken === "string") {
    const code = (asked.code as string).toUpperCase();
    const result = await env.DB.prepare(
      "UPDATE shared_splits SET payload = ?3, expires_at = ?4 WHERE code = ?1 AND host_token = ?2"
    )
      .bind(code, asked.hostToken, read.payload, expiresAt)
      .run();
    if ((result.meta?.changes ?? 0) === 1) return json({ code, expiresAt }, 200, cors);
    // Wrong token, or it expired and was swept. Fall through and make a new one rather than
    // failing: the host wants their friends to see this split, and a new link achieves that.
  }

  const code = newShareCode();
  const hostToken = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO shared_splits (code, host_token, payload, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5)`
  )
    .bind(code, hostToken, read.payload, nowMs, expiresAt)
    .run();

  return json({ code, hostToken, expiresAt }, 200, cors);
}

/**
 * A shared split, or null if it never existed or has expired.
 *
 * Expiry is enforced on read as well as swept on a schedule, so a request arriving one second after
 * the week is up gets nothing even if the sweep has not run yet.
 */
async function readShare(
  env: Env,
  code: string,
  now: Date
): Promise<{ payload: string; expires_at: number } | null> {
  const row = await env.DB.prepare("SELECT payload, expires_at FROM shared_splits WHERE code = ?1")
    .bind(code)
    .first<{ payload: string; expires_at: number }>();
  if (!row) return null;
  if (row.expires_at <= now.getTime()) {
    await env.DB.prepare("DELETE FROM split_participants WHERE code = ?1").bind(code).run();
    await env.DB.prepare("DELETE FROM shared_splits WHERE code = ?1").bind(code).run();
    return null;
  }
  return row;
}

async function handleReadSplit(
  env: Env,
  cors: Record<string, string>,
  code: string,
  now: Date
): Promise<Response> {
  const row = await readShare(env, code, now);
  if (!row) return json({ error: "not-found" }, 404, cors);
  const taken = await env.DB.prepare("SELECT person_id FROM split_participants WHERE code = ?1")
    .bind(code)
    .all<{ person_id: string }>();
  return json(
    {
      split: JSON.parse(row.payload),
      expiresAt: row.expires_at,
      // So the join screen can show a name as already taken, rather than letting somebody pick it
      // and be refused after they have tapped.
      taken: (taken.results ?? []).map((r) => r.person_id),
    },
    200,
    cors
  );
}

/**
 * Claim a person on the split.
 *
 * The unique index does the work. Two phones racing for "Ana" both try to insert and exactly one
 * succeeds; checking first and inserting second would let both read "free" before either wrote.
 */
async function handleJoin(
  request: Request,
  env: Env,
  cors: Record<string, string>,
  code: string,
  installId: string,
  now: Date
): Promise<Response> {
  const row = await readShare(env, code, now);
  if (!row) return json({ error: "not-found" }, 404, cors);

  let body: { personId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "bad-json" }, 400, cors);
  }
  const personId = body.personId;
  if (typeof personId !== "string" || personId.length === 0 || personId.length > 64) {
    return json({ error: "bad-person" }, 400, cors);
  }

  const nowMs = now.getTime();
  try {
    await env.DB.prepare(
      `INSERT INTO split_participants (code, install_id, person_id, claims, joined_at, updated_at)
       VALUES (?1, ?2, ?3, '[]', ?4, ?4)
       ON CONFLICT(code, install_id) DO UPDATE SET person_id = ?3, updated_at = ?4`
    )
      .bind(code, installId, personId, nowMs)
      .run();
  } catch {
    // The only constraint that can fail here is split_person_once: somebody else is already Ana.
    return json({ error: "person-taken" }, 409, cors);
  }
  return json({ ok: true, personId }, 200, cors);
}

async function handleClaims(
  request: Request,
  env: Env,
  cors: Record<string, string>,
  code: string,
  installId: string,
  now: Date
): Promise<Response> {
  const row = await readShare(env, code, now);
  if (!row) return json({ error: "not-found" }, 404, cors);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad-json" }, 400, cors);
  }
  const itemIds = readClaims(body);
  if (itemIds === null) return json({ error: "bad-claims" }, 400, cors);

  // A phone replaces its own row and nothing else, which is why no two writers ever contend.
  const result = await env.DB.prepare(
    "UPDATE split_participants SET claims = ?3, updated_at = ?4 WHERE code = ?1 AND install_id = ?2"
  )
    .bind(code, installId, JSON.stringify(itemIds), now.getTime())
    .run();

  if ((result.meta?.changes ?? 0) !== 1) return json({ error: "not-joined" }, 409, cors);
  return json({ ok: true, count: itemIds.length }, 200, cors);
}

/**
 * Everybody's answers, for the host to merge.
 *
 * Readable by anyone with the code, deliberately: the guests are looking at the same dinner and
 * there is nothing here they did not just help write.
 */
async function handleReadClaims(
  env: Env,
  cors: Record<string, string>,
  code: string,
  now: Date
): Promise<Response> {
  const row = await readShare(env, code, now);
  if (!row) return json({ error: "not-found" }, 404, cors);
  const all = await env.DB.prepare(
    "SELECT person_id, claims, updated_at FROM split_participants WHERE code = ?1 ORDER BY joined_at"
  )
    .bind(code)
    .all<{ person_id: string; claims: string; updated_at: number }>();
  return json(
    {
      claims: (all.results ?? []).map((r) => ({
        personId: r.person_id,
        itemIds: safeParseIds(r.claims),
        updatedAt: r.updated_at,
      })),
    },
    200,
    cors
  );
}

/** A corrupt claims column must not take down the whole poll for everybody else. */
function safeParseIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Revoke. Requires the host token, so a guest holding the code cannot delete somebody's split. */
async function handleRevoke(
  request: Request,
  env: Env,
  cors: Record<string, string>,
  code: string
): Promise<Response> {
  const token = request.headers.get("x-host-token");
  if (!token) return json({ error: "forbidden" }, 403, cors);
  const result = await env.DB.prepare(
    "DELETE FROM shared_splits WHERE code = ?1 AND host_token = ?2"
  )
    .bind(code, token)
    .run();
  if ((result.meta?.changes ?? 0) !== 1) return json({ error: "forbidden" }, 403, cors);
  await env.DB.prepare("DELETE FROM split_participants WHERE code = ?1").bind(code).run();
  return json({ ok: true }, 200, cors);
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
 * Reached only from `handlePurchase`, which is reached only by a request carrying RevenueCat's
 * shared secret. There is deliberately no route by which a client can ask for credits — the number
 * always comes from our own catalogue, keyed by a product id the store confirmed was bought.
 */
async function grantCredits(env: Env, installId: string, scans: number, nowMs: number): Promise<void> {
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
