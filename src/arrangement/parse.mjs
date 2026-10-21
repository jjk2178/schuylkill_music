// Parse Ultimate-Guitar style plain-text tab/chord sheets into the beat-based
// SongArrangement schema (schema.mjs). The text files mix several notations:
//
//   * chord-shape definitions   (e.g. "G     320003")
//   * chord progression grids   (e.g. "| C G/B | Am7 G/B |")
//   * chords-over-lyrics        (a sparse chord line above a prose line)
//   * six-line ASCII tab blocks  with optional timing rows + lyric lines
//   * chord labels over a tab block (e.g. the Stairway solo)
//   * a legend block fenced by "****" lines
//
// Rhythm in ASCII tab is only column-proportional, so note timing is recovered by
// mapping a note's character column to a beat within its measure and quantizing
// to a 16th-note grid. This is intentionally approximate; the JSON keeps every
// parsed symbol so nothing from the source is silently dropped.

import { tabNoteMidi } from "./schema.mjs";

const STRING_LABELS = ["e", "B", "G", "D", "A", "E"]; // high e -> low E

// Per-song curation so the exported parts are musical. Not derivable from the
// chord/tab text; everything else comes straight from the file.
const SONG_META = {
  landslide: { title: "Landslide", artist: "Fleetwood Mac", tempoBpm: 72, keyFifths: 0, mode: "major", capo: 3 },
  drivers_license: { title: "Drivers License", artist: "Olivia Rodrigo", tempoBpm: 72, keyFifths: 1, mode: "major" },
  creep: { title: "Creep", artist: "Radiohead", tempoBpm: 92, keyFifths: 2, mode: "major" },
  stairway_to_heaven: { title: "Stairway to Heaven", artist: "Led Zeppelin", tempoBpm: 82, keyFifths: 0, mode: "minor" },
  smells_like_teen_spirit: { title: "Smells Like Teen Spirit", artist: "Nirvana", tempoBpm: 117, keyFifths: -2, mode: "minor" },
  // Capo 4 with C-position shapes (sounding key E); diagrams match the supplied PDF.
  how_far_ill_go: { title: "How Far I'll Go", artist: "Auli'i Cravalho", tempoBpm: 90, keyFifths: 0, mode: "major", capo: 4 },
};

