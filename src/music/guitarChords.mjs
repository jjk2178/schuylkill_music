// Shapes list strings from low E (6) to high E (1); -1 means muted.
const names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const opens = {
  C: [-1, 3, 2, 0, 1, 0],
  D: [-1, -1, 0, 2, 3, 2],
  E: [0, 2, 2, 1, 0, 0],
  G: [3, 2, 0, 0, 0, 3],
  A: [-1, 0, 2, 2, 2, 0],
  Am: [-1, 0, 2, 2, 1, 0],
  Dm: [-1, -1, 0, 2, 3, 1],
  Em: [0, 2, 2, 0, 0, 0],
};
export const guitarChords = names.flatMap((name, root) =>
  ["", "m"].map((quality) => {
    const id = name + quality;
    const fret = (root - 4 + 12) % 12;
    const frets = opens[id] ?? [
      fret,
      fret + 2,
      fret + 2,
      fret + (quality ? 0 : 1),
      fret,
      fret,
    ];
    const position = opens[id] ? 1 : Math.max(1, fret);
    return {
      id,
      frets,
      position,
      chord: frets.map((f, i) => [
        6 - i,
        f < 0 ? "x" : f === 0 ? 0 : f - position + 1,
      ]),
      barres:
        opens[id] || !fret ? [] : [{ fromString: 6, toString: 1, fret: 1 }],
      pitchClasses: [root, (root + (quality ? 3 : 4)) % 12, (root + 7) % 12],
    };
  }),
);
