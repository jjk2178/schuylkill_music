import { describe, expect, it } from "vitest";
import { demoChart } from "./demoChart";
import { getChartDurationMs, getPrimaryTrack, parseChart } from "./schema";

describe("chart schema", () => {
  it("parses the demo chart", () => {
    const chart = parseChart(demoChart);
    expect(chart.schemaVersion).toBe(1);
    expect(getPrimaryTrack(chart).events.length).toBeGreaterThan(4);
  });

  it("reports duration from the last event", () => {
    expect(getChartDurationMs(demoChart)).toBe(8625);
  });
});
