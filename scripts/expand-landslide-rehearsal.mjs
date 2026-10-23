#!/usr/bin/env node
/** Build the interactive Landslide rehearsal metadata from the owned text sheet. */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { addBeatCoordinates } from "../src/music/beatTimeline.mjs";

const root = resolve(import.meta.dirname, "..");
const sourcePath = "/home/jjk/Music/songs/landslide.txt";
const chartPath = resolve(root, "public/user-songs/fleetwood-mac-landslide.json");
const arrangementPath = resolve(root, "public/arrangements/landslide.json");
const publicSource = resolve(root, "public/user-songs/sources/landslide.txt");
const arrangement = JSON.parse(readFileSync(arrangementPath, "utf8"));
const chart = JSON.parse(readFileSync(chartPath, "utf8"));
const text = readFileSync(sourcePath, "utf8");
copyFileSync(sourcePath, publicSource);

const names = ["Intro", "Verse 1", "Verse 2", "Pre-Chorus", "Chorus 1", "Solo", "Chorus 2", "Verse 3", "Outro"];
const sections = arrangement.sections.map((section, index) => ({
  label: names[index],
  chords: arrangement.tracks[0].measures
    .filter((measure) => measure.sectionId === section.id)
    .flatMap((measure) => {
      const events = measure.events.filter((event) => event.chordSymbol);
      // A chord at the beginning of a sparse source measure is held until the
      // next measure; encode that hold explicitly rather than shrinking it.
      const missing = 4 - events.reduce((sum, event) => sum + event.durationBeats, 0);
      return events.map((event, eventIndex) => ({
        chord: event.chordSymbol,
        beats: event.durationBeats + (eventIndex === events.length - 1 ? Math.max(0, missing) : 0),
        cue: `M${measure.number}`,
      }));
    }),
}));
const shapes = Object.fromEntries(arrangement.chordLibrary.map((chord) => [chord.name, {
  frets: chord.frets, barres: chord.barres ?? [],
}]));
// The imported MusicXML's 79 BPM is the playback master; it keeps chord blocks
// on the original recording's measure clock while preserving the supplied form.
const bpm = chart.tempoMap[0].bpm;
chart.capo = arrangement.capo;
chart.timeSignatures = [{ timeMs: 0, beats: 4, beatUnit: 4 }];
chart.guitarArrangement = {
  capo: arrangement.capo,
  bpm,
  startQuarter: 0,
  timing: "practice",
  timingNotes: "Two chord blocks per 4/4 bar. Use the basic picking grid or Travis-style alternating bass; on D/F# and D7/F#, pick the low E string instead of A.",
  sourceUrl: "/user-songs/sources/landslide.txt",
  shapeKey: "G",
  strumming: [
    { label: "Basic picking", pattern: "1 + 2 + 3 + 4 + · steady eighth-note grid" },
    { label: "Travis style", pattern: "1 + 2 + 3 + 4 + · alternating bass with upper-string answers" },
  ],
  sections,
  riffs: [
    { label: "Basic picking", tab: "e|----------------|\\nB|---x-------x----|\\nG|--x---x---x---x-|\\nD|-x---x---x---x--|\\nA|x---x---x---x---|\\nE|----------------|" },
    { label: "Travis style", tab: "e|----------------|\\nB|---x-------x----|\\nG|-x---x---x---x--|\\nD|--x---x---x---x-|\\nA|x---x---x---x---|\\nE|----------------|" },
  ],
  shapes,
};

const chunks = text.split(/(?=^\[[^\]]+\]\s*$)/m).filter((chunk) => /^\[[^\]]+\]/.test(chunk));
const chordNames = Object.keys(shapes).sort((a, b) => b.length - a.length).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const chordPattern = new RegExp(`(^|\\s)(?:${chordNames.join("|")})(?=\\s|$)`, "g");
const lyricLines = chunks.map((chunk) => chunk.trim().split("\n").slice(1)
  .map((line) => line.replace(chordPattern, "$1").replace(/\s+/g, " ").trim())
  .filter((line) => /[A-Za-z]/.test(line)));
chart.rehearsalLyrics = sections.map((section, index) => ({
  label: section.label,
  lines: lyricLines[index]?.length ? lyricLines[index] : ["Instrumental"],
}));

const totalBeats = sections.reduce((sum, section) => sum + section.chords.reduce((n, chord) => n + chord.beats, 0), 0);
const sectionStarts = [];
let elapsedBeats = 0;
for (const section of sections) { sectionStarts.push(elapsedBeats); elapsedBeats += section.chords.reduce((n, chord) => n + chord.beats, 0); }
const quarterMs = 60000 / bpm;
chart.sections = sections.map((section, index) => ({ id: `landslide-${index + 1}`, label: section.label, timeMs: sectionStarts[index] * quarterMs }));
chart.lyrics = chart.rehearsalLyrics.flatMap((section, index) => {
  const start = sectionStarts[index] * quarterMs;
  const end = (sectionStarts[index + 1] ?? totalBeats) * quarterMs;
  return section.lines.map((line, lineIndex) => ({ timeMs: start + (end - start) * lineIndex / section.lines.length, text: line, verse: section.label }));
});
chart.lyricChordCues = sections.flatMap((section, index) => {
  let beat = sectionStarts[index];
  return section.chords.map((chord) => { const cue = { chord: chord.chord, timeMs: beat * quarterMs, beat }; beat += chord.beats; return cue; });
});
chart.assets = { ...chart.assets, sourceUrl: "/user-songs/sources/landslide.txt" };
addBeatCoordinates(chart);
// Chord cues come from the supplied 4/4 form, so retain their literal beat
// positions instead of recomputing them from audio milliseconds.
chart.lyricChordCues.forEach((cue, index) => {
  cue.beat = sections.flatMap((section) => section.chords).slice(0, index).reduce((sum, chord) => sum + chord.beats, 0);
});
writeFileSync(chartPath, `${JSON.stringify(chart, null, 2)}\n`);
console.log(`Expanded Landslide: ${sections.length} sections, ${chart.lyrics.length} lyric lines, ${chart.lyricChordCues.length} chord blocks.`);
