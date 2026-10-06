export function rhythmicValue(
  durationMs: number,
  quarterMs: number,
): { duration: string; dots: number };
export function beamGroups(
  notes: { timeMs: number; durationMs: number; midi: number[] }[],
  quarterMs: number,
  meter: { beats: number; beatUnit: number },
  measures?: number[],
): number[][];
