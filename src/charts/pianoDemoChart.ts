import { parseChart, type Chart } from "./schema";

export const pianoDemoChart: Chart = parseChart({
  schemaVersion: 1,
  title: "Tiny C Major Study",
  artist: "Pluck n Play",
  instrument: "piano",
  tuning: ["E2", "A2", "D3", "G3", "B3", "E4"],
  tempoMap: [{ timeMs: 0, bpm: 96 }],
  timeSignatures: [{ timeMs: 0, beats: 4, beatUnit: 4 }],
  sections: [{ id: "study", label: "Study", timeMs: 0 }],
  tracks: [
    {
      id: "piano",
      name: "Piano",
      instrument: "piano",
      clef: "grand",
      events: [
        event("p1", 0, [60], "C4"),
        event("p2", 625, [64], "E4"),
        event("p3", 1250, [67], "G4"),
        event("p4", 1875, [72], "C5"),
        event("p5", 2500, [48, 55, 64], "C"),
        event("p6", 3375, [50, 57, 65], "Dm"),
        event("p7", 4250, [52, 59, 67], "Em"),
        event("p8", 5125, [53, 60, 69], "F"),
      ],
    },
  ],
});

function event(id: string, timeMs: number, midi: number[], label: string) {
  return {
    id,
    label,
    timeMs,
    durationMs: midi.length > 1 ? 780 : 500,
    strings: [],
    expected: {
      kind: midi.length > 1 ? "chord" : "note",
      midi,
      toleranceCents: midi.length > 1 ? 40 : 30,
      timingWindowMs: { early: 140, late: 180 },
    },
  };
}
