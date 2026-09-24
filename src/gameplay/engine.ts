import type { Chart, GuitarEvent } from "../charts/schema";
import { getChartDurationMs, getPrimaryTrack } from "../charts/schema";
import { judgeEvent, scoreForHit, type HitInput, type HitResult } from "./scoring";

export type PlayMode = "practice-sticky" | "performance";
export type TransportState = "idle" | "playing" | "paused" | "complete";

export type GameplayEventState = {
  result: Exclude<HitResult, "pending">;
  atMs: number;
};

export type GameplaySnapshot = {
  mode: PlayMode;
  transport: TransportState;
  playheadMs: number;
  stickyEventId: string | null;
  activeEventId: string | null;
  score: number;
  streak: number;
  bestStreak: number;
  eventStates: Record<string, GameplayEventState>;
};

export function createInitialSnapshot(mode: PlayMode): GameplaySnapshot {
  return {
    mode,
    transport: "idle",
    playheadMs: 0,
    stickyEventId: null,
    activeEventId: null,
    score: 0,
    streak: 0,
    bestStreak: 0,
    eventStates: {},
  };
}

export function getActiveEvent(chart: Chart, playheadMs: number): GuitarEvent | null {
  const events = getPrimaryTrack(chart).events;
  return (
    events.find((event) => {
      const early = event.expected.timingWindowMs.early;
      const late = Math.max(event.durationMs, event.expected.timingWindowMs.late);
      return playheadMs >= event.timeMs - early && playheadMs <= event.timeMs + late;
    }) ?? null
  );
}

export function advanceGameplay(
  chart: Chart,
  snapshot: GameplaySnapshot,
  deltaMs: number,
): GameplaySnapshot {
  if (snapshot.transport !== "playing") return snapshot;

  const durationMs = getChartDurationMs(chart);
  const stickyEvent = snapshot.stickyEventId
    ? getPrimaryTrack(chart).events.find((event) => event.id === snapshot.stickyEventId)
    : null;
  const playheadMs = stickyEvent
    ? stickyEvent.timeMs
    : Math.min(durationMs, snapshot.playheadMs + deltaMs);
  const active = getActiveEvent(chart, playheadMs);
  let next = {
    ...snapshot,
    playheadMs,
    activeEventId: active?.id ?? null,
    transport: (playheadMs >= durationMs ? "complete" : snapshot.transport) as TransportState,
  };

  if (active && !next.eventStates[active.id]) {
    const lateEdge = active.timeMs + active.expected.timingWindowMs.late;
    if (playheadMs > lateEdge) {
      next = markMiss(next, active, playheadMs);
    }
  }

  return next;
}

export function receiveInput(
  chart: Chart,
  snapshot: GameplaySnapshot,
  input: HitInput,
): GameplaySnapshot {
  const active = snapshot.stickyEventId
    ? getPrimaryTrack(chart).events.find((event) => event.id === snapshot.stickyEventId)
    : getActiveEvent(chart, input.atMs);
  if (!active || snapshot.eventStates[active.id]?.result === "hit") return snapshot;

  const judgedInput = snapshot.stickyEventId ? { ...input, atMs: active.timeMs } : input;
  const result = judgeEvent(active, judgedInput);
  if (result === "pending") return snapshot;
  if (result === "hit") return markHit(snapshot, active, input.atMs);
  if (result === "wrong-note") {
    return snapshot.mode === "practice-sticky"
      ? { ...snapshot, stickyEventId: active.id }
      : markMiss(snapshot, active, input.atMs, "wrong-note");
  }
  return markMiss(snapshot, active, input.atMs, result);
}

export function start(snapshot: GameplaySnapshot): GameplaySnapshot {
  return { ...snapshot, transport: "playing" };
}

export function pause(snapshot: GameplaySnapshot): GameplaySnapshot {
  return { ...snapshot, transport: "paused" };
}

export function reset(mode: PlayMode): GameplaySnapshot {
  return createInitialSnapshot(mode);
}

function markHit(
  snapshot: GameplaySnapshot,
  event: GuitarEvent,
  atMs: number,
): GameplaySnapshot {
  const streak = snapshot.streak + 1;
  return {
    ...snapshot,
    stickyEventId: snapshot.stickyEventId === event.id ? null : snapshot.stickyEventId,
    score: snapshot.score + scoreForHit(streak),
    streak,
    bestStreak: Math.max(snapshot.bestStreak, streak),
    eventStates: {
      ...snapshot.eventStates,
      [event.id]: { result: "hit", atMs },
    },
  };
}

function markMiss(
  snapshot: GameplaySnapshot,
  event: GuitarEvent,
  atMs: number,
  result: Exclude<HitResult, "pending" | "hit"> = "miss",
): GameplaySnapshot {
  return {
    ...snapshot,
    stickyEventId: snapshot.mode === "practice-sticky" ? event.id : null,
    streak: 0,
    eventStates: {
      ...snapshot.eventStates,
      [event.id]: { result, atMs },
    },
  };
}
