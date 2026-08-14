# Bills scan proxy

A Cloudflare Worker that holds **one** Anthropic key and scans receipts on the app's behalf.

It exists because the app currently asks every user to create their own Anthropic API key, load
credit, and paste it into Settings. No member of the public will do that — it is the whole funnel
and it is a wall. This removes it.

It is also the only place the free trial can live. `localStorage.clear()` is otherwise an
infinite supply of free scans, and clearing site data is a normal thing for a person to do.

And it is where the **daily ceiling** lives — the one thing that bounds a bad day. Everything else
here limits a *person*; the ceiling limits the *bill*, which is the only guarantee that survives
someone who can mint install ids.

## What it does and does not do

- **Does:** scan a photo, count a **one-off trial of three scans per install** (a lifetime count —
  nothing resets it), stop serving anybody once the **day's ceiling** is reached, refuse politely
  in both cases, and refund a scan when *our* side fails.
- **Does not:** store photos, store trips, receipts, or who owes whom. Those never leave the
  phone. An outage stops scanning and nothing else — the maths is all local.

## Endpoints

| | |
|---|---|
| `POST /v1/scan` | `{ imageBase64 }` → `{ result, used, left, limit }`. `402` when the trial is spent, `503` (`closed-today`) when the day's ceiling is reached. |
| `GET /v1/quota` | `{ used, left, limit, subscribed }` — the counter, without spending a scan. |
| `POST /v1/purchases/revenuecat` | Called by RevenueCat's servers, never by the app. Adds bought scans. |

The two refusals are deliberately different codes and different words. `402` is the person's own
trial running out, and a scan pack would fix it. `503` is the proxy having a busy day, which they
can do nothing about and should not be sold anything for.

The first two require `X-Install-Id` (a uuid the app generates on first launch) and `X-App-Token`.
The third carries neither — it comes from RevenueCat, not from a phone — and has a secret of its own.

## Deploying it

You need a Cloudflare account (free tier is plenty) and a **fresh** Anthropic key.

```bash
cd server
npx wrangler login
npx wrangler d1 create bills
```

Paste the printed `database_id` into `wrangler.toml`, then create the tables and set the secrets:

```bash
npx wrangler d1 execute bills --remote --file=./schema.sql
npx wrangler deploy
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put APP_TOKEN
```

Deploy *before* the secrets, deliberately. Setting a secret on a Worker that does not exist yet
makes wrangler create one on the fly, and that path is noticeably more fragile on a flaky
connection — it fails halfway and leaves neither the Worker nor the secret. Deploying first is one
plain call, and the Worker simply refuses every scan until the secrets arrive, which is fine when
nothing is pointed at it yet.

`APP_TOKEN` is any long random string — generate one with
`node -e "console.log(crypto.randomUUID())"`.

Then point the app at it. Two places, because two things build the app:

**For local testing** — `.env.local` in the repo root (git-ignored):

```
VITE_SCAN_PROXY_URL=https://bills-scan-proxy.<your-subdomain>.workers.dev
VITE_APP_TOKEN=<the same APP_TOKEN>
```

**For every built app** — the same two as **repository secrets** on GitHub (Settings → Secrets and
variables → Actions → New repository secret), named exactly `VITE_SCAN_PROXY_URL` and
`VITE_APP_TOKEN`. Both workflows read them, so the web build and the phone builds all get them.

**Until those variables are set, the app keeps using the user's own key exactly as before.**
Deploying the proxy is a switch, not a cutover — and unsetting the secrets switches it back.

## Checking it works

```bash
npx wrangler tail            # live logs
npx wrangler d1 execute bills --remote --command "SELECT * FROM installs"
```

## Honest limitations

**`APP_TOKEN` is not real security.** A token shipped inside a client can be extracted by anyone
who wants to. It stops casual drive-by use of the endpoint and nothing more. Real assurance needs
**App Attest (iOS)** and **Play Integrity (Android)**, which require a native build to attest —
so it arrives with the Capacitor wrapper, not before. Until then the exposure is bounded by the
**daily ceiling** (`MAX_SCANS_PER_DAY`, currently 200 ≈ $6 at ~3 cents a scan), the per-install
trial, the two-second burst check, and the 4 MB image limit.

