// Export a SongArrangement (schema.mjs) to MusicXML 4.0 (score-partwise).
//
// The guitar part is engraved on a treble (octave-down) staff. Every note also
// carries <technical><string>/<fret> so a reader can display tablature, chord
// changes become <harmony> with fretboard <frame> diagrams, and sung text
// becomes <lyric>. This covers the notation-facing data losslessly; gameplay
// fields never existed in this schema, so there is nothing to drop.

import { noteValueFor, tabNoteMidi } from "./schema.mjs";
import { withGeneratedTab } from "./tab.mjs";

const DIVISIONS = 4; // divisions per quarter note (16th = 1)

const PITCH_CLASSES = [
  ["C", 0],
  ["C", 1],
  ["D", 0],
  ["D", 1],
  ["E", 0],
  ["F", 0],
  ["F", 1],
  ["G", 0],
  ["G", 1],
  ["A", 0],
  ["A", 1],
  ["B", 0],
];

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

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function midiToPitch(m) {
  const [step, alter] = PITCH_CLASSES[((m % 12) + 12) % 12];
  const octave = Math.floor(m / 12) - 1;
  return { step, alter, octave };
}

function durationToDivisions(beats) {
  return Math.max(1, Math.round(beats * DIVISIONS));
}

// Parse a chord symbol into MusicXML harmony parts.
function parseChordSymbol(symbol) {
  const m = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(symbol.trim());
  if (!m) return null;
  const root = m[1];
  const rest = m[2] || "";
  const bass = m[3] || null;
  let kind = "major";
  const r = rest.toLowerCase();
  if (/maj7|maj9|M7/.test(rest)) kind = "major-seventh";
  else if (/m7|min7/.test(r)) kind = "minor-seventh";
  else if (/m6|min6/.test(r)) kind = "minor-sixth";
  else if (/6/.test(r)) kind = "major-sixth";
  else if (/^m|^min/.test(r)) kind = "minor";
  else if (/dim/.test(r)) kind = "diminished";
  else if (/aug/.test(r)) kind = "augmented";
  else if (/sus2/.test(r)) kind = "suspended-second";
  else if (/sus/.test(r)) kind = "suspended-fourth";
  else if (/5/.test(r)) kind = "power";
  else if (/9/.test(r)) kind = "dominant-ninth";
  else if (/7/.test(r)) kind = "dominant";
  return { root, kind, bass, text: symbol };
}

