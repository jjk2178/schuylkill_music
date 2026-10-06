import { describe, expect, it } from "vitest";
import { demoChart } from "../charts/demoChart";
import { chordChangesForChart } from "./chordChanges.mjs";
const event = (timeMs: number, midi: number[]) => ({
  ...demoChart.tracks[0].events[0],
  timeMs,
  durationMs: 2000,
  expected: {
    ...demoChart.tracks[0].events[0].expected,
    midi,
    kind: "chord" as const,
  },
});
describe("guitar chord changes", () => {
  it("preserves explicitly encoded chord symbols without replacing unsupported types", () => {
    const chordChanges = [{ timeMs: 0, chord: "Cmaj7", origin: "source" }];
    expect(chordChangesForChart({ ...demoChart, chordChanges })).toEqual(
      chordChanges,
    );
  });
  it("suggests triads from source harmony and emits only transitions", () => {
    const chart = {
      ...demoChart,
      tempoMap: [{ timeMs: 0, bpm: 120 }],
      timeSignatures: [{ timeMs: 0, beats: 4, beatUnit: 4 }],
      tracks: [
        {
          ...demoChart.tracks[0],
          events: [
            event(0, [48, 52, 55]),
            event(2000, [48, 52, 55]),
            event(4000, [45, 48, 52]),
          ],
        },
      ],
    };
    expect(chordChangesForChart(chart)).toEqual([
      { timeMs: 0, chord: "C", origin: "suggested" },
      { timeMs: 4000, chord: "Am", origin: "suggested" },
    ]);
  });
});
