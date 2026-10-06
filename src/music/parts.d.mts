import type { PlayableEvent, KeySignatureEvent } from "../charts/schema";
export type CompiledNote = {
  id: string;
  sourceEventId: string;
  timeMs: number;
  durationMs: number;
  midi: number[];
  frets?:number[];
  chord?:string;
  tuplet?:3|null;
  staff?: "treble"|"bass";
  voice?:number;
  stemDirection?:"up"|"down"|null;
  measure?:number;
  tieNext?:number[];
  tiePrevious?:number[];
};
export function instrumentKey(value: string): string;
export function compilePart(
  events: PlayableEvent[],
  instrument: string,
  title?: string,
  indexOffset?: number,
): CompiledNote[];
export function writtenPitches(midi: number[], instrument: string): number[];
export function writtenKey<
  T extends { fifths: number; key: string; mode?: string },
>(signature: T, instrument: string): T;

export function compileChartPart(chart:import("../charts/schema").Chart,instrument:string):CompiledNote[];
export function isPianoChordAccompaniment(chart:import("../charts/schema").Chart,instrument:string):boolean;
