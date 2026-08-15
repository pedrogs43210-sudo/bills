import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabBar } from "./TabBar";

describe("TabBar", () => {
  it("offers the three tabs", () => {
    render(<TabBar current="splits" onSplits={() => {}} onScan={() => {}} onProfile={() => {}} />);
    expect(screen.getByRole("tab", { name: /splits/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /scan/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /profile/i })).toBeTruthy();
  });

  it("marks the current tab, and never marks scan — it is an action, not a place", () => {
    const { unmount } = render(<TabBar current="splits" onSplits={() => {}} onScan={() => {}} onProfile={() => {}} />);
    expect(screen.getByRole("tab", { name: /splits/i }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /scan/i }).getAttribute("aria-selected")).toBe("false");
    unmount();

    render(<TabBar current="profile" onSplits={() => {}} onScan={() => {}} onProfile={() => {}} />);
    expect(screen.getByRole("tab", { name: /profile/i }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /splits/i }).getAttribute("aria-selected")).toBe("false");
  });

  it("calls the right thing", async () => {
    const onSplits = vi.fn();
    const onScan = vi.fn();
    const onProfile = vi.fn();
    render(<TabBar current="splits" onSplits={onSplits} onScan={onScan} onProfile={onProfile} />);
    await userEvent.click(screen.getByRole("tab", { name: /scan/i }));
    await userEvent.click(screen.getByRole("tab", { name: /profile/i }));
    expect(onScan).toHaveBeenCalledOnce();
    expect(onProfile).toHaveBeenCalledOnce();
    expect(onSplits).not.toHaveBeenCalled();
  });

  it("reserves its own height, so the last split is never underneath it", () => {
    render(<TabBar current="splits" onSplits={() => {}} onScan={() => {}} onProfile={() => {}} />);
    expect(document.documentElement.style.getPropertyValue("--footer-h")).not.toBe("");
  });
});
