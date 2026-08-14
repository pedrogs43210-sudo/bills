/**
 * Proves the money-in path works, against the real Worker, without a store account.
 *
 * The chain a real purchase travels is: phone → Google Play → RevenueCat → this Worker → credits.
 * We own the last two links and cannot yet build the first two, so this script stands in for
 * RevenueCat: it sends the same shaped notification, carrying the same shared secret, to the same
 * endpoint. If the last two links are wrong, it is far better to find out now than on the day a
 * stranger's €2.99 goes missing.
 *
 * It checks the refusals as well as the grant, because the refusals are the part that matters.
 * A webhook that grants scans is easy; one that grants them twice, or grants them to a forged
 * request, is the expensive kind of bug.
 *
 * Run it (PowerShell):
 *
 *   $env:RC_WEBHOOK_TOKEN="the-token-you-gave-wrangler"
 *   node server/simulate-purchase.mjs
 *
 * The proxy URL and app token are read from .env.local, which is git-ignored and which you already
 * have. RC_WEBHOOK_TOKEN is deliberately NOT read from there: it is a server secret, and client env
 * files have a way of ending up in builds.
 *
 * What it touches: one obviously-fake install id in your D1, granted a pack and then refunded it,
 * ending back at zero. It never touches a real install and never spends a scan.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** Read a value out of .env.local without pulling in a dependency to do it. */
function fromEnvFile(key) {
  try {
    const text = readFileSync(join(here, "..", ".env.local"), "utf8");
    const line = text.split(/\r?\n/).find((l) => l.trim().startsWith(`${key}=`));
    return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : null;
  } catch {
    return null;
  }
}

// Quotes are stripped because cmd.exe's `set FOO="bar"` puts the quotes *in* the value, which would
// send a token that is subtly wrong and produce a 403 that looks exactly like a real secret
// mismatch. An hour lost to that is an hour lost to punctuation.
const token = (process.env.RC_WEBHOOK_TOKEN || "").replace(/^["']|["']$/g, "") || null;
const url = process.env.PROXY_URL || fromEnvFile("VITE_SCAN_PROXY_URL");
const appToken = process.env.APP_TOKEN || fromEnvFile("VITE_APP_TOKEN");

// The product to pretend was bought. Must be one of the ids in src/lib/packs.ts — if it drifts,
// the Worker answers "unknown product" and this script says so, which is the whole idea.
const productId = process.argv[2] || "app.billy.scans.20";

// Obviously not a real install: all zeroes but for the last digit, and a valid v4 shape so it gets
// past the id check. Nobody's phone will ever generate this.
const INSTALL_ID = "00000000-0000-4000-8000-000000000001";

if (!token) {
  console.error("Set RC_WEBHOOK_TOKEN first — the same value you gave `wrangler secret put`.");
  process.exit(1);
}
if (!url) {
  console.error("No proxy URL. Put VITE_SCAN_PROXY_URL in .env.local, or set PROXY_URL.");
  process.exit(1);
}

const endpoint = `${url.replace(/\/$/, "")}/v1/purchases/revenuecat`;
const run = Date.now(); // so repeated runs are new events, except where a replay is the point

/** One notification, shaped the way RevenueCat shapes them. */
const notify = (type, eventId, over = {}) =>
  fetch(endpoint, {
    method: "POST",
    headers: { authorization: token, "content-type": "application/json" },
    body: JSON.stringify({
      event: { type, id: eventId, app_user_id: INSTALL_ID, product_id: productId, ...over },
    }),
  });

const results = [];
async function check(what, fn) {
  try {
    const { ok, detail } = await fn();
    results.push({ what, ok, detail });
    console.log(`${ok ? "  ok " : "FAIL "} ${what}${detail ? ` — ${detail}` : ""}`);
  } catch (err) {
    results.push({ what, ok: false, detail: String(err) });
    console.log(`FAIL  ${what} — ${err}`);
  }
}

const body = async (res) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

console.log(`\nAgainst ${endpoint}`);
console.log(`Pretending ${INSTALL_ID} bought ${productId}\n`);

// --- the refusals, first, because they are the ones that cost money when wrong ----------------

await check("a forged request is refused", async () => {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: "not-the-token", "content-type": "application/json" },
    body: JSON.stringify({ event: { type: "NON_RENEWING_PURCHASE", id: "forged", app_user_id: INSTALL_ID, product_id: productId } }),
  });
  return { ok: res.status === 403, detail: `HTTP ${res.status}` };
});

