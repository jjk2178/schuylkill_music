// Beat-based song-arrangement schema (schemaVersion 2).
//
// This is the lossless, persisted *source of truth* for an arrangement. Unlike
// src/charts/schema.ts (millisecond-timed for the gameplay hit-window loop),
// positions here are measured in musical BEATS so they line up with notation and
// map cleanly to MusicXML. See docs/arrangement-format.md.
//
// Conventions (shared with src/music/guitarChords.mjs):
//   * Chord `frets` arrays run string 6 (low E) -> string 1 (high e).
//     -1 = muted/not played, 0 = open.
//   * `tuning` runs string 6 (low E) -> string 1 (high e), e.g.
//     ["E2","A2","D3","G3","B3","E4"].
//   * A tab note's `string` is the standard tab number: 1 = high e, 6 = low E.
//   * `beat` / `durationBeats` are in quarter-note units from the measure start.

import { z } from "zod";

// MusicXML note-type names, keyed by quarter-note length.
export const NOTE_VALUES = {
  4: "whole",
  3: "half", // dotted-half handled via dots
  2: "half",
  1.5: "quarter",
  1: "quarter",
  0.75: "eighth",
  0.5: "eighth",
  0.375: "16th",
  0.25: "16th",
  0.125: "32nd",
  0.0625: "64th",
};

export const NoteValueSchema = z.enum([
  "whole",
  "half",
  "quarter",
  "eighth",
  "16th",
  "32nd",
  "64th",
]);

// Playing techniques. Most map to a MusicXML <technical>/<articulations> child.
export const TechniqueSchema = z.enum([
  "pick",
  "hammer", // h
  "pull", // p
  "slide-up", // /
  "slide-down", // \
  "bend", // b
  "bend-release", // br / r
  "release", // r
  "vibrato", // ~
  "mute", // palm/left-hand mute
  "dead", // x (dead/ghosted note)
  "ghost", // (n) parenthesised ghost / held note
  "harmonic",
  "let-ring",
  "tap",
]);

export const InstrumentSchema = z.enum([
  "guitar",
  "bass",
  "piano",
  "keys",
  "drums",
  "flute",
  "recorder",
  "trumpet",
  "vocals",
]);

// One fretted note on one string.
export const TabNoteSchema = z.object({
  string: z.number().int().min(1).max(6), // 1 = high e, 6 = low E
  fret: z.number().int().min(0).max(24),
  techniques: z.array(TechniqueSchema).default([]),
});

export const LyricSchema = z.object({
  text: z.string(),
  syllabic: z.enum(["single", "begin", "middle", "end"]).default("single"),
  verse: z.number().int().positive().default(1),
});

// A rhythmic event inside one measure, positioned by beat.
export const EventSchema = z.object({
  id: z.string().min(1),
  beat: z.number().nonnegative(), // offset from measure start, in quarter notes
  durationBeats: z.number().positive(), // in quarter notes
  value: NoteValueSchema.optional(), // notated value (derivable from durationBeats)
  dots: z.number().int().min(0).max(2).default(0),
  tuplet: z
    .object({
      actual: z.number().int().positive(),
      normal: z.number().int().positive(),
    })
    .optional(),
  kind: z.enum(["note", "rest", "chord"]).default("note"),
  midi: z.array(z.number().int().min(0).max(127)).default([]), // staff pitches
  tab: z.array(TabNoteSchema).default([]),
  tie: z.enum(["start", "stop", "continue"]).optional(),
  voice: z.number().int().positive().default(1),
  // The originally-ingested fingering, kept for reference when `tab` is
  // regenerated from pitch by src/arrangement/tab.mjs.
  sourceFingering: z.array(TabNoteSchema).optional(),
  chordSymbol: z.string().optional(), // references chordLibrary[].name
  lyric: LyricSchema.optional(),
  annotation: z.string().optional(), // free text printed above the event
});

export const MeasureSchema = z.object({
  number: z.number().int().positive(),
  timeSignature: z
    .object({
      beats: z.number().int().positive(),
      beatUnit: z.number().int().positive(),
    })
    .optional(),
  tempoBpm: z.number().positive().optional(),
  keyFifths: z.number().int().min(-7).max(7).optional(),
  repeat: z.enum(["start", "end", "both"]).optional(),
  repeatTimes: z.number().int().positive().optional(),
  sectionId: z.string().optional(),
  events: z.array(EventSchema),
});

