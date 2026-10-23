#!/usr/bin/env node
/** Import the owned concert-pitch Drivers License piano chord sheet. */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = "/home/jjk/Music/songs/drivers_license_piano_chords";
const output = resolve(root, "public/user-songs/olivia-rodrigo-drivers-license-purchased.json");
const publicSource = resolve(root, "public/user-songs/sources/drivers_license_piano_chords.txt");
const chart = JSON.parse(readFileSync(output, "utf8"));
copyFileSync(source, publicSource);

const chordRe = /(?:^|\s)([A-G](?:#|b)?(?:maj7|m7|m|6|7|sus[24]?|add\d+)?(?:\/[A-G](?:#|b)?)?)(?=\s|$)/g;
const chunks = readFileSync(source, "utf8").split(/(?=^\[[^\]]+\])/m).filter((chunk) => /^\[/.test(chunk));
const sourceSections = chunks.map((chunk) => chunk.trimEnd().split("\n").slice(1).flatMap((line) => [...line.matchAll(chordRe)].map((match) => match[1])));
// The supplied form joins the two bridge sections and the final chorus/outro;
// split them to match the existing timed rehearsal form.
const groups = [
  sourceSections[0], sourceSections[1], sourceSections[2], sourceSections[3], sourceSections[4],
  sourceSections[5].slice(0, 8), sourceSections[5].slice(8), sourceSections[6].slice(0, 12), sourceSections[6].slice(12),
];
const timedGroups = chart.guitarArrangement.sections;
if (groups.length !== timedGroups.length)
  throw new Error("Piano chord sheet does not match the Drivers License section form.");
let cursor = chart.guitarArrangement.startQuarter;
chart.pianoChordCues = groups.flatMap((group, sectionIndex) => {
  const sectionBeats = timedGroups[sectionIndex].chords.reduce((sum, timing) => sum + timing.beats, 0);
  const start = cursor;
  cursor += sectionBeats;
  // The piano chart occasionally subdivides a lyric chord differently from
  // the capo-relative guitar form. Preserve each supplied piano change and
  // distribute it over the same measured section window.
  return group.map((chord, chordIndex) => {
    const beat = start + sectionBeats * chordIndex / group.length;
    return { chord, timeMs: beat * 60000 / chart.guitarArrangement.bpm, beat };
  });
});
chart.assets = { ...chart.assets, sourceUrl: "/user-songs/sources/drivers_license_piano_chords.txt" };
writeFileSync(output, `${JSON.stringify(chart, null, 2)}\n`);
console.log(`Added ${chart.pianoChordCues.length} concert-pitch piano chord cues.`);
