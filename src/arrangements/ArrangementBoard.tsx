import { useEffect, useMemo, useRef } from "react";
import type { Chart, KeySignatureEvent } from "../charts/schema";
import { notationActiveEndInset, notationActiveStartOffset, renderVexflowStaff } from "../notation/vexflowStaffRenderer";
import {
  arrangeForFivePlayers,
  keySignatureAt,
  midiName,
  type Arrangement,
  type ArrangementNote,
  type ArrangementPart,
} from "./arranger";
import { rehearsalSongs } from "../band/rehearsalSet";

type Props = {
  chart: Chart;
  playheadMs: number;
  playerName?: string;
};

const scoreWidth = 1440;
const labelWidth = 172;
const systemPadding = 32;
const rowHeight = 144;
const stringStaffHeight = 196;
const stringRowHeight = 340;
const keyboardRowHeight = 208;
const masterHeight = 208;
const rulerHeight = 34;

const guitarTuning = [
  { label: "e", openMidi: 64 },
  { label: "B", openMidi: 59 },
  { label: "G", openMidi: 55 },
  { label: "D", openMidi: 50 },
  { label: "A", openMidi: 45 },
  { label: "E", openMidi: 40 },
];

const bassTuning = [
  { label: "G", openMidi: 43 },
  { label: "D", openMidi: 38 },
  { label: "A", openMidi: 33 },
  { label: "E", openMidi: 28 },
];

const trumpetFingerings: Record<number, string> = {
  0: "0",
  1: "123",
  2: "13",
  3: "23",
  4: "12",
  5: "1",
  6: "2",
  7: "0",
  8: "23",
  9: "12",
  10: "1",
  11: "2",
};

const drumNames: Record<number, string> = {
  36: "Kick",
  38: "Snare",
  42: "Hat",
  49: "Crash",
};

export function ArrangementBoard({ chart, playheadMs, playerName }: Props) {
  const arrangement = useMemo(() => arrangeForFivePlayers(chart), [chart]);
  const visibleParts = useMemo(
    () => (playerName ? partsForPlayer(arrangement.parts, chart, playerName) : arrangement.parts),
    [arrangement.parts, chart, playerName],
  );
  const timeline = useMemo(() => getTimeline({ ...arrangement, parts: visibleParts }, chart), [arrangement, chart, visibleParts]);
  const playheadX = timeToX(playheadMs, timeline);

  return (
    <section className="arrangement-board" aria-label="Five-player arrangement">
      <header className="arrangement-head">
        <div>
          <p className="eyebrow">Arrangement lab</p>
          <h2>{playerName ? `${playerName}'s player view` : "Stacked band score"}</h2>
        </div>
        <span>{arrangement.sourceTitle}</span>
      </header>
      <div className="stacked-score">
        <div className="score-scroll" style={{ width: labelWidth + scoreWidth }}>
          <div className="score-playhead" style={{ transform: `translateX(${labelWidth + playheadX}px)` }} />
          <MeasureRuler timeline={timeline} />
          {playerName ? null : <MasterRow arrangement={arrangement} timeline={timeline} chart={chart} />}
          {visibleParts.map((part) => (
            <ScoreRow key={part.id} part={part} timeline={timeline} chart={chart} />
          ))}
        </div>
      </div>
    </section>
  );
}

