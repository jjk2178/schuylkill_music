import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the playable trainer surface", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /retro guitar trainer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mock hit/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/guitar tab/i)).toBeInTheDocument();
  });
});
