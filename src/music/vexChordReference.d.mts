import type {GuitarChord} from './guitarChords.mjs';
export const vexChordReference:GuitarChord[];
export const printableChordReference:GuitarChord[];
export const guitarChordReference:GuitarChord[];
export function vexChordData(chord:GuitarChord):unknown;
export function vexChordOptions(small?:boolean):Record<string,unknown>;
