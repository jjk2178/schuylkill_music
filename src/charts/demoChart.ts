import { parseChart, type Chart } from "./schema";

export const demoChart: Chart = parseChart({
  schemaVersion: 1,
  title: "Neon Open Strings",
  artist: "Pluck n Play",
  tuning: ["E2", "A2", "D3", "G3", "B3", "E4"],
  tempoMap: [{ timeMs: 0, bpm: 96 }],
  timeSignatures: [{ timeMs: 0, beats: 4, beatUnit: 4 }],
  sections: [
    { id: "intro", label: "Intro", timeMs: 0 },
    { id: "riff", label: "Riff", timeMs: 4000 },
  ],
  tracks: [
    {
      id: "lead",
      name: "Lead Guitar",
      events: [
        note("n1", 0, 6, 0, [40], "E"),
        note("n2", 625, 5, 0, [45], "A"),
        note("n3", 1250, 4, 0, [50], "D"),
        note("n4", 1875, 3, 0, [55], "G"),
        note("n5", 2500, 2, 1, [61], "C"),
        note("n6", 3125, 1, 0, [64], "E"),
        chord("c1", 4000, "E5", [
          { string: 6, fret: 0 },
          { string: 5, fret: 2 },
          { string: 4, fret: 2 },
        ], [40, 47, 52]),
        note("n7", 5000, 4, 2, [52], "E"),
        note("n8", 5625, 3, 2, [57], "A"),
        chord("c2", 6250, "G", [
          { string: 6, fret: 3 },
          { string: 5, fret: 2 },
          { string: 1, fret: 3 },
        ], [43, 47, 67]),
        note("n9", 7500, 2, 3, [63], "D"),
        note("n10", 8125, 1, 3, [67], "G"),
      ],
    },
  ],
});

function note(
  id: string,
  timeMs: number,
  string: 1 | 2 | 3 | 4 | 5 | 6,
  fret: number,
  midi: number[],
  label: string,
) {
  return {
    id,
    label,
    timeMs,
    durationMs: 500,
    strings: [{ string, fret }],
    expected: {
      kind: "note",
      midi,
      toleranceCents: 35,
      timingWindowMs: { early: 140, late: 180 },
    },
  };
}

function chord(
  id: string,
  timeMs: number,
  label: string,
  strings: Array<{ string: 1 | 2 | 3 | 4 | 5 | 6; fret: number }>,
  midi: number[],
) {
  return {
    id,
    label,
    timeMs,
    durationMs: 850,
    strings,
    expected: {
      kind: "chord",
      midi,
      toleranceCents: 45,
      timingWindowMs: { early: 170, late: 230 },
    },
  };
}
