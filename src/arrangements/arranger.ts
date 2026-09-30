import type { Chart, KeySignatureEvent, PlayableEvent } from "../charts/schema";
import { getPrimaryTrack } from "../charts/schema";

export type EnsembleRoleId =
  | "jack-guitar"
  | "jack-trumpet"
  | "laura-guitar"
  | "laura-flute"
  | "michael-guitar"
  | "michael-recorder"
  | "bobby-bass"
  | "nana-keys"
  | "pops-drums"
  | "xinnia-vocal"
  | "tara-vocal";

export type PartPresentation =
  | "guitar-tab"
  | "bass-tab"
  | "trumpet-fingering"
  | "keyboard-staff"
  | "drum-grid"
  | "melody-staff"
  | "vocal-cues";

export type ArrangementNote = {
  id: string;
  sourceEventId: string;
  timeMs: number;
  durationMs: number;
  midi: number[];
  label: string;
};

export type ArrangementPart = {
  id: EnsembleRoleId;
  name: string;
  instrument: string;
  clef: "treble" | "bass";
  presentation: PartPresentation;
  color: string;
  range: string;
  notes: ArrangementNote[];
};

export type Arrangement = {
  title: string;
  sourceTitle: string;
  parts: ArrangementPart[];
};

const partTemplates: Omit<ArrangementPart, "notes">[] = [
  {
    id: "jack-guitar",
    name: "Jack",
    instrument: "Lead Guitar",
    clef: "treble",
    presentation: "guitar-tab",
    color: "#141820",
    range: "lead tab; swaps to trumpet",
  },
  {
    id: "jack-trumpet",
    name: "Jack",
    instrument: "Bb Trumpet",
    clef: "treble",
    presentation: "trumpet-fingering",
    color: "#141820",
    range: "selected accents and valves",
  },
  {
    id: "laura-guitar",
    name: "Laura",
    instrument: "Rhythm Guitar",
    clef: "treble",
    presentation: "guitar-tab",
    color: "#141820",
    range: "covers guitar bed",
  },
  {
    id: "laura-flute",
    name: "Laura",
    instrument: "Flute",
    clef: "treble",
    presentation: "melody-staff",
    color: "#141820",
    range: "hook doubles and counter-line",
  },
  {
    id: "michael-guitar",
    name: "Michael",
    instrument: "Backup Guitar",
    clef: "treble",
    presentation: "guitar-tab",
    color: "#141820",
    range: "fills guitar when trumpet enters",
  },
  {
    id: "michael-recorder",
    name: "Michael",
    instrument: "Recorder",
    clef: "treble",
    presentation: "melody-staff",
    color: "#141820",
    range: "simple doubled melody",
  },
  {
    id: "bobby-bass",
    name: "Bobby",
    instrument: "Bass",
    clef: "bass",
    presentation: "bass-tab",
    color: "#141820",
    range: "root movement tab",
  },
  {
    id: "nana-keys",
    name: "Nana",
    instrument: "Keys",
    clef: "treble",
    presentation: "keyboard-staff",
    color: "#141820",
    range: "grand staff source",
  },
  {
    id: "pops-drums",
    name: "Pops",
    instrument: "Drums",
    clef: "treble",
    presentation: "drum-grid",
    color: "#141820",
    range: "kick snare hat map",
  },
  {
    id: "xinnia-vocal",
    name: "Xinnia",
    instrument: "Lead Vocal",
    clef: "treble",
    presentation: "vocal-cues",
    color: "#141820",
    range: "lead melody cues",
  },
  {
    id: "tara-vocal",
    name: "Tara",
    instrument: "Harmony Vocal",
    clef: "treble",
    presentation: "vocal-cues",
    color: "#141820",
    range: "chorus harmony cues",
  },
];

