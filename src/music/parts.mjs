import { measureBoundaries, meterAt, tempoAt } from "./measures.mjs";
import { chordChangesForChart } from "./chordChanges.mjs";
// Shared by the browser trainer, band score, and printable packet generator.
export function instrumentKey(value) {
  const text = value.toLowerCase();
  if (text.includes("keys") || text.includes("keyboard") || text.includes("piano")) return "piano";
  return (
    [
      "trumpet",
      "recorder",
      "flute",
      "bass",
      "drums",
      "piano",
      "keys",
      "vocals",
      "guitar",
    ].find(
      (key) =>
        text.includes(key) || (key === "vocals" && text.includes("vocal")),
    ) ?? "guitar"
  );
}
function inRange(midi, min, max) {
  while (midi < min) midi += 12;
  while (midi > max) midi -= 12;
  return midi;
}
export function compilePart(events, instrument, title = "", indexOffset = 0) {
  const key = instrumentKey(instrument);
  const normalizedTitle = title.toLowerCase();
  const isJerusalem = normalizedTitle === "jerusalem" || normalizedTitle.includes("(jerusalem)");
  return events.flatMap((event, localIndex) => {
    const index = localIndex + indexOffset;
    const midi = [...new Set(event.expected.midi)].sort((a, b) => a - b);
    if (!midi.length || event.expected.kind === "rest") return [];
    const low = midi[0],
      high = midi.at(-1);
    let pitches;
    if (isJerusalem && ["trumpet", "flute", "recorder"].includes(key)) {
      // Same complete hymn melody and rhythm; winds take one consistent
      // octave above the trumpet concert A3–D5, avoiding notes below C4.
      pitches = [inRange(high, 57, 74) + (key === "trumpet" ? 0 : 12)];
    } else if (key === "bass") pitches = [inRange(low, 28, 52)];
    else if (key === "trumpet") {
      // Carry the source melody throughout the part, preserving every onset.
      pitches = [inRange(high, 58, 82)];
    } else if (key === "flute") {

      // The Silent Night source spans D3–B4. Move the whole melody
      // up one octave, preserving intervals instead of folding low notes.
      pitches = [normalizedTitle === "silent night" ? high + 12 : inRange(high, 60, 84)];
    } else if (key === "recorder") {

      pitches = [inRange(high, 60, 79)];
    } else if (key === "vocals") {
      if (index % 2 !== 0) return [];
      pitches = [inRange(high, 55, 76)];
    } else if (key === "drums") {
      pitches = [42];
      if (index % 2 === 0 || midi.length > 1) pitches.push(36);
      if (index % 4 === 2 || event.durationMs >= 700) pitches.push(38);
      if (index % 8 === 0) pitches.push(49);
    } else if (key === "keys" || key === "piano")
      pitches = [
        ...new Set(midi.slice(0, 4).map((note) => inRange(note, 48, 81))),
      ];
    else pitches = [inRange(high, 45, 76)];
    return [
      {
        id: `${key}-${event.id}`,
        sourceEventId: event.id,
        timeMs: event.timeMs,
        durationMs: event.durationMs,
        midi: pitches,
        tuplet:event.tuplet,
        tieNext:key === "drums" ? undefined : event.tieNext?.flatMap(p=>pitches.filter(n=>n%12===p%12)),
        tiePrevious:key === "drums" ? undefined : event.tiePrevious?.flatMap(p=>pitches.filter(n=>n%12===p%12)),
      },
    ];
  });
}
export function writtenPitches(midi, instrument) {
  return instrumentKey(instrument) === "trumpet"
    ? midi.map((pitch) => pitch + 2)
    : midi;
}
export function writtenKey(signature, instrument) {
  if (instrumentKey(instrument) !== "trumpet") return signature;
  let fifths = signature.fifths + 2;
  if (fifths > 7) fifths -= 12;
  const major = [
    "Cb",
    "Gb",
    "Db",
    "Ab",
    "Eb",
    "Bb",
    "F",
    "C",
    "G",
    "D",
    "A",
    "E",
    "B",
    "F#",
    "C#",
  ];
  const minor = [
    "Abm",
    "Ebm",
    "Bbm",
    "Fm",
    "Cm",
    "Gm",
    "Dm",
    "Am",
    "Em",
    "Bm",
    "F#m",
    "C#m",
    "G#m",
    "D#m",
    "A#m",
  ];
  return {
    ...signature,
    fifths,
    key: (signature.mode === "minor" ? minor : major)[fifths + 7],
  };
}

