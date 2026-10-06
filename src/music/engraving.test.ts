import { describe, expect, it } from "vitest";
import { beamGroups, rhythmicValue } from "./engraving.mjs";
const notes = (times: number[], duration = 250) =>
  times.map((timeMs) => ({ timeMs, durationMs: duration, midi: [60] }));
describe("meter-aware engraving", () => {
  it("beams eighth notes by quarter beat without crossing barlines", () => {
    expect(
      beamGroups(
        notes([0, 250, 500, 750, 1000, 1250]),
        500,
        { beats: 4, beatUnit: 4 },
        [0, 1000],
      ),
    ).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });
  it("beams three eighths in compound meter and splits at rests", () => {
    expect(
      beamGroups(notes([0, 250, 500, 750, 1000, 1250]), 500, {
        beats: 6,
        beatUnit: 8,
      }),
    ).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
    expect(
      beamGroups(notes([0, 125, 375], 125), 500, { beats: 4, beatUnit: 4 }),
    ).toEqual([[0, 1]]);
  });
  it("preserves dotted values and sixteenth notes", () => {
    expect(rhythmicValue(750, 500)).toEqual({ duration: "q", dots: 1 });
    expect(rhythmicValue(125, 500)).toEqual({ duration: "16", dots: 0 });
  });
});