const CHORD_RE =
  /^[A-G][#b]?(?:m|maj|min|M|sus|add|dim|aug|°)?(?:2|4|5|6|7|9|11|13)*(?:[#b](?:5|6|9|11|13))*(?:sus[24])?(?:add\d+)?(?:\/[A-G][#b]?)?$/;

const TECH = {
  h: "hammer",
  p: "pull",
  b: "bend",
  "/": "slide-up",
  "\\": "slide-down",
  r: "release",
  "~": "vibrato",
};

const isBlank = (line) => line.trim() === "";
const isChordToken = (tok) => CHORD_RE.test(tok) && /[A-G]/.test(tok[0]);

function isChordLine(line) {
  const toks = line.trim().split(/\s+/).filter(Boolean);
  if (!toks.length || toks.length > 8) return false;
  return toks.every(isChordToken);
}

function isStringLine(line) {
  return /^\s*[eBGDAE]\|/.test(line);
}

function isTimingRow(line) {
  const t = line.trim();
  if (!t) return false;
  return /^[\d&+eE.\s()]+$/.test(t) && /[&+]/.test(t) && !t.includes("|");
}

// "320003" / "x32010" -> frets[6] running string 6 (low E) -> string 1 (high e).
export function parseFretString(str) {
  const chars = str.trim().split("");
  if (chars.length !== 6) return null;
  const frets = chars.map((c) =>
    c === "x" || c === "X" ? -1 : /\d/.test(c) ? Number(c) : null,
  );
  if (frets.some((f) => f === null)) return null;
  return frets; // index 0 = low E string (string 6)
}

function chordShapeFromFrets(name, lowToHigh) {
  // Input frets run low E -> high e; schema stores the same order (string 6 -> 1).
  // The diagram window starts at fret 1 whenever an open string is played;
  // only a shape made entirely of fretted notes above fret 1 shifts up.
  const positive = lowToHigh.filter((f) => f > 0);
  const hasOpen = lowToHigh.some((f) => f === 0);
  const baseFret =
    !hasOpen && positive.length && Math.min(...positive) > 1
      ? Math.min(...positive)
      : 1;
  return { name, frets: lowToHigh, barres: [], baseFret };
}

// ---- tab block parsing --------------------------------------------------

function collectTabBlock(lines, start) {
  const collected = [];
  let j = start;
  while (j < lines.length && collected.length < 6) {
    const m = /^(\s*)([eBGDAE])\|(.*)$/.exec(lines[j]);
    if (!m) break;
    collected.push({ label: m[2], raw: lines[j] });
    j++;
  }
  if (collected.length < 6) return null;
  const labels = collected.map((c) => c.label);
  // Require the canonical high->low ordering to avoid grabbing stray lines.
  if (labels.join("") !== STRING_LABELS.join("")) return null;
  return { lines: collected, next: j };
}

function barlineColumns(eLineRaw) {
  const cols = [];
  for (let i = 0; i < eLineRaw.length; i++)
    if (eLineRaw[i] === "|") cols.push(i);
  return cols;
}

export function barlineColumnsOf(line) {
  return barlineColumns(line);
}

export function parseStringSegment(seg, absStart, stringNum, out) {
  let i = 0;
  let ghost = false;
  while (i < seg.length) {
    const ch = seg[i];
    if (ch === "(") {
      ghost = true;
      i++;
      continue;
    }
    if (ch === ")") {
      ghost = false;
      i++;
      continue;
    }
    if (/\d/.test(ch)) {
      const startCol = i;
      let num = ch;
      i++;
      while (i < seg.length && /\d/.test(seg[i])) {
        num += seg[i];
        i++;
      }
      const techniques = ghost ? ["ghost"] : [];
      while (i < seg.length && TECH[seg[i]] !== undefined) {
        const t = TECH[seg[i]];
        if (!techniques.includes(t)) techniques.push(t);
        i++;
      }
      out.push({
        col: absStart + startCol,
        string: stringNum,
        fret: Math.min(24, Number(num)),
        techniques,
      });
    } else if (ch === "x" || ch === "X") {
      out.push({
        col: absStart + i,
        string: stringNum,
        fret: 0,
        techniques: ["dead"],
      });
      i++;
    } else {
      i++;
    }
  }
}

// Group a measure's notes (columns relative to its own start) into beat events.
function eventsFromNotes(notes, width, beats, grid = 0.25) {
  if (!notes.length) return [{ beat: 0, durationBeats: beats, tab: [], rest: true }];
  const byBeat = new Map();
  for (const n of notes) {
    let beat = width > 0 ? (n.col / width) * beats : 0;
    beat = Math.round(beat / grid) * grid;
    if (beat >= beats) beat = beats - grid;
    if (beat < 0) beat = 0;
    const key = beat.toFixed(3);
    if (!byBeat.has(key)) byBeat.set(key, { beat, tab: [] });
    const ev = byBeat.get(key);
    if (!ev.tab.some((t) => t.string === n.string))
      ev.tab.push({ string: n.string, fret: n.fret, techniques: n.techniques });
  }
  const sorted = [...byBeat.values()].sort((a, b) => a.beat - b.beat);
  return sorted.map((ev, k) => {
    const next = k + 1 < sorted.length ? sorted[k + 1].beat : beats;
    let durationBeats = next - ev.beat;
    if (durationBeats <= 0) durationBeats = grid;
    return { beat: ev.beat, durationBeats, tab: ev.tab };
  });
}

// Convert an N-line tab block into measures, returning measures + a flat list of
// events annotated with their absolute column (for lyric / chord-label mapping).
// Works for 6-string guitar and 4-string bass (block.lines ordered high->low).
export function tabBlockToMeasures(block, beats, tuning, startNumber) {
  const eLine = block.lines[0].raw;
  const pipes = barlineColumns(eLine);
  const measures = [];
  const flatEvents = [];
  if (pipes.length < 2) return { measures, flatEvents, next: startNumber };
  let number = startNumber;
  for (let k = 0; k < pipes.length - 1; k++) {
    const segStart = pipes[k] + 1;
    const segEnd = pipes[k + 1];
    const width = segEnd - segStart;
    if (width <= 0) continue;
    const notes = [];
    for (let s = 0; s < block.lines.length; s++) {
      const raw = block.lines[s].raw;
      const seg = raw.slice(segStart, segEnd);
      // string number: line 0 = string 1 (highest) .. last line = lowest string
      parseStringSegment(seg, 0, s + 1, notes);
    }
    const evs = eventsFromNotes(notes, width, beats);
    const events = evs.map((ev, idx) => {
      const tab = (ev.tab || []).map((t) => ({
        string: t.string,
        fret: t.fret,
        techniques: t.techniques,
      }));
      const live = tab.filter((t) => !t.techniques.includes("dead"));
      const midi = live.map((t) => tabNoteMidi(t, tuning));
      const event = {
        id: `m${number}-e${idx}`,
        beat: ev.beat,
        durationBeats: ev.durationBeats,
        kind: ev.rest || tab.length === 0 ? "rest" : tab.length > 1 ? "chord" : "note",
        midi,
        tab,
      };
      flatEvents.push({ event, absCol: segStart + (ev.beat / beats) * width });
      return event;
    });
    measures.push({ number, events });
    number++;
  }
  return { measures, flatEvents, next: number };
}

function mapLyricLine(flatEvents, line, verse) {
  const re = /\S+/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const col = m.index;
    let best = null;
    let bestDist = Infinity;
    for (const fe of flatEvents) {
      if (fe.event.kind === "rest") continue;
      const d = Math.abs(fe.absCol - col);
      if (d < bestDist) {
        bestDist = d;
        best = fe;
      }
    }
    if (best && bestDist < 24) {
      const existing = best.event.lyric;
      const text = existing ? `${existing.text} ${m[0]}` : m[0];
      best.event.lyric = { text, syllabic: "single", verse };
    }
  }
}

