/**
 * Proves a split can be shared, joined and claimed — against the real Worker and the real database.
 *
 * The check that matters is number 4: two phones both trying to be Ana, and the second being
 * refused. That rule is enforced by a unique index rather than by application code, because a
 * check-then-insert lets both phones read "Ana is free" before either of them writes. If it ever
 * stops holding, two people quietly become one person and the arithmetic silently stops being
 * about the dinner that happened.
 *
 * Run `node server/setup-secrets.mjs` once, then:
 *
 *   node server/simulate-share.mjs
 *
 * What it touches: one shared split under two obviously-fake install ids, revoked at the end, so it
 * leaves nothing behind. It never scans, so it costs nothing.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

function fromFile(path, key) {
  try {
    const text = readFileSync(path, "utf8");
    const line = text.split(/\r?\n/).find((l) => l.trim().startsWith(`${key}=`));
    return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : null;
  } catch {
    return null;
  }
}
const fromEnvFile = (key) => fromFile(join(here, "..", ".env.local"), key);

const url = fromEnvFile("VITE_SCAN_PROXY_URL") || process.env.PROXY_URL;
const appToken = fromEnvFile("VITE_APP_TOKEN") || process.env.APP_TOKEN;

if (!url || !appToken) {
  console.error("\nNo proxy URL or app token. Run this first, and nothing needs copying:\n");
  console.error("  node server/setup-secrets.mjs\n");
  process.exitCode = 1;
  throw new Error("missing configuration");
}

const base = url.replace(/\/$/, "");
/** Two obviously-fake phones. Nobody's install will ever generate these. */
const ANA_PHONE = "00000000-0000-4000-8000-00000000000a";
const RUI_PHONE = "00000000-0000-4000-8000-00000000000b";