await check("a request with no secret at all is refused", async () => {
  const res = await fetch(endpoint, { method: "POST", body: "{}" });
  return { ok: res.status === 403, detail: `HTTP ${res.status}` };
});

// The first check that has to get *past* the door rather than be turned away by it. If this 403s
// there is no point running the rest: they will all 403 for the same reason, and six identical
// failures bury the one fact that matters.
let doorOpened = false;
await check("a dashboard test event is answered calmly", async () => {
  const res = await notify("TEST", `sim-${run}-test`);
  const b = await body(res);
  doorOpened = res.status !== 403;
  return { ok: res.status === 200 && b.ignored === "test event", detail: JSON.stringify(b) };
});

if (!doorOpened) {
  console.error(
    "\nThe Worker refused a correctly-formed notification, which means the token this script is\n" +
      "sending is not the token the Worker is holding. They are set in two separate places and\n" +
      "have to match exactly:\n\n" +
      "  npx wrangler secret put RC_WEBHOOK_TOKEN     <- what the Worker checks against\n" +
      "  set RC_WEBHOOK_TOKEN=...                     <- what this script sends\n\n" +
      "There is no way to read the stored secret back, so the fix is always to set both again from\n" +
      "the same value. Check the shell's copy first with:  echo %RC_WEBHOOK_TOKEN%\n"
  );
  process.exit(1);
}

await check("a product we do not sell grants nothing", async () => {
  const res = await notify("NON_RENEWING_PURCHASE", `sim-${run}-unknown`, { product_id: "app.billy.scans.99999" });
  const b = await body(res);
  return { ok: res.status === 200 && String(b.ignored).startsWith("unknown product"), detail: JSON.stringify(b) };
});

await check("a payload claiming 10,000 scans does not get 10,000 scans", async () => {
  // The number must come from our catalogue, not from the message. This one names a real product
  // and lies about the size; it should be granted the real size.
  const res = await notify("NON_RENEWING_PURCHASE", `sim-${run}-liar`, { scans: 10000, credits: 10000 });
  const b = await body(res);
  return { ok: res.status === 200 && b.scans !== 10000, detail: JSON.stringify(b) };
});

// --- the grant, and the replay -----------------------------------------------------------------

const grantId = `sim-${run}-grant`;
let granted = 0;

await check("a real purchase grants the pack", async () => {
  const res = await notify("NON_RENEWING_PURCHASE", grantId);
  const b = await body(res);
  granted = b.scans ?? 0;
  return { ok: res.status === 200 && b.applied === "grant" && granted > 0, detail: JSON.stringify(b) };
});

await check("the same notification arriving twice grants nothing extra", async () => {
  // RevenueCat retries anything it is not sure arrived. This is the check that a retry is free.
  const res = await notify("NON_RENEWING_PURCHASE", grantId);
  const b = await body(res);
  return { ok: res.status === 200 && b.ignored === "already processed", detail: JSON.stringify(b) };
});

if (appToken) {
  await check("the app can see the scans", async () => {
    // The real proof: not what the webhook said, but what the phone would be told next time it asks.
    const res = await fetch(`${url.replace(/\/$/, "")}/v1/quota`, {
      headers: { "x-install-id": INSTALL_ID, "x-app-token": appToken },
    });
    const b = await body(res);
    return { ok: b.credits === granted, detail: `credits ${b.credits}, expected ${granted}` };
  });
} else {
  console.log("  -- skipped the balance check (no VITE_APP_TOKEN in .env.local)");
}

// --- the refund, which is also the cleanup ------------------------------------------------------

await check("a refund takes the scans back", async () => {
  const res = await notify("REFUND", `sim-${run}-refund`);
  const b = await body(res);
  return { ok: res.status === 200 && b.applied === "revoke", detail: JSON.stringify(b) };
});

if (appToken) {
  await check("and the balance is back to nothing", async () => {
    const res = await fetch(`${url.replace(/\/$/, "")}/v1/quota`, {
      headers: { "x-install-id": INSTALL_ID, "x-app-token": appToken },
    });
    const b = await body(res);
    return { ok: b.credits === 0, detail: `credits ${b.credits}` };
  });
}

const failed = results.filter((r) => !r.ok);
console.log(
  failed.length === 0
    ? `\nAll ${results.length} checks passed. The money-in path works.\n`
    : `\n${failed.length} of ${results.length} checks failed.\n`
);
process.exit(failed.length === 0 ? 0 : 1);
