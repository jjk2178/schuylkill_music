import { writeFile } from "node:fs/promises";

const eighthMs = 500;
const melody = [
  [69, 1.5], [71, 0.5], [69, 1], [66, 2], [null, 1],
  [69, 1.5], [71, 0.5], [69, 1], [66, 2], [null, 1],
  [64, 1.5], [63, 0.5], [64, 1], [61, 2], [null, 1],
  [62, 1.5], [61, 0.5], [62, 1], [57, 2], [null, 1],
  [59, 2], [59, 1], [62, 1.5], [61, 0.5], [59, 1], [57, 1.5], [59, 0.5], [57, 1], [54, 2], [null, 1],
  [59, 2], [59, 1], [62, 1.5], [61, 0.5], [59, 1], [57, 1.5], [59, 0.5], [57, 1], [54, 2], [null, 1],
  [61, 1.5], [61, 0.5], [61, 1], [64, 1.5], [62, 0.5], [61, 1], [62, 2.5], [66, 1],
  [62, 1.5], [57, 0.5], [54, 1], [57, 1.5], [55, 0.5], [52, 1], [50, 3], [null, 3],
];
const phraseDurationMs = melody.reduce((total, [, durationUnits]) => total + durationUnits * eighthMs, 0);

function makeEvents(repetition) {
  let timeMs = repetition * phraseDurationMs;
  return melody.flatMap(([midi, durationUnits], index) => {
    const durationMs = Math.round(durationUnits * eighthMs);
    const event = midi === null ? [] : [{
      id: `silent-night-${repetition + 1}-${index + 1}`,
      label: repetition === 0 ? "Silent night" : "Holy night",
      timeMs,
      durationMs,
      strings: [],
      expected: {
        kind: "note",
        midi: [midi],
        toleranceCents: 40,
        timingWindowMs: { early: 160, late: 240 },
      },
    }];
    timeMs += durationMs;
    return event;
  });
}

const chart = {
  schemaVersion: 1,
  title: "Silent Night",
  artist: "Franz Xaver Gruber, text by Joseph Mohr",
  instrument: "piano",
  tuning: ["E2", "A2", "D3", "G3", "B3", "E4"],
  tempoMap: [{ timeMs: 0, bpm: 60 }],
  timeSignatures: [{ timeMs: 0, beats: 6, beatUnit: 8 }],
  keySignatures: [{ timeMs: 0, key: "D", fifths: 2, mode: "major" }],
  tracks: [{
    id: "melody",
    name: "Silent Night melody",
    instrument: "piano",
    clef: "treble",
    events: [...makeEvents(0), ...makeEvents(1)],
  }],
  sections: [
    { id: "silent-night", label: "Silent night", timeMs: 0 },
    { id: "holy-night", label: "Holy night", timeMs: phraseDurationMs },
  ],
  assets: {
    sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Silent_Nights_-_Concert_Band_-_United_States_Air_Force_Band_of_the_Rockies.mp3",
    license: "Public-domain melody arrangement; reference recording hosted by Wikimedia Commons",
  },
};

await writeFile("public/demo-songs/silent-night.json", `${JSON.stringify(chart, null, 2)}\n`);
console.log(`Wrote ${chart.tracks[0].events.length} Silent Night melody events.`);