function mapChordLabels(flatEvents, line) {
  const re = /\S+/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    if (!isChordToken(m[0])) continue;
    const col = m.index;
    let best = null;
    let bestDist = Infinity;
    for (const fe of flatEvents) {
      const d = Math.abs(fe.absCol - col);
      if (d < bestDist) {
        bestDist = d;
        best = fe;
      }
    }
    if (best) best.event.chordSymbol = m[0];
  }
}

// ---- chord grids & chords-over-lyrics ----------------------------------

function gridToMeasures(line, beats, startNumber, chordNames) {
  const cells = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|\s*(\(\d+x\))?\s*$/, "")
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean);
  let number = startNumber;
  const measures = [];
  for (const cell of cells) {
    const chords = cell.split(/\s+/).filter(isChordToken);
    if (!chords.length) continue;
    const per = beats / chords.length;
    const events = chords.map((chord, idx) => {
      chordNames.add(chord);
      return {
        id: `m${number}-g${idx}`,
        beat: idx * per,
        durationBeats: per,
        kind: "rest",
        midi: [],
        tab: [],
        chordSymbol: chord,
      };
    });
    measures.push({ number, events });
    number++;
  }
  return { measures, next: number };
}

// Move a column left to the start of the word that contains it, so slicing a
// lyric at a chord column never splits a word in half.
function snapToWord(text, col) {
  let c = Math.min(col, text.length);
  while (c > 0 && text[c - 1] !== " ") c--;
  return c;
}

// A sparse chord line followed by a prose lyric line -> one measure of
// half-note chord events carrying the lyric text until the next chord column.
// The first chord owns any lyric before it (col 0), and segment boundaries snap
// to word edges so no syllable is lost or cut.
function chordLyricToMeasures(chordLine, lyricLine, beats, startNumber, chordNames) {
  const chords = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(chordLine)) !== null)
    if (isChordToken(m[0])) chords.push({ chord: m[0], col: m.index });
  if (!chords.length) return { measures: [], next: startNumber };
  const lyric = lyricLine ?? "";
  // Cut points: first segment starts at 0; later ones snap to a word boundary.
  const cuts = chords.map((c, i) => (i === 0 ? 0 : snapToWord(lyric, c.col)));
  let number = startNumber;
  const measures = [];
  let events = [];
  let beat = 0;
  const flush = () => {
    if (events.length) {
      measures.push({ number, events });
      number++;
      events = [];
      beat = 0;
    }
  };
  for (let i = 0; i < chords.length; i++) {
    const { chord } = chords[i];
    chordNames.add(chord);
    const text = lyric.slice(cuts[i], i + 1 < cuts.length ? cuts[i + 1] : undefined).trim();
    const dur = 2; // half note per chord (rhythm not encoded in the source)
    if (beat + dur > beats) flush();
    events.push({
      id: `m${number}-c${events.length}`,
      beat,
      durationBeats: dur,
      kind: "rest",
      midi: [],
      tab: [],
      chordSymbol: chord,
      ...(text ? { lyric: { text, syllabic: "single", verse: 1 } } : {}),
    });
    beat += dur;
    if (beat >= beats) flush();
  }
  flush();
  return { measures, next: number };
}

