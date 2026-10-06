import { staffTieLinks } from "../music/ties.mjs";
import { rhythmicValue, beamGroups } from "../music/engraving.mjs";
import {
  Accidental,
  Beam,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveNote,
  StaveTie,
  Stem,
  Voice,
} from "vexflow";

export type RenderedStaffNote = {
  timeMs: number;
  durationMs: number;
  midi: number[];
  stemDirection?:"up"|"down"|null;
  tieNext?:number[];
  tiePrevious?:number[];
};

export type RenderedKeySignature = {
  key: string;
  fifths: number;
};

export type RenderVexflowStaffOptions = {
  clef: "treble" | "bass" | "percussion";
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
  measureTimes?: number[];
  timePositioned?: boolean;
  timeRange?: { startMs: number; endMs: number };
};

export const notationActiveStartOffset = 72;
export const notationActiveEndInset = 12;

const naturalPitchClasses: Record<string, number> = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11,
};

export function renderVexflowStaff(
  host: HTMLElement,
  options: RenderVexflowStaffOptions,
): void {
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
    timePositioned = false,
    timeRange,
  } = options;

  host.innerHTML = "";

  const renderer = new Renderer(host as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const context = renderer.getContext();
  const stave = new Stave(staveX, staveY, width - stavePadding).addClef(clef);
  if (clef !== "percussion") stave.addKeySignature(keySignature.key);
  stave.addTimeSignature(`${timeSignature.beats}/${timeSignature.beatUnit}`);
  if (timePositioned) stave.setNoteStartX(staveX + notationActiveStartOffset);
  stave.setContext(context).draw();

  const tickables = notes.map((note) => {
    const spellings = note.midi.slice(0, 4).map((midi) =>
      clef === "percussion"
        ? {
            key:
              (
                {
                  36: "f/4",
                  38: "c/5",
                  42: "g/5/x2",
                  49: "a/5/x2",
                } as Record<number, string>
              )[midi] ?? "g/5/x2",
            accidental: null,
          }
        : spellMidiForKey(midi, keySignature),
    );
    const value = rhythmicValue(note.durationMs, quarterMs);
    const staveNote = new StaveNote({
      clef,
      keys: spellings.length
        ? spellings.map((spelling) => spelling.key)
        : [clef === "bass" ? "c/3" : "c/4"],
      duration: value.duration + (!note.midi.length ? "r" : ""),
      autoStem: !note.stemDirection && clef !== "percussion",
      stemDirection: note.stemDirection === "up" ? Stem.UP : note.stemDirection === "down" ? Stem.DOWN : clef === "percussion" ? Stem.UP : undefined,
    });
    if (value.dots) Dot.buildAndAttach([staveNote], { all: true });
    spellings.forEach((spelling, index) => {
      if (spelling.accidental)
        staveNote.addModifier(new Accidental(spelling.accidental), index);
    });
    return staveNote;
  });

  if (!tickables.length) {
    addMeasureBarlines(host, stave, options.measureTimes ?? [], timeRange);
    return;
  }

  const voice = new Voice({
    numBeats: timeSignature.beats,
    beatValue: timeSignature.beatUnit,
  }).setStrict(false);
  voice.addTickables(tickables);
  new Formatter().joinVoices([voice]).format([voice], width - formatPadding);

  if (timePositioned && timeRange) {
    const firstTime = timeRange.startMs;
    const timeSpan = Math.max(1, timeRange.endMs - firstTime);
    const activeStart = stave.getNoteStartX();
    const activeEnd = stave.getX() + stave.getWidth() - notationActiveEndInset;
    tickables.forEach((tickable, index) => {
      const progress = Math.max(
        0,
        Math.min(1, (notes[index].timeMs - firstTime) / timeSpan),
      );
      tickable.getTickContext().setX(progress * (activeEnd - activeStart) - 12);
    });
  }

  const beams = beamGroups(
    notes,
    quarterMs,
    timeSignature,
    options.measureTimes,
  ).map((group) => new Beam(group.map((i) => tickables[i])));
  voice.draw(context, stave);
  beams.forEach((beam) => beam.setContext(context).draw());
  staffTieLinks(notes).forEach(link=>new StaveTie({firstNote:link.from===null?undefined:tickables[link.from],lastNote:link.to===null?undefined:tickables[link.to],firstIndexes:link.fromIndices,lastIndexes:link.toIndices}).setContext(context).draw());
  addMeasureBarlines(host, stave, options.measureTimes ?? [], timeRange);
}

function addMeasureBarlines(
  host: HTMLElement,
  stave: Stave,
  measures: number[],
  range?: { startMs: number; endMs: number },
): void {
  const svg = host.querySelector("svg");
  if (!svg || !range) return;
  const startX = stave.getNoteStartX(),
    endX = stave.getX() + stave.getWidth() - notationActiveEndInset;
  for (const time of measures.filter(
    (time) => time > range.startMs && time < range.endMs,
  )) {
    const x =
      startX +
      ((time - range.startMs) / Math.max(1, range.endMs - range.startMs)) *
        (endX - startX);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("class", "vex-measure-bar");
    line.setAttribute("x1", String(x));
    line.setAttribute("x2", String(x));
    line.setAttribute("y1", String(stave.getTopLineTopY()));
    line.setAttribute("y2", String(stave.getBottomLineBottomY()));
    line.setAttribute("stroke", "#222");
    line.setAttribute("stroke-width", "1");
    svg.appendChild(line);
  }
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
    if ((((natural + accidental) % 12) + 12) % 12 === pitchClass) {
      return { key: `${letter}/${octave}`, accidental: null };
    }
  }

  const preferFlats = signature.fifths < 0;
  const spellings: [string, number][] = preferFlats
    ? [
        ["c", 0],
        ["db", 1],
        ["d", 2],
        ["eb", 3],
        ["e", 4],
        ["f", 5],
        ["gb", 6],
        ["g", 7],
        ["ab", 8],
        ["a", 9],
        ["bb", 10],
        ["b", 11],
      ]
    : [
        ["c", 0],
        ["c#", 1],
        ["d", 2],
        ["d#", 3],
        ["e", 4],
        ["f", 5],
        ["f#", 6],
        ["g", 7],
        ["g#", 8],
        ["a", 9],
        ["a#", 10],
        ["b", 11],
      ];
  const [name] = spellings.find(([, pc]) => pc === pitchClass) ?? ["c"];
  const letter = name[0];
  const writtenAccidental = name.includes("#")
    ? 1
    : name.includes("b")
      ? -1
      : 0;
  const signatureAccidental = signatureAccidentals[letter] ?? 0;
  const accidental =
    writtenAccidental === signatureAccidental
      ? null
      : writtenAccidental === 0
        ? "n"
        : writtenAccidental > 0
          ? "#"
          : "b";
  return { key: `${name}/${octave}`, accidental };
}

function keyAccidentals(fifths = 0): Record<string, number> {
  const accidentals: Record<string, number> = {
    c: 0,
    d: 0,
    e: 0,
    f: 0,
    g: 0,
    a: 0,
    b: 0,
  };
  const sharpOrder = ["f", "c", "g", "d", "a", "e", "b"];
  const flatOrder = ["b", "e", "a", "d", "g", "c", "f"];
  if (fifths > 0)
    sharpOrder.slice(0, fifths).forEach((letter) => {
      accidentals[letter] = 1;
    });
  if (fifths < 0)
    flatOrder.slice(0, Math.abs(fifths)).forEach((letter) => {
      accidentals[letter] = -1;
    });
  return accidentals;
}