export function arrangeForFivePlayers(chart: Chart): Arrangement {
  const events = getPrimaryTrack(chart).events;
  const buckets: Record<EnsembleRoleId, ArrangementNote[]> = {
    "jack-guitar": [],
    "jack-trumpet": [],
    "laura-guitar": [],
    "laura-flute": [],
    "michael-guitar": [],
    "michael-recorder": [],
    "bobby-bass": [],
    "nana-keys": [],
    "pops-drums": [],
    "xinnia-vocal": [],
    "tara-vocal": [],
  };

  events.forEach((event, index) => {
    const midi = playableMidi(event);
    if (!midi.length) return;

    const low = midi[0];
    const high = midi[midi.length - 1];
    const chordShell = compactChord(midi);

    buckets["jack-guitar"].push(makeNote("jack-guitar", event, [transposeIntoRange(high, 52, 76)]));
    buckets["laura-guitar"].push(makeNote("laura-guitar", event, [transposeIntoRange(chordShell[0] ?? low, 45, 69)]));

    if (index % 4 === 0) {
      buckets["jack-trumpet"].push(makeNote("jack-trumpet", event, [transposeIntoRange(high, 58, 82)]));
      buckets["michael-guitar"].push(
        makeNote("michael-guitar", event, [transposeIntoRange(chordShell.at(-1) ?? high, 45, 69)]),
      );
    }

    if (index % 2 === 0 || midi.length > 1) {
      buckets["bobby-bass"].push(makeNote("bobby-bass", event, [transposeIntoRange(low, 28, 52)]));
    }

    if (index % 3 === 0) {
      buckets["laura-flute"].push(makeNote("laura-flute", event, [transposeIntoRange(high, 60, 84)]));
    }

    if (index % 4 === 2) {
      buckets["michael-recorder"].push(makeNote("michael-recorder", event, [transposeIntoRange(high, 60, 79)]));
    }

    if (midi.length > 1) {
      buckets["nana-keys"].push(makeNote("nana-keys", event, compactChord(midi.map((note) => transposeIntoRange(note, 48, 81)))));
    } else if (index % 4 === 0) {
      buckets["nana-keys"].push(makeNote("nana-keys", event, [transposeIntoRange(high, 60, 81)]));
    }

    if (index % 2 === 0) {
      buckets["xinnia-vocal"].push(makeNote("xinnia-vocal", event, [transposeIntoRange(high, 55, 76)]));
    }
    if (index % 8 === 4) {
      buckets["tara-vocal"].push(makeNote("tara-vocal", event, [transposeIntoRange(high - 3, 52, 72)]));
    }

    buckets["pops-drums"].push(
      makeNote("pops-drums", event, drumMidiForEvent(index, midi.length > 1, event.durationMs >= 700)),
    );
  });

  return {
    title: `${chart.title} - Band arrangement`,
    sourceTitle: chart.title,
    parts: partTemplates.map((template) => ({
      ...template,
      notes: buckets[template.id].slice(0, 48),
    })),
  };
}

function drumMidiForEvent(index: number, isChord: boolean, isLong: boolean): number[] {
  const hits = [42];
  if (index % 2 === 0 || isChord) hits.push(36);
  if (index % 4 === 2 || isLong) hits.push(38);
  if (index % 8 === 0) hits.push(49);
  return hits;
}

function playableMidi(event: PlayableEvent): number[] {
  return [...new Set(event.expected.midi)]
    .filter((midi) => midi >= 28 && midi <= 96)
    .sort((a, b) => a - b);
}

function compactChord(midi: number[]): number[] {
  const uniquePitchClasses = new Set<number>();
  const compact: number[] = [];
  for (const note of midi) {
    const normalized = transposeIntoRange(note, 52, 76);
    const pitchClass = normalized % 12;
    if (uniquePitchClasses.has(pitchClass)) continue;
    uniquePitchClasses.add(pitchClass);
    compact.push(normalized);
    if (compact.length >= 3) break;
  }
  return compact.sort((a, b) => a - b);
}

function transposeIntoRange(midi: number, min: number, max: number): number {
  let note = midi;
  while (note < min) note += 12;
  while (note > max) note -= 12;
  return note;
}

function makeNote(role: EnsembleRoleId, event: PlayableEvent, midi: number[]): ArrangementNote {
  return {
    id: `${role}-${event.id}`,
    sourceEventId: event.id,
    timeMs: event.timeMs,
    durationMs: event.durationMs,
    midi,
    label: midi.map(midiName).join(" "),
  };
}

export function midiName(midi: number): string {
  const names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function midiToVexKey(midi: number): string {
  return spellMidiForKey(midi, defaultKeySignature()).key;
}

export function defaultKeySignature(): KeySignatureEvent {
  return { timeMs: 0, key: "C", fifths: 0, mode: "major" };
}

export function keySignatureAt(chart: Chart, timeMs = 0): KeySignatureEvent {
  return (
    [...(chart.keySignatures ?? [])]
      .sort((a, b) => a.timeMs - b.timeMs)
      .findLast((signature) => signature.timeMs <= timeMs) ?? defaultKeySignature()
  );
}

export function spellMidiForKey(midi: number, signature: Pick<KeySignatureEvent, "fifths">): {
  key: string;
  accidental: "#" | "b" | "n" | null;
} {
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

const naturalPitchClasses: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function keyAccidentals(fifths = 0): Record<string, number> {
  const accidentals: Record<string, number> = { c: 0, d: 0, e: 0, f: 0, g: 0, a: 0, b: 0 };
  const sharpOrder = ["f", "c", "g", "d", "a", "e", "b"];
  const flatOrder = ["b", "e", "a", "d", "g", "c", "f"];
  if (fifths > 0) sharpOrder.slice(0, fifths).forEach((letter) => { accidentals[letter] = 1; });
  if (fifths < 0) flatOrder.slice(0, Math.abs(fifths)).forEach((letter) => { accidentals[letter] = -1; });
  return accidentals;
}
