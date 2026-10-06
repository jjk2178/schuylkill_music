import { chartForInstrument } from "./chordChanges.mjs";
import {
  parseChart,
  getPrimaryTrack,
  type Chart,
  type Instrument,
} from "../charts/schema";
import { compileChartPart, instrumentKey } from "./parts.mjs";
import { midiName } from "../arrangements/arranger";

export function compilePracticeChart(source: Chart, instrument: string): Chart {
  const key = instrumentKey(instrument) as Instrument;
  const tuning = key === "bass" ? [43, 38, 33, 28] : [64, 59, 55, 50, 45, 40];
  const events = compileChartPart(source, instrument).map((note) => {
    const original = source.tracks.flatMap(track=>track.events).find(
      (event) => event.id === note.sourceEventId,
    )!;
    const positions = note.frets ? note.frets.flatMap((f,index)=>f<0?[]:[{string:6-index,fret:f}]) :
      key === "guitar" || key === "bass"
        ? tuning
            .map((open, index) => ({
              string: index + 1,
              fret: note.midi[0] - open,
            }))
            .filter((pos) => pos.fret >= 0 && pos.fret <= 24)
            .sort((a, b) => Math.abs(a.fret - 5) - Math.abs(b.fret - 5))
            .slice(0, 1)
        : [];
    return {
      ...original,
      id: note.id,
      timeMs: note.timeMs,
      durationMs: note.durationMs,
      tuplet:note.tuplet,staff:note.staff, voice:note.voice,stemDirection:note.stemDirection,measure:note.measure,tieNext:note.tieNext,tiePrevious:note.tiePrevious,
      label: note.chord ?? note.midi.map(midiName).join(" "),
      strings: positions,
      expected: {
        ...original.expected,
        midi: note.midi,
        kind: !note.midi.length ? "rest" : note.midi.length > 1 ? "chord" : "note",
        scoring: key === "drums" ? "onset" : "pitch",
      },
    };
  });
  return parseChart({
    ...chartForInstrument(source,instrument),
    instrument: key,
    tracks: [
      {
        id: `practice-${key}`,
        name: instrument,
        instrument: key,
        clef: key === "bass" ? "bass" : "treble",
        events,
      },
    ],
  });
}
