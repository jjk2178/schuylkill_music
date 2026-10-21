// Parse a 4-string bass tab (EADG, e.g. cant_stop_bass.txt) into a bass-only
// SongArrangement. Reuses the guitar tab-block machinery; the block is four
// lines ordered G (string 1, highest) -> E (string 4, lowest). Slap/pop marker
// rows (S/P/X above the staff) are recorded in the legend rather than mapped to
// individual notes; inline X is a ghost/dead note and / \ are slides.

import { tabBlockToMeasures, barlineColumnsOf } from "./parse.mjs";

const BASS_TUNING = ["E1", "A1", "D2", "G2"]; // low -> high
const BASS_LABELS = ["G", "D", "A", "E"]; // block line order, high -> low

const BASS_META = {
  cant_stop: {
    title: "Can't Stop",
    artist: "Red Hot Chili Peppers",
    tempoBpm: 91,
    keyFifths: 0,
    mode: "minor",
  },
};

const isBlank = (l) => l.trim() === "";
const isBassStringLine = (l) => /^\s*[GDAE]\|/.test(l);
// A slap/pop marker row: only S, P, X and spaces.
const isMarkerRow = (l) => /\S/.test(l) && /^[\sSPX]+$/.test(l) && /[SP]/.test(l);

function collectBassBlock(lines, start) {
  const collected = [];
  let j = start;
  while (j < lines.length && collected.length < 4) {
    const m = /^(\s*)([GDAE])\|(.*)$/.exec(lines[j]);
    if (!m) break;
    collected.push({ label: m[2], raw: lines[j] });
    j++;
  }
  if (collected.length < 4) return null;
  if (collected.map((c) => c.label).join("") !== BASS_LABELS.join(""))
    return null;
  return { lines: collected, next: j };
}

export function parseBassSong(text, { id }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const meta = BASS_META[id] ?? {};
  const beats = 4;

  const sections = [];
  const legend = [];
  const measures = [];
  let currentSection = null;
  let measureNumber = 1;

  const startSection = (label) => {
    currentSection = {
      id: `s${sections.length + 1}`,
      label: label.replace(/:\s*$/, "").trim(),
      startMeasure: measureNumber,
    };
    sections.push(currentSection);
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }
    // Legend: "S=Slap", "X = Ghost Note", "/or\ = Slide"
    const leg = /^\s*(\S.*?)\s*=\s*(.+?)\s*$/.exec(line);
    if (leg && !isBassStringLine(line) && line.length < 48) {
      legend.push({ symbol: leg[1], meaning: leg[2] });
      i++;
      continue;
    }
    // Section header: a non-tab line ending with ":"
    if (!isBassStringLine(line) && /:\s*$/.test(line.trim())) {
      startSection(line.trim());
      i++;
      continue;
    }
    if (isMarkerRow(line)) {
      i++;
      continue;
    }
    if (isBassStringLine(line)) {
      const block = collectBassBlock(lines, i);
      if (block) {
        if (!currentSection) startSection("Intro");
        const { measures: ms, next } = tabBlockToMeasures(
          block,
          beats,
          BASS_TUNING,
          measureNumber,
        );
        for (const m of ms) {
          m.number = measureNumber++;
          m.sectionId = currentSection.id;
          measures.push(m);
        }
        void barlineColumnsOf; // (kept available for debugging alignment)
        i = block.next;
        continue;
      }
    }
    i++; // skip unrecognised preamble (tuning hint, warnings, etc.)
  }

  if (!measures.length)
    measures.push({
      number: 1,
      events: [{ id: "m1-e0", beat: 0, durationBeats: beats, kind: "rest", midi: [], tab: [] }],
    });

  const title =
    meta.title ||
    id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    schemaVersion: 2,
    id,
    title,
    ...(meta.artist ? { artist: meta.artist } : {}),
    key: { fifths: meta.keyFifths ?? 0, mode: meta.mode ?? "major" },
    timeSignature: { beats, beatUnit: 4 },
    tempoBpm: meta.tempoBpm ?? 100,
    tuning: BASS_TUNING,
    sections,
    chordLibrary: [],
    tracks: [
      {
        id: "bass",
        name: "Bass",
        instrument: "bass",
        clef: "bass",
        tuning: BASS_TUNING,
        measures,
      },
    ],
    snippets: [],
    legend,
  };
}
