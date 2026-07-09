import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";

beforeEach(() => localStorage.clear());

describe("trip management", () => {
  it("creates a trip and lands on the trip screen", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByPlaceholderText(/trip name/i), "Algarve 2026");
    await user.click(screen.getByRole("button", { name: /create trip/i }));
    expect(screen.getByText(/algarve 2026/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/add friend/i)).toBeInTheDocument();
  });

  it("adds friends and persists across remount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.type(screen.getByPlaceholderText(/trip name/i), "Algarve");
    await user.click(screen.getByRole("button", { name: /create trip/i }));
    await user.type(screen.getByPlaceholderText(/add friend/i), "Pedro");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.type(screen.getByPlaceholderText(/add friend/i), "Ana");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("Pedro")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();

    unmount();
    render(<App />); // fresh mount reads localStorage
    expect(screen.getByText(/algarve/i)).toBeInTheDocument();
  });

  it("disables adding receipts until there is at least one person", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByPlaceholderText(/trip name/i), "Algarve");
    await user.click(screen.getByRole("button", { name: /create trip/i }));
    expect(screen.getByRole("button", { name: /add items by hand/i })).toBeDisabled();
    await user.type(screen.getByPlaceholderText(/add friend/i), "Pedro");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("button", { name: /add items by hand/i })).toBeEnabled();
  });
});
