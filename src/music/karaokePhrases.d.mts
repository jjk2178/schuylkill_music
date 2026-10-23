export type KaraokePhrase = {
  text: string;
  timeMs: number;
  sourceTimeMs: number;
  verse?: string | number;
};

export function buildKaraokePhrases(chart: {
  lyrics?: { text: string; timeMs: number; verse?: string | number }[];
  tracks?: { events?: { timeMs: number; durationMs: number; midi?: number[] }[] }[];
}): KaraokePhrase[];
