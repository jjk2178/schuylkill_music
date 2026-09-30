import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScoreboardApp } from "./ScoreboardApp";

describe("ScoreboardApp", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    );
  });

  it("renders the standalone Scoreboard shell", async () => {
    render(<ScoreboardApp />);

    expect(screen.getByRole("heading", { name: /band score builder/i })).toBeInTheDocument();
    expect(screen.getByText(/stacked band score/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /linger/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /stairway to heaven/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /go your own way/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /drivers license/i })).toBeInTheDocument();
    expect(screen.getAllByText(/backup guitar/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Jack/i).length).toBeGreaterThan(0);
    expect(await screen.findByText(/0 shared songs loaded/i)).toBeInTheDocument();
  });

  it("can switch to a single player's music view", async () => {
    render(<ScoreboardApp />);

    await screen.findByText(/0 shared songs loaded/i);

    fireEvent.click(screen.getByRole("button", { name: /player/i }));

    expect(screen.getByText(/Nana's player view/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /player/i })).toHaveValue("Nana");
    expect(screen.queryByRole("heading", { name: /band score builder/i })).toBeInTheDocument();
  });
});
