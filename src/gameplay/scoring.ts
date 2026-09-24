import type { GuitarEvent } from "../charts/schema";
import { isPitchWithinTolerance } from "../audio/noteMath";

export type HitInput = {
  atMs: number;
  pitchHz: number | null;
  onset: boolean;
};

export type HitResult = "pending" | "hit" | "late" | "miss" | "wrong-note";

export function judgeEvent(event: GuitarEvent, input: HitInput): HitResult {
  if (event.expected.kind === "rest") return "pending";
  const earlyEdge = event.timeMs - event.expected.timingWindowMs.early;
  const lateEdge = event.timeMs + event.expected.timingWindowMs.late;

  if (input.atMs < earlyEdge) return "pending";
  if (input.atMs > lateEdge) return "late";
  if (!input.onset) return "pending";

  return isPitchWithinTolerance(
    input.pitchHz,
    event.expected.midi,
    event.expected.toleranceCents,
  )
    ? "hit"
    : "wrong-note";
}

export function scoreForHit(streak: number): number {
  const multiplier = Math.min(4, 1 + Math.floor(streak / 8));
  return 100 * multiplier;
}
