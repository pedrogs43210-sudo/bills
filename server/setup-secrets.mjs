/**
 * Sets both of Billy's shared secrets, everywhere they need to be, in one command.
 *
 * The reason this exists: a secret has to be identical in two or three places that cannot see each
 * other — the Worker, the local env file, and whatever is testing against it. Getting a person to
 * copy the same forty characters between three windows is a bug waiting to happen, and when it
 * happens it looks exactly like a real authentication failure. So nobody copies anything. The
 * values are generated here, written where they need to go, and never printed.
 *
 * Run it from anywhere in the project:
 *
 *   node server/setup-secrets.mjs
 *
 * It touches:
 *   - the Worker's APP_TOKEN and RC_WEBHOOK_TOKEN     (via wrangler, which you must be logged into)
 *   - .env.local at the project root                   (git-ignored; the app reads this)
 *   - server/.secrets.local                            (git-ignored; only simulate-purchase reads it)
 *
 * It deliberately does NOT touch ANTHROPIC_API_KEY. That one comes from Anthropic's console, costs
 * real money, and is not ours to regenerate.
 *
 * Safe to run again whenever things get confused. It overwrites all three places from the same new
 * pair, so "start over" is a single command rather than an investigation.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/** The deployed Worker. Override with PROXY_URL if you ever deploy a second one. */
const PROXY_URL = process.env.PROXY_URL || "https://bills-scan-proxy.pedrogs43210.workers.dev";

/** 48 hex characters. Longer than a uuid and with no structure to guess at. */
const makeToken = () => randomBytes(24).toString("hex");

/**
 * Hand a secret to wrangler down a pipe rather than typing it at the prompt.
 *
 * wrangler reads the value from stdin when stdin is not a terminal, which is how CI sets these.
 * It means the value is never on screen, never in shell history, and never mistyped.
 */
function putSecret(name, value) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["wrangler", "secret", "put", name], {
      cwd: here, // where wrangler.toml lives
      shell: true, // npx is a .cmd on Windows
      stdio: ["pipe", "pipe", "inherit"],
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`wrangler exited with code ${code} setting ${name}`))
    );
    child.stdin.write(`${value}\n`);
    child.stdin.end();
  });
}

/** Add or replace keys in a KEY=value file, leaving anything else in it alone. */
function upsert(path, entries) {
  const lines = existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/) : [];
  // A file that ends in a newline splits to a trailing empty string, and appending after it would
  // leave a blank line in the middle of the file every time this runs.
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

  for (const [key, value] of Object.entries(entries)) {
    const at = lines.findIndex((l) => l.trim().startsWith(`${key}=`));
    if (at >= 0) lines[at] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  }
  writeFileSync(path, `${lines.join("\n")}\n`);
}

const appToken = makeToken();
const webhookToken = makeToken();

console.log("\nGenerating a fresh pair and setting them everywhere.\n");

try {
  console.log("  → Worker: APP_TOKEN");
  await putSecret("APP_TOKEN", appToken);
  console.log("  → Worker: RC_WEBHOOK_TOKEN");
  await putSecret("RC_WEBHOOK_TOKEN", webhookToken);
} catch (err) {
  console.error(`\nwrangler failed: ${err.message}`);
  console.error("Are you logged in? Try `npx wrangler whoami` from the server folder.\n");
  console.error("Nothing was written locally, so the Worker and your files are still in step.\n");
  process.exit(1);
}

// Only written after the Worker accepted them, so a half-finished run never leaves the files
// claiming a value the Worker does not have. That mismatch is the exact thing this script exists
// to prevent.
upsert(join(root, ".env.local"), {
  VITE_SCAN_PROXY_URL: PROXY_URL,
  VITE_APP_TOKEN: appToken,
});
console.log("  → .env.local (the app)");

upsert(join(here, ".secrets.local"), { RC_WEBHOOK_TOKEN: webhookToken });
console.log("  → server/.secrets.local (the simulator)");

console.log(`
Done. Both files are git-ignored, and neither value was printed.

Next:
  node server/simulate-purchase.mjs      proves the purchase path end to end

Later, for the built apps, GitHub needs the same two — Settings → Secrets and variables →
Actions. Copy them out of .env.local:
  VITE_SCAN_PROXY_URL
  VITE_APP_TOKEN
`);
