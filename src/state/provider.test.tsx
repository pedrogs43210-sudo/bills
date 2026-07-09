import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StoreProvider } from "./StoreProvider";

describe("StoreProvider", () => {
  it("shows a warning when saving fails", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("QuotaExceededError");
    };
    try {
      render(
        <StoreProvider>
          <p>child</p>
        </StoreProvider>
      );
      expect(screen.getByText(/couldn't save/i)).toBeInTheDocument();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("renders children and no warning when saving works", () => {
    render(
      <StoreProvider>
        <p>child</p>
      </StoreProvider>
    );
    expect(screen.getByText("child")).toBeInTheDocument();
    expect(screen.queryByText(/couldn't save/i)).toBeNull();
  });
});
