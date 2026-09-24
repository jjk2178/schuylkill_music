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
  timeMs: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
  strings: z.array(GuitarStringEventSchema).min(0).max(6),
  expected: z.object({
    kind: z.enum(["note", "chord", "rest", "mute"]),
    midi: z.array(z.number().int().min(0).max(127)),
    toleranceCents: z.number().positive(),
    timingWindowMs: z.object({
      early: z.number().nonnegative(),
      late: z.number().nonnegative(),
    }),
  }),
});

export const GuitarTrackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  events: z.array(GuitarEventSchema),
});

export const ChartSchema = z.object({
  schemaVersion: z.literal(1),
  title: z.string().min(1),
  artist: z.string().optional(),
  tuning: z.array(z.string()).length(6),
  capo: z.number().int().nonnegative().optional(),
  tempoMap: z.array(TempoEventSchema).min(1),
  timeSignatures: z.array(TimeSignatureEventSchema).min(1),
  tracks: z.array(GuitarTrackSchema).min(1),
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
    })
    .optional(),
});

export type Technique = z.infer<typeof TechniqueSchema>;
export type TempoEvent = z.infer<typeof TempoEventSchema>;
export type TimeSignatureEvent = z.infer<typeof TimeSignatureEventSchema>;
export type GuitarStringEvent = z.infer<typeof GuitarStringEventSchema>;
export type GuitarEvent = z.infer<typeof GuitarEventSchema>;
export type GuitarTrack = z.infer<typeof GuitarTrackSchema>;
export type Chart = z.infer<typeof ChartSchema>;

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

export function getPrimaryTrack(chart: Chart): GuitarTrack {
  return chart.tracks[0];
}

export function getChartDurationMs(chart: Chart): number {
  return Math.max(
    ...chart.tracks.flatMap((track) =>
      track.events.map((event) => event.timeMs + event.durationMs),
    ),
  );
}
