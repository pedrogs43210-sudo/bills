# Bills 🧾

Split holiday grocery receipts with friends. Snap a photo, let AI read the items,
tap who got what, and see who owes whom.

## What it does

- Scan a receipt, or add items by hand.
- Tap who each item was for: one person, several, or 👥 Everyone. Tapping a group or
  Everyone leaves each name highlighted, so untapping one gives "everyone except them".
- Save a group of people you split with often, and assign them in one tap.
- Split a quantity line by units (2 juices for Ana, 1 for Bruno).
- Record more than one payer per receipt, each with the amount they actually put in.
- When a receipt's printed total leaves discounts out, set it to the items' sum in one tap.
- Share a summary of who owes whom. Receipts the app can't count yet are called out
  rather than quietly left out of the total.

One phone keeps the ledger; the others just read the shared summary.

## Run locally

```bash
npm install
npm run dev          # open on your phone: npm run dev -- --host
npm test             # unit + component tests
npm run build        # production build in dist/
```

## Scanning setup (one time)

1. Create an API key at https://console.anthropic.com → API keys.
2. Add a few euros of credit (Billing). A scanned receipt costs a few cents.
3. In the app: ⚙️ Settings → paste the key → Save → Test key.

The key and all trip data stay in your phone's browser storage. Use
Settings → Export for backups.

## Deploy

**GitHub Pages (automatic):** push this repo to GitHub, then in the repo go to
Settings → Pages → Source: "GitHub Actions". Every push to `main` builds, tests,
and deploys. Your app URL will be `https://<username>.github.io/<repo>/`.

**Netlify (manual alternative):** `npm run build`, then drag the `dist/` folder
onto https://app.netlify.com/drop.

After deploying, open the URL on your phone and "Add to Home Screen".