// A lyric line with no chord above it (a continuation within a section) becomes a
// measure carrying just the text, so nothing sung is dropped.
function lyricOnlyMeasure(text, number, beats) {
  return {
    number,
    events: [
      {
        id: `m${number}-l0`,
        beat: 0,
        durationBeats: beats,
        kind: "rest",
        midi: [],
        tab: [],
        lyric: { text: text.trim(), syllabic: "single", verse: 1 },
      },
    ],
  };
}

// ---- top-level ----------------------------------------------------------

export function parseSong(text, { id }) {
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");
  const meta = SONG_META[id] ?? {};
  const beats = 4;
  const tuning = ["E2", "A2", "D3", "G3", "B3", "E4"];

  const chordLibraryMap = new Map(); // name -> shape
  const chordNames = new Set();
  const sections = [];
  const snippets = [];
  const legend = [];
  const measures = [];

  let currentSection = null;
  let measureNumber = 1;
  let inLegend = false;
  let currentGuitar = 1;
  let pendingChordLabels = null; // a chord-label line awaiting its tab block
  let title = meta.title;
  let artist = meta.artist;

  // Title line like "LANDSLIDE - Stevie Nicks" on the very first content line.
  const firstContent = rawLines.find((l) => !isBlank(l));
  if (firstContent && !title) {
    const m = /^([A-Z][A-Z '’]+?)\s*[-–]\s*(.+)$/.exec(firstContent.trim());
    if (m) {
      title = m[1].trim();
      artist = artist ?? m[2].trim();
    }
  }
  if (!title) title = id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const startSection = (label, trailing) => {
    const sid = `s${sections.length + 1}`;
    currentSection = {
      id: sid,
      label,
      startMeasure: measureNumber,
      ...(trailing ? { repeatText: trailing } : {}),
    };
    sections.push(currentSection);
    currentGuitar = 1; // each section starts on the primary guitar
    pendingChordLabels = null;
  };

  const pushMeasures = (ms) => {
    for (const measure of ms) {
      measure.number = measureNumber++;
      if (currentSection) measure.sectionId = currentSection.id;
      measures.push(measure);
    }
  };

  let i = 0;
  while (i < rawLines.length) {
    const line = rawLines[i];

    if (/^\s*\*{4,}/.test(line)) {
      inLegend = !inLegend;
      i++;
      continue;
    }
    if (inLegend) {
      const m = /^\s*\|?\s*(\S+)\s{2,}(.+?)\s*$/.exec(line);
      if (m) legend.push({ symbol: m[1], meaning: m[2] });
      i++;
      continue;
    }
    if (isBlank(line)) {
      i++;
      continue;
    }

    // Section header
    const sec = /^\s*\[([^\]]+)\]\s*(.*)$/.exec(line);
    if (sec) {
      startSection(sec[1].trim(), sec[2].trim() || undefined);
      i++;
      continue;
    }

    // Chord-shape definition (name + 6 fret chars)
    const shape = /^\s*([A-G][#b]?[^\s]*)\s+([0-9xX]{6})\s*$/.exec(line);
    if (shape && isChordToken(shape[1])) {
      const frets = parseFretString(shape[2]);
      if (frets) {
        chordLibraryMap.set(shape[1], chordShapeFromFrets(shape[1], frets));
        chordNames.add(shape[1]);
        i++;
        continue;
      }
    }

    // Tab block (possibly preceded by a chord-label line or performance note)
    if (isStringLine(line)) {
      const block = collectTabBlock(rawLines, i);
      if (block) {
        // Preamble tab (before any section): keep as a picking/riff snippet.
        if (!currentSection) {
          snippets.push({
            kind: "picking",
            text: block.lines.map((l) => l.raw).join("\n"),
          });
          i = block.next;
          continue;
        }
        if (currentGuitar > 1) {
          // Secondary guitar: preserve verbatim but keep it out of the main part.
          snippets.push({
            kind: "riff",
            label: `Guitar ${currentGuitar}`,
            sectionId: currentSection?.id,
            text: block.lines.map((l) => l.raw).join("\n"),
          });
          i = block.next;
          continue;
        }
        const { measures: ms, flatEvents, next } = tabBlockToMeasures(
          block,
          beats,
          tuning,
          measureNumber,
        );
        // pendingChordLabels: a chord line immediately above the block
        if (pendingChordLabels) {
          mapChordLabels(flatEvents, pendingChordLabels);
          for (const fe of flatEvents)
            if (fe.event.chordSymbol) chordNames.add(fe.event.chordSymbol);
          pendingChordLabels = null;
        }
        // Lyrics: scan following lines for timing row + lyric line(s).
        let j = block.next;
        let verse = 1;
        while (j < rawLines.length) {
          const l = rawLines[j];
          if (isBlank(l)) break;
          if (isStringLine(l)) break;
          if (isTimingRow(l)) {
            j++;
            continue;
          }
          if (/^\s*\(/.test(l)) break; // performance note begins next block
          mapLyricLine(flatEvents, l, verse);
          verse++;
          j++;
        }
        // Renumber + attach section, then store.
        pushMeasures(ms);
        i = j;
        continue;
      }
    }

    // Chord grid line: | C G/B | Am7 G/B |
    if (/^\s*\|/.test(line) && line.includes("|", line.indexOf("|") + 1)) {
      const inner = line.trim().replace(/^\|/, "").replace(/\|[^|]*$/, "");
      if (inner.split("|").every((c) => c.trim().split(/\s+/).every((t) => !t || isChordToken(t)))) {
        const { measures: ms } = gridToMeasures(line, beats, measureNumber, chordNames);
        pushMeasures(ms);
        i++;
        continue;
      }
    }

    // Chord line: decide if it labels a following tab block or a lyric line.
    if (isChordLine(line)) {
      // find next non-blank line
      let k = i + 1;
      while (k < rawLines.length && isBlank(rawLines[k])) k++;
      if (k < rawLines.length && isStringLine(rawLines[k])) {
        pendingChordLabels = line;
        i++;
        continue;
      }
      // chords-over-lyrics
      const lyricLine = k < rawLines.length ? rawLines[k] : "";
      const { measures: ms } = chordLyricToMeasures(
        line,
        lyricLine,
        beats,
        measureNumber,
        chordNames,
      );
      pushMeasures(ms);
      i = k + 1;
      continue;
    }

    // Performance note / guitar switch
    const note = /^\s*\(([^)]*)\)\s*(\{[^}]*\})?\s*$/.exec(line);
    if (note) {
      const text = note[1].trim();
      const gm = /guitar\s*(\d+)/i.exec(text);
      if (gm) currentGuitar = Number(gm[1]);
      else if (currentSection && !currentSection.notes) currentSection.notes = text;
      else snippets.push({ kind: "note", sectionId: currentSection?.id, text });
      i++;
      continue;
    }

    // A chord-less lyric line inside a section is a sung continuation: keep it in
    // the chart so no words are lost. Outside any section (preamble instructions)
    // it is just a note.
    if (currentSection && /[A-Za-z]/.test(line)) {
      pushMeasures([lyricOnlyMeasure(line, 0, beats)]);
      i++;
      continue;
    }
    snippets.push({ kind: "note", sectionId: currentSection?.id, text: line.trim() });
    i++;
  }

  // Build chord library: definitions first, then standard shapes for any
  // remaining referenced names (filled in by the importer via a shape resolver).
  const chordLibrary = [...chordLibraryMap.values()];

  if (!measures.length)
    measures.push({ number: 1, events: [{ id: "m1-e0", beat: 0, durationBeats: beats, kind: "rest", midi: [], tab: [] }] });

  return {
    arrangement: {
      schemaVersion: 2,
      id,
      title,
      ...(artist ? { artist } : {}),
      key: { fifths: meta.keyFifths ?? 0, mode: meta.mode ?? "major" },
      timeSignature: { beats, beatUnit: 4 },
      tempoBpm: meta.tempoBpm ?? 120,
      tuning,
      ...(meta.capo ? { capo: meta.capo } : {}),
      sections,
      chordLibrary,
      tracks: [
        {
          id: "guitar",
          name: "Guitar",
          instrument: "guitar",
          clef: "treble+tab",
          tuning,
          ...(meta.capo ? { capo: meta.capo } : {}),
          measures,
        },
      ],
      snippets,
      legend,
    },
    referencedChords: [...chordNames],
  };
}
