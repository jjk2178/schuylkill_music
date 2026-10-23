#!/usr/bin/env node
/**
 * Import the user-provided chord-sheet lyrics into the two reference charts.
 *
 * The score sources contain the timing and notation. The chord sheets provide
 * text by song section, so phrase starts are distributed across the matching
 * guitar-chord section. This is deliberately a rehearsal reference, not a
 * claim of syllable-perfect published engraving.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { addBeatCoordinates } from "../src/music/beatTimeline.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const musicDir = "/home/jjk/Music/songs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sourceSections(path, knownChords) {
  const chunks = readFileSync(path, "utf8")
    .split(/(?=^\[[^\]]+\]\s*$)/m)
    .filter((chunk) => /^\[[^\]]+\]/.test(chunk));
  const chordPattern = new RegExp(
    `(^|\\s)(?:${[...knownChords]
      .sort((a, b) => b.length - a.length)
      .map((chord) => chord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})(?=\\s|$)`,
    "g",
  );
  return chunks.map((chunk) => {
    const [heading, ...rows] = chunk.trim().split("\n");
    return {
      label: heading.slice(1, -1),
      lines: rows
        .map((row) => row.replace(chordPattern, "$1").replace(/\s+/g, " ").trim())
        .filter((row) => /[A-Za-z]/.test(row)),
    };
  });
}

// Preserve the horizontal placement in the supplied chord sheet. A chord line
// is paired with the lyric line immediately below it; its character position
// becomes a proportion of that lyric phrase's practice-time window.
function sourceChordLines(path, knownChords) {
  const chunks = readFileSync(path, "utf8")
    .split(/(?=^\[[^\]]+\]\s*$)/m)
    .filter((chunk) => /^\[[^\]]+\]/.test(chunk));
  const chordPattern = new RegExp(
    `(^|\\s)(${[...knownChords]
      .sort((a, b) => b.length - a.length)
      .map((chord) => chord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})(?=\\s|$)`,
    "g",
  );
  return chunks.flatMap((chunk) => {
    const [, ...rows] = chunk.trimEnd().split("\n");
    let pending = [];
    return rows.flatMap((row) => {
      const matches = [...row.matchAll(chordPattern)];
      const withoutChords = row.replace(chordPattern, "$1").trim();
      if (matches.length && !/[A-Za-z]/.test(withoutChords)) {
        pending = matches.map((match) => ({
          chord: match[2],
          ratio: (match.index + match[1].length) / Math.max(row.length, 1),
        }));
        return [];
      }
      const text = row.trim();
      if (!/[A-Za-z]/.test(text)) return [];
      const result = [{ text, chords: pending }];
      pending = [];
      return result;
    });
  });
}

function chartDuration(chart) {
  return Math.max(
    ...chart.tracks.flatMap((track) => track.events).map((event) => event.timeMs + event.durationMs),
  );
}

function sectionWindows(chart) {
  const arrangement = chart.guitarArrangement;
  const starts = [];
  let quarter = arrangement.startQuarter;
  for (const section of arrangement.sections) {
    starts.push((quarter * 60000) / arrangement.bpm);
    quarter += section.chords.reduce((sum, chord) => sum + chord.beats, 0);
  }
  const sourceEnd = chartDuration(chart);
  const arrangementEnd = (quarter * 60000) / arrangement.bpm;
  return arrangement.sections.map((section, index) => ({
    label: section.label,
    startMs: (starts[index] / arrangementEnd) * sourceEnd,
    endMs: ((starts[index + 1] ?? arrangementEnd) / arrangementEnd) * sourceEnd,
  }));
}

function installLyrics(chartPath, textPath, mapLines) {
  const chart = readJson(chartPath);
  const knownChords = Object.keys(chart.guitarArrangement.shapes);
  const source = sourceSections(textPath, knownChords);
  const chordLines = sourceChordLines(textPath, knownChords);
  const mapped = mapLines(source);
  const windows = sectionWindows(chart);
  if (mapped.length !== windows.length)
    throw new Error(`${chart.title}: expected ${windows.length} lyric sections, found ${mapped.length}`);

  chart.rehearsalLyrics = windows.map((window, index) => ({
    label: window.label,
    lines: mapped[index],
  }));
  chart.lyrics = windows.flatMap((window, index) => {
    const lines = mapped[index];
    return lines.map((text, lineIndex) => ({
      timeMs: window.startMs + ((window.endMs - window.startMs) * lineIndex) / Math.max(1, lines.length),
      text,
      verse: window.label,
    }));
  });
  let sourceCursor = 0;
  chart.lyricChordCues = chart.lyrics.flatMap((lyric, lyricIndex) => {
    while (sourceCursor < chordLines.length && chordLines[sourceCursor].text !== lyric.text)
      sourceCursor += 1;
    const sourceLine = chordLines[sourceCursor++];
    if (!sourceLine) return [];
    const nextInSection = chart.lyrics[lyricIndex + 1];
    const section = windows.find((window) => window.label === lyric.verse);
    const endMs = nextInSection?.verse === lyric.verse
      ? nextInSection.timeMs
      : section?.endMs ?? lyric.timeMs;
    return sourceLine.chords.map((chord) => ({
      chord: chord.chord,
      timeMs: lyric.timeMs + (endMs - lyric.timeMs) * chord.ratio,
    }));
  });
  addBeatCoordinates(chart);
  writeJson(chartPath, chart);
  console.log(`Updated ${chart.title}: ${chart.lyrics.length} timed lyric phrases`);
}

installLyrics(
  resolve(repoRoot, "public/user-songs/how-far-ill-go.json"),
  resolve(musicDir, "How_far_ill_go.txt"),
  (source) => [
    source[0].lines,
    source[1].lines,
    source[2].lines,
    source[3].lines,
    source[4].lines,
    source[5].lines.slice(0, 4),
    source[5].lines.slice(4),
  ],
);

installLyrics(
  resolve(repoRoot, "public/user-songs/olivia-rodrigo-drivers-license-purchased.json"),
  resolve(musicDir, "drivers_license.txt"),
  (source) => [
    source[0].lines,
    source[1].lines,
    source[2].lines,
    source[3].lines,
    source[4].lines,
    source[5].lines.slice(0, 4),
    source[5].lines.slice(4),
    source[6].lines,
    source[7].lines,
  ],
);
