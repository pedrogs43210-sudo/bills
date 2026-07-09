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

**GitHub Pages (automatic):** push this repo to GitHub, then in the repo go to
Settings → Pages → Source: "GitHub Actions". Every push to `main` builds, tests,
and deploys. Your app URL will be `https://<username>.github.io/<repo>/`.

**Netlify (manual alternative):** `npm run build`, then drag the `dist/` folder
onto https://app.netlify.com/drop.

After deploying, open the URL on your phone and "Add to Home Screen".