// Source piano staves take precedence over generated melody reductions.
export function isPianoChordAccompaniment(chart, instrument) {
  return instrumentKey(instrument) === "piano" && chart.tracks.some(track=>track.role === "piano-accompaniment");
}
function compileTrackPart(events,instrument,title) {
  const key=instrumentKey(instrument);
  const rests=events.filter(e=>e.expected.kind==="rest" || !e.expected.midi.length).map(e=>({id:`${key}-${e.id}`,sourceEventId:e.id,timeMs:e.timeMs,durationMs:e.durationMs,midi:[],measure:e.measure}));
  return [...compilePart(events,instrument,title),...rests].sort((a,b)=>a.timeMs-b.timeMs);
}
export function compileChartPart(chart, instrument) {
  if(instrumentKey(instrument)==="drums") {
    const end=Math.max(...chart.tracks.flatMap(t=>t.events).map(e=>e.timeMs+e.durationMs));
    const bars=measureBoundaries(chart,end).filter(t=>t<end-.01);bars.push(end);
    return bars.slice(0,-1).flatMap((start,bar)=>{
      const quarter=60000/tempoAt(chart,start),meter=meterAt(chart,start),notes=[];
      for(let slot=0,startMs=start;startMs<bars[bar+1]-.01;slot++,startMs=start+slot*quarter/2) {
        const durationMs=Math.min(quarter/2,bars[bar+1]-startMs);
        if(durationMs<quarter*.1 && notes.length){notes.at(-1).durationMs+=durationMs;break;}
        const midi=[42];
        if(meter.beatUnit===8 && meter.beats===6){if(slot===0)midi.push(36);if(slot===3)midi.push(38);}
        else {if(slot===0||slot===4)midi.push(36);if(slot===2||slot===6)midi.push(38);}
        notes.push({id:`drums-bar-${bar}-${slot}`,sourceEventId:chart.tracks[0].events[0].id,timeMs:startMs,durationMs,midi});
      }
      return notes;
    });
  }
  if(instrumentKey(instrument)==="guitar" && chart.guitarArrangement) {
    const a=chart.guitarArrangement, quarter=60000/a.bpm;
    return chordChangesForChart(chart).flatMap((change,index)=>{
      const frets=a.shapes[change.chord].frets;
      const midi=frets.flatMap((f,i)=>f<0?[]:[([40,45,50,55,59,64][i]+f+a.capo)]);
      const notes=[];let remaining=change.beats, time=change.timeMs;
      while(remaining>0.001) {const beats=Math.min(remaining,4);notes.push({id:`guitar-source-${index}-${notes.length}`,sourceEventId:chart.tracks[0].events[0].id,timeMs:time,durationMs:beats*quarter,midi,frets,chord:change.chord});time+=beats*quarter;remaining-=beats;}
      return notes;
    });
  }
  if(instrumentKey(instrument)==="bass" && chart.tracks.some(t=>t.role==="piano-accompaniment" && t.clef==="bass")) return compileTrackPart(chart.tracks.find(t=>t.role==="piano-accompaniment" && t.clef==="bass").events,instrument,chart.title);
  if (!isPianoChordAccompaniment(chart,instrument)) return compileTrackPart(chart.tracks[0]?.events ?? [],instrument,chart.title);
  return chart.tracks.filter(track=>track.role === "piano-accompaniment").flatMap(track=>track.events.map(event=>({
    id:`piano-${event.id}`,sourceEventId:event.id,timeMs:event.timeMs,durationMs:event.durationMs,midi:event.expected.midi,
    staff:event.staff ?? (track.clef === "bass" ? "bass" : "treble"),voice:event.voice,stemDirection:event.stemDirection,measure:event.measure,
    tieNext:event.tieNext,tiePrevious:event.tiePrevious,
  }))).sort((a,b)=>a.timeMs-b.timeMs || b.durationMs-a.durationMs || a.id.localeCompare(b.id));
}
