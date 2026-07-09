# Bills 🧾

Split holiday grocery receipts with friends. Snap a photo, let AI read the items,
tap who got what, and see who owes whom.

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

Any static host works. Easiest: `npm run build`, then drag the `dist/`
folder onto https://app.netlify.com/drop — you get a URL to bookmark on
your phone ("Add to Home Screen" makes it feel like a native app).
