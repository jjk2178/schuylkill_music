// Generate supporting parts from a guitar arrangement: a clean root+octave bass
// line and a strummed rhythm-guitar (Guitar 2) part. Both are derived from the
// chord progression — taken from explicit chord symbols where the source has
// them, and otherwise inferred from the guitar's own pitches per measure.

import { guitarChords } from "../music/guitarChords.mjs";

const NOTE_PC = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

const BASS_TUNING = ["E1", "A1", "D2", "G2"]; // low -> high, 4-string bass

export function rootPcOf(chordName) {
  const m = /^([A-G][#b]?)/.exec(chordName || "");
  return m ? (NOTE_PC[m[1]] ?? null) : null;
}

// Estimate a major/minor triad for a measure from its pitch content.
function inferChord(measure, prevName) {
  const weights = new Map();
  let lowest = Infinity;
  for (const ev of measure.events) {
    for (const pitch of ev.midi || []) {
      const pc = pitch % 12;
      weights.set(pc, (weights.get(pc) ?? 0) + Math.max(0.25, ev.durationBeats));
      if (pitch < lowest) lowest = pitch;
    }
  }
  if (!weights.size) return prevName || null;
  const lowPc = lowest === Infinity ? null : lowest % 12;
  let best = null;
  let bestScore = -Infinity;
  for (const chord of guitarChords) {
    let score = 0;
    for (const [pc, w] of weights)
      score += chord.pitchClasses.includes(pc) ? w : -w * 0.8;
    if (lowPc != null && chord.pitchClasses[0] === lowPc) score += 1.5; // bass = root
    if (chord.id === prevName) score += 0.75; // prefer staying put
    if (score > bestScore) {
      bestScore = score;
      best = chord.id;
    }
  }
  return best;
}

// Chord segments covering a measure: [{start, end, name, rootPc}].
function chordSegments(measure, beats, prevName) {
  const chordEvents = measure.events
    .filter((e) => e.chordSymbol)
    .sort((a, b) => a.beat - b.beat);
  if (chordEvents.length) {
    return chordEvents.map((e, i) => ({
      start: e.beat,
      end: i + 1 < chordEvents.length ? chordEvents[i + 1].beat : beats,
      name: e.chordSymbol,
      rootPc: rootPcOf(e.chordSymbol),
    }));
  }
  const name = inferChord(measure, prevName);
  return [{ start: 0, end: beats, name, rootPc: name ? rootPcOf(name) : null }];
}

// Lowest bass octave for a pitch class (E1..D#2).
function bassRoot(pc) {
  return 28 + ((pc - 4 + 12) % 12); // 28 = E1
}

// Root + octave eighth-note groove for a whole guitar arrangement.
export function generateBassTrack(arr) {
  const beats = arr.timeSignature.beats;
  let prevName = null;
  const measures = arr.tracks[0].measures.map((m) => {
    const segs = chordSegments(m, beats, prevName);
    prevName = segs[segs.length - 1]?.name || prevName;
    const events = [];
    let idx = 0;
    for (const seg of segs) {
      if (seg.rootPc == null) continue;
      const root = bassRoot(seg.rootPc);
      for (let t = seg.start; t < seg.end - 1e-6; t += 0.5) {
        const onBeat = Math.round((t - seg.start) / 0.5) % 2 === 0;
        events.push({
          id: `b${m.number}-${idx++}`,
          beat: Number(t.toFixed(3)),
          durationBeats: 0.5,
          kind: "note",
          midi: [onBeat ? root : root + 12],
          tab: [],
        });
      }
    }
    if (!events.length)
      events.push({
        id: `b${m.number}-r`,
        beat: 0,
        durationBeats: beats,
        kind: "rest",
        midi: [],
        tab: [],
      });
    return { number: m.number, sectionId: m.sectionId, events };
  });
  return {
    id: "bass",
    name: "Bass",
    instrument: "bass",
    clef: "bass",
    tuning: BASS_TUNING,
    measures,
  };
}

// Strummed rhythm guitar (Guitar 2): one chord per segment, rendered as a
// diagram + strummed shape. Mirrors the progression without doubling any tab.
export function generateRhythmGuitarTrack(arr) {
  const beats = arr.timeSignature.beats;
  let prevName = null;
  const names = new Set();
  const measures = arr.tracks[0].measures.map((m) => {
    const segs = chordSegments(m, beats, prevName);
    prevName = segs[segs.length - 1]?.name || prevName;
    const events = [];
    let idx = 0;
    for (const seg of segs) {
      if (!seg.name) continue;
      names.add(seg.name);
      events.push({
        id: `g2-${m.number}-${idx++}`,
        beat: seg.start,
        durationBeats: Math.max(0.5, seg.end - seg.start),
        kind: "rest", // strummed from the chord shape on export
        midi: [],
        tab: [],
        chordSymbol: seg.name,
      });
    }
    if (!events.length)
      events.push({
        id: `g2-${m.number}-r`,
        beat: 0,
        durationBeats: beats,
        kind: "rest",
        midi: [],
        tab: [],
      });
    return { number: m.number, sectionId: m.sectionId, events };
  });
  return {
    track: {
      id: "guitar2",
      name: "Guitar 2",
      instrument: "guitar",
      clef: "treble+tab",
      tuning: arr.tuning,
      ...(arr.capo ? { capo: arr.capo } : {}),
      measures,
    },
    chordNames: [...names],
  };
}
