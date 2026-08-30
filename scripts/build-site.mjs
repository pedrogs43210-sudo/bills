/*
 * Lays the marketing site over the built app.
 *
 * `vite build` produces the app in dist/ exactly as it always has. This nests that under
 * dist/app/ and puts the contents of site/ at the root, so:
 *
 *   /            the landing page          site/index.html
 *   /privacy.html                          site/privacy.html
 *   /sw.js       the retirement stub       site/sw.js
 *   /app/        the app                   whatever vite built
 *
 * A post-build move rather than a multi-page Vite build, and that is a deliberate choice. Two HTML
 * entry points would put both pages through one PWA plugin: the service worker's precache and its
 * navigation fallback are configured for a single app shell, and pointing them at the right one of
 * two roots is more moving parts than moving a directory. This way the app's build is untouched
 * and its worker keeps a scope of exactly /app/.
 *
 * NOT run for native builds. `npm run build:native` leaves dist/ as the bare app because that is
 * what Capacitor's webDir expects; a landing page inside the phone app would be a second, dead
 * copy of the marketing site shipped to the store.
 */
import { cp, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const APP = join(DIST, "app");

if (!existsSync(join(DIST, "index.html"))) {
  throw new Error("dist/index.html is missing — run `vite build` before this script.");
}

/*
 * Move the app aside first.
 *
 * Everything already in dist/ belongs to the app, with one exception: dist/app itself, if a
 * previous run left it behind. Vite empties the output directory on each build, so in practice
 * this is a fresh tree, but the guard costs nothing and a recursive self-move would be an
 * unpleasant way to find out.
 */
const staged = `${DIST}/.app-staging`;
await rm(staged, { recursive: true, force: true });
await mkdir(staged, { recursive: true });

for (const entry of await readdir(DIST)) {
  if (entry === "app" || entry === ".app-staging") continue;
  await rename(join(DIST, entry), join(staged, entry));
}
await rm(APP, { recursive: true, force: true });
await rename(staged, APP);

/*
 * The fonts the landing page draws with.
 *
 * Copied from the packages rather than lifted out of the app's bundle: Vite writes them under
 * hashed names, and a landing page that hunts for `fredoka-latin-600-normal-*.woff2` would break
 * silently on the day a hash changed and quietly fall back to system-ui.
 *
 * Self-hosted rather than fetched from Google Fonts, which would put every visitor's IP address in
 * someone else's log — on the page that promises no tracking.
 */
await mkdir(join(DIST, "fonts"), { recursive: true });
const FONTS = [
  ["@fontsource/fredoka/files/fredoka-latin-600-normal.woff2", "fredoka-600.woff2"],
  ["@fontsource/nunito/files/nunito-latin-600-normal.woff2", "nunito-600.woff2"],
  ["@fontsource/nunito/files/nunito-latin-800-normal.woff2", "nunito-800.woff2"],
];
for (const [from, to] of FONTS) {
  await cp(join("node_modules", from), join(DIST, "fonts", to));
}

// The mark, for the browser tab. One file, shared: the app ships its own copy under /app/.
await cp(join("public", "favicon.svg"), join(DIST, "favicon.svg"));

// The site itself, last, so it wins any name it shares with the app's output.
await cp("site", DIST, { recursive: true });

/*
 * GitHub Pages serves 404.html for anything it cannot find. Sending those to the landing page
 * rather than to Pages' own error screen matters most for /app — a link without the trailing
 * slash, which is what people type and what some clients produce when they linkify a URL.
 */
await writeFile(
  join(DIST, "404.html"),
  `<!doctype html><meta charset="utf-8"><title>Billy</title>` +
    `<meta http-equiv="refresh" content="0; url=/">` +
    `<p>Nothing here. <a href="/">Billy is this way</a>.</p>\n`
);

const listed = (await readdir(DIST)).sort().join(" ");
console.log(`site: dist/ now holds ${listed}`);
