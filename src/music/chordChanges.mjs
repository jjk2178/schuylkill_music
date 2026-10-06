import { guitarChordReference } from "./vexChordReference.mjs";
import { guitarChords } from "./guitarChords.mjs";
import { measureBoundaries } from "./measures.mjs";
export function chordChangesForChart(chart) {
  if (chart.guitarArrangement) {
    const a=chart.guitarArrangement; let q=a.startQuarter;
    return a.sections.flatMap(section=>section.chords.map(change=>{const result={timeMs:q*60000/a.bpm,...change,section:section.label,origin:"supplied PDF"};q+=change.beats;return result;}));
  }
  if (chart.chordChanges?.length) return chart.chordChanges;
  const events = chart.tracks[0]?.events ?? [];
  const end = Math.max(0, ...events.map((e) => e.timeMs + e.durationMs));
  const bars = measureBoundaries(chart, end);
  if (bars.at(-1) < end) bars.push(end);
  const changes = [];
  let previous = "";
  for (let i = 0; i < bars.length - 1; i++) {
    const notes = events.filter(
      (e) =>
        e.timeMs >= bars[i] &&
        e.timeMs < bars[i + 1] &&
        e.expected.kind !== "rest",
    );
    if (!notes.length) continue;
    const weights = new Map();
    for (const note of notes) {
      const pitches = note.expected.midi;
      for (const pitch of pitches) {
        const pc = pitch % 12;
        weights.set(
          pc,
          (weights.get(pc) ?? 0) + Math.min(note.durationMs, 1200),
        );
      }
      if (pitches.length > 1) {
        const pc = Math.min(...pitches) % 12;
        weights.set(pc, (weights.get(pc) ?? 0) + 1200);
      }
    }
    const ranked = guitarChords
      .map((chord) => ({
        chord,
        score:
          [...weights].reduce(
            (s, [pc, w]) =>
              s + (chord.pitchClasses.includes(pc) ? w : -w * 0.7),
            0,
          ) + (chord.id === previous ? 100 : 0),
      }))
      .sort((a, b) => b.score - a.score);
    const chord = ranked[0].chord;
    if (chord.id !== previous)
      changes.push({ timeMs: bars[i], chord: chord.id, origin: "suggested" });
    previous = chord.id;
  }
  return changes;
}

export function guitarChordForChart(chart,id) {
 const shape=chart.guitarArrangement?.shapes[id];
 if(!shape) return guitarChordReference.find(c=>c.id===id);
 const positive=shape.frets.filter(f=>f>0);const position=Math.max(1,Math.min(...positive));
 return {id,frets:shape.frets,position,chord:shape.frets.map((f,i)=>[6-i,f<0?"x":f===0?0:f-position+1]),barres:shape.barres.map(b=>({...b,fret:b.fret-position+1})),pitchClasses:shape.frets.flatMap((f,i)=>f<0?[]:[([40,45,50,55,59,64][i]+f)%12])};
}
export function chartForInstrument(chart,instrument) {
 if(!instrument.toLowerCase().includes("guitar") || !chart.guitarArrangement) return chart;
 const a=chart.guitarArrangement;
 return {...chart,capo:a.capo,tempoMap:[{timeMs:0,bpm:a.bpm}],pickupQuarters:a.startQuarter||undefined,keySignatures:[{timeMs:0,key:a.shapeKey,fifths:a.shapeKey==="G"?1:0}],timeSignatures:[{timeMs:0,beats:4,beatUnit:4}]};
}
