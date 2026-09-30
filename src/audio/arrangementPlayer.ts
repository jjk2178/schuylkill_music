import { useEffect, useRef } from "react";
import type { Chart } from "../charts/schema";
import { arrangeForFivePlayers, type ArrangementPart } from "../arrangements/arranger";

type AudioTransport = "idle" | "playing" | "paused" | "complete";

type ActiveNode = {
  node: AudioScheduledSourceNode;
  gain?: GainNode;
};

export class ArrangementAudioPlayer {
  private context: AudioContext | null = null;
  private activeNodes: ActiveNode[] = [];

  play(chart: Chart, playheadMs: number): void {
    this.stop();
    const context = this.getContext();
    void context.resume();
    const arrangement = arrangeForFivePlayers(chart);
    const startAt = context.currentTime + 0.04;

    for (const part of arrangement.parts) {
      for (const note of part.notes) {
        const offsetMs = note.timeMs - playheadMs;
        if (offsetMs < -note.durationMs) continue;
        const when = startAt + Math.max(0, offsetMs) / 1000;
        const duration = Math.max(0.08, (note.durationMs - Math.max(0, -offsetMs)) / 1000);
        if (part.presentation === "drum-grid") this.scheduleDrum(context, note.midi, when);
        else this.scheduleNotes(context, part, note.midi, when, duration);
      }
    }
  }

  stop(): void {
    for (const { node, gain } of this.activeNodes) {
      try {
        gain?.gain.cancelScheduledValues(0);
        node.stop();
      } catch {
        // A node that already completed is safe to discard.
      }
    }
    this.activeNodes = [];
  }

  dispose(): void {
    this.stop();
    void this.context?.close();
    this.context = null;
  }

  private getContext(): AudioContext {
    this.context ??= new AudioContext();
    return this.context;
  }

  private scheduleNotes(
    context: AudioContext,
    part: ArrangementPart,
    midi: number[],
    when: number,
    duration: number,
  ): void {
    for (const pitch of midi) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const voice = voiceForPart(part);
      oscillator.type = voice.type;
      oscillator.frequency.setValueAtTime(midiToFrequency(pitch), when);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(voice.volume, when + voice.attack);
      gain.gain.setValueAtTime(voice.volume, when + Math.max(voice.attack, duration - voice.release));
      gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(when);
      oscillator.stop(when + duration + 0.03);
      this.activeNodes.push({ node: oscillator, gain });
    }
  }

  private scheduleDrum(context: AudioContext, midi: number[], when: number): void {
    for (const drum of midi) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const isKick = drum === 36;
      const isSnare = drum === 38;
      const duration = isKick ? 0.18 : isSnare ? 0.12 : 0.055;
      oscillator.type = isSnare || drum === 42 ? "square" : "sine";
      oscillator.frequency.setValueAtTime(isKick ? 110 : isSnare ? 180 : 5200, when);
      if (isKick) oscillator.frequency.exponentialRampToValueAtTime(48, when + duration);
      gain.gain.setValueAtTime(isSnare ? 0.06 : 0.08, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(when);
      oscillator.stop(when + duration + 0.01);
      this.activeNodes.push({ node: oscillator, gain });
    }
  }
}

export function useArrangementAudio(chart: Chart, transport: AudioTransport, playheadMs: number): void {
  const playerRef = useRef<ArrangementAudioPlayer | null>(null);
  playerRef.current ??= new ArrangementAudioPlayer();

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return undefined;
    if (transport === "playing") player.play(chart, playheadMs);
    else player.stop();
    return undefined;
  }, [chart, transport]);

  useEffect(() => () => playerRef.current?.dispose(), []);
}

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function voiceForPart(part: ArrangementPart): { type: OscillatorType; volume: number; attack: number; release: number } {
  if (part.instrument.includes("Bass")) return { type: "sawtooth", volume: 0.08, attack: 0.025, release: 0.08 };
  if (part.instrument.includes("Guitar")) return { type: "triangle", volume: 0.055, attack: 0.008, release: 0.14 };
  if (part.instrument.includes("Trumpet")) return { type: "square", volume: 0.035, attack: 0.025, release: 0.1 };
  if (part.instrument.includes("Drum")) return { type: "square", volume: 0.03, attack: 0.01, release: 0.04 };
  if (part.instrument.includes("Flute") || part.instrument.includes("Recorder")) {
    return { type: "sine", volume: 0.035, attack: 0.06, release: 0.12 };
  }
  if (part.instrument.includes("Vocal")) return { type: "triangle", volume: 0.025, attack: 0.045, release: 0.1 };
  return { type: "sine", volume: 0.045, attack: 0.02, release: 0.12 };
}
