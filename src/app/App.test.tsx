import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    );
  });

  it("renders the playable trainer surface", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /retro play-along trainer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mock hit/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/guitar tab/i)).toBeInTheDocument();
    expect(await screen.findByText(/0 mutopia demos loaded/i)).toBeInTheDocument();
  });
});