function MeasureRuler({ timeline }: { timeline: Timeline }) {
  return (
    <div className="measure-ruler" aria-hidden="true">
      <div className="measure-ruler-label">Bars</div>
      <svg viewBox={`0 0 ${scoreWidth} ${rulerHeight}`}>
        {timeline.measures.map((timeMs, index) => {
          const x = timeToX(timeMs, timeline);
          return (
            <g key={timeMs} transform={`translate(${x} 0)`}>
              <line y1={16} y2={rulerHeight} />
              <text y={11}>{index + 1}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MasterRow({ arrangement, timeline, chart }: { arrangement: Arrangement; timeline: Timeline; chart: Chart }) {
  const events = useMemo(() => makeConductorReduction(arrangement.parts, timeline), [arrangement.parts, timeline]);
  const signature = keySignatureAt(chart, events[0]?.timeMs ?? 0);
  return (
    <article className="score-row master-row">
      <header className="score-label">
        <strong>Master</strong>
        <small>Conductor reduction</small>
      </header>
      <div className="score-system master-system">
        <GrandStaff notes={events} height={masterHeight} timeline={timeline} keySignature={signature} timeSignature={chart.timeSignatures[0]} />
      </div>
    </article>
  );
}

function ScoreRow({ part, timeline, chart }: { part: ArrangementPart; timeline: Timeline; chart: Chart }) {
  const signature = keySignatureAt(chart, part.notes[0]?.timeMs ?? 0);
  return (
    <article className={`score-row score-row-${part.id}${part.presentation === "guitar-tab" || part.presentation === "bass-tab" ? " score-row-string" : ""}`} style={{ color: part.color }}>
      <header className="score-label">
        <strong>{part.name}</strong>
        <small>{part.instrument}</small>
        <span>{part.range}</span>
        {part.presentation === "trumpet-fingering" ? <span className="score-hint">valves 1 2 3</span> : null}
        {part.presentation === "drum-grid" ? <span className="score-hint">x hats, dots drums</span> : null}
        {part.presentation === "vocal-cues" ? <span className="score-hint">cue pitches</span> : null}
      </header>
      <div className="score-system">
        <StaffLayer part={part} timeline={timeline} chart={chart} keySignature={signature} />
        <AnnotationLayer part={part} timeline={timeline} />
      </div>
    </article>
  );
}

function StaffLayer({ part, timeline, chart, keySignature }: { part: ArrangementPart; timeline: Timeline; chart: Chart; keySignature: KeySignatureEvent }) {
  const height = part.presentation === "keyboard-staff"
      ? keyboardRowHeight
    : part.presentation === "guitar-tab" || part.presentation === "bass-tab"
      ? stringRowHeight
      : rowHeight;
  if (part.presentation === "guitar-tab") {
    return <StringInstrumentStaff part={part} tuning={guitarTuning} height={height} timeline={timeline} keySignature={keySignature} timeSignature={chart.timeSignatures[0]} />;
  }
  if (part.presentation === "bass-tab") {
    return <StringInstrumentStaff part={part} tuning={bassTuning} height={height} timeline={timeline} keySignature={keySignature} timeSignature={chart.timeSignatures[0]} />;
  }
  if (part.presentation === "keyboard-staff") {
    return <GrandStaff notes={part.notes} height={keyboardRowHeight} timeline={timeline} keySignature={keySignature} timeSignature={chart.timeSignatures[0]} />;
  }
  if (part.presentation === "melody-staff" || part.presentation === "vocal-cues") {
    const timePositioned = part.instrument.toLowerCase().includes("flute") || part.instrument.toLowerCase().includes("recorder");
    return <VexStaff notes={part.notes} clef={part.clef} height={height} timeline={timeline} keySignature={keySignature} timeSignature={chart.timeSignatures[0]} timePositioned={timePositioned} />;
  }
  if (part.presentation !== "drum-grid") {
    const timePositioned = part.instrument.toLowerCase().includes("trumpet");
    return <VexStaff notes={part.notes} clef={part.clef} height={height} timeline={timeline} keySignature={keySignature} timeSignature={chart.timeSignatures[0]} timePositioned={timePositioned} />;
  }
  const staffTop = 24;
  const staffGap = 18;

  return (
    <svg className="staff-layer" viewBox={`0 0 ${scoreWidth} ${height}`} aria-hidden="true">
      <TimelineGuides timeline={timeline} height={height} />
      {[49, 42, 38, 36].map((_, index) => (
        <line
          key={index}
          x1={systemPadding}
          x2={scoreWidth - systemPadding}
          y1={staffTop + index * staffGap}
          y2={staffTop + index * staffGap}
        />
      ))}
      {part.notes.slice(0, 32).map((note) => (
        <DrumNote key={note.id} note={note} timeline={timeline} />
      ))}
    </svg>
  );
}

function StringInstrumentStaff({
  part,
  tuning,
  height,
  timeline,
  keySignature,
  timeSignature,
}: {
  part: ArrangementPart;
  tuning: Array<{ label: string; openMidi: number }>;
  height: number;
  timeline: Timeline;
  keySignature: KeySignatureEvent;
  timeSignature: { beats: number; beatUnit: number };
}) {
  return (
    <div className="string-notation-stack">
      <div className="string-grand-staff">
        <GrandStaff notes={part.notes} height={stringStaffHeight} timeline={timeline} keySignature={keySignature} timeSignature={timeSignature} />
      </div>
      <div className="string-tab-staff">
        <TabStaff tuning={tuning} height={height - stringStaffHeight} timeline={timeline} />
      </div>
    </div>
  );
}

function partsForPlayer(parts: ArrangementPart[], chart: Chart, playerName: string): ArrangementPart[] {
  const namedParts = parts.filter((part) => part.name === playerName);
  const song = rehearsalSongs.find((candidate) => {
    const songTitle = candidate.title.toLowerCase();
    const chartTitle = chart.title.toLowerCase();
    return chartTitle === songTitle || chartTitle.startsWith(`${songTitle} (`);
  });
  const role = song?.roles.find((candidate) => candidate.player === playerName);
  if (!role) return namedParts;

  const targetPresentation = presentationForInstrument(role.instrument);
  return namedParts.filter((part) => part.presentation === targetPresentation);
}

function presentationForInstrument(instrument: string): ArrangementPart["presentation"] {
  const value = instrument.toLowerCase();
  if (value.includes("key")) return "keyboard-staff";
  if (value.includes("bass")) return "bass-tab";
  if (value.includes("drum")) return "drum-grid";
  if (value.includes("guitar")) return "guitar-tab";
  if (value.includes("trumpet")) return "trumpet-fingering";
  if (value.includes("vocal")) return "vocal-cues";
  return "melody-staff";
}

function TabStaff({
  tuning,
  height,
  timeline,
}: {
  tuning: Array<{ label: string; openMidi: number }>;
  height: number;
  timeline: Timeline;
}) {
  const lineTop = tuning.length === 6 ? 36 : 42;
  const lineGap = tuning.length === 6 ? 17 : 23;
  return (
    <svg className="staff-layer tab-staff-layer" viewBox={`0 0 ${scoreWidth} ${height}`} aria-hidden="true">
      <TimelineGuides timeline={timeline} height={height} />
      {tuning.map((stringInfo, index) => (
        <g key={stringInfo.label} transform={`translate(0 ${lineTop + index * lineGap})`}>
          <text x={systemPadding - 16} y={4} textAnchor="end">
            {stringInfo.label}
          </text>
          <line x1={systemPadding} x2={scoreWidth - systemPadding} y1={0} y2={0} />
        </g>
      ))}
      {timeline.measures.map((timeMs) => {
        const x = timeToX(timeMs, timeline);
        return <line key={timeMs} className="tab-barline" x1={x} x2={x} y1={lineTop} y2={lineTop + (tuning.length - 1) * lineGap} />;
      })}
    </svg>
  );
}

function DrumNote({
  note,
  timeline,
}: {
  note: ArrangementNote;
  timeline: Timeline;
}) {
  const x = timeToX(note.timeMs, timeline);
  return (
    <g className="drum-hit" transform={`translate(${x} 0)`}>
      {note.midi.map((midi) =>
        midi === 42 || midi === 49 ? (
          <g key={midi} transform={`translate(0 ${drumY(midi)})`}>
            <text x={0} y={5} textAnchor="middle" className="drum-x">
              x
            </text>
            <line x1={6} x2={6} y1={-22} y2={2} />
          </g>
        ) : (
          <g key={midi} transform={`translate(0 ${drumY(midi)})`}>
            <circle r={5} />
            <line x1={6} x2={6} y1={-22} y2={2} />
          </g>
        ),
      )}
    </g>
  );
}

function VexStaff({
  notes,
  clef,
  height,
  timeline,
  keySignature,
  timeSignature,
  timePositioned = false,
  compact = false,
}: {
  notes: ArrangementNote[];
  clef: "treble" | "bass";
  height: number;
  timeline: Timeline;
  keySignature: KeySignatureEvent;
  timeSignature: { beats: number; beatUnit: number };
  timePositioned?: boolean;
  compact?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    renderVexflowStaff(host, {
      clef,
      notes: notes.slice(0, compact ? 24 : 32),
      keySignature,
      width: scoreWidth,
      height,
      compact,
      staveX: systemPadding,
      staveY: compact ? 14 : 18,
      stavePadding: systemPadding * 2,
      formatPadding: systemPadding * 2 + 86,
      timeSignature,
      timePositioned,
      timeRange: timePositioned ? timeline : undefined,
    });
  }, [clef, compact, height, keySignature, notes, timePositioned, timeSignature, timeline]);

  return (
    <>
      <svg className="staff-guides" viewBox={`0 0 ${scoreWidth} ${height}`} aria-hidden="true">
        <TimelineGuides timeline={timeline} height={height} />
      </svg>
      <div ref={hostRef} className="vex-score-layer" />
    </>
  );
}

function GrandStaff({
  notes,
  height,
  timeline,
  keySignature,
  timeSignature,
}: {
  notes: ArrangementNote[];
  height: number;
  timeline: Timeline;
  keySignature: KeySignatureEvent;
  timeSignature: { beats: number; beatUnit: number };
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = '<div class="grand-staff-part"></div><div class="grand-staff-part"></div>';
    const [trebleHost, bassHost] = Array.from(host.children) as HTMLElement[];

    const trebleNotes = notes
      .slice(0, 32)
      .map((note) => ({ ...note, midi: note.midi.filter((midi) => midi >= 60) }))
      .filter((note) => note.midi.length);
    const bassNotes = notes
      .slice(0, 32)
      .map((note) => ({ ...note, midi: note.midi.filter((midi) => midi < 60) }))
      .filter((note) => note.midi.length);

    renderVexflowStaff(trebleHost, {
      clef: "treble",
      notes: trebleNotes,
      keySignature,
      width: scoreWidth,
      height: Math.max(68, Math.floor(height / 2)),
      compact: true,
      staveX: systemPadding,
      staveY: 8,
      stavePadding: systemPadding * 2,
      formatPadding: systemPadding * 2 + 96,
      timeSignature,
    });
    renderVexflowStaff(bassHost, {
      clef: "bass",
      notes: bassNotes,
      keySignature,
      width: scoreWidth,
      height: Math.max(68, Math.floor(height / 2)),
      compact: true,
      staveX: systemPadding,
      staveY: 4,
      stavePadding: systemPadding * 2,
      formatPadding: systemPadding * 2 + 96,
      timeSignature,
    });
  }, [height, keySignature, notes, timeSignature]);

  return (
    <>
      <svg className="staff-guides" viewBox={`0 0 ${scoreWidth} ${height}`} aria-hidden="true">
        <TimelineGuides timeline={timeline} height={height} />
      </svg>
      <div ref={hostRef} className="vex-score-layer grand-score-layer" />
    </>
  );
}

function AnnotationLayer({ part, timeline }: { part: ArrangementPart; timeline: Timeline }) {
  if (part.presentation === "keyboard-staff") {
    return (
      <div className="annotation-layer keys-annotations">
        {part.notes.slice(0, 40).map((note) => (
          <div key={note.id} style={{ left: timeToX(note.timeMs, timeline) }}>
            <span>{chordSymbol(note.midi)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (part.presentation === "guitar-tab" || part.presentation === "bass-tab") {
    const tuning = part.presentation === "bass-tab" ? bassTuning : guitarTuning;
    return <TabAnnotation notes={part.notes} timeline={timeline} tuning={tuning} showRoots={part.presentation === "bass-tab"} />;
  }

  if (part.presentation === "trumpet-fingering") {
    return (
      <div className="annotation-layer trumpet-annotations">
        {part.notes.slice(0, 40).map((note) => {
          const midi = note.midi[0];
          const fingering = trumpetFingerings[midi % 12] ?? "0";
          return (
            <div key={note.id} style={{ left: windTimeToX(note.timeMs, timeline) }}>
              <strong>{midiName(midi)}</strong>
              <span className="valve-stack" aria-label={`Valves ${fingering}`}>
                {[1, 2, 3].map((valve) => (
                  <i key={valve} className={fingering.includes(String(valve)) ? "pressed" : ""} />
                ))}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  if (part.instrument.toLowerCase().includes("flute") || part.instrument.toLowerCase().includes("recorder")) {
    return <WindAnnotation notes={part.notes} instrument={part.instrument} timeline={timeline} />;
  }

  if (part.presentation === "vocal-cues") {
    return (
      <div className="annotation-layer vocal-annotations">
        {part.notes.slice(0, 32).map((note, index) => (
          <div key={note.id} style={{ left: timeToX(note.timeMs, timeline) }}>
            <strong>{index % 4 === 0 ? "cue" : ""}</strong>
            <span>{note.midi.map(midiName).join("/")}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="annotation-layer drum-annotations">
      {[49, 42, 38, 36].map((lane) => (
        <span key={lane}>{drumNames[lane]}</span>
      ))}
    </div>
  );
}

function WindAnnotation({
  notes,
  instrument,
  timeline,
}: {
  notes: ArrangementNote[];
  instrument: string;
  timeline: Timeline;
}) {
  const kind = instrument.toLowerCase().includes("flute") ? "flute" : "recorder";
  return (
    <div className={`annotation-layer wind-annotations ${kind}-annotations`}>
      {notes.slice(0, 32).map((note) => {
        const holes = windHoles(note.midi[0], kind);
        const x = windTimeToX(note.timeMs, timeline);
        return (
          <div key={note.id} style={{ left: x }}>
            <strong>{midiName(note.midi[0])}</strong>
            <span className={`wind-fingering ${kind}`} aria-label={`${instrument} fingering`}>
              <i className="wind-thumb" />
              <span className="wind-hole-stack">
                {holes.map((pressed, index) => <i key={`${note.id}-${index}`} className={pressed ? "pressed" : ""} />)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function windHoles(midi: number, kind: "flute" | "recorder"): boolean[] {
  const flutePatterns: Record<number, boolean[]> = {
    59: [true, true, true, true, true, true, true, true, true],
    60: [true, true, true, true, true, true, true, true, false],
    61: [true, true, true, true, true, true, true, false, false],
    62: [true, true, true, true, true, true, false, false, false],
    64: [true, true, true, true, true, false, false, false, false],
    65: [true, true, true, true, false, false, false, false, false],
    67: [true, true, true, false, false, false, false, false, false],
    69: [true, true, false, false, false, false, false, false, false],
    71: [true, false, false, false, false, false, false, false, false],
  };
  const recorderPatterns: Record<number, boolean[]> = {
    60: [true, true, true, true, true, true, true, true],
    62: [true, true, true, true, true, true, true, false],
    64: [true, true, true, true, true, true, false, false],
    65: [true, true, true, true, true, false, false, false],
    67: [true, true, true, true, false, false, false, false],
    69: [true, true, true, false, false, false, false, false],
    71: [true, true, false, false, false, false, false, false],
  };
  const patterns = kind === "flute" ? flutePatterns : recorderPatterns;
  const first = kind === "flute" ? 59 : 60;
  const normalized = first + (((midi - first) % 12) + 12) % 12;
  return patterns[normalized] ?? patterns[first];
}

function TabAnnotation({
  notes,
  timeline,
  tuning,
  showRoots = false,
}: {
  notes: ArrangementNote[];
  timeline: Timeline;
  tuning: Array<{ label: string; openMidi: number }>;
  showRoots?: boolean;
}) {
  return (
    <div className="annotation-layer tab-annotations">
      {notes.slice(0, 40).map((note) => {
        const fret = bestFret(note.midi[0], tuning);
        const lineTop = tuning.length === 6 ? 34 : 42;
        const lineGap = tuning.length === 6 ? 15 : 21;
        const x = timeToX(note.timeMs, timeline);
        return (
          <span key={note.id} className="tab-event" style={{ left: x, top: stringStaffHeight + lineTop + fret.stringIndex * lineGap }}>
            {showRoots ? <em>{midiName(note.midi[0]).replace(/\d+$/, "")}</em> : null}
            <b>{fret.fret}</b>
          </span>
        );
      })}
    </div>
  );
}

function TimelineGuides({ timeline, height }: { timeline: Timeline; height: number }) {
  return (
    <>
      {timeline.measures.map((timeMs) => (
        <line
          key={`measure-${timeMs}`}
          className="measure-guide"
          x1={timeToX(timeMs, timeline)}
          x2={timeToX(timeMs, timeline)}
          y1={0}
          y2={height}
        />
      ))}
      {timeline.times.map((timeMs) => (
        <line
          key={timeMs}
          className="time-guide"
          x1={timeToX(timeMs, timeline)}
          x2={timeToX(timeMs, timeline)}
          y1={0}
          y2={height}
        />
      ))}
    </>
  );
}

type Timeline = {
  startMs: number;
  endMs: number;
  times: number[];
  measures: number[];
};

function getTimeline(arrangement: Arrangement, chart: Chart): Timeline {
  const notes = mergePartNotes(arrangement.parts);
  const times = [...new Set(notes.map((note) => note.timeMs))].sort((a, b) => a - b).slice(0, 40);
  const startMs = times[0] ?? 0;
  const endMs = Math.max(times.at(-1) ?? 1, startMs + 1);
  const tempo = chart.tempoMap[0]?.bpm ?? 100;
  const signature = chart.timeSignatures[0]?.beats ?? 4;
  const beatUnit = chart.timeSignatures[0]?.beatUnit ?? 4;
  const measureMs = (60000 / tempo) * signature * (4 / beatUnit);
  const measures: number[] = [];
  for (let timeMs = 0; timeMs <= endMs + measureMs; timeMs += measureMs) {
    measures.push(Math.round(timeMs));
  }
  return { startMs, endMs, times, measures };
}

function mergePartNotes(parts: ArrangementPart[]): ArrangementNote[] {
  return parts
    .flatMap((part) => part.notes)
    .sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id));
}

function makeConductorReduction(parts: ArrangementPart[], timeline: Timeline): ArrangementNote[] {
  const pitchedParts = parts.filter((part) => part.presentation !== "drum-grid");
  const byTime = new Map<number, ArrangementNote[]>();
  pitchedParts.forEach((part) => {
    part.notes.forEach((note) => {
      const notes = byTime.get(note.timeMs) ?? [];
      notes.push(note);
      byTime.set(note.timeMs, notes);
    });
  });

  const eventTimes = [...byTime.keys()].sort((a, b) => a - b);
  const selectedTimes: number[] = [];
  timeline.measures.forEach((measureStart, index) => {
    const measureEnd = timeline.measures[index + 1] ?? timeline.endMs + 1;
    const measureTimes = eventTimes.filter((timeMs) => timeMs >= measureStart && timeMs < measureEnd);
    if (!measureTimes.length) return;
    selectedTimes.push(measureTimes[0]);
    const midpoint = measureStart + (measureEnd - measureStart) / 2;
    const secondCue = measureTimes.find((timeMs) => timeMs >= midpoint && timeMs !== measureTimes[0]);
    if (secondCue) selectedTimes.push(secondCue);
  });

  return [...new Set(selectedTimes)].slice(0, 24).flatMap((timeMs, index) => {
    const notes = byTime.get(timeMs) ?? [];
    const midi = notes.flatMap((note) => note.midi).sort((a, b) => a - b);
    if (!midi.length) return [];

    const lowest = transposeIntoGrandStaff(midi[0], "bass");
    const highest = transposeIntoGrandStaff(midi[midi.length - 1], "treble");
    const reducedMidi = lowest % 12 === highest % 12 ? [lowest] : [lowest, highest];
    return [
      {
        id: `master-reduction-${index}`,
        sourceEventId: notes[0]?.sourceEventId ?? `master-${index}`,
        timeMs,
        durationMs: Math.max(...notes.map((note) => note.durationMs), 360),
        midi: reducedMidi.sort((a, b) => a - b),
        label: reducedMidi.map(midiName).join(" "),
      },
    ];
  });
}

function transposeIntoGrandStaff(midi: number, clef: "treble" | "bass"): number {
  if (clef === "treble") {
    let note = midi;
    while (note < 60) note += 12;
    while (note > 84) note -= 12;
    return note;
  }
  let note = midi;
  while (note < 36) note += 12;
  while (note >= 60) note -= 12;
  return note;
}

function timeToX(timeMs: number, timeline: Timeline): number {
  const range = Math.max(1, timeline.endMs - timeline.startMs);
  const progress = Math.max(0, Math.min(1, (timeMs - timeline.startMs) / range));
  return systemPadding + progress * (scoreWidth - systemPadding * 2);
}

function windTimeToX(timeMs: number, timeline: Timeline): number {
  const range = Math.max(1, timeline.endMs - timeline.startMs);
  const progress = Math.max(0, Math.min(1, (timeMs - timeline.startMs) / range));
  const activeStart = systemPadding + notationActiveStartOffset;
  const activeEnd = scoreWidth - systemPadding - notationActiveEndInset;
  return activeStart + progress * (activeEnd - activeStart);
}

function drumY(midi: number): number {
  return ({ 49: 24, 42: 42, 38: 60, 36: 78 } as Record<number, number>)[midi] ?? 42;
}

function chordSymbol(midi: number[]): string {
  if (!midi.length) return "";
  const names = midi.map((note) => midiName(note).replace(/\d+$/, ""));
  if (names.length === 1) return names[0];
  return [...new Set(names)].slice(0, 3).join("-");
}

function bestFret(midi: number, tuning: Array<{ openMidi: number }>) {
  return (
    tuning
      .map((stringInfo, stringIndex) => ({ stringIndex, fret: midi - stringInfo.openMidi }))
      .filter((position) => position.fret >= 0 && position.fret <= 20)
      .sort((a, b) => Math.abs(a.fret - 5) - Math.abs(b.fret - 5))[0] ?? {
      stringIndex: tuning.length - 1,
      fret: 0,
    }
  );
}
