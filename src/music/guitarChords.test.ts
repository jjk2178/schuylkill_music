import { describe, expect, it } from "vitest";
import { guitarChords } from "./guitarChords.mjs";

describe("guitar chord reference", () => {
  it("voices every major and minor chord correctly in standard tuning", () => {
    const tuning = [40, 45, 50, 55, 59, 64];
    expect(guitarChords).toHaveLength(24);
    for (const chord of guitarChords) {
      const sounding = chord.frets.flatMap((fret, index) =>
        fret < 0 ? [] : [(tuning[index] + fret) % 12],
      );
      expect([...new Set(sounding)].sort()).toEqual(
        [...chord.pitchClasses].sort(),
      );
      expect(
        Math.max(...chord.frets.filter((fret) => fret > 0)) - chord.position,
      ).toBeLessThan(5);
    }
  });
  it("uses familiar open shapes and a first-fret F barre", () => {
    expect(guitarChords.find((c) => c.id === "C")?.frets).toEqual([
      -1, 3, 2, 0, 1, 0,
    ]);
    expect(guitarChords.find((c) => c.id === "F")?.frets).toEqual([
      1, 3, 3, 2, 1, 1,
    ]);
    expect(guitarChords.find((c) => c.id === "F")?.barres).toEqual([
      { fromString: 6, toString: 1, fret: 1 },
    ]);
  });
});