**A reinstall resets someone's free trial**, because the install id is generated fresh. This is
deliberate — a sign-up wall would cost more in lost users than the abuse costs in scans — and it is
exactly why the daily ceiling exists. Someone scripting fresh install ids gets three scans each and
then meets the ceiling, which is the difference between a nuisance and a bill you cannot pay.

**Set `MAX_SCANS_PER_DAY = 0` to stop scanning entirely.** It is the emergency brake: no deploy, no
code change, and the app degrades to "Billy is having a busy day" rather than breaking.

## What a scan actually costs

`scan_stats` answers the question this project has been guessing at. One row per day per model, no
install id, no clock finer than the date — so it can tell you what scanning costs and cannot tell
you when anybody shops.

```sh
npx wrangler d1 execute bills --remote --command   "SELECT day, model, scans, failures,
          ROUND(cost_micros / 1000000.0, 2)          AS dollars,
          ROUND(cost_micros / 10000.0 / scans, 2)    AS cents_per_scan,
          input_tokens / scans                       AS avg_in,
          output_tokens / scans                      AS avg_out,
          total_ms / scans                           AS avg_ms
   FROM scan_stats WHERE scans > 0 ORDER BY day DESC LIMIT 14"
```

A million micro-dollars is a dollar, so cents are `cost_micros / 10000`. The first version of this
query divided by 1,000 and labelled the result `cents_per_scan`, which reported a three-cent scan as
costing thirty. A wrong unit under a confident column name is worse than no column at all.

Failed scans are counted and costed too. A refusal or an unreadable answer still burned tokens, and
a report that only counts the successes understates the bill.

## Giving somebody the scans they bought

The phone never tells the proxy what was bought. Google tells RevenueCat, RevenueCat tells this
Worker, and the Worker looks the product up in its *own* catalogue:

```
phone → Google Play → RevenueCat → POST /v1/purchases/revenuecat → credits
```

Three things are checked, in order, each cheaper than the last:

1. **the shared secret** — `RC_WEBHOOK_TOKEN`, sent as an `Authorization` header. Unset means the
   endpoint refuses everything, which is the right way to be misconfigured;
2. **the product** — the number of scans comes from `PACKS` in `src/lib/packs.ts`, keyed by the
   product id. A payload claiming ten thousand scans gets whatever the pack it names is worth, and
   a product we do not sell gets nothing;
3. **the event id** — inserted into `processed_events` as a primary key *before* the grant, so a
   replay collides and changes nothing. Webhooks are delivered at least once; a retry that granted
   a second pack would be free scans for anybody who noticed.

Refunds run the same path backwards, and never below zero: someone who bought twenty, used five and
was refunded keeps nothing, but does not go into debt either — a negative balance would follow them
into their next purchase and quietly eat scans they had paid for again.

Almost everything gets a `200` with a reason in the body. An error would be retried, and there is no
point retrying a message that will never be understood; the reason is what makes RevenueCat's
delivery log readable while you are setting it up.

### Setting it up

In RevenueCat: **Project → Integrations → Webhooks**.

- **URL:** `https://bills-scan-proxy.<your-subdomain>.workers.dev/v1/purchases/revenuecat`
- **Authorization header:** any long random string — `node -e "console.log(crypto.randomUUID())"`

Then give the same string to the Worker and re-deploy:

```bash
npx wrangler d1 execute bills --remote --file=./schema.sql   # adds processed_events
npx wrangler secret put RC_WEBHOOK_TOKEN
npx wrangler deploy
```

`schema.sql` is safe to run as often as you like — every table in it is `CREATE TABLE IF NOT
EXISTS`, so re-running it adds what is new and leaves your data alone.

The products in RevenueCat must be named exactly as in `src/lib/packs.ts`
(`app.billy.scans.10`, `.20`, `.60`), and the app must call RevenueCat's `logIn()` with the **install
id** before the purchase sheet opens — that is what makes `app_user_id` a uuid this Worker
recognises. An anonymous id is ignored rather than guessed at.

Press **Send test event** in RevenueCat when it is wired up. A `TEST` event is answered
`{ ok: true, ignored: "test event" }` — proof the URL and the secret are right, without anybody
being given anything.

The free trial is always spent before bought credits, so nobody burns a scan they paid for while a
free one is sitting there.

**Nothing writes to the `subscriptions` table yet.** The proxy already reads it, so switching
subscriptions on is an insert — no change to this code.
