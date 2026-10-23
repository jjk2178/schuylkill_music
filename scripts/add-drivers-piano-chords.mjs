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
const rootPitchClass = (chord) => {
  const match = /^([A-G])([#b]?)/.exec(chord);
  const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (natural[match[1]] + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0) + 12) % 12;
};
let cursor = chart.guitarArrangement.startQuarter;
chart.pianoChordCues = groups.flatMap((group, sectionIndex) => {
  const timings = timedGroups[sectionIndex].chords.map((timing) => {
    const item = { ...timing, beat: cursor };
    cursor += timing.beats;
    return item;
  });
  const sectionStart = timings[0]?.beat ?? cursor;
  const sectionBeats = timings.reduce((sum, timing) => sum + timing.beats, 0);
  let searchFrom = 0;
  let previousBeat = sectionStart - 1;
  return group.map((chord, chordIndex) => {
    // The guitar chart is capo 3, so its chord roots sound three semitones
    // higher. Match the concert-pitch piano chord to that real timed cue.
    const matchIndex = timings.findIndex((timing, index) =>
      index >= searchFrom && (rootPitchClass(timing.chord) + 3) % 12 === rootPitchClass(chord),
    );
    const usableMatch = matchIndex >= 0 && matchIndex - chordIndex <= 2;
    if (usableMatch) searchFrom = matchIndex + 1;
    // A few supplied piano spellings add a passing chord absent from the
    // guitar sheet. Keep it on the nearest whole beat of that real section,
    // never at an invented fractional/averaged timestamp.
    const gridBeat = sectionStart + Math.round(sectionBeats * chordIndex / group.length);
    const beat = usableMatch
      ? timings[matchIndex].beat
      : Math.max(Math.ceil(previousBeat), gridBeat);
    previousBeat = beat;
    return { chord, timeMs: beat * 60000 / chart.guitarArrangement.bpm, beat };
  });
});
chart.assets = { ...chart.assets, sourceUrl: "/user-songs/sources/drivers_license_piano_chords.txt" };
writeFileSync(output, `${JSON.stringify(chart, null, 2)}\n`);
console.log(`Added ${chart.pianoChordCues.length} concert-pitch piano chord cues.`);
