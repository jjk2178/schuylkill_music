import type { Chart } from "../charts/schema";
export function chordChangesForChart(
  chart: Chart,
): { timeMs: number; chord: string; origin?: string }[];

export function chartForInstrument(chart:Chart,instrument:string):Chart;
export function guitarChordForChart(chart:Chart,id:string):typeof import("./guitarChords.mjs").guitarChords[number]|undefined;