function rootXml(tag, name) {
  const m = /^([A-G])([#b]?)$/.exec(name);
  if (!m) return "";
  const step = m[1];
  const alter = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return (
    `<${tag}>` +
    `<${tag}-step>${step}</${tag}-step>` +
    (alter ? `<${tag}-alter>${alter}</${tag}-alter>` : "") +
    `</${tag}>`
  );
}

// Fretboard diagram from a chord shape (frets run string 6 -> string 1).
function frameXml(shape) {
  const played = shape.frets
    .map((fret, idx) => ({ fret, mxString: 6 - idx })) // idx0 (low E) -> string 6
    .filter((n) => n.fret >= 0);
  if (!played.length) return "";
  const baseFret = shape.baseFret && shape.baseFret > 1 ? shape.baseFret : 1;
  const barreStrings = new Set();
  for (const b of shape.barres || []) {
    barreStrings.add(b.fromString);
    barreStrings.add(b.toString);
  }
  const notes = played
    .sort((a, b) => a.mxString - b.mxString)
    .map((n) => {
      const barre = barreStrings.has(n.mxString)
        ? `<barre type="start"/>`
        : "";
      return (
        `<frame-note><string>${n.mxString}</string>` +
        `<fret>${n.fret}</fret>${barre}</frame-note>`
      );
    })
    .join("");
  return (
    `<frame><frame-strings>6</frame-strings><frame-frets>5</frame-frets>` +
    (baseFret > 1
      ? `<first-fret location="left" text="${baseFret}fr">${baseFret}</first-fret>`
      : "") +
    notes +
    `</frame>`
  );
}

function harmonyXml(symbol, shape) {
  const parsed = parseChordSymbol(symbol);
  if (!parsed) return "";
  const kindText = esc(symbol);
  return (
    `<harmony print-frame="${shape ? "yes" : "no"}">` +
    rootXml("root", parsed.root) +
    `<kind text="${kindText}">${parsed.kind}</kind>` +
    (parsed.bass ? rootXml("bass", parsed.bass) : "") +
    (shape ? frameXml(shape) : "") +
    `</harmony>`
  );
}

const TECH_XML = {
  hammer: "<hammer-on type=\"start\">H</hammer-on>",
  pull: "<pull-off type=\"start\">P</pull-off>",
  "slide-up": "<slide type=\"start\" line-type=\"solid\"/>",
  "slide-down": "<slide type=\"start\" line-type=\"solid\"/>",
  harmonic: "<harmonic/>",
  tap: "<tap/>",
};

function techNotations(techniques, string, fret) {
  const tech = [`<string>${string}</string>`, `<fret>${fret}</fret>`];
  for (const t of techniques || []) {
    if (TECH_XML[t]) tech.push(TECH_XML[t]);
    if (t === "bend" || t === "bend-release")
      tech.push("<bend><bend-alter>1</bend-alter></bend>");
  }
  return `<technical>${tech.join("")}</technical>`;
}

function noteXml(event, { tuning }) {
  const out = [];
  const divisions = durationToDivisions(event.durationBeats);
  const { value, dots } = noteValueFor(event.durationBeats);
  const typeXml = `<type>${value}</type>` + "<dot/>".repeat(dots);
  const tieTypes = event.tie
    ? event.tie === "continue"
      ? ["stop", "start"]
      : [event.tie]
    : [];

  const lyricXml = event.lyric
    ? `<lyric number="${event.lyric.verse || 1}">` +
      `<syllabic>${event.lyric.syllabic || "single"}</syllabic>` +
      `<text>${esc(event.lyric.text)}</text></lyric>`
    : "";

  // Rest (chord-only, grid, or empty event).
  if ((!event.tab || event.tab.length === 0) && (!event.midi || event.midi.length === 0)) {
    out.push(
      `<note><rest/><duration>${divisions}</duration>` +
        `<voice>${event.voice || 1}</voice>${typeXml}${lyricXml}</note>`,
    );
    return out.join("");
  }

  // Prefer tab entries (carry string/fret + techniques); fall back to pitches.
  const entries =
    event.tab && event.tab.length
      ? event.tab.map((t) => ({
          midi: tabNoteMidi(t, tuning),
          string: t.string,
          fret: t.fret,
          techniques: t.techniques || [],
          dead: (t.techniques || []).includes("dead"),
        }))
      : event.midi.map((m) => ({ midi: m, techniques: [] }));

  entries.sort((a, b) => a.midi - b.midi);
  entries.forEach((entry, idx) => {
    const { step, alter, octave } = midiToPitch(entry.midi);
    const chordTag = idx > 0 ? "<chord/>" : "";
    const pitch =
      `<pitch><step>${step}</step>` +
      (alter ? `<alter>${alter}</alter>` : "") +
      `<octave>${octave}</octave></pitch>`;
    const ties = tieTypes.map((t) => `<tie type="${t}"/>`).join("");
    const tiedNotations = tieTypes.map((t) => `<tied type="${t}"/>`).join("");
    let notations = tiedNotations;
    if (entry.string)
      notations += techNotations(entry.techniques, entry.string, entry.fret);
    const notationsXml = notations ? `<notations>${notations}</notations>` : "";
    const notehead = entry.dead ? `<notehead>x</notehead>` : "";
    out.push(
      `<note>${chordTag}${pitch}${ties}` +
        `<duration>${divisions}</duration><voice>${event.voice || 1}</voice>` +
        `${typeXml}${notehead}${idx === 0 ? lyricXml : ""}${notationsXml}</note>`,
    );
  });
  return out.join("");
}

function measureXml(measure, ctx, attributesXml, directionsXml) {
  const parts = [`<measure number="${measure.number}">`];
  if (attributesXml) parts.push(attributesXml);
  if (directionsXml) parts.push(directionsXml);

  const events = [...measure.events].sort((a, b) => a.beat - b.beat);
  let filled = 0; // in divisions
  const measureQuarters =
    (ctx.timeSignature.beats * 4) / ctx.timeSignature.beatUnit;
  const measureDivisions = Math.round(measureQuarters * DIVISIONS);

  for (const event of events) {
    const target = Math.round(event.beat * DIVISIONS);
    if (target > filled) {
      // gap -> rest
      const gap = target - filled;
      parts.push(
        `<note><rest/><duration>${gap}</duration><voice>1</voice></note>`,
      );
      filled += gap;
    }
    let shape = null;
    if (event.chordSymbol) {
      shape = ctx.resolveChord(event.chordSymbol);
      parts.push(harmonyXml(event.chordSymbol, shape));
    }
    if (event.annotation)
      parts.push(
        `<direction placement="above"><direction-type><words>${esc(
          event.annotation,
        )}</words></direction-type></direction>`,
      );
    // Chord-chart event (symbol only, no tab/pitch): strum the resolved shape so
    // the chord is playable and its lyric attaches to real notes.
    let emitEvent = event;
    if (
      shape &&
      (!event.tab || event.tab.length === 0) &&
      (!event.midi || event.midi.length === 0)
    ) {
      const tab = shape.frets
        .map((fret, idx) => ({ fret, string: 6 - idx, techniques: [] }))
        .filter((t) => t.fret >= 0);
      if (tab.length) emitEvent = { ...event, tab, kind: "chord" };
    }
    parts.push(noteXml(emitEvent, ctx));
    filled += durationToDivisions(event.durationBeats);
  }
  if (filled < measureDivisions) {
    parts.push(
      `<note><rest/><duration>${measureDivisions - filled}</duration><voice>1</voice></note>`,
    );
  }
  parts.push(`</measure>`);
  return parts.join("");
}

function clefXml(track) {
  if (track.instrument === "bass" || track.clef?.startsWith("bass"))
    return `<clef><sign>F</sign><line>4</line></clef>`;
  // Guitar: treble clef sounding an octave lower.
  return `<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>`;
}

function partMeasuresXml(arr, track, { isFirst, resolveChord }) {
  const ctx = {
    tuning: track.tuning || arr.tuning,
    timeSignature: arr.timeSignature,
    resolveChord,
  };
  const sectionByMeasure = new Map();
  for (const s of arr.sections) sectionByMeasure.set(s.startMeasure, s);

  return track.measures
    .map((measure, idx) => {
      const attributesXml =
        idx === 0
          ? `<attributes><divisions>${DIVISIONS}</divisions>` +
            `<key><fifths>${arr.key.fifths}</fifths><mode>${esc(arr.key.mode)}</mode></key>` +
            `<time><beats>${arr.timeSignature.beats}</beats><beat-type>${arr.timeSignature.beatUnit}</beat-type></time>` +
            clefXml(track) +
            `</attributes>`
          : "";
      const directions = [];
      // Tempo rides on the first part only; rehearsal marks appear on every part.
      if (idx === 0 && isFirst)
        directions.push(
          `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${Math.round(
            arr.tempoBpm,
          )}</per-minute></metronome></direction-type><sound tempo="${Math.round(
            arr.tempoBpm,
          )}"/></direction>`,
        );
      const section = sectionByMeasure.get(measure.number);
      if (section)
        directions.push(
          `<direction placement="above"><direction-type><rehearsal>${esc(
            section.label,
          )}</rehearsal></direction-type>` +
            (section.notes
              ? `<direction-type><words>${esc(section.notes)}</words></direction-type>`
              : "") +
            `</direction>`,
        );
      return measureXml(measure, ctx, attributesXml, directions.join(""));
    })
    .join("\n");
}

export function arrangementToMusicXML(arr, options = {}) {
  // Derive tab (string/fret) from the pitches unless explicitly disabled.
  if (options.generateTabFromPitch !== false) arr = withGeneratedTab(arr);
  const resolveChord =
    options.resolveChord ||
    ((name) => arr.chordLibrary.find((c) => c.name === name) || null);

  const abbr = (t) =>
    t.instrument === "bass"
      ? "Bass"
      : /2/.test(t.name)
        ? "Gtr. 2"
        : "Gtr.";

  const partList = arr.tracks
    .map(
      (t, i) =>
        `<score-part id="P${i + 1}"><part-name>${esc(t.name)}</part-name>` +
        `<part-abbreviation>${esc(abbr(t))}</part-abbreviation></score-part>`,
    )
    .join("");

  const partsXml = arr.tracks
    .map((track, i) => {
      const measures = partMeasuresXml(arr, track, {
        isFirst: i === 0,
        resolveChord,
      });
      return `<part id="P${i + 1}">\n${measures}\n</part>`;
    })
    .join("\n");

  const work = esc(arr.title);
  const creator = arr.artist
    ? `<identification><creator type="composer">${esc(arr.artist)}</creator>` +
      (arr.credits?.tabbedBy
        ? `<creator type="arranger">${esc(arr.credits.tabbedBy)}</creator>`
        : "") +
      `<encoding><software>Schuylkill Music arrangement exporter</software></encoding></identification>`
    : "";

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` +
    `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n` +
    `<score-partwise version="4.0">\n` +
    `<work><work-title>${work}</work-title></work>\n` +
    creator +
    `<part-list>${partList}</part-list>\n` +
    `${partsXml}\n` +
    `</score-partwise>\n`
  );
}
