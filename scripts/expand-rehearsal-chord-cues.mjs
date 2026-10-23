import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { addBeatCoordinates } from "../src/music/beatTimeline.mjs";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);

function chartEnd(chart) {
  return Math.max(0, ...chart.tracks.flatMap((track) => track.events).map((event) => event.timeMs + event.durationMs));
}

function lyricSectionWindows(chart) {
  const lines = [...(chart.lyrics ?? [])].sort((a, b) => a.timeMs - b.timeMs);
  const windows = [];
  for (const lyric of lines) {
    const current = windows.at(-1);
    if (current?.label === lyric.verse) continue;
    windows.push({ label: lyric.verse, startMs: lyric.timeMs, endMs: chartEnd(chart) });
    if (current) current.endMs = lyric.timeMs;
  }
  return windows;
}

function expandCues(chart) {
  const windows = lyricSectionWindows(chart);
  return chart.guitarArrangement.sections.flatMap((section, index) => {
    const window = windows.find((candidate) => candidate.label === section.label) ?? windows[index];
    if (!window) return [];
    const totalBeats = section.chords.reduce((sum, chord) => sum + chord.beats, 0);
    let elapsed = 0;
    return section.chords.map((chord) => {
      const cue = {
        chord: chord.chord,
        // Preserve each section's first lyric time exactly. Rounding a
        // section boundary down by a microsecond makes the new section's
        // first diagram appear at the end of the preceding lyric line.
        timeMs: elapsed === 0
          ? window.startMs
          : Number((window.startMs + (window.endMs - window.startMs) * elapsed / totalBeats).toFixed(6)),
      };
      elapsed += chord.beats;
      return cue;
    });
  });
}

for (const relativePath of [
  "public/user-songs/how-far-ill-go.json",
  "public/user-songs/olivia-rodrigo-drivers-license-purchased.json",
]) {
  const file = resolve(repoRoot, relativePath);
  const chart = JSON.parse(readFileSync(file, "utf8"));
  chart.lyricChordCues = expandCues(chart);
  addBeatCoordinates(chart);
  writeFileSync(file, `${JSON.stringify(chart, null, 2)}\n`);
  console.log(`${chart.title}: wrote ${chart.lyricChordCues.length} full-section chord cues`);
}
