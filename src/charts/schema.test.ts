import { describe, expect, it } from "vitest";
import { demoChart } from "./demoChart";
import { getChartDurationMs, getPrimaryTrack, parseChart } from "./schema";

describe("chart schema", () => {
  it("parses the demo chart", () => {
    const chart = parseChart(demoChart);
    expect(chart.schemaVersion).toBe(1);
    expect(getPrimaryTrack(chart).events.length).toBeGreaterThan(4);
  });

  it("retains source lyrics and explicit chord changes", () => {
    const lyrics = [{ timeMs: 0, text: "A sung phrase", verse: 1 }];
    const chordChanges = [{ timeMs: 0, chord: "Cmaj7", origin: "source" }];
    const chart = parseChart({ ...demoChart, lyrics, chordChanges });
    expect(chart.lyrics).toEqual(lyrics);
    expect(chart.chordChanges).toEqual(chordChanges);
  });

  it("reports duration from the last event", () => {
    expect(getChartDurationMs(demoChart)).toBe(8625);
  });
});
