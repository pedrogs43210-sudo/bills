import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * Where an invite link points.
 *
 * This is the one URL in the app that a stranger receives in a message and taps, with no way to
 * recover if it is wrong — there is no address bar to correct and no second link coming. It has to
 * agree with two other things that live nowhere near it:
 *
 *   - site/index.html, which forwards anything carrying ?join= to /app/ and is the only reason
 *     links sent before the landing page existed still work;
 *   - scripts/build-site.mjs, which is what actually puts the app at /app/.
 *
 * If any of the three moves without the others, invites break silently for everybody.
 */
async function load(appLink?: string) {
  vi.resetModules();
  if (appLink === undefined) vi.stubEnv("VITE_APP_LINK", "");
  else vi.stubEnv("VITE_APP_LINK", appLink);
  return import("./sharedSplit");
}

afterEach(() => vi.unstubAllEnvs());

describe("the invite link", () => {
  it("points into the app, not at the landing page", async () => {
    const { inviteLink } = await load("https://splitwithbilly.com");
    expect(inviteLink("ABC123")).toBe("https://splitwithbilly.com/app/?join=ABC123");
  });

  it("does not double the slash when the configured address has a trailing one", async () => {
    const { inviteLink } = await load("https://splitwithbilly.com/");
    expect(inviteLink("ABC123")).toBe("https://splitwithbilly.com/app/?join=ABC123");
  });

  it("drops a query or fragment that came with the configured address", async () => {
    // APP_LINK carries ?from=share for the settle summary; an invite must not inherit it, or the
    // join code ends up as the second query parameter and openingView() never sees it.
    const { inviteLink } = await load("https://splitwithbilly.com/?from=share");
    expect(inviteLink("ABC123")).toBe("https://splitwithbilly.com/app/?join=ABC123");
  });

  it("carries the code exactly as given, since the server upper-cases it on arrival", async () => {
    const { inviteLink } = await load("https://splitwithbilly.com");
    expect(inviteLink("q7k2mn")).toContain("?join=q7k2mn");
  });
});
