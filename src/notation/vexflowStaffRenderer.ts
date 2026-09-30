import { Accidental, Formatter, Renderer, Stave, StaveNote, Voice } from "vexflow";

export type RenderedStaffNote = {
  timeMs: number;
  durationMs: number;
  midi: number[];
};

export type RenderedKeySignature = {
  key: string;
  fifths: number;
};

export type RenderVexflowStaffOptions = {
  clef: "treble" | "bass";
  notes: RenderedStaffNote[];
  keySignature: RenderedKeySignature;
  width: number;
  height: number;
  compact?: boolean;
  staveX?: number;
  staveY?: number;
  stavePadding?: number;
  formatPadding?: number;
  timeSignature?: { beats: number; beatUnit: number };
  quarterMs?: number;
};

const naturalPitchClasses: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

export function renderVexflowStaff(host: HTMLElement, options: RenderVexflowStaffOptions): void {
  const {
    clef,
    notes,
    keySignature,
    width,
    height,
    compact = false,
    staveX = 12,
    staveY = compact ? 10 : 18,
    stavePadding = 24,
    formatPadding = 120,
    timeSignature = { beats: 4, beatUnit: 4 },
    quarterMs = 600,
  } = options;

  host.innerHTML = "";

  const renderer = new Renderer(host as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const context = renderer.getContext();
  const stave = new Stave(staveX, staveY, width - stavePadding).addClef(clef).addKeySignature(keySignature.key);
  stave.addTimeSignature(`${timeSignature.beats}/${timeSignature.beatUnit}`);
  stave.setContext(context).draw();

  const tickables = notes.map((note) => {
    const spellings = note.midi.slice(0, 4).map((midi) => spellMidiForKey(midi, keySignature));
    const ratio = Math.max(0.125, note.durationMs / quarterMs);
    const duration = ratio >= 1.75 ? "h" : ratio >= 0.875 ? "q" : ratio >= 0.4375 ? "8" : "16";
    const staveNote = new StaveNote({
      clef,
      keys: spellings.length ? spellings.map((spelling) => spelling.key) : [clef === "bass" ? "c/3" : "c/4"],
      duration,
    });
    spellings.forEach((spelling, index) => {
      if (spelling.accidental) staveNote.addModifier(new Accidental(spelling.accidental), index);
    });
    return staveNote;
  });

  if (!tickables.length) return;

  const voice = new Voice({ numBeats: timeSignature.beats, beatValue: timeSignature.beatUnit }).setStrict(false);
  voice.addTickables(tickables);
  new Formatter().joinVoices([voice]).format([voice], width - formatPadding);

  voice.draw(context, stave);
}

export function spellMidiForKey(
  midi: number,
  signature: Pick<RenderedKeySignature, "fifths">,
): { key: string; accidental: "#" | "b" | "n" | null } {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const signatureAccidentals = keyAccidentals(signature.fifths);

  for (const [letter, natural] of Object.entries(naturalPitchClasses)) {
    const accidental = signatureAccidentals[letter] ?? 0;
    if (((natural + accidental) % 12 + 12) % 12 === pitchClass) {
      return { key: `${letter}/${octave}`, accidental: null };
    }
  }

  const preferFlats = signature.fifths < 0;
  const spellings: [string, number][] = preferFlats
    ? [
        ["c", 0], ["db", 1], ["d", 2], ["eb", 3], ["e", 4], ["f", 5],
        ["gb", 6], ["g", 7], ["ab", 8], ["a", 9], ["bb", 10], ["b", 11],
      ]
    : [
        ["c", 0], ["c#", 1], ["d", 2], ["d#", 3], ["e", 4], ["f", 5],
        ["f#", 6], ["g", 7], ["g#", 8], ["a", 9], ["a#", 10], ["b", 11],
      ];
  const [name] = spellings.find(([, pc]) => pc === pitchClass) ?? ["c"];
  const letter = name[0];
  const writtenAccidental = name.includes("#") ? 1 : name.includes("b") ? -1 : 0;
  const signatureAccidental = signatureAccidentals[letter] ?? 0;
  const accidental =
    writtenAccidental === signatureAccidental ? null : writtenAccidental === 0 ? "n" : writtenAccidental > 0 ? "#" : "b";
  return { key: `${name}/${octave}`, accidental };
}

function keyAccidentals(fifths = 0): Record<string, number> {
  const accidentals: Record<string, number> = { c: 0, d: 0, e: 0, f: 0, g: 0, a: 0, b: 0 };
  const sharpOrder = ["f", "c", "g", "d", "a", "e", "b"];
  const flatOrder = ["b", "e", "a", "d", "g", "c", "f"];
  if (fifths > 0) sharpOrder.slice(0, fifths).forEach((letter) => { accidentals[letter] = 1; });
  if (fifths < 0) flatOrder.slice(0, Math.abs(fifths)).forEach((letter) => { accidentals[letter] = -1; });
  return accidentals;
}
