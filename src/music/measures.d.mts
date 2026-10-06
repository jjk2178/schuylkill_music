import type { Chart, TimeSignatureEvent } from "../charts/schema";
export function measureBoundaries(
  chart: Pick<Chart, "tempoMap" | "timeSignatures">,
  endMs: number,
): number[];
export function tempoAt(chart: Pick<Chart, "tempoMap">, timeMs: number): number;
export function meterAt(
  chart: Pick<Chart, "timeSignatures">,
  timeMs: number,
): TimeSignatureEvent;