/** fetch, with one retry — a dropped connection is weather, not a failed check. */
async function hit(path, { installId = ANA_PHONE, method = "GET", body, hostToken } = {}) {
  const init = {
    method,
    headers: {
      "x-app-token": appToken,
      "x-install-id": installId,
      ...(body ? { "content-type": "application/json" } : {}),
      ...(hostToken ? { "x-host-token": hostToken } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  try {
    return await fetch(base + path, init);
  } catch {
    await new Promise((r) => setTimeout(r, 750));
    return fetch(base + path, init);
  }
}

const results = [];
async function check(what, fn) {
  try {
    const { ok, detail } = await fn();
    results.push({ what, ok });
    console.log(`${ok ? "  ok " : "FAIL "} ${what}${detail ? ` — ${detail}` : ""}`);
  } catch (err) {
    results.push({ what, ok: false });
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

/** A dinner: two people, three items, one of them shared. */
const split = {
  name: "Tasca do Bairro",
  emoji: "🧾",
  currency: "EUR",
  people: [
    { id: "ana", name: "Ana", color: "#ffd9a0" },
    { id: "rui", name: "Rui", color: "#ffc4b8" },
  ],
  receipts: [
    {
      id: "r1",
      storeName: "Tasca do Bairro",
      date: "2026-08-17",
      printedTotal: 4200,
      payments: [{ personId: "ana", amount: 4200 }],
      items: [
        { id: "bacalhau", name: "Bacalhau", quantity: 1, lineTotal: 1800, assignment: { kind: "unassigned" } },
        { id: "polvo", name: "Polvo", quantity: 1, lineTotal: 1600, assignment: { kind: "unassigned" } },
        { id: "vinho", name: "Vinho verde", quantity: 1, lineTotal: 800, assignment: { kind: "unassigned" } },
      ],
    },
  ],
};

console.log(`\nAgainst ${base}`);
console.log("Sharing a dinner between two fake phones\n");

let code = null;
let hostToken = null;

await check("a split can be published", async () => {
  const res = await hit("/v1/splits", { method: "POST", body: { split } });
  const b = await body(res);
  code = b.code;
  hostToken = b.hostToken;
  return {
    ok: res.status === 200 && typeof code === "string" && code.length === 12 && !!hostToken,
    detail: `code ${code}`,
  };
});

if (!code) {
  console.error("\nNothing was published, so there is nothing to test. Is the schema applied?\n");
  console.error("  cd server && npx wrangler d1 execute bills --remote --file=./schema.sql\n");
  process.exitCode = 1;
  throw new Error("publish failed");
}

await check("anyone with the code can read it back", async () => {
  const res = await hit(`/v1/splits/${code}`, { installId: RUI_PHONE });
  const b = await body(res);
  return {
    ok: res.status === 200 && b.split?.name === split.name && b.split?.receipts?.length === 1,
    detail: `${b.split?.receipts?.[0]?.items?.length ?? 0} items`,
  };
});

await check("a lowercase code still works, because links get retyped", async () => {
  const res = await hit(`/v1/splits/${code.toLowerCase()}`, { installId: RUI_PHONE });
  return { ok: res.status === 200, detail: `HTTP ${res.status}` };
});

await check("the first phone can be Ana", async () => {
  const res = await hit(`/v1/splits/${code}/join`, { method: "POST", body: { personId: "ana" } });
  return { ok: res.status === 200, detail: `HTTP ${res.status}` };
});

// --- the one that matters ------------------------------------------------------------------
await check("a second phone CANNOT also be Ana", async () => {
  const res = await hit(`/v1/splits/${code}/join`, {
    installId: RUI_PHONE,
    method: "POST",
    body: { personId: "ana" },
  });
  const b = await body(res);
  return { ok: res.status === 409 && b.error === "person-taken", detail: `HTTP ${res.status} ${b.error ?? ""}` };
});

await check("but it can be Rui", async () => {
  const res = await hit(`/v1/splits/${code}/join`, {
    installId: RUI_PHONE,
    method: "POST",
    body: { personId: "rui" },
  });
  return { ok: res.status === 200, detail: `HTTP ${res.status}` };
});

await check("each phone records what its owner had", async () => {
  const a = await hit(`/v1/splits/${code}/claims`, { method: "PUT", body: { itemIds: ["bacalhau", "vinho"] } });
  const r = await hit(`/v1/splits/${code}/claims`, {
    installId: RUI_PHONE,
    method: "PUT",
    body: { itemIds: ["polvo", "vinho"] },
  });
  return { ok: a.status === 200 && r.status === 200, detail: `HTTP ${a.status}/${r.status}` };
});

await check("a phone that never joined cannot claim anything", async () => {
  const res = await hit(`/v1/splits/${code}/claims`, {
    installId: "00000000-0000-4000-8000-00000000000c",
    method: "PUT",
    body: { itemIds: ["bacalhau"] },
  });
  return { ok: res.status === 409, detail: `HTTP ${res.status}` };
});

await check("the host gets both answers back, and the shared wine belongs to both", async () => {
  const res = await hit(`/v1/splits/${code}/claims`);
  const b = await body(res);
  const claims = b.claims ?? [];
  // The merge itself is unit-tested in src/lib/mergeClaims.test.ts. What this proves is the half
  // that unit tests cannot: that both answers survived the round trip to a real database intact,
  // and that one item genuinely came back claimed by two different people.
  const wine = claims.filter((c) => c.itemIds.includes("vinho")).map((c) => c.personId).sort();
  return {
    ok: res.status === 200 && claims.length === 2 && wine.join(",") === "ana,rui",
    detail: `vinho claimed by ${wine.join(" + ") || "nobody"}`,
  };
});

await check("a guest holding the code cannot revoke the split", async () => {
  const res = await hit(`/v1/splits/${code}`, { installId: RUI_PHONE, method: "DELETE" });
  return { ok: res.status === 403, detail: `HTTP ${res.status}` };
});

await check("the host can revoke it", async () => {
  const res = await hit(`/v1/splits/${code}`, { method: "DELETE", hostToken });
  return { ok: res.status === 200, detail: `HTTP ${res.status}` };
});

await check("and then it is gone for everybody", async () => {
  const res = await hit(`/v1/splits/${code}`, { installId: RUI_PHONE });
  return { ok: res.status === 404, detail: `HTTP ${res.status}` };
});

const failed = results.filter((r) => !r.ok);
console.log(
  failed.length === 0
    ? `\nAll ${results.length} checks passed. A split can be shared safely.\n`
    : `\n${failed.length} of ${results.length} checks failed.\n`
);
process.exitCode = failed.length === 0 ? 0 : 1;
