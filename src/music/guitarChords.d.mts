export type GuitarChord = {
  id: string;
  frets: number[];
  position: number;
  chord: [number, number | string, (number | string)?][];
  barres: { fromString: number; toString: number; fret: number }[];
  pitchClasses: number[];
};
export const guitarChords: GuitarChord[];
