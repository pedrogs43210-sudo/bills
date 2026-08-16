# Shared Splits, Part A — the server and the merge logic

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Worker can hold a shared split for seven days, let invited phones claim a person and record what they had, and hand the host back everyone's picks — with no accounts anywhere.

**Architecture:** The server is a postbox, not a record. The host's phone remains the source of truth; the Worker holds a copy so other phones can read it and write their own claims against it. Claims are additive — two people claiming one item share it — so merging is a union and there is no conflict resolution. Nothing in this plan touches the app's UI or the scanning path.

**Tech Stack:** Cloudflare Workers + D1, TypeScript, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-08-17-shared-splits-design.md`

**Not in this plan:** the invite/join/pick screens (Part B), App Links and the Play install referrer (Part C, blocked on a domain and a live listing), and the privacy policy rewrite.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/shareCodes.ts` | **New.** Generating and validating a join code. Pure, shared by app and Worker. |
| `src/lib/mergeClaims.ts` | **New.** Turning everyone's claims into the assignment model that already exists. Pure. |
| `server/schema.sql` | Two new tables. |
| `server/src/shared.ts` | **New.** Pure request interpretation — what a body means, before any database. |
| `server/src/worker.ts` | Seven routes and their handlers. |
| `server/simulate-share.mjs` | **New.** Proves the whole flow against the deployed Worker, as `simulate-purchase.mjs` does for payments. |

---

### Task 1: The join code

**Files:**
- Create: `src/lib/shareCodes.ts`
- Test: `src/lib/shareCodes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { newShareCode, isValidShareCode, CODE_LENGTH } from "./shareCodes";

describe("a join code", () => {
  it("is long enough that guessing is hopeless", () => {
    // The code IS the permission — there is no password behind it — so its only defence is
    // being unguessable. 12 characters from a 32-letter alphabet is 60 bits.
    expect(CODE_LENGTH).toBeGreaterThanOrEqual(12);
    expect(newShareCode()).toHaveLength(CODE_LENGTH);
  });

  it("avoids the characters people misread when reading one aloud", () => {
    // A code gets read out at a table. O/0, I/l/1 and U/V are where that goes wrong.
    const codes = Array.from({ length: 200 }, newShareCode).join("");
    expect(codes).not.toMatch(/[OIl1U0]/);
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 500 }, newShareCode));
    expect(seen.size).toBe(500);
  });

  it("accepts what it generates and refuses everything else", () => {
    expect(isValidShareCode(newShareCode())).toBe(true);
    for (const bad of [null, undefined, "", "short", "a".repeat(64), "has space", "'; DROP TABLE--", "OOOOOOOOOOOO"]) {
      expect(isValidShareCode(bad), String(bad)).toBe(false);
    }
  });

  it("is case-insensitive on the way in, because links get retyped", () => {
    const code = newShareCode();
    expect(isValidShareCode(code.toLowerCase())).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/shareCodes.test.ts`
Expected: FAIL — cannot resolve `./shareCodes`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/shareCodes.ts`:

```ts
/**
 * The code in an invite link.
 *
 * It is the whole of the permission: anybody holding it is in, anybody without it cannot find the
 * split. There is no password behind it and no account to check, so the only thing standing between
 * a stranger and somebody's dinner is how hard this is to guess.
 *
 * Twelve characters from a 32-letter alphabet is about 60 bits. Guessing one at a thousand attempts
 * a second would take longer than the seven days the split exists for.
 */

