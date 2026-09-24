import { describe, expect, it } from "vitest";
import { demoChart } from "../charts/demoChart";
import { midiToHz } from "../audio/noteMath";
import {
  advanceGameplay,
  createInitialSnapshot,
  receiveInput,
  start,
} from "./engine";

describe("gameplay engine", () => {
  it("scores a note hit in performance mode", () => {
    const started = start(createInitialSnapshot("performance"));
    const next = receiveInput(demoChart, started, {
      atMs: 0,
      pitchHz: midiToHz(40),
      onset: true,
    });

    expect(next.score).toBe(100);
    expect(next.streak).toBe(1);
    expect(next.eventStates.n1.result).toBe("hit");
  });

  it("sticks on a missed note in practice mode", () => {
    const started = start(createInitialSnapshot("practice-sticky"));
    const next = advanceGameplay(demoChart, started, 260);

    expect(next.stickyEventId).toBe("n1");
    expect(next.eventStates.n1.result).toBe("miss");
  });

  it("unsticks after the correct note is played", () => {
    const missed = advanceGameplay(demoChart, start(createInitialSnapshot("practice-sticky")), 260);
    const recovered = receiveInput(demoChart, missed, {
      atMs: 5000,
      pitchHz: midiToHz(40),
      onset: true,
    });

    expect(recovered.stickyEventId).toBeNull();
    expect(recovered.eventStates.n1.result).toBe("hit");
  });
});
