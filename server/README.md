# Bills scan proxy

A Cloudflare Worker that holds **one** Anthropic key and scans receipts on the app's behalf.

It exists because the app currently asks every user to create their own Anthropic API key, load
credit, and paste it into Settings. No member of the public will do that — it is the whole funnel
and it is a wall. This removes it.

It is also the only place the free allowance can live. `localStorage.clear()` is otherwise an
infinite supply of free scans, and clearing site data is a normal thing for a person to do.

## What it does and does not do

- **Does:** scan a photo, count five scans a month per install, refuse politely when they run
  out, refund a scan when *our* side fails.
- **Does not:** store photos, store trips, receipts, or who owes whom. Those never leave the
  phone. An outage stops scanning and nothing else — the maths is all local.

## Endpoints

| | |
|---|---|
| `POST /v1/scan` | `{ imageBase64 }` → `{ result, used, left, limit }`. `402` when the allowance is gone. |
| `GET /v1/quota` | `{ used, left, limit, month, subscribed }` — the counter, without spending a scan. |

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

Then point the app at it by adding to `.env.local` in the repo root (and to the GitHub Pages
build environment):

```
VITE_SCAN_PROXY_URL=https://bills-scan-proxy.<your-subdomain>.workers.dev
VITE_APP_TOKEN=<the same APP_TOKEN>
```

**Until those variables are set, the app keeps using the user's own key exactly as before.**
Deploying the proxy is a switch, not a cutover.

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
per-install monthly cap, the two-second burst check, and the 1.5 MB image limit.

**A reinstall resets someone's free allowance**, because the install id is generated fresh. This
is deliberate: at roughly a cent a scan, that abuse costs less than the users a sign-up wall
would turn away.

**Nothing writes to the `subscriptions` table yet.** The proxy already reads it, so switching
subscriptions on is an insert once in-app purchases are verified — no change to this code.
