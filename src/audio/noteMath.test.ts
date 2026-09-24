import { describe, expect, it } from "vitest";
import { centsBetween, hzToMidi, isPitchWithinTolerance, midiToHz } from "./noteMath";

describe("note math", () => {
  it("converts A4 between midi and Hz", () => {
    expect(midiToHz(69)).toBe(440);
    expect(hzToMidi(440)).toBe(69);
  });

  it("checks pitch tolerance", () => {
    expect(isPitchWithinTolerance(441, [69], 5)).toBe(true);
    expect(isPitchWithinTolerance(466.16, [69], 5)).toBe(false);
    expect(Math.round(centsBetween(880, 440))).toBe(1200);
  });
});
