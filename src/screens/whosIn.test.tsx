import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WhosInScreen } from "./WhosInScreen";

const base = {
  people: ["You"],
  suggestions: ["Maria", "João"],
  onAdd: () => {},
  onDone: () => {},
};

describe("who's in", () => {
  it("shows who is already here", () => {
    render(<WhosInScreen {...base} />);
    expect(screen.getByText("You")).toBeTruthy();
  });

  it("offers last time's people as one tap each", async () => {
    const onAdd = vi.fn();
    render(<WhosInScreen {...base} onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: /add maria/i }));
    expect(onAdd).toHaveBeenCalledWith("Maria");
  });

  it("takes a typed name", async () => {
    const onAdd = vi.fn();
    render(<WhosInScreen {...base} onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText(/add someone/i), "Rui{Enter}");
    expect(onAdd).toHaveBeenCalledWith("Rui");
  });

  it("trims a typed name rather than storing the spaces", async () => {
    const onAdd = vi.fn();
    render(<WhosInScreen {...base} onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText(/add someone/i), "  Rui  {Enter}");
    expect(onAdd).toHaveBeenCalledWith("Rui");
  });

  it("ignores an empty or blank name rather than adding a nameless person", async () => {
    const onAdd = vi.fn();
    render(<WhosInScreen {...base} onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText(/add someone/i), "   {Enter}");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("clears the field after adding, so the next name can just be typed", async () => {
    render(<WhosInScreen {...base} />);
    const field = screen.getByLabelText(/add someone/i) as HTMLInputElement;
    await userEvent.type(field, "Rui{Enter}");
    expect(field.value).toBe("");
  });

  it("shows no suggestion row at all when there is nothing to suggest", () => {
    render(<WhosInScreen {...base} suggestions={[]} />);
    expect(screen.queryByText(/last time/i)).toBeNull();
  });

  it("can always be finished — splitting with nobody else is allowed", async () => {
    const onDone = vi.fn();
    render(<WhosInScreen {...base} onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