/**
 * No O, I, l, 1, U or 0. A code gets read aloud across a table at least once, and those are the
 * characters that turn into a different code when it is.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const CODE_LENGTH = 12;

export function newShareCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  // Modulo bias across 30 letters from 256 values is negligible at this length, and the alternative
  // — rejection sampling — buys nothing against an attacker who cannot make 2^50 attempts anyway.
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function isValidShareCode(code: unknown): boolean {
  if (typeof code !== "string" || code.length !== CODE_LENGTH) return false;
  // Upper-cased first: a link that has been through a chat app, an email client and a retype can
  // arrive in any case, and refusing it would be refusing a correct code.
  return [...code.toUpperCase()].every((c) => ALPHABET.includes(c));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/shareCodes.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/shareCodes.ts src/lib/shareCodes.test.ts
git commit -m "feat: a join code short enough to read aloud, long enough to not guess"
```

---

### Task 2: Merging everyone's picks

**Files:**
- Create: `src/lib/mergeClaims.ts`
- Test: `src/lib/mergeClaims.test.ts`

This is the task that matters. It decides what people pay.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { mergeClaims, type Claim } from "./mergeClaims";
import type { Item } from "../types";

const item = (id: string): Item => ({
  id, name: id, quantity: 1, lineTotal: 1000, assignment: { kind: "unassigned" },
});

describe("merging what everybody said they had", () => {
  it("assigns an item to the one person who claimed it", () => {
    const claims: Claim[] = [{ personId: "maria", itemIds: ["wine"] }];
    const [wine] = mergeClaims([item("wine")], claims);
    expect(wine.assignment).toEqual({ kind: "people", personIds: ["maria"] });
  });

  it("shares an item two people both claimed, which is the right answer and not a conflict", () => {
    // The whole reason this needs no locking: both of them did drink it.
    const claims: Claim[] = [
      { personId: "maria", itemIds: ["wine"] },
      { personId: "joao", itemIds: ["wine"] },
    ];
    const [wine] = mergeClaims([item("wine")], claims);
    expect(wine.assignment).toEqual({ kind: "people", personIds: ["maria", "joao"] });
  });

  it("leaves an item nobody claimed exactly as the host had it", () => {
    // Not "everyone". Nobody ticking the bread means nobody has answered about the bread yet, and
    // silently dividing it between four people would be inventing an answer.
    const bread = { ...item("bread"), assignment: { kind: "everyone" } as const };
    expect(mergeClaims([bread], [{ personId: "maria", itemIds: ["wine"] }])[0].assignment)
      .toEqual({ kind: "everyone" });
  });

  it("does not resurrect an item id that is no longer on the receipt", () => {
    // The host deleted a misread line after the link went out. A claim against it must not
    // reintroduce it or throw.
    const claims: Claim[] = [{ personId: "maria", itemIds: ["deleted", "wine"] }];
    const merged = mergeClaims([item("wine")], claims);
    expect(merged).toHaveLength(1);
    expect(merged[0].assignment).toEqual({ kind: "people", personIds: ["maria"] });
  });

  it("keeps people in a stable order, so applying twice changes nothing", () => {
    const claims: Claim[] = [
      { personId: "joao", itemIds: ["wine"] },
      { personId: "maria", itemIds: ["wine"] },
    ];
    const once = mergeClaims([item("wine")], claims);
    const twice = mergeClaims(once, claims);
    expect(twice).toEqual(once);
  });

  it("ignores a claim from somebody with no items, rather than assigning them nothing", () => {
    const merged = mergeClaims([item("wine")], [{ personId: "maria", itemIds: [] }]);
    expect(merged[0].assignment).toEqual({ kind: "unassigned" });
  });

  it("never modifies the items it was given", () => {
    // The host taps Apply, sees the result, and taps undo. That only works if the input survived.
    const items = [item("wine")];
    mergeClaims(items, [{ personId: "maria", itemIds: ["wine"] }]);
    expect(items[0].assignment).toEqual({ kind: "unassigned" });
  });

  it("copes with rubbish without throwing", () => {
    expect(() => mergeClaims([item("a")], [{ personId: "", itemIds: ["a"] }])).not.toThrow();
    expect(mergeClaims([], [{ personId: "maria", itemIds: ["a"] }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/mergeClaims.test.ts`
Expected: FAIL — cannot resolve `./mergeClaims`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/mergeClaims.ts`:

```ts
import type { Item } from "../types";

/**
 * Turning what everybody said they had into who pays for what.
 *
 * Pure, and tested harder than anything else in this feature, because it decides what people owe
 * each other. A bug here is not a visual glitch; it is somebody paying for a steak they did not eat.
 *
 * The rule that makes this simple: **claims are additive.** Two people claiming one item share it,
 * which is the correct answer rather than a conflict to resolve, so this is a union and never a
 * negotiation. Nothing here locks, retries, or decides who was first.
 */

