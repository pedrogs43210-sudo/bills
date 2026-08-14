import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PackOfferSheet } from "./PackOfferSheet";

/**
 * The sheet that asks for money.
 *
 * Every test here is about getting *out* of it. An offer nobody can escape converts a little better
 * and is how an app earns the review that ends "felt like being cornered" — so the ways out are the
 * feature, and they are what gets pinned down.
 */

const open = (onClose = vi.fn()) => {
  render(
    <PackOfferSheet
      title="That was your last free scan"
      blurb="Everything else stays free."
      onClose={onClose}
    />
  );
  return onClose;
};

beforeEach(() => {
  localStorage.clear();
});

describe("getting out of it", () => {
  it("closes on the ✕", async () => {
    const onClose = open();
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Not now", async () => {
    const onClose = open();
    await userEvent.click(screen.getByRole("button", { name: /not now/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const onClose = open();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the dimmed area behind it is tapped", async () => {
    const onClose = open();
    await userEvent.click(document.querySelector(".sheet-backdrop")!);
    expect(onClose).toHaveBeenCalled();
  });

  it("does NOT close when the sheet itself is tapped", async () => {
    // Without this, every tap on a pack would dismiss the thing the tap was aimed at — the offer
    // would be impossible to accept, which is a funnier bug than it sounds and entirely silent.
    const onClose = open();
    await userEvent.click(screen.getByRole("heading", { name: /last free scan/i }));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("what it says and how it reads", () => {
  it("is a dialog, and says what it is", () => {
    const dialog = screen.queryByRole("dialog");
    expect(dialog).toBeNull(); // nothing rendered yet
    open();
    expect(screen.getByRole("dialog")).toHaveAccessibleName(/last free scan/i);
  });

  it("shows the packs and their prices", () => {
    open();
    expect(screen.getByRole("radiogroup", { name: /scan packs/i })).toBeInTheDocument();
    expect(screen.getByText(/never expire/i)).toBeInTheDocument();
  });

  it("takes focus, so a screen reader stops reading the receipt underneath", () => {
    open();
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("stops the page behind from scrolling, and gives it back on the way out", () => {
    const { unmount } = render(
      <PackOfferSheet title="t" blurb="b" onClose={vi.fn()} />
    );
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