export const TrackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  instrument: InstrumentSchema.default("guitar"),
  clef: z
    .enum(["treble", "bass", "grand", "tab", "treble+tab", "bass+tab"])
    .default("tab"),
  tuning: z.array(z.string()).min(4).max(6).optional(), // lowest -> highest string
  capo: z.number().int().nonnegative().optional(),
  measures: z.array(MeasureSchema).min(1),
});

// A chord-diagram shape for the library (drawn over tab / at chord changes).
export const ChordShapeSchema = z.object({
  name: z.string().min(1),
  frets: z.array(z.number().int().min(-1).max(24)).length(6), // string 6 -> 1
  fingers: z.array(z.number().int().min(0).max(4)).length(6).optional(),
  barres: z
    .array(
      z.object({
        fromString: z.number().int(),
        toString: z.number().int(),
        fret: z.number().int(),
      }),
    )
    .default([]),
  baseFret: z.number().int().positive().default(1),
});

export const SectionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  startMeasure: z.number().int().positive(),
  notes: z.string().optional(), // e.g. "Clean guitar with chorus pedal"
  repeatText: z.string().optional(), // e.g. "x3", "(2x)"
});

// A free-form fragment (picking template, riff, strumming) kept verbatim so no
// source information is lost even when it does not become notated measures.
export const SnippetSchema = z.object({
  kind: z.enum(["picking", "riff", "strumming", "note"]),
  label: z.string().optional(),
  sectionId: z.string().optional(),
  text: z.string(),
});

export const SongArrangementSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().optional(),
  credits: z
    .object({ tabbedBy: z.string().optional(), source: z.string().optional() })
    .optional(),
  key: z
    .object({
      fifths: z.number().int().min(-7).max(7).default(0),
      mode: z.string().default("major"),
    })
    .default({ fifths: 0, mode: "major" }),
  timeSignature: z
    .object({
      beats: z.number().int().positive(),
      beatUnit: z.number().int().positive(),
    })
    .default({ beats: 4, beatUnit: 4 }),
  tempoBpm: z.number().positive().default(120),
  tuning: z
    .array(z.string())
    .min(4)
    .max(6)
    .default(["E2", "A2", "D3", "G3", "B3", "E4"]),
  capo: z.number().int().nonnegative().optional(),
  sections: z.array(SectionSchema).default([]),
  chordLibrary: z.array(ChordShapeSchema).default([]),
  tracks: z.array(TrackSchema).min(1),
  snippets: z.array(SnippetSchema).default([]),
  legend: z
    .array(z.object({ symbol: z.string(), meaning: z.string() }))
    .default([]),
});

export function parseArrangement(input) {
  return SongArrangementSchema.parse(input);
}

// Choose a notated note value + dot count for a quarter-note length.
export function noteValueFor(durationBeats) {
  const base = [
    { beats: 4, value: "whole" },
    { beats: 2, value: "half" },
    { beats: 1, value: "quarter" },
    { beats: 0.5, value: "eighth" },
    { beats: 0.25, value: "16th" },
    { beats: 0.125, value: "32nd" },
    { beats: 0.0625, value: "64th" },
  ];
  for (const { beats, value } of base) {
    if (Math.abs(durationBeats - beats) < 1e-6) return { value, dots: 0 };
    if (Math.abs(durationBeats - beats * 1.5) < 1e-6)
      return { value, dots: 1 };
    if (Math.abs(durationBeats - beats * 1.75) < 1e-6)
      return { value, dots: 2 };
  }
  // Fallback: nearest base value without dots.
  let best = base[2];
  for (const b of base)
    if (Math.abs(b.beats - durationBeats) < Math.abs(best.beats - durationBeats))
      best = b;
  return { value: best.value, dots: 0 };
}

// Open-string MIDI for a 6->1 tuning array. Defaults to standard tuning.
const NOTE_PC = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

export function tuningMidi(tuning = ["E2", "A2", "D3", "G3", "B3", "E4"]) {
  return tuning.map((note) => {
    const m = /^([A-G][#b]?)(-?\d)$/.exec(note.trim());
    if (!m) return 40;
    const pc = NOTE_PC[m[1]] ?? 0;
    const octave = Number(m[2]);
    return (octave + 1) * 12 + pc; // MIDI: C-1 = 0
  });
}

// MIDI pitch for a tab note given a low->high tuning (index 0 = lowest string).
// Works for any string count: string 1 is the highest (thinnest) string.
export function tabNoteMidi(tabNote, tuning) {
  const open = tuningMidi(tuning); // index 0 = lowest string
  const idx = tuning.length - tabNote.string; // string N -> idx 0, string 1 -> idx N-1
  return open[idx] + tabNote.fret;
}
