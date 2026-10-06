import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync("public/worklets/mic-analyzer.js", "utf8");
const scope = {
  AudioWorkletProcessor: class {},
  registerProcessor: () => {},
  Float32Array,
};
const estimate = runInNewContext(`${source}\nestimatePitch`, scope) as (
  frame: Float32Array,
  rate: number,
) => number | null;
describe("instrument microphone pitch range", () => {
  for (const frequency of [41.203, 65.406, 233.082, 440, 1046.502]) {
    it(`detects ${frequency} Hz without dropping an octave`, () => {
      const frame = Float32Array.from(
        { length: 4096 },
        (_, i) =>
          0.3 * Math.sin((2 * Math.PI * frequency * i) / 48000) +
          0.1 * Math.sin((4 * Math.PI * frequency * i) / 48000) +
          0.04,
      );
      const detected = estimate(frame, 48000);
      expect(detected).not.toBeNull();
      expect(Math.abs(1200 * Math.log2(detected! / frequency))).toBeLessThan(
        40,
      );
    });
  }
  it("does not score silence as pitched input", () => {
    expect(estimate(new Float32Array(4096), 48000)).toBeNull();
  });
});
