import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { setOnboarded } from "../lib/onboarding";

beforeEach(() => {
  localStorage.clear();
  setOnboarded();
});

async function openHelp() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: /settings/i }));
  await user.click(screen.getByRole("button", { name: /open help/i }));
  return user;
}

describe("help and about", () => {
  it("is reachable from settings and comes back", async () => {
    const user = await openHelp();
    expect(screen.getByRole("heading", { name: /help & about/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByRole("heading", { name: /^settings$/i })).toBeInTheDocument();
  });

  it("answers the one-cent question with the actual arithmetic", async () => {
    await openHelp();
    // the question people actually ask, in the numbers they see
    expect(screen.getByText(/one cent different/i)).toBeInTheDocument();
    expect(screen.getByText(/2\.505/)).toBeInTheDocument();
    expect(screen.getByText(/matches the receipt exactly/i)).toBeInTheDocument();
  });

  it("explains the two kinds of discount receipt", async () => {
    await openHelp();
    expect(screen.getByText(/subtract the same discount twice/i)).toBeInTheDocument();
  });

  it("says where a receipt photo goes, and that nothing else leaves the phone", async () => {
    await openHelp();
    expect(screen.getByText(/sent to Anthropic/i)).toBeInTheDocument();
    expect(screen.getByText(/not used to train anything/i)).toBeInTheDocument();
    expect(screen.getByText(/stays on this phone/i)).toBeInTheDocument();
  });

  it("offers a way forward when a scan is wrong, including skipping scanning entirely", async () => {
    await openHelp();
    expect(screen.getByText(/every line is editable/i)).toBeInTheDocument();
    expect(screen.getByText(/never had a limit/i)).toBeInTheDocument();
  });

  it("shows the version, so a bug report can name it", async () => {
    await openHelp();
    expect(screen.getByText(/Billy version \d+\.\d+\.\d+/)).toBeInTheDocument();
  });

  it("shows the install reference, which is the only way to ask for the scan count to be deleted", async () => {
    await openHelp();
    expect(screen.getByText(/install reference/i)).toBeInTheDocument();
    expect(screen.getByText(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)).toBeInTheDocument();
    expect(screen.getByText(/not linked to your name/i)).toBeInTheDocument();
  });

  it("uses the same install reference the scanner sends, not a fresh one", async () => {
    const { installId } = await import("../lib/installId");
    const expected = installId();
    await openHelp();
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
