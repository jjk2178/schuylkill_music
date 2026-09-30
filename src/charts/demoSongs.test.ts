import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseChart } from "./schema";

describe("generated demo songs", () => {
  it("validates every public demo chart", () => {
    const demoDir = join(process.cwd(), "public", "demo-songs");
    const chartFiles = readdirSync(demoDir).filter(
      (fileName) => fileName.endsWith(".json") && fileName !== "index.json",
    );

    expect(chartFiles.length).toBeGreaterThanOrEqual(4);

    for (const chartFile of chartFiles) {
      const chart = parseChart(JSON.parse(readFileSync(join(demoDir, chartFile), "utf8")));
      expect(chart.tracks[0].events.length, chartFile).toBeGreaterThan(0);
      expect(chart.assets?.sourcePageUrl, chartFile).toContain("mutopiaproject.org");
    }
  });

  it("validates imported user charts", () => {
    const userDir = join(process.cwd(), "public", "user-songs");
    const chartFiles = readdirSync(userDir).filter((fileName) => fileName.endsWith(".json"));

    expect(chartFiles.length).toBeGreaterThanOrEqual(3);

    for (const chartFile of chartFiles) {
      const chart = parseChart(JSON.parse(readFileSync(join(userDir, chartFile), "utf8")));
      expect(chart.tracks[0].events.length, chartFile).toBeGreaterThan(0);
      expect(chart.assets?.license, chartFile).toBe("Purchased local MusicXML");
    }
  });
});
