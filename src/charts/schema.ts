import { z } from "zod";

export const TechniqueSchema = z.enum([
  "pick",
  "hammer",
  "pull",
  "slide",
  "bend",
  "mute",
  "harmonic",
]);

export const TempoEventSchema = z.object({
  timeMs: z.number().nonnegative(),
  bpm: z.number().positive(),
});

export const TimeSignatureEventSchema = z.object({
  timeMs: z.number().nonnegative(),
  beats: z.number().int().positive(),
  beatUnit: z.number().int().positive(),
});

export const KeySignatureEventSchema = z.object({
  timeMs: z.number().nonnegative(),
  key: z.string().min(1),
  fifths: z.number().int().min(-7).max(7),
  mode: z.string().optional(),
});

export const GuitarStringEventSchema = z.object({
  string: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  fret: z.number().int().min(0).max(24),
  technique: TechniqueSchema.optional(),
});

export const GuitarEventSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  tuplet: z.literal(3).nullable().optional(),
  staff: z.enum(["treble", "bass"]).optional(),
  voice: z.number().int().positive().optional(),
  stemDirection: z.enum(["up", "down"]).nullable().optional(),
  measure: z.number().int().positive().optional(),
  tieNext: z.array(z.number().int().min(0).max(127)).optional(),
  tiePrevious: z.array(z.number().int().min(0).max(127)).optional(),
  timeMs: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
  strings: z.array(GuitarStringEventSchema).min(0).max(6),
  expected: z.object({
    kind: z.enum(["note", "chord", "rest", "mute"]),
    scoring: z.enum(["pitch", "onset"]).optional(),
    midi: z.array(z.number().int().min(0).max(127)),
    toleranceCents: z.number().positive(),
    timingWindowMs: z.object({
      early: z.number().nonnegative(),
      late: z.number().nonnegative(),
    }),
  }),
});

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
export const ClefSchema = z.enum(["treble", "bass", "grand"]);

export const GuitarTrackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  instrument: InstrumentSchema.default("guitar"),
  clef: ClefSchema.optional(),
  role: z.enum(["piano-accompaniment"]).optional(),
  events: z.array(GuitarEventSchema),
});

export const ChartSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().min(1),
  artist: z.string().optional(),
  instrument: InstrumentSchema.default("guitar"),
  tuning: z.array(z.string()).length(6),
  capo: z.number().int().nonnegative().optional(),
  tempoMap: z.array(TempoEventSchema).min(1),
  pickupQuarters: z.number().positive().optional(),
  timeSignatures: z.array(TimeSignatureEventSchema).min(1),
  keySignatures: z.array(KeySignatureEventSchema).default([]),
  tracks: z.array(GuitarTrackSchema).min(1),
  lyrics: z
    .array(
      z.object({
        timeMs: z.number().nonnegative(),
        text: z.string(),
        verse: z.number().int().positive().optional(),
      }),
    )
    .optional(),
  guitarArrangement: z.object({
    capo: z.number().int().nonnegative(), bpm: z.number().positive(), startQuarter: z.number().nonnegative(), timing: z.literal("practice"), timingNotes:z.string().optional(), sourceUrl: z.string(), shapeKey: z.string(),
    strumming: z.array(z.object({label:z.string(),pattern:z.string()})),
    sections:z.array(z.object({label:z.string(),chords:z.array(z.object({chord:z.string(),beats:z.number().positive(),cue:z.string()}))})),
    riffs:z.array(z.object({label:z.string(),tab:z.string()})),
    shapes:z.record(z.string(),z.object({frets:z.array(z.number().int()).length(6),barres:z.array(z.object({fromString:z.number(),toString:z.number(),fret:z.number()}))})),
  }).optional(),
  chordChanges: z
    .array(
      z.object({
        timeMs: z.number().nonnegative(),
        chord: z.string(),
        origin: z.string().optional(),
      }),
    )
    .optional(),
  sections: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      timeMs: z.number().nonnegative(),
    }),
  ),
  assets: z
    .object({
      backingTrackUrl: z.string().optional(),
      artworkUrl: z.string().optional(),
      sourceUrl: z.string().optional(),
      sourcePageUrl: z.string().optional(),
      license: z.string().optional(),
    })
    .optional(),
});

export type Technique = z.infer<typeof TechniqueSchema>;
export type TempoEvent = z.infer<typeof TempoEventSchema>;
export type TimeSignatureEvent = z.infer<typeof TimeSignatureEventSchema>;
export type KeySignatureEvent = z.infer<typeof KeySignatureEventSchema>;
export type GuitarStringEvent = z.infer<typeof GuitarStringEventSchema>;
export type GuitarEvent = z.infer<typeof GuitarEventSchema>;
export type GuitarTrack = z.infer<typeof GuitarTrackSchema>;
export type Instrument = z.infer<typeof InstrumentSchema>;
export type Chart = z.infer<typeof ChartSchema>;

export type PlayableEvent = GuitarEvent;
export type PlayableTrack = GuitarTrack;

export function parseChart(input: unknown): Chart {
  const chart = ChartSchema.parse(input);
  return {
    ...chart,
    tracks: chart.tracks.map((track) => ({
      ...track,
      events: [...track.events].sort((a, b) => a.timeMs - b.timeMs),
    })),
  };
}

export function getPrimaryTrack(chart: Chart): PlayableTrack {
  return chart.tracks[0];
}

export function getChartDurationMs(chart: Chart): number {
  return Math.max(
    0,
    ...chart.tracks.flatMap((track) =>
      track.events.map((event) => event.timeMs + event.durationMs),
    ),
  );
}
