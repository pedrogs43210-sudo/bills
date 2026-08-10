import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { loadApiKey, exportTrip } from "../lib/storage";
import type { Trip } from "../types";
import { setOnboarded } from "../lib/onboarding";

beforeEach(() => {
  localStorage.clear();
  // These tests start from an empty app, which is exactly when the first-run introduction
  // appears. Mark it seen so they exercise the screens they are about.
  setOnboarded();
});

describe("settings screen", () => {
  it("saves the API key locally", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.type(screen.getByLabelText(/anthropic api key/i), "sk-ant-test123");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(loadApiKey()).toBe("sk-ant-test123");
    expect(screen.getByText(/saved/i)).toBeInTheDocument();
  });

  it("imports a trip from an export file", async () => {
    const trip: Trip = {
      id: "t9", name: "Madeira", emoji: "⛰️", currency: "EUR",
      people: [], groups: [], receipts: [], createdAt: "", schemaVersion: 1,
    };
    const file = new File([exportTrip(trip)], "madeira.bills.json", { type: "application/json" });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.upload(screen.getByLabelText(/import trip/i), file);
    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(await screen.findByText(/madeira/i)).toBeInTheDocument();
  });

  it("rejects a non-trip file", async () => {
    const file = new File(["{}"], "junk.json", { type: "application/json" });
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.upload(screen.getByLabelText(/import trip/i), file);
    expect(await screen.findByText(/isn't a bills trip/i)).toBeInTheDocument();
  });
});

describe("appearance and the API key card", () => {
  it("offers light, dark and follow-the-phone", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    expect(screen.getByRole("button", { name: /follow phone/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dark/i })).toBeInTheDocument();
  });

  it("applies a chosen theme where the stylesheet reads it, and remembers it", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    await user.click(screen.getByRole("button", { name: /dark/i }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button", { name: /dark/i })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("bills.theme.v1")).toBe("dark");
  });

  it("shows the API key card while the app still scans with the user's own key", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /settings/i }));
    expect(screen.getByPlaceholderText(/sk-ant/i)).toBeInTheDocument();
  });
});
