// Derive guitar tablature from the musical representation (pitches), not from any
// pre-existing fingering. A pitch can sound at several string/fret positions, so
// this is an optimisation: for each event we pick the playable positions that
// keep the fretting hand in one place and the chord span small, carrying the
// hand position across the whole track.
//
// This is what makes the arrangement *generated from the music*: feed it `midi`
// and a tuning and it produces tab, the same way notation software does.

import { tuningMidi } from "./schema.mjs";

const MAX_FRET = 24;
const MAX_SPAN = 5; // frets a hand can cover in one position

// Candidate (string, fret) spots for a pitch. `open` runs index 0 = lowest
// string … index N-1 = highest; tab string numbers are 1 (highest) … N (lowest).
// Works for 6-string guitar and 4-string bass alike.
function candidates(pitch, open) {
  const out = [];
  const N = open.length;
  for (let s = 1; s <= N; s++) {
    const fret = pitch - open[N - s];
    if (fret >= 0 && fret <= MAX_FRET) out.push({ string: s, fret });
  }
  return out;
}

// Every way to put a sorted-ascending chord on distinct strings, keeping voicing
// monotonic (higher pitch -> thinner/lower-numbered string). That prunes crossed,
// unplayable shapes and keeps the search tiny.
function chordAssignments(pitches, open) {
  const perPitch = pitches.map((p) => candidates(p, open));
  if (perPitch.some((c) => c.length === 0)) return [];
  const results = [];
  const cur = [];
  (function bt(i, maxString) {
    if (i === pitches.length) {
      results.push(cur.slice());
      return;
    }
    for (const cand of perPitch[i]) {
      if (cand.string >= maxString) continue; // strictly thinner as pitch rises
      cur.push(cand);
      bt(i + 1, cand.string);
      cur.pop();
    }
  })(0, open.length + 1);
  return results;
}

// Score a candidate voicing. Lower is better. When a `hint` (the ingested
// fingering) is supplied the optimiser is pulled toward that neck region so the
// canonical shape survives; without one it falls back to a low/open bias.
function scoreAssignment(assign, handPos, hint) {
  const fretted = assign.map((a) => a.fret).filter((f) => f > 0);
  const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
  let score = span * 2;
  if (span > MAX_SPAN) score += (span - MAX_SPAN) * 100; // near-unplayable
  const center = fretted.length
    ? fretted.reduce((a, b) => a + b, 0) / fretted.length
    : handPos;
  score += Math.abs(center - handPos) * 2; // minimise hand travel

  if (hint && hint.center != null) {
    // Faithful mode: stay in the ingested neck region and reward positions that
    // match the source string/fret exactly, so a valid source shape is kept.
    score += Math.abs(center - hint.center) * 10;
    for (const a of assign)
      if (hint.pairs.get(a.string) === a.fret) score -= 6;
  } else if (fretted.length) {
    score += Math.max(...fretted) * 0.4; // free mode: mildly prefer low positions
    score -= assign.filter((a) => a.fret === 0).length * 0.75;
  }
  return score;
}

function hintFrom(sourceTab) {
  const frets = (sourceTab || []).map((t) => t.fret).filter((f) => f > 0);
  if (!(sourceTab || []).length) return null;
  const pairs = new Map((sourceTab || []).map((t) => [t.string, t.fret]));
  return {
    center: frets.length ? frets.reduce((a, b) => a + b, 0) / frets.length : null,
    pairs,
  };
}

// Positions for a single event's pitches, given the current hand position and an
// optional source-fingering hint.
export function positionsForPitches(midi, open, handPos, hint = null) {
  if (!midi || midi.length === 0) return { positions: [], handPos };
  const pitches = [...midi].sort((a, b) => a - b);
  const options = chordAssignments(pitches, open);
  if (!options.length) return { positions: [], handPos };
  let best = options[0];
  let bestScore = Infinity;
  for (const opt of options) {
    const s = scoreAssignment(opt, handPos, hint);
    if (s < bestScore) {
      bestScore = s;
      best = opt;
    }
  }
  const fretted = best.map((a) => a.fret).filter((f) => f > 0);
  const nextHand = fretted.length
    ? fretted.reduce((a, b) => a + b, 0) / fretted.length
    : handPos;
  return { positions: best, handPos: nextHand };
}

// Generate a position list per event (track order), carrying the hand across
// bars. Each event's own `sourceFingering`/`tab` biases its voicing toward the
// ingested neck region while every position is still recomputed from pitch.
export function generateTab(events, tuning) {
  const open = tuningMidi(tuning);
  let handPos = 2;
  return events.map((ev) => {
    const hint = hintFrom(ev.sourceFingering || ev.tab);
    const { positions, handPos: next } = positionsForPitches(
      ev.midi,
      open,
      handPos,
      hint,
    );
    handPos = next;
    return positions;
  });
}

// Return a copy of the arrangement whose tab is regenerated from the pitches.
// The originally-parsed fingering is preserved on each event as `sourceFingering`
// so nothing is lost, but `tab` (what the exporters render) is now derived from
// the music. Techniques are carried over by string match where the generated
// position coincides with the source.
export function withGeneratedTab(arr) {
  return {
    ...arr,
    tracks: arr.tracks.map((track) => {
      const flat = track.measures.flatMap((m) => m.events);
      const generated = generateTab(flat, track.tuning || arr.tuning);
      let i = 0;
      return {
        ...track,
        measures: track.measures.map((m) => ({
          ...m,
          events: m.events.map((ev) => {
            const positions = generated[i++];
            if (!ev.midi || ev.midi.length === 0) return ev;
            const source = ev.tab || [];
            const tab = positions.map((p) => {
              const match = source.find((s) => s.string === p.string);
              return {
                string: p.string,
                fret: p.fret,
                techniques: match ? match.techniques || [] : [],
              };
            });
            return {
              ...ev,
              tab,
              ...(source.length ? { sourceFingering: source } : {}),
            };
          }),
        })),
      };
    }),
  };
}