/** One person's answer: the items they say they had. */
export type Claim = { personId: string; itemIds: string[] };

export function mergeClaims(items: Item[], claims: Claim[]): Item[] {
  // Built once, in claim order, so the personIds on an item come out in a stable order and applying
  // the same claims twice produces an identical result.
  const byItem = new Map<string, string[]>();
  for (const claim of claims) {
    if (!claim.personId) continue;
    for (const itemId of claim.itemIds ?? []) {
      const people = byItem.get(itemId);
      if (people) {
        if (!people.includes(claim.personId)) people.push(claim.personId);
      } else {
        byItem.set(itemId, [claim.personId]);
      }
    }
  }

  return items.map((item) => {
    const people = byItem.get(item.id);
    // Nobody claimed it, so nobody has answered about it. Leave whatever the host decided —
    // inventing "everyone" here would put bread on the bill of somebody who never said so.
    if (!people || people.length === 0) return item;
    return { ...item, assignment: { kind: "people", personIds: people } };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/mergeClaims.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/mergeClaims.ts src/lib/mergeClaims.test.ts
git commit -m "feat: two people claiming one item share it, which is not a conflict"
```

---

### Task 3: The tables

**Files:**
- Modify: `server/schema.sql`

- [ ] **Step 1: Append the tables**

```sql
-- A split published for other phones to read, and the answers they write back.
--
-- The server is a POSTBOX, NOT A RECORD. The host's phone remains the source of truth; this is a
-- copy that exists so four people can look at the same list of items. It is deleted after seven
-- days, and that expiry is what the privacy policy rests on — so nothing here may outlive it.
CREATE TABLE IF NOT EXISTS shared_splits (
  code       TEXT PRIMARY KEY,        -- the code from the invite link
  host_token TEXT NOT NULL,           -- only this may update or revoke; guests never see it
  payload    TEXT NOT NULL,           -- the split as JSON
  created_at INTEGER NOT NULL,        -- ms epoch
  expires_at INTEGER NOT NULL         -- created_at + 7 days
);

CREATE INDEX IF NOT EXISTS shared_splits_expiry ON shared_splits (expires_at);

-- One row per phone that joined a split, holding that phone's own answer.
--
-- Each phone owns exactly its own row, which is why no two writers ever contend: there is nothing
-- shared to contend over. Merging happens on the host's phone, from the union of these rows.
CREATE TABLE IF NOT EXISTS split_participants (
  code       TEXT NOT NULL,
  install_id TEXT NOT NULL,
  person_id  TEXT NOT NULL,           -- which person on the split this phone claims to be
  claims     TEXT NOT NULL DEFAULT '[]', -- JSON array of item ids
  joined_at  INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (code, install_id)
);

-- "A name can only be taken once", enforced where it cannot be raced. Checking in application code
-- first would let two phones both read "Ana is free" and both take her.
CREATE UNIQUE INDEX IF NOT EXISTS split_person_once ON split_participants (code, person_id);
```

- [ ] **Step 2: Apply it**

```bash
cd server
npx wrangler d1 execute bills --remote --file=./schema.sql
```

Expected: executes without error. Everything in the file is `IF NOT EXISTS`, so re-running is safe.

- [ ] **Step 3: Verify the unique index actually bites**

```bash
npx wrangler d1 execute bills --remote --command "INSERT INTO split_participants (code,install_id,person_id,claims,joined_at,updated_at) VALUES ('TESTTESTTEST','a','ana','[]',1,1),('TESTTESTTEST','b','ana','[]',1,1)"
```

Expected: **FAILS** with a UNIQUE constraint error. If it succeeds, the index did not apply and two phones can both be Ana — stop and fix that before going further. Then clean up:

```bash
npx wrangler d1 execute bills --remote --command "DELETE FROM split_participants WHERE code='TESTTESTTEST'"
```

- [ ] **Step 4: Commit**

```bash
git add server/schema.sql
git commit -m "feat: tables for a split other phones can read"
```

---

### Task 4: Reading a publish request

**Files:**
- Create: `server/src/shared.ts`
- Test: `server/src/shared.test.ts`

Pure interpretation, in the style of `webhook.ts`: decide what a request means before any database is involved.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { readPublish, readClaims, MAX_PAYLOAD_BYTES } from "./shared";

const split = { name: "Tasca", emoji: "🧾", currency: "EUR", people: [], receipts: [] };

describe("a publish request", () => {
  it("accepts a split", () => {
    const out = readPublish({ split });
    expect(out.ok).toBe(true);
  });

  it("refuses one too big to be a dinner", () => {
    // A cap, because the only real abuse here is filling the database. A receipt with four hundred
    // items is still comfortably inside this.
    const huge = { split: { ...split, receipts: [{ blob: "x".repeat(MAX_PAYLOAD_BYTES) }] } };
    expect(readPublish(huge).ok).toBe(false);
  });

  it("refuses rubbish without throwing", () => {
    for (const bad of [null, undefined, "", 7, [], {}, { split: null }, { split: "hello" }]) {
      expect(readPublish(bad).ok, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("a claims request", () => {
  it("takes a list of item ids", () => {
    expect(readClaims({ itemIds: ["a", "b"] })).toEqual(["a", "b"]);
  });

  it("takes an empty list, because unticking everything is a real answer", () => {
    expect(readClaims({ itemIds: [] })).toEqual([]);
  });

  it("drops anything that is not a string id, rather than refusing the whole request", () => {
    expect(readClaims({ itemIds: ["a", 7, null, "", "b"] })).toEqual(["a", "b"]);
  });

  it("caps the number of items, so one request cannot be a denial of service", () => {
    expect(readClaims({ itemIds: Array.from({ length: 5000 }, (_, i) => `i${i}`) }).length)
      .toBeLessThanOrEqual(1000);
  });

  it("returns null for anything that is not a claims body", () => {
    for (const bad of [null, undefined, {}, { itemIds: "a" }, 7]) {
      expect(readClaims(bad)).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run server/src/shared.test.ts`
Expected: FAIL — cannot resolve `./shared`

- [ ] **Step 3: Write minimal implementation**

Create `server/src/shared.ts`:

```ts
/**
 * Reading the requests that make a split shared.
 *
 * Pure, like `webhook.ts` and for the same reason: every branch should be arguable in a test rather
 * than discovered by four people standing around a table.
 */

/** Bigger than any real dinner, small enough that filling the database is not free. */
export const MAX_PAYLOAD_BYTES = 128_000;
/** More item ids than any receipt has lines. A cap, not a limit anyone will meet. */
const MAX_CLAIMED_ITEMS = 1000;

export type PublishResult = { ok: true; payload: string } | { ok: false; why: string };

export function readPublish(body: unknown): PublishResult {
  if (typeof body !== "object" || body === null) return { ok: false, why: "not an object" };
  const split = (body as { split?: unknown }).split;
  if (typeof split !== "object" || split === null || Array.isArray(split)) {
    return { ok: false, why: "no split" };
  }
  const payload = JSON.stringify(split);
  // Measured in bytes rather than characters: the cap exists to bound what is stored, and an emoji
  // is four bytes of storage however it counts as a string length.
  if (new TextEncoder().encode(payload).length > MAX_PAYLOAD_BYTES) {
    return { ok: false, why: "too large" };
  }
  return { ok: true, payload };
}

/**
 * What one phone says its owner had.
 *
 * Unknown ids are dropped rather than refused: the host may have deleted a misread line after the
 * link went out, and rejecting the whole answer because one id is stale would lose the other nine.
 */
export function readClaims(body: unknown): string[] | null {
  if (typeof body !== "object" || body === null) return null;
  const ids = (body as { itemIds?: unknown }).itemIds;
  if (!Array.isArray(ids)) return null;
  return ids.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, MAX_CLAIMED_ITEMS);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run server/src/shared.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add server/src/shared.ts server/src/shared.test.ts
git commit -m "feat: read a publish and a claim without touching a database"
```

---

### Task 5: Publishing a split

**Files:**
- Modify: `server/src/worker.ts`

- [ ] **Step 1: Add the route and handler**

In `Env`, nothing new is needed. Add to the router, after the existing `/v1/scan` route and inside the app-token-checked section (a guest's phone is a Billy build, so it carries the app token and an install id):

```tsx
    if (request.method === "POST" && url.pathname === "/v1/splits") {
      return handlePublish(request, env, cors, id, now);
    }
```

Then the handler:

```ts
/**
 * Publish a split so other phones can read it.
 *
 * Returns a `hostToken` exactly once. It is the only thing that can later update or revoke this
 * split — a guest holding the code can read it and write their own claims, and nothing else. Losing
 * the token means the host can no longer revoke, so the app stores it beside the split.
 */
async function handlePublish(
  request: Request,
  env: Env,
  cors: Record<string, string>,
  installId: string,
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

  const existing = (body as { code?: unknown; hostToken?: unknown });
  const nowMs = now.getTime();
  const expiresAt = nowMs + SHARE_TTL_MS;

  // Updating an existing share rather than creating a second one: the host scanned another receipt
  // and republished. The token is checked in the UPDATE's WHERE clause, so a guest who has seen the
  // code cannot rewrite the receipts.
  if (isValidShareCode(existing.code) && typeof existing.hostToken === "string") {
    const code = (existing.code as string).toUpperCase();
    const result = await env.DB.prepare(
      "UPDATE shared_splits SET payload = ?3, expires_at = ?4 WHERE code = ?1 AND host_token = ?2"
    )
      .bind(code, existing.hostToken, read.payload, expiresAt)
      .run();
    if ((result.meta?.changes ?? 0) === 1) {
      return json({ code, expiresAt }, 200, cors);
    }
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

  void installId; // published splits are deliberately not linked to who published them
  return json({ code, hostToken, expiresAt }, 200, cors);
}
```

Add near the other constants:

```ts
/**
 * How long a shared split lives.
 *
 * Seven days, and this number is load-bearing: the privacy policy says a shared copy is deleted
 * after a week, so raising it silently would make the policy untrue.
 */
const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
```

And the imports:

```ts
import { readPublish, readClaims } from "./shared";
import { isValidShareCode, newShareCode } from "../../src/lib/shareCodes";
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add server/src/worker.ts
git commit -m "feat: publish a split, and keep the only key that can revoke it"
```

---

### Task 6: Reading, joining and claiming

**Files:**
- Modify: `server/src/worker.ts`

- [ ] **Step 1: Add the routes**

```tsx
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
```

- [ ] **Step 2: Add the handlers**

```ts
/** A shared split, or nothing if it never existed or has expired. Expiry is checked on every read
 *  as well as swept on a schedule: a lazily-deleted row lives forever if nobody asks again, which is
 *  exactly what happens to an abandoned split. */
async function readShare(env: Env, code: string, now: Date) {
  const row = await env.DB.prepare(
    "SELECT payload, expires_at FROM shared_splits WHERE code = ?1"
  ).bind(code).first<{ payload: string; expires_at: number }>();
  if (!row) return null;
  if (row.expires_at <= now.getTime()) {
    await env.DB.prepare("DELETE FROM shared_splits WHERE code = ?1").bind(code).run();
    await env.DB.prepare("DELETE FROM split_participants WHERE code = ?1").bind(code).run();
    return null;
  }
  return row;
}

async function handleReadSplit(env: Env, cors: Record<string, string>, code: string, now: Date) {
  const row = await readShare(env, code, now);
  if (!row) return json({ error: "not-found" }, 404, cors);
  const taken = await env.DB.prepare(
    "SELECT person_id, install_id FROM split_participants WHERE code = ?1"
  ).bind(code).all<{ person_id: string; install_id: string }>();
  return json(
    {
      split: JSON.parse(row.payload),
      expiresAt: row.expires_at,
      // So the join screen can show a name as taken rather than letting somebody pick it and be
      // refused after the fact.
      taken: (taken.results ?? []).map((r) => r.person_id),
    },
    200,
    cors
  );
}

/**
 * Claim a person on the split.
 *
 * The unique index does the work: two phones racing for "Ana" both try to insert, and exactly one
 * succeeds. Checking first and inserting second would let both read "free" before either wrote.
 */
async function handleJoin(
  request: Request,
  env: Env,
  cors: Record<string, string>,
  code: string,
  installId: string,
  now: Date
) {
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
    ).bind(code, installId, personId, nowMs).run();
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
) {
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
  ).bind(code, installId, JSON.stringify(itemIds), now.getTime()).run();

  if ((result.meta?.changes ?? 0) !== 1) return json({ error: "not-joined" }, 409, cors);
  return json({ ok: true, count: itemIds.length }, 200, cors);
}

/** Everybody's answers, for the host to merge. Deliberately readable by anyone with the code: the
 *  guests are looking at the same dinner and there is nothing here they did not just help write. */
async function handleReadClaims(env: Env, cors: Record<string, string>, code: string, now: Date) {
  const row = await readShare(env, code, now);
  if (!row) return json({ error: "not-found" }, 404, cors);
  const all = await env.DB.prepare(
    "SELECT person_id, claims, updated_at FROM split_participants WHERE code = ?1 ORDER BY joined_at"
  ).bind(code).all<{ person_id: string; claims: string; updated_at: number }>();
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
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Revoke. Requires the host token, so a guest holding the code cannot delete somebody's split. */
async function handleRevoke(request: Request, env: Env, cors: Record<string, string>, code: string) {
  const token = request.headers.get("x-host-token");
  if (!token) return json({ error: "forbidden" }, 403, cors);
  const result = await env.DB.prepare(
    "DELETE FROM shared_splits WHERE code = ?1 AND host_token = ?2"
  ).bind(code, token).run();
  if ((result.meta?.changes ?? 0) !== 1) return json({ error: "forbidden" }, 403, cors);
  await env.DB.prepare("DELETE FROM split_participants WHERE code = ?1").bind(code).run();
  return json({ ok: true }, 200, cors);
}
```

- [ ] **Step 3: Allow the new header through CORS**

In `corsHeaders`, add `x-host-token` to the allowed headers:

```ts
    "access-control-allow-headers": "content-type, x-install-id, x-app-token, x-host-token",
```

- [ ] **Step 4: Typecheck and deploy**

```bash
npm run typecheck
cd server && npx wrangler deploy
```

- [ ] **Step 5: Commit**

```bash
git add server/src/worker.ts
git commit -m "feat: join a split, claim your items, and only the host may revoke"
```

---

### Task 7: Sweeping expired splits

**Files:**
- Modify: `server/src/worker.ts`, `server/wrangler.toml`

- [ ] **Step 1: Add the scheduled handler**

In `wrangler.toml`:

```toml
# Daily, to delete shared splits nobody came back for. Expiry is also checked on every read, but a
# split that is abandoned is never read again — and the privacy policy promises a week, not "a week
# unless nobody looks".
[triggers]
crons = ["17 3 * * *"]
```

In `worker.ts`, beside `fetch`:

```ts
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const now = Date.now();
    // Participants first: orphaning them would leave people's names behind after the split they
    // belonged to had gone.
    await env.DB.prepare(
      "DELETE FROM split_participants WHERE code IN (SELECT code FROM shared_splits WHERE expires_at <= ?1)"
    ).bind(now).run();
    await env.DB.prepare("DELETE FROM shared_splits WHERE expires_at <= ?1").bind(now).run();
  },
```

- [ ] **Step 2: Deploy and confirm the trigger registered**

```bash
cd server && npx wrangler deploy
```

Expected: the output lists a schedule. If it does not, the `[triggers]` block is in the wrong place.

- [ ] **Step 3: Commit**

```bash
git add server/src/worker.ts server/wrangler.toml
git commit -m "feat: a week means a week, even for a split nobody reopens"
```

---

### Task 8: Prove the whole flow against the real Worker

**Files:**
- Create: `server/simulate-share.mjs`

Modelled on `server/simulate-purchase.mjs` — read it first and match its shape, its `hit()` retry helper, and how it reads config from `.env.local`.

- [ ] **Step 1: Write the script**

It must check, in this order, printing ok/FAIL per line and exiting non-zero on any failure:

1. **publish** returns a 12-character code and a host token
2. **read** returns the split back, with the same receipts
3. **join** as "ana" succeeds
4. **join as "ana" from a second install id is refused with 409** — the race guard, and the most important check in the file
5. **join as "rui" from that second install id** succeeds
6. **claims** from both phones are accepted
7. **read claims** returns both, and `mergeClaims` applied to them assigns the shared item to both people
8. **revoke without the host token is refused**
9. **revoke with it succeeds**
10. **read after revoke returns 404**

Use two distinct fake install ids, both obviously synthetic (`00000000-0000-4000-8000-00000000000a` and `…0b`), and finish by revoking so the script leaves nothing behind.

- [ ] **Step 2: Run it**

```bash
node server/simulate-share.mjs
```

Expected: all ten pass. A failure on step 4 means the unique index is missing — go back to Task 3 step 3.

- [ ] **Step 3: Document it**

Add a section to `server/README.md` in the style of the existing "Proving it works before there is a store", explaining what the script covers and that step 4 is the one that matters.

- [ ] **Step 4: Commit**

```bash
git add server/simulate-share.mjs server/README.md
git commit -m "test: prove a split can be shared without two people becoming Ana"
```

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Join code as the permission | 1 |
| Claims are additive; merge by union | 2 |
| Explicit merge (server side: claims are never applied for you) | 2, 6 |
| Storage, seven-day expiry | 3, 7 |
| Publish, minimum payload, size cap | 4, 5 |
| Host token; only the host may update or revoke | 5, 6 |
| A name can only be taken once | 3 (index), 6 (handler), 8 (proof) |
| Guests never scan | Nothing in this plan touches the scan path |
| Endpoints table | 5, 6 |

**Not covered here, by design:** the invite/join/pick screens (Part B), App Links and the install referrer (Part C), and the privacy policy rewrite — which must land before any of this is reachable by a user.

**Naming consistency:** `newShareCode`/`isValidShareCode` (Task 1) are used under those names in Tasks 5 and 6. `readPublish`/`readClaims`/`MAX_PAYLOAD_BYTES` (Task 4) likewise. `Claim` from Task 2 is the shape Task 6's `handleReadClaims` returns.

**One thing deliberately left loose:** `handlePublish` falls through to creating a new code when an update is rejected, rather than erroring. A host whose token no longer matches has usually had their split swept after a week, and giving them a working new link serves them better than an error explaining a token they never knew existed.
