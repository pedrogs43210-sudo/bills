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

The two refusals are deliberately different codes and different words. `402` is the person's own
trial running out, and a scan pack would fix it. `503` is the proxy having a busy day, which they
can do nothing about and should not be sold anything for.

Both require `X-Install-Id` (a uuid the app generates on first launch) and `X-App-Token`.

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
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put APP_TOKEN
npx wrangler deploy
```

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
**daily ceiling** (`MAX_SCANS_PER_DAY`, default 1000 ≈ $30 at ~3 cents a scan), the per-install
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
          ROUND(cost_micros / 1000.0 / scans, 2)     AS cents_per_scan,
          input_tokens / scans                       AS avg_in,
          output_tokens / scans                      AS avg_out,
          total_ms / scans                           AS avg_ms
   FROM scan_stats WHERE scans > 0 ORDER BY day DESC LIMIT 14"
```

Failed scans are counted and costed too. A refusal or an unreadable answer still burned tokens, and
a report that only counts the successes understates the bill.

## Giving somebody the scans they bought

`grantCredits()` exists in `worker.ts` and **no endpoint calls it.** That is deliberate: a route
that takes a number of credits from the client is a route that hands out free scans. When in-app
purchases ship, the flow is store receipt → verify it with Apple or Google → `grantCredits()`.

The free trial is always spent before bought credits, so nobody burns a scan they paid for while a
free one is sitting there.

**Nothing writes to the `subscriptions` table yet.** The proxy already reads it, so switching
subscriptions on is an insert once in-app purchases are verified — no change to this code.
