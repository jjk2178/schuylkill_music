import { describe, expect, it } from "vitest";
import { pianoDemoChart } from "../charts/pianoDemoChart";
import { arrangeForFivePlayers } from "./arranger";

describe("arrangeForFivePlayers", () => {
  it("creates playable band parts from a source chart", () => {
    const arrangement = arrangeForFivePlayers(pianoDemoChart);

    expect(arrangement.parts).toHaveLength(11);
    expect(arrangement.parts.map((part) => part.id)).toEqual([
      "jack-guitar",
      "jack-trumpet",
      "laura-guitar",
      "laura-flute",
      "michael-guitar",
      "michael-recorder",
      "bobby-bass",
      "nana-keys",
      "pops-drums",
      "xinnia-vocal",
      "tara-vocal",
    ]);
    expect(arrangement.parts.some((part) => part.notes.length > 0)).toBe(true);
    expect(arrangement.parts.find((part) => part.id === "bobby-bass")?.clef).toBe("bass");
    expect(arrangement.parts.find((part) => part.id === "pops-drums")?.presentation).toBe("drum-grid");
    expect(arrangement.parts.find((part) => part.id === "xinnia-vocal")?.presentation).toBe("vocal-cues");
  });
});
