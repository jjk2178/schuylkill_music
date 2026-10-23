import { guitarStrumsForChart } from "../src/music/guitarStrums.mjs";
import { printableChordReference, vexChordData, vexChordOptions } from "../src/music/vexChordReference.mjs";
import { staffTieLinks } from "../src/music/ties.mjs";
import { fluteFingeringSvg } from "../src/music/fluteFingerings.mjs";
import { recorderFingeringSvg } from "../src/music/recorderFingerings.mjs";
import { rhythmicValue, beamGroups } from "../src/music/engraving.mjs";
import { chartForInstrument, guitarChordForChart, chordChangesForChart } from "../src/music/chordChanges.mjs";
import { buildSync } from "esbuild";
import { guitarChords } from "../src/music/guitarChords.mjs";
import {
  compilePart,
  compileChartPart,
  isPianoChordAccompaniment,
  writtenPitches,
  writtenKey,
} from "../src/music/parts.mjs";
import { measureBoundaries, tempoAt, meterAt } from "../src/music/measures.mjs";
import { timeToBeat } from "../src/music/beatTimeline.mjs";
import { buildKaraokePhrases } from "../src/music/karaokePhrases.mjs";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Bravura } from "../node_modules/vexflow/build/esm/src/fonts/bravura.js";
import { Academico } from "../node_modules/vexflow/build/esm/src/fonts/academico.js";
import { AcademicoBold } from "../node_modules/vexflow/build/esm/src/fonts/academicobold.js";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const dataPath = join(repoRoot, "src/band/rehearsalSet.json");
const outputDir = resolve(repoRoot, process.env.PDF_OUTPUT_DIR ?? "output/pdf");
const htmlDir = resolve(repoRoot, process.env.PDF_HTML_DIR ?? join(outputDir,"html"));
const chromePath =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const scoreWidth = 680;
const completeScoreWidth = 920;
const eventsPerSystem = 24;
const systemsPerPage = 4;

if(!process.argv.includes("--web")) {
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(htmlDir, { recursive: true });
}

const data = JSON.parse(readFileSync(dataPath, "utf8"));
const songIndex = loadSongIndex();

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function midiName(midi) {
  const names = [
    "C",
    "C#",
    "D",
    "Eb",
    "E",
    "F",
    "F#",
    "G",
    "Ab",
    "A",
    "Bb",
    "B",
  ];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function midiToVexKey(midi) {
  return spellMidi(midi, defaultKeySignature()).key;
}

function secondsLabel(timeMs) {
  const seconds = Math.round(timeMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function transposeIntoRange(midi, min, max) {
  let note = midi;
  while (note < min) note += 12;
  while (note > max) note -= 12;
  return note;
}

function eventMidi(event) {
  return [...new Set(event?.expected?.midi ?? [])].sort((a, b) => a - b);
}

function defaultKeySignature() {
  return { key: "C", fifths: 0, mode: "major" };
}

function keySignatureAt(chart, timeMs = 0) {
  return (
    [...(chart?.keySignatures ?? [])]
      .sort((a, b) => a.timeMs - b.timeMs)
      .findLast((signature) => signature.timeMs <= timeMs) ??
    defaultKeySignature()
  );
}

function keyAccidentals(fifths = 0) {
  const accidentals = { c: 0, d: 0, e: 0, f: 0, g: 0, a: 0, b: 0 };
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

const naturalPitchClasses = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function spellMidi(midi, signature = defaultKeySignature()) {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const signatureAccidentals = keyAccidentals(signature.fifths);
  for (const [letter, natural] of Object.entries(naturalPitchClasses)) {
    const accidental = signatureAccidentals[letter];
    if ((((natural + accidental) % 12) + 12) % 12 === pitchClass) {
      return { key: `${letter}/${octave}`, accidental: null };
    }
  }

  const preferFlats = signature.fifths < 0;
  const spellings = preferFlats
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

function loadSongIndex() {
  const indexPath = join(repoRoot, "public/demo-songs/index.json");
  if (!existsSync(indexPath)) return new Map();
  return new Map(
    JSON.parse(readFileSync(indexPath, "utf8")).map((song) => [
      song.title.toLowerCase(),
      song,
    ]),
  );
}

function loadChart(song) {
  const item = songIndex.get(song.title.toLowerCase());
  if (!item?.chartUrl) return null;
  const chartPath = join(repoRoot, "public", item.chartUrl.replace(/^\//, ""));
  if (!existsSync(chartPath)) return null;
  return JSON.parse(readFileSync(chartPath, "utf8"));
}

function chartEvents(chart) {
  return chart?.tracks?.[0]?.events ?? [];
}

function dataAttr(value) {
  return escapeHtml(JSON.stringify(value));
}

function renderStaff(
  notes,
  {
    clef = "treble",
    height = 118,
    width = scoreWidth,
    compact = false,
    keySignature = defaultKeySignature(),
    timeSignature = { beats: 4, beatUnit: 4 },
    timeRange,
    timePositioned = false,
    diagramGap = 0,
    noteNames = false,
  } = {},
) {
  const range = timeRange ?? {
    startMs: notes[0]?.timeMs ?? 0,
    endMs: notes.at(-1)?.timeMs ?? 1,
  };
  const beatStart = range.beatStart ?? notes[0]?.beat ?? 0;
  const lastNote = notes.at(-1);
  const beatEnd = range.beatEnd ?? (lastNote?.beat ?? beatStart) + (lastNote?.durationBeats ?? 1);
  return `<div class="vf-staff" data-note-names="${noteNames ? 1 : 0}" data-diagram-gap="${diagramGap}" data-grand="${range.grand ? 1 : 0}" data-measures="${dataAttr(range.measures ?? [])}" data-quarter-ms="${range.quarterMs ?? 600}" data-clef="${escapeHtml(clef)}" data-height="${height}" data-width="${width}" data-compact="${compact ? "1" : "0"}" data-key="${dataAttr(keySignature)}" data-beats="${timeSignature.beats}" data-beat-unit="${timeSignature.beatUnit}" data-time-start="${range.startMs}" data-time-end="${range.endMs}" data-beat-start="${beatStart}" data-beat-end="${beatEnd}" data-time-positioned="${timePositioned ? "1" : "0"}" data-notes="${dataAttr(notes)}"></div>`;
}

function renderGrandStaff(
  notes,
  keySignature = defaultKeySignature(),
  compact = false,
  timeSignature = { beats: 4, beatUnit: 4 },
  timeRange,
  timePositioned = false,
  noteNames = false,
  height = 104,
  width = scoreWidth,
) {
  timeRange = {...timeRange, grand:true};
  const treble = notes
    .map((note) => ({ ...note, midi: note.midi.filter((midi) => note.staff ? note.staff === "treble" : midi >= 60) }))
    .filter((note) => note.midi.length || note.staff === "treble");
  const bass = notes
    .map((note) => ({ ...note, midi: note.midi.filter((midi) => note.staff ? note.staff === "bass" : midi < 60) }))
    .filter((note) => note.midi.length || note.staff === "bass");
  return `<div class="grand">${renderStaff(treble, { clef: "treble", height, width, compact: true, keySignature, timeSignature, timeRange, timePositioned, noteNames })}${renderStaff(bass, { clef: "bass", height, width, compact: true, keySignature, timeSignature, timeRange, timePositioned, noteNames })}</div>`;
}

function masterNotes(events) {
  const notes = [];
  let lastBucket = -1;
  for (const event of events) {
    const midi = eventMidi(event);
    if (!midi.length) continue;
    const bucket = Math.floor(event.timeMs / 6000);
    if (bucket === lastBucket) continue;
    lastBucket = bucket;
    notes.push({
      timeMs: event.timeMs,
      durationMs: event.durationMs,
      midi: [
        transposeIntoRange(midi[0], 36, 59),
        transposeIntoRange(midi.at(-1), 60, 84),
      ],
    });
  }
  return notes;
}

const guitarTuning = [
  { label: "e", open: 64 },
  { label: "B", open: 59 },
  { label: "G", open: 55 },
  { label: "D", open: 50 },
  { label: "A", open: 45 },
  { label: "E", open: 40 },
];
const bassTuning = [
  { label: "G", open: 43 },
  { label: "D", open: 38 },
  { label: "A", open: 33 },
  { label: "E", open: 28 },
];

function bestFret(midi, tuning) {
  return (
    tuning
      .map((stringInfo, stringIndex) => ({
        stringIndex,
        fret: midi - stringInfo.open,
      }))
      .filter((position) => position.fret >= 0 && position.fret <= 24)
      .sort((a, b) => Math.abs(a.fret - 5) - Math.abs(b.fret - 5))[0] ?? {
      stringIndex: tuning.length - 1,
      fret: 0,
    }
  );
}

function renderTabAnnotation(notes, tuning) {
  const columns = notes.filter(note=>note.midi.length).map((note) => ({
    note,
    position: bestFret(note.midi[0], tuning),
  }));
  const rowGap = tuning.length === 6 ? 10 : 13;
  const top = 8;
  const left = 84;
  const width = scoreWidth;
  const activeEnd = 656;
  const usableWidth = activeEnd - left;
  const firstTime = notes[0]?.timeMs ?? 0;
  const lastTime = notes.at(-1)?.timeMs ?? firstTime + 1;
  const timeSpan = Math.max(1, lastTime - firstTime);
  const height = top * 2 + rowGap * (tuning.length - 1);
  return `<svg class="tab-ann" viewBox="0 0 ${width} ${height}" role="img" aria-label="Tab annotation">
    ${tuning
      .map((stringInfo, stringIndex) => {
        const y = top + stringIndex * rowGap;
        return `<g><text class="tab-label" x="${left - 13}" y="${y + 3}" text-anchor="end">${escapeHtml(stringInfo.label)}</text><line x1="${left}" x2="${width - 8}" y1="${y}" y2="${y}"></line></g>`;
      })
      .join("")}
    ${columns
      .map(({ note, position }) => {
        const x = left + ((note.timeMs - firstTime) / timeSpan) * usableWidth;
        if(note.frets) return note.frets.map((f,i)=>f<0?"":`<text class="tab-fret" data-time="${note.timeMs}" x="${x}" y="${top+(5-i)*rowGap+3}" text-anchor="middle">${f}</text>`).join("");
        const y = top + position.stringIndex * rowGap;
        return `<text class="tab-fret" data-time="${note.timeMs}" x="${x}" y="${y + 3}" text-anchor="middle">${position.fret}</text>`;
      })
      .join("")}
  </svg>`;
}

function trumpetFingering(midi) {
  return (
    {
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
    }[((midi % 12) + 12) % 12] ?? "0"
  );
}

function renderInstrumentAnnotation(notes, instrument, timeRange) {
  if (instrument.includes("guitar"))
    return renderTabAnnotation(notes, guitarTuning);
  if (instrument.includes("bass"))
    return renderTabAnnotation(notes, bassTuning);
  if (instrument.includes("trumpet")) {
    const range = timeRange ?? {
      startMs: notes[0]?.timeMs ?? 0,
      endMs: notes.at(-1)?.timeMs ?? 1,
    };
    const span = Math.max(1, range.endMs - range.startMs);
    return `<div class="valves aligned-valves">${notes
      .map((note) => {
        const f = trumpetFingering(note.midi[0]);
        const x =
          84 +
          Math.max(0, Math.min(1, (note.timeMs - range.startMs) / span)) * 572;
      return `<span data-time="${note.timeMs}" style="left:${x}px"><b>${midiName(note.midi[0])}</b><i class="${f.includes("1") ? "on" : ""}"></i><i class="${f.includes("2") ? "on" : ""}"></i><i class="${f.includes("3") ? "on" : ""}"></i></span>`;
      })
      .join("")}</div>`;
  }
  if (instrument.includes("flute") || instrument.includes("recorder")) {
    return renderWindAnnotation(notes, instrument, timeRange);
  }
  if (instrument.includes("drums")) {
    return `<div class="drums">${notes.map((note) => `<span>${secondsLabel(note.timeMs)} ${note.midi.map((midi) => ({ 36: "kick", 38: "snare", 42: "hat", 49: "crash" })[midi] ?? "hit").join("/")}</span>`).join("")}</div>`;
  }
  if (instrument.includes("vocal")) {
    return `<div class="vocal">${notes.map((note) => `<span>${secondsLabel(note.timeMs)} cue ${midiName(note.midi[0])}</span>`).join("")}</div>`;
  }
  return `<div class="labels">${notes.map((note) => `<span>${secondsLabel(note.timeMs)} ${note.midi.map(midiName).join("/")}</span>`).join("")}</div>`;
}

function renderWindAnnotation(notes, instrument, timeRange) {
  const kind = instrument.includes("flute") ? "flute" : "recorder";
  const range = timeRange ?? {
    startMs: notes[0]?.timeMs ?? 0,
    endMs: notes.at(-1)?.timeMs ?? 1,
  };
  const activeStart = 84;
  const activeEnd = 656;
  const span = Math.max(1, range.endMs - range.startMs);
  return `<div class="wind-diagrams ${kind}-diagrams">${notes.filter(note=>note.midi.length)
    .map((note) => {
      const x =
        activeStart +
        Math.max(0, Math.min(1, (note.timeMs - range.startMs) / span)) *
          (activeEnd - activeStart);
      if(kind === "recorder") return `<span data-time="${note.timeMs}" style="left:${x}px"><b>${midiName(note.midi[0])}</b>${recorderFingeringSvg(note.midi[0])}</span>`;
      return `<span data-time="${note.timeMs}" style="left:${x}px"><b>${midiName(note.midi[0])}</b>${fluteFingeringSvg(note.midi[0],{assetBase:pathToFileURL(join(repoRoot,"public/user-songs/sources/")).href+"/"})}</span>`;
    })
    .join("")}</div>`;
}

function roleFor(song, memberName) {
  return song.roles.find((role) => role.player === memberName);
}

function notesForInstrument(events, instrument, indexOffset = 0, title = "") {
  return compilePart(events, instrument, title, indexOffset).map((note) => ({
    ...note,
    midi: writtenPitches(note.midi, instrument),
  }));
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size)
    chunks.push(values.slice(index, index + size));
  return chunks.length ? chunks : [[]];
}

function musicSystemsForInstrument(events, instrument, title = "") {
  const fullWindMelody = (title.toLowerCase().includes("jerusalem") && ["flute", "recorder"].includes(instrument)) || (title.toLowerCase() === "silent night" && instrument === "flute");
  const limit = Math.min(
    instrument.includes("trumpet") || instrument.includes("guitar") || fullWindMelody ? 12 : eventsPerSystem,
    Math.max(1, Math.ceil(events.length / systemsPerPage)),
  );
  return chunk(events, limit);
}

function renderScoreBlock(
  title,
  notes,
  instrument,
  keySignature = defaultKeySignature(),
  compact = false,
  selected = false,
  timeSignature = { beats: 4, beatUnit: 4 },
) {
  const clef =
    instrument.includes("bass") || instrument.includes("drums")
      ? "bass"
      : "treble";
  const staff = !instrument.includes("drums")
    ? renderGrandStaff(notes, keySignature, compact, timeSignature)
    : renderStaff(notes, {
        clef,
        height: compact ? 78 : 118,
        keySignature,
        compact,
        timeSignature,
      });
  return `<section class="score-block ensemble-block${selected ? " selected-part" : ""}"><h3>${escapeHtml(title)}</h3><span class="time-signature">${timeSignature.beats}/${timeSignature.beatUnit}</span>${staff}${renderInstrumentAnnotation(notes, instrument)}</section>`;
}

function renderGuitarStrumSystem(chart,range,active) {
  const meter=meterAt(chart,range.startMs),beatMs=range.quarterMs*4/meter.beatUnit;
  const left=28,right=652,span=Math.max(1,range.endMs-range.startMs,meter.beats*beatMs*4);
  const strums=active?guitarStrumsForChart(chart,range.endMs).filter(s=>s.timeMs>=range.startMs-.01):[];
  const x=time=>left+(time-range.startMs)/span*(right-left);
  const changes=active?chordChangesForChart(chart).filter(c=>c.timeMs>=range.startMs-.01 && c.timeMs<range.endMs-.01):[];
  const bars=range.measures.filter(t=>t>=range.startMs-.01 && t<=range.endMs+.01);
  const unique=[...new Map(changes.map(c=>[c.chord,c])).values()];
  const diagramHtml=unique.map(c=>{const shape=guitarChordForChart(chart,c.chord);return `<div class="strum-change"><b>${escapeHtml(c.chord)}</b>${shape?`<div class="guitar-chord-box" data-small="1" data-compact="1" data-chord="${dataAttr(shape)}"></div>`:""}</div>`;}).join("");
  const positions=strums.map(s=>[s.timeMs,x(s.timeMs)]);
  const groups=[];
  for(let time=range.startMs;time<range.startMs+span-.01;time+=beatMs){
    const played=strums.filter(s=>s.timeMs>=time-.01&&s.timeMs<time+beatMs-.01);
    const names=[...new Set(played.map(s=>s.chord).filter(Boolean))];
    const barStart=time>=range.endMs-.01?range.startMs+Math.floor((time-range.startMs)/beatMs/meter.beats)*beatMs*meter.beats:bars.filter(t=>t<=time+.01).at(-1)??range.startMs;
    groups.push({time,names:names.join("/"),beat:Math.round((time-barStart)/beatMs)+1,pattern:played.map(s=>s.direction==="D"?"↓":s.direction==="U"?"↑":"·").join("")});
  }
  const columns=groups.map(g=>{const center=x(g.time)+beatMs/span*(right-left)/2;return `<g data-time="${g.time}"><text x="${center}" y="11" text-anchor="middle" font-size="7" fill="#777">${g.beat}</text><text x="${center}" y="25" text-anchor="middle" font-size="9" font-weight="bold">${escapeHtml(g.names||"–")}</text><text x="${center}" y="39" text-anchor="middle" font-size="9">${g.pattern}</text></g>`;}).join("");
  return `<div class="packet-system music-system instrument-guitar compact-guitar"><div class="guitar-strum-grid" data-time-start="${range.startMs}" data-time-end="${range.endMs}" data-active-start="${left}" data-active-end="${x(range.endMs)}" data-positions="${dataAttr(positions)}"><svg viewBox="0 0 680 46" role="img" aria-label="Guitar chords and condensed strumming">${bars.map(t=>`<line x1="${x(t)}" x2="${x(t)}" y1="1" y2="44" stroke="#aaa"/>`).join("")}${columns}</svg></div><div class="strum-changes">${diagramHtml}</div></div>`;
}

function rehearsalSections(chart) {
  const lyrics = chart.rehearsalLyrics ?? [];
  const accompaniment = chart.guitarArrangement;
  if (!lyrics.length || !accompaniment) return [];
  const starts = [];
  let quarter = accompaniment.startQuarter;
  for (const section of accompaniment.sections) {
    starts.push(quarter * 60000 / accompaniment.bpm);
    quarter += section.chords.reduce((total, chord) => total + chord.beats, 0);
  }
  const sourceEnd = Math.max(1, ...chart.tracks.flatMap(track => track.events).map(event => event.timeMs + event.durationMs));
  const arrangementEnd = Math.max(1, quarter * 60000 / accompaniment.bpm);
  return lyrics.map((lyric, index) => ({
    ...lyric,
    startMs: (starts[index] ?? 0) / arrangementEnd * sourceEnd,
    endMs: (starts[index + 1] ?? arrangementEnd) / arrangementEnd * sourceEnd,
    chords: accompaniment.sections[index]?.chords ?? [],
  }));
}

function rehearsalSectionForRange(chart, range) {
  return rehearsalSections(chart).find(section =>
    range.startMs < section.endMs && range.endMs > section.startMs,
  );
}

function renderBeatLyrics(chart, range, width = scoreWidth, beatAligned = false) {
  const phrases = buildKaraokePhrases(chart).filter(
    (lyric) => lyric.timeMs >= range.startMs - 0.01 && lyric.timeMs < range.endMs - 0.01,
  );
  if (!phrases.length) return "";
  const span = Math.max(1, range.endMs - range.startMs);
  const positions = phrases.map((phrase, index) => {
    const inset = Math.round(width * 0.04);
    const usableWidth = width - inset * 2;
    const idealStart = inset + ((phrase.timeMs - range.startMs) / span) * usableWidth;
    // Keep a late lyric inside its system. The estimate is deliberately
    // conservative so lyric text remains readable instead of being clipped.
    const lyricWidth = phrase.text.length * 5.4;
    const start = Math.min(idealStart, width - inset - lyricWidth);
    return `<text${beatAligned ? ` class="complete-lyric" data-beat="${timeToBeat(chart, phrase.timeMs)}" data-time="${phrase.timeMs}"` : ""} x="${start.toFixed(1)}" y="12">${escapeHtml(phrase.text)}</text>`;
  }).join("");
  return `<svg class="beat-lyrics" viewBox="0 0 ${width} 19" role="img" aria-label="Lyrics aligned to reference timing">${positions}</svg>`;
}

function renderRehearsalReference(chart, range) {
  const section = rehearsalSectionForRange(chart, range);
  const heading = section ? `<b>${escapeHtml(section.label)}</b>` : "";
  const lyrics = renderBeatLyrics(chart, range);
  return heading || lyrics ? `<div class="rehearsal-reference">${heading}${lyrics}</div>` : "";
}

function renderGuitarSongSheet(chart) {
  return `<div class="guitar-song-sheet">${rehearsalSections(chart).map(section => {
    const seen = new Set();
    const changes = section.chords.filter(change => !seen.has(change.chord) && seen.add(change.chord));
    let elapsedBeats = 0;
    const blocks = section.chords.map((change) => {
      const startBar = Math.floor(elapsedBeats / 4) + 1;
      const endBar = Math.floor((elapsedBeats + change.beats - 1) / 4) + 1;
      const beatLabel = change.beats === 8
        ? `bars ${startBar}–${endBar} · 8 beats`
        : change.beats === 4
          ? `bar ${startBar} · 4 beats`
          : `bar ${startBar}, beat ${(elapsedBeats % 4) + 1} · ${change.beats} beats`;
      elapsedBeats += change.beats;
      return `<li><b>${escapeHtml(change.chord)}</b><span>${beatLabel}</span></li>`;
    }).join("");
    return `<section class="guitar-lyric-section"><h3>${escapeHtml(section.label)}</h3><ol class="guitar-chord-blocks">${blocks}</ol><div class="guitar-section-body"><div class="guitar-lyrics">${section.lines.map(line => `<p>${escapeHtml(line)}</p>`).join("")}</div><div class="guitar-section-chords">${changes.map(change => { const shape = guitarChordForChart(chart, change.chord); return `<div class="song-sheet-chord"><b>${escapeHtml(change.chord)}</b>${shape ? `<div class="guitar-chord-box" data-compact="1" data-chord="${dataAttr(shape)}"></div>` : ""}</div>`; }).join("")}</div></div></section>`;
  }).join("")}</div>`;
}

function referenceChordChanges(chart) {
  return rehearsalSections(chart).flatMap((section) => {
    const totalBeats = section.chords.reduce((sum, chord) => sum + chord.beats, 0);
    let elapsedBeats = 0;
    return section.chords.map((chord) => {
      const timeMs = section.startMs + ((section.endMs - section.startMs) * elapsedBeats) / totalBeats;
      elapsedBeats += chord.beats;
      return { ...chord, timeMs };
    });
  });
}

function chordLaneTheme(chart) {
  const title = chart.title.toLowerCase();
  if (title.includes("how far")) return { tone: "#0f766e", tint: "#ccfbf1" };
  if (title.includes("drivers")) return { tone: "#6d28d9", tint: "#ede9fe" };
  if (title.includes("landslide")) return { tone: "#b45309", tint: "#fef3c7" };
  return { tone: "#1d4ed8", tint: "#dbeafe" };
}

function renderCompleteChordLane(chart, range, width = completeScoreWidth) {
  // The user-supplied chord sheets contain horizontal chord placement above
  // each lyric. Prefer those cues in Complete view; fall back to the arranged
  // beat map for charts without an imported chord sheet.
  const source = chart.lyricChordCues?.length ? chart.lyricChordCues : referenceChordChanges(chart);
  const changes = source.filter(
    (change) => change.timeMs >= range.startMs - 0.01 && change.timeMs < range.endMs - 0.01,
  );
  if (!changes.length) return `<div class="complete-chord-lane complete-chord-empty"><span>—</span></div>`;
  const theme = chordLaneTheme(chart);
  const cues = changes.map((change) => {
    const index = source.indexOf(change);
    const beat = change.beat ?? timeToBeat(chart, change.timeMs);
    const next = source[index + 1];
    const durationBeats = Math.max(1, Math.round(change.beats ?? ((next?.beat ?? beat + 4) - beat)));
    const startBar = Math.floor(beat / 4) + 1;
    const endBar = Math.floor((beat + durationBeats - 1) / 4) + 1;
    const durationLabel = durationBeats === 4
      ? `M${startBar} · 4 beats`
      : `M${startBar}–${endBar} · ${durationBeats} beats`;
    const shape = guitarChordForChart(chart, change.chord);
    const symbol = shape
      ? `<div class="guitar-chord-box" data-complete="1" data-chord="${dataAttr(shape)}"></div>`
      : "";
    const endMs = next?.timeMs ?? change.timeMs + durationBeats * (60000 / tempoAt(chart, change.timeMs));
    return { diagram: `<div class="complete-chord-cue"><b>${escapeHtml(change.chord)}</b>${symbol}</div>`, block: `<div class="complete-chord-block" data-beat="${beat}" data-duration-beats="${durationBeats}" data-start-time="${change.timeMs}" data-end-time="${endMs}"><i class="complete-chord-progress"></i><b>${escapeHtml(change.chord)}</b><span>${durationLabel}</span></div>` };
  });
  const measures = range.measures.slice(0, -1).map((time, index) => `<i class="complete-measure-line" data-beat="${timeToBeat(chart, time)}"><span>${Math.floor(timeToBeat(chart, time) / 4) + 1}</span></i>`).join("");
  return `<div class="complete-chord-lane" style="--chord-tone:${theme.tone};--chord-tint:${theme.tint}"><div class="complete-cue-row" data-cue-row style="grid-template-columns:repeat(${cues.length},minmax(0,1fr))">${cues.map((cue) => cue.diagram).join("")}</div><div class="complete-chord-timeline" data-chord-timeline>${measures}${cues.map((cue) => cue.block).join("")}</div></div>`;
}

function pianoChordDiagram(chord) {
  const match = /^([A-G])([#b]?)(.*)$/.exec(chord);
  if (!match) return "";
  const root = ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 })[match[1]] + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0);
  const quality = match[3];
  const intervals = /maj7/.test(quality) ? [0, 4, 7, 11] : /m7/.test(quality) ? [0, 3, 7, 10] : /m/.test(quality) ? [0, 3, 7] : /6/.test(quality) ? [0, 4, 7, 9] : /7/.test(quality) ? [0, 4, 7, 10] : [0, 4, 7];
  // Keep the displayed keyboard fixed at C3–B4, centered around middle C.
  // Chord roots stay in octave 3 so the named root remains the lowest
  // highlighted tone (for example Bb3–D4–F4).
  const rootMidi = 48 + ((root + 120) % 12);
  const naturalPitchClasses = new Set([0, 2, 4, 5, 7, 9, 11]);
  const whites = Array.from({ length: 24 }, (_, index) => 48 + index)
    .filter((midi) => naturalPitchClasses.has(midi % 12));
  const active = new Set(intervals.map((interval) => rootMidi + interval));
  const whiteWidth = 5.4;
  // Show one useful voicing only. Rendering both octaves doubles every pitch
  // marker and reads as an over-stuffed chord rather than a playable shape.
  const dot = (midi, x, y) => active.has(midi) ? `<circle cx="${x}" cy="${y}" r="${midi === rootMidi ? 2.35 : 1.9}" fill="${midi === rootMidi ? "#c81e2b" : "#38bdf8"}" stroke="#ffffff" stroke-width=".45"/>` : "";
  const white = whites.map((midi, index) => `<rect x="${index * whiteWidth}" y="0" width="${whiteWidth - .35}" height="34" fill="#fff" stroke="#334155" stroke-width=".45"/>${dot(midi, index * whiteWidth + whiteWidth / 2, 27)}`).join("");
  const black = whites.slice(0, -1).map((midi, index) => {
    const sharp = midi + 1;
    if (whites[index + 1] - midi !== 2) return "";
    return `<rect x="${(index + 1) * whiteWidth - 1.7}" y="0" width="3.2" height="20" rx=".4" fill="#172435"/>${dot(sharp, (index + 1) * whiteWidth - .1, 16)}`;
  }).join("");
  return `<svg class="piano-chord-diagram" viewBox="0 0 76 35" role="img" aria-label="${escapeHtml(chord)} piano chord">${white}${black}</svg>`;
}

function renderCompletePianoChordLane(chart, range) {
  const source = chart.pianoChordCues ?? [];
  const changes = source.filter((change) => change.timeMs >= range.startMs - .01 && change.timeMs < range.endMs - .01);
  if (!changes.length) return "";
  const theme = chordLaneTheme(chart);
  const cues = changes.map((change) => {
    const index = source.indexOf(change), next = source[index + 1];
    const beat = change.beat ?? timeToBeat(chart, change.timeMs);
    const durationBeats = Math.max(1, Math.round((next?.beat ?? beat + 4) - beat));
    const endMs = next?.timeMs ?? change.timeMs + durationBeats * 60000 / tempoAt(chart, change.timeMs);
    return { diagram: `<div class="complete-piano-chord-cue"><b>${escapeHtml(change.chord)}</b>${pianoChordDiagram(change.chord)}</div>`, block: `<div class="complete-piano-chord-block" data-beat="${beat}" data-duration-beats="${durationBeats}" data-start-time="${change.timeMs}" data-end-time="${endMs}"><i class="complete-chord-progress"></i><b>${escapeHtml(change.chord)}</b><span>${durationBeats} beats</span></div>` };
  });
  const measures = range.measures.slice(0, -1).map((time) => `<i class="complete-measure-line" data-beat="${timeToBeat(chart, time)}"><span>${Math.floor(timeToBeat(chart, time) / 4) + 1}</span></i>`).join("");
  const cueRows = Math.ceil(cues.length / 6);
  const timelineTop = cueRows * 70 + 2;
  const laneHeight = timelineTop + 60;
  return `<div class="complete-piano-chord-lane" style="--chord-tone:${theme.tone};--chord-tint:${theme.tint};--piano-lane-height:${laneHeight}px"><div class="complete-cue-row complete-piano-cue-row" data-cue-row style="grid-template-columns:repeat(${Math.min(cues.length, 6)},minmax(0,1fr))">${cues.map((cue) => cue.diagram).join("")}</div><div class="complete-piano-chord-timeline" data-chord-timeline style="top:${timelineTop}px">${measures}${cues.map((cue) => cue.block).join("")}</div></div>`;
}

function completeMelodyNotes(chart) {
  const melodyTrack = chart.tracks.find((track) => track.instrument === "vocals");
  if (!melodyTrack) return [];
  return melodyTrack.events
    .filter((event) => event.expected?.midi?.length)
    .map((event) => ({
      id: `melody-${event.id}`,
      sourceEventId: event.id,
      timeMs: event.timeMs,
      durationMs: event.durationMs,
      beat: event.beat,
      durationBeats: event.durationBeats,
      midi: [Math.max(...event.expected.midi)],
      tuplet: event.tuplet,
      tieNext: event.tieNext,
      tiePrevious: event.tiePrevious,
    }));
}

function renderCompleteSystem(chart, notes, melody, range) {
  const key = writtenKey(keySignatureAt(chart, range.startMs), "piano");
  const meter = meterAt(chart, range.startMs);
  const melodyStaff = melody.length
    ? `<div class="complete-melody"><div class="complete-part-label">Lead vocal melody — sing this line</div>${renderStaff(melody, { clef: "treble", height: 70, width: completeScoreWidth, compact: true, keySignature: key, timeSignature: meter, timeRange: range, timePositioned: true })}</div>`
    : "";
  return `<div class="complete-system" data-time-start="${range.startMs}" data-time-end="${range.endMs}" data-beat-start="${range.beatStart}" data-beat-end="${range.beatEnd}"><div class="complete-section">${escapeHtml(rehearsalSectionForRange(chart, range)?.label ?? "")}</div>${melodyStaff}<div class="complete-rhythm"><div class="complete-part-label">Rhythm Piano</div>${renderGrandStaff(notes, key, true, meter, range, true, false, 70, completeScoreWidth)}</div>${renderCompletePianoChordLane(chart, range)}<div class="complete-lyric-chord-lane">${renderCompleteChordLane(chart, range, completeScoreWidth)}${renderBeatLyrics(chart, range, completeScoreWidth, true)}</div></div>`;
}

function completeReferencePages(song, songIndex) {
  const chart = chartForInstrument(loadChart(song), "piano");
  if (!chart) throw new Error(`Complete view needs a piano chart: ${song.title}`);
  const events = compileChartPart(chart, "piano");
  const melodyEvents = completeMelodyNotes(chart);
  const endMs = Math.max(...chart.tracks.flatMap((track) => track.events).map((event) => event.timeMs + event.durationMs));
  const barLines = measureBoundaries(chart, endMs);
  const lyricStarts = (chart.lyrics ?? []).map((lyric) => lyric.timeMs).sort((a, b) => a - b);
  const systems = [];
  for (let start = 0; start < endMs - 0.01;) {
    const meter = meterAt(chart, start);
    const targetEnd = Math.min(endMs, start + meter.beats * (60000 / tempoAt(chart, start)) * 3);
    // Do not split a supplied lyric/chord line. This can make a system a
    // little longer than three bars, but keeps source chord placement,
    // words, and the music they reference together.
    const nextLyricStart = lyricStarts.find((time) => time > targetEnd + 0.01);
    const end = nextLyricStart ?? targetEnd;
    const range = {
      startMs: start,
      endMs: end,
      beatStart: timeToBeat(chart, start),
      beatEnd: timeToBeat(chart, end),
      measures: [start, ...barLines.filter((time) => time > start + 0.01 && time < end - 0.01), end],
      quarterMs: 60000 / tempoAt(chart, start),
    };
    const notes = events.filter((note) => note.timeMs >= start - 0.01 && note.timeMs < end - 0.01);
    const melody = melodyEvents.filter((note) => note.timeMs >= start - 0.01 && note.timeMs < end - 0.01);
    systems.push({ range, notes: notes.length ? notes : [{ timeMs: range.startMs, durationMs: range.endMs - range.startMs, midi: [] }], melody });
    start = end;
  }
  const pages = chunk(systems, 2);
  return pages.map((page, pageIndex) => {
    const lines = page.map(({ range, notes, melody }) => renderCompleteSystem(chart, notes, melody, range));
    while (lines.length < 2) lines.push(`<div class="complete-system complete-empty-system"></div>`);
    const referenceLabel = chart.guitarArrangement
      ? "Complete piano / vocal / guitar reference"
      : "Imported piano reference";
    return `<div class="page complete-page"><div class="top"><div><h1>${songIndex + 1}. ${escapeHtml(song.title)}</h1><p>${escapeHtml(song.artist)} · ${referenceLabel} · page ${pageIndex + 1} of ${pages.length}</p></div><p>${meterAt(chart, 0).beats}/${meterAt(chart, 0).beatUnit} · ${chart.guitarArrangement?.bpm ?? tempoAt(chart, 0)} BPM</p></div><p class="part-note">About three to five bars per line; systems extend to keep supplied lyric/chord lines together. Every played chord is shown as a diagram.</p><section class="complete-score">${lines.join("")}</section></div>`;
  }).join("");
}

function renderMusicSystem(
  notes,
  instrument,
  keySignature,
  timeSignature,
  timeRange,
  chart,
  mode = "music",
) {
  if(instrument === "guitar" && mode === "chords") return renderGuitarStrumSystem(chart,timeRange,notes.length>0);
  if(instrument === "guitar" && chart?.guitarArrangement) notes=notes.map(n=>({...n,midi:n.midi.map(p=>p-chart.capo)}));
  const common = {
    height: 104,
    compact: true,
    keySignature,
    timeSignature,
    timeRange,
    timePositioned: true,
    diagramGap:instrument === "flute" ? 34 : instrument === "recorder" ? 30 : 0,
  };
  let staff,
    annotation = "";
  if (instrument === "piano" || instrument === "keys") {
    staff = renderGrandStaff(
      notes,
      keySignature,
      true,
      timeSignature,
      timeRange,
      true,
      true,
    );
  } else if (instrument === "vocals") {
    const treble = renderStaff(
      notes.map((n) => ({
        ...n,
        midi: n.midi.map((p) => transposeIntoRange(p, 60, 81)),
      })),
      { ...common, clef: "treble" },
    );
    const bass = renderStaff(
      notes.map((n) => ({
        ...n,
        midi: n.midi.map((p) => transposeIntoRange(p, 48, 60)),
      })),
      { ...common, clef: "bass" },
    );
    const lyrics = (chart?.lyrics ?? []).filter(
      (l) => l.timeMs >= timeRange.startMs && l.timeMs < timeRange.endMs,
    );
    staff = `<div class="vocal-grand">${treble}<div class="lyrics-middle">${lyrics.length ? lyrics.map((l) => escapeHtml(l.text)).join(" · ") : "_______________________________"}</div>${bass}</div>`;
  } else {
    const clef =
      instrument === "drums"
        ? "percussion"
        : instrument === "bass"
          ? "bass"
          : "treble";
    staff = renderStaff(notes, { ...common, clef });
    if (instrument === "guitar" && mode !== "chords")
      annotation = renderTabAnnotation(notes, guitarTuning);
    else if (instrument === "bass")
      annotation = renderTabAnnotation(notes, bassTuning);
    else if (instrument === "guitar" && mode === "chords") {
      const changes = notes.length ? chordChangesForChart(chart) : [];
      const prior = changes.filter((c) => c.timeMs <= timeRange.startMs + .01).at(-1);
      const visible = [
        ...(prior
          ? [
              {
                ...prior,
                timeMs: timeRange.startMs,
                continued: prior.timeMs < timeRange.startMs,
              },
            ]
          : []),
        ...changes.filter(
          (c) => c.timeMs > timeRange.startMs + .01 && c.timeMs < timeRange.endMs - .01,
        ),
      ];
      annotation = `<div class="chord-transitions">${visible
        .map((change) => {
          const shape = guitarChordForChart(chart,change.chord);
          const x =
            84 +
            ((change.timeMs - timeRange.startMs) /
              Math.max(1, timeRange.endMs - timeRange.startMs)) *
              572;
          return `<div class="chord-transition" data-time="${change.timeMs}" style="left:${x}px"><b>${escapeHtml(change.chord)}${change.continued ? " (cont.)" : ""}</b>${shape ? `<div class="guitar-chord-box" data-small="1" data-chord="${dataAttr(shape)}"></div>` : ""}</div>`;
        })
        .join("")}</div>`;
    } else if (["trumpet", "flute", "recorder"].includes(instrument))
      annotation = renderInstrumentAnnotation(notes, instrument, timeRange);
  }
  const reference = ["piano", "keys", "vocals"].includes(instrument)
    ? renderRehearsalReference(chart, timeRange)
    : "";
  return `<div class="packet-system music-system instrument-${instrument}">${reference}${staff}${annotation}</div>`;
}

function renderPacketBlock(title, content, timeSignature) {
  return `<section class="score-block ensemble-block packet-part-block"><h3>${escapeHtml(title)}</h3><span class="time-signature">${timeSignature.beats}/${timeSignature.beatUnit}</span><div class="packet-systems">${content}</div></section>`;
}

function css() {
  return `
    @page { size: letter; margin: 0.45in; }
    @page complete { size: letter landscape; margin: 0.4in; }
    @font-face { font-family: "Bravura"; src: url("${Bravura}") format("woff2"); font-weight: 400; font-style: normal; }
    @font-face { font-family: "Academico"; src: url("${Academico}") format("woff2"); font-weight: 400; font-style: normal; }
    @font-face { font-family: "Academico"; src: url("${AcademicoBold}") format("woff2"); font-weight: 700; font-style: normal; }
    body { font-family: Helvetica, Arial, sans-serif; color: #111; margin: 0; }
    .page { break-after: page; min-height: 9.8in; }
    .top { display:flex; justify-content:space-between; gap:16px; border-bottom:1px solid #222; padding-bottom:8px; margin-bottom:12px; }
    h1 { font-size: 24px; margin: 0 0 4px; }
    h2 { font-size: 18px; margin: 0; }
    h3 { font-size: 13px; margin: 8px 0 2px; text-transform: uppercase; letter-spacing: .04em; }
    p, li { font-size: 10px; line-height: 1.35; }
    ul { padding-left: 15px; margin-top: 4px; }
    .grid { display:grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .card { border:1px solid #999; padding:8px; min-height:52px; }
    .score-block { border:1px solid #aaa; padding:8px; margin: 9px 0; page-break-inside: avoid; }
    .ensemble-page .top { margin-bottom: 7px; }
    .ensemble-page .top h1 { font-size: 19px; }
    .ensemble-page .role-note { margin: 0 0 5px; }
    .ensemble-score { display:grid; gap: 4px; }
    .ensemble-block { padding: 3px 6px; margin: 0; border-color: #b6b6b6; }
    .ensemble-block.selected-part { border: 2px solid #111; padding: 2px 5px; }
    .ensemble-block h3 { font-size: 9px; margin: 1px 0 0; letter-spacing: .03em; }
    .ensemble-block .vf-staff { min-height: 84px; height: auto; overflow: visible; }
    .ensemble-block .grand { display: grid; grid-template-rows: auto auto; row-gap: 0; }
    .ensemble-block .grand svg + svg { margin-top: 0; }
    .packet-part-block { position: relative; padding-top: 5px; }
    .packet-part-block h3 { padding-right: 40px; }
    .packet-part-block .time-signature { position: absolute; top: 4px; right: 7px; font-size: 9px; font-weight: 700; }
    .lyrics-middle { font-size:10px; text-align:center; height:20px; line-height:20px; overflow:visible; }
    .rehearsal-reference { margin: 2px 0 1px; color: #222; }
    .rehearsal-reference b { display:block; font-size: 8px; text-transform: uppercase; letter-spacing: .06em; }
    .beat-lyrics { display:block; width:680px; height:24px; overflow:visible; }
    .beat-lyrics text { font-family:Arial,sans-serif !important; font-size:10px; font-weight:600; dominant-baseline:middle; }
    .guitar-song-page { min-height: 0; }
    .guitar-song-sheet { columns: 2; column-gap: 14px; font-size: 8px; line-height: 1.22; }
    .guitar-lyric-section { break-inside: avoid; border-top: 1px solid #999; padding: 3px 0 5px; }
    .guitar-lyric-section h3 { margin: 0 0 2px; font-size: 9px; }
    .guitar-chord-blocks { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:2px 5px; padding:0; margin:0 0 4px; list-style:none; }
    .guitar-chord-blocks li { border:1px solid #bbb; padding:2px 3px; font-size:7px; line-height:1.15; }
    .guitar-chord-blocks b { display:block; font-size:8px; }
    .guitar-chord-blocks span { color:#444; white-space:nowrap; }
    .guitar-section-body { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px; }
    .guitar-lyrics p { margin: 0 0 2px; }
    .guitar-section-chords { display:flex; flex-wrap:wrap; align-content:start; gap:2px; max-width:102px; }
    .song-sheet-chord { font-size:7px; text-align:center; min-width:26px; }
    .song-sheet-chord .guitar-chord-box svg { width:29px !important; height:35px !important; }
    .complete-page { page:complete; min-height:7.7in; }
    .complete-page .top { margin-bottom: 5px; }
    .complete-page .part-note { margin-bottom: 3px; }
    .complete-score { border: 1px solid #aaa; padding: 4px 10px; }
    .complete-system { position:relative; height:400px; box-sizing:border-box; border-bottom:1px solid #c8c8c8; overflow:hidden; }
    .complete-system:last-child { border-bottom:0; }
    .complete-empty-system { opacity:.35; }
    .complete-section { height:13px; font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; }
    .complete-lyric-chord-lane { position:relative; width:${completeScoreWidth}px; max-width:100%; height:142px; }
    .complete-chord-lane { position:relative; height:126px; width:${completeScoreWidth}px; max-width:100%; overflow:visible; }
    .complete-piano-chord-lane { position:relative; height:132px; width:${completeScoreWidth}px; max-width:100%; overflow:visible; border-top:1px solid #d2dae5; }
    .complete-chord-empty { color:#999; font-size:10px; padding:12px 0 0 36px; }
    .complete-cue-row { position:absolute; top:0; display:grid; align-items:start; text-align:center; }
    .complete-chord-cue,.complete-piano-chord-cue { min-width:0; display:grid; justify-items:center; line-height:1; }
    .complete-chord-cue b,.complete-piano-chord-cue b { display:block; padding:0 0 2px; font-size:9px; line-height:10px; white-space:nowrap; }
    .complete-chord-cue .guitar-chord-box { height:72px; overflow:visible; }
    .complete-chord-cue .guitar-chord-box svg { width:58px !important; height:70px !important; }
    .complete-chord-timeline,.complete-piano-chord-timeline { position:absolute; box-sizing:border-box; border:1px solid var(--chord-tone,#53667f); border-radius:3px; background:repeating-linear-gradient(135deg,var(--chord-tint,#d9e5f2) 0 5px,#fff 5px 10px); overflow:hidden; }
    .complete-chord-timeline { top:88px; height:25px; }
    .complete-piano-chord-timeline { top:72px; height:28px; }
    .complete-chord-block,.complete-piano-chord-block { position:absolute; inset:0 auto 0 0; min-width:8px; border-right:1px solid var(--chord-tone,#53667f); background:var(--chord-tint,#dbeafe); overflow:hidden; }
    .complete-chord-block b,.complete-piano-chord-block b { position:relative; z-index:1; display:block; padding:3px 5px 0; color:var(--chord-tone,#172435); font:900 12px/1 Arial,sans-serif; white-space:nowrap; }
    .complete-chord-block span,.complete-piano-chord-block span { position:relative; z-index:1; display:block; padding:1px 5px; color:#172435; font:700 7px/1 Arial,sans-serif; white-space:nowrap; }
    .complete-measure-line { position:absolute; top:0; bottom:0; width:1px; background:var(--chord-tone,#53667f); z-index:2; }
    .complete-measure-line span { position:absolute; top:2px; left:2px; color:var(--chord-tone,#53667f); font:700 7px/1 Arial,sans-serif; font-style:normal; }
    .complete-chord-progress { position:absolute; inset:0 auto 0 0; width:0; background:#dc2626aa; transition:width 80ms linear; }
    .play-note-marker { display:none; fill:none; stroke:#dc2626; stroke-width:2.2px; pointer-events:none; }
    .play-note-marker.is-active { display:block; }
    .complete-chord i { font-size:16px; font-style:normal; line-height:21px; }
    .complete-piano-cue-row { grid-auto-rows:70px; }
    .piano-chord-diagram { width:123px; height:57px; overflow:visible; }
    .complete-piano-chord-timeline .complete-chord-progress { background:#c81e2baa; }
    .complete-system .vf-staff { width:${completeScoreWidth}px; min-height:86px; }
    .complete-system .vf-staff svg { width:100% !important; height:auto !important; }
    .complete-system .grand { margin:0; }
    .complete-part-label { height:12px; padding:1px 0 0 3px; color:#555; font:700 8px/1.1 Arial,sans-serif; text-transform:uppercase; letter-spacing:.06em; }
    .complete-melody { margin-bottom:2px; }
    .complete-melody .vf-staff { min-height:66px; }
    .complete-rhythm .vf-staff { min-height:70px; }
    .complete-system .beat-lyrics { position:relative; top:auto; left:0; width:${completeScoreWidth}px; height:27px; margin:0; overflow:visible; }
    .complete-system .beat-lyrics text { font-size:12px; }
    .guitar-strum-grid { width:680px; height:76px; }
    .guitar-strum-grid svg { width:680px; height:72px; }
    .strum-changes { display:flex; justify-content:space-around; height:116px; }
    .compact-guitar .guitar-strum-grid { height:48px; }
    .compact-guitar .guitar-strum-grid svg { height:46px; }
    .compact-guitar .strum-changes { height:86px; gap:3px; }
    .packet-system.music-system.compact-guitar { height:140px; }
    .strum-change { text-align:center; font-size:9px; }
    .chord-transitions { position:relative; height:116px; width:680px; }
    .chord-transition { position:absolute; top:0; font-size:9px; text-align:center; transform:translateX(-50%); }
    .part-note { min-height:15px; font-size:9px; margin:2px 0 6px; }
    .vocal-grand .vf-staff { min-height:78px; }
    .empty-system { opacity:.5; }
    .packet-systems { display: grid; gap: 0; }
    .packet-system { min-height: 54px; padding: 4px 0; box-sizing: border-box; break-inside: avoid; }
    .packet-system.music-system { min-height: 0; height:194px; overflow:visible; border-bottom:1px solid #ddd; }
    .packet-system.music-system.instrument-piano, .packet-system.music-system.instrument-keys, .packet-system.music-system.instrument-vocals { height:252px; }
    .packet-system .grand { margin-bottom: 2px; }
    .ensemble-block .tab-ann { margin: 0; padding: 3px 0; box-sizing: content-box; }
    .ensemble-block .labels, .ensemble-block .vocal, .ensemble-block .drums { gap: 5px; font-size: 7px; margin-top: 0; max-height: 16px; overflow: hidden; }
    .wind-diagrams { position:relative; width:${scoreWidth}px; height:68px; margin-top:3px; font-size:8px; overflow:visible; }
    .wind-diagrams.recorder-diagrams, .wind-diagrams.flute-diagrams { height:98px; }
    .flute-fingering-svg { width:28px; height:82px; }
    .recorder-fingering-svg { width:24px; height:82px; }
    .wind-diagrams > span { position:absolute; top:0; display:grid; justify-items:center; gap:2px; transform:translateX(-50%); }
    .wind-diagrams .wind-fingering { display:grid; justify-items:center; gap:1px; font-style:normal; }
    .wind-diagrams .wind-thumb { width:8px; height:8px; border:1px solid #111; border-radius:50%; display:block; }
    .wind-diagrams .wind-hole-stack { display:grid; grid-auto-flow:row; gap:2px; padding:1px 4px; border-left:1px solid #111; border-right:1px solid #111; }
    .wind-diagrams.flute-diagrams .wind-hole-stack { grid-auto-flow:column; gap:3px; padding:4px 5px; border-top:1px solid #111; border-bottom:1px solid #111; border-left:0; border-right:0; }
    .wind-diagrams .wind-hole-stack em { width:8px; height:8px; border:1px solid #111; border-radius:50%; display:block; }
    .wind-diagrams .wind-hole-stack em.on { background:#111; }
    svg { max-width: 100%; height: auto; display:block; }
    svg text.piano-note-name { font-family:Arial,sans-serif !important; font-size:11px; font-weight:600; fill:#222; paint-order:stroke; stroke:white; stroke-width:1.6px; stroke-linejoin:round; }
    .guitar-chord-box svg text { font-family:Helvetica,Arial,sans-serif !important; }
    svg text { font-family: "Bravura", "Academico", Helvetica, Arial, sans-serif !important; }
    .vf-staff { width: ${scoreWidth}px; max-width: 100%; min-height: 104px; }
    .grand svg + svg { margin-top: 0; }
    .tab-ann { width: ${scoreWidth}px; max-width:100%; height: auto; margin-top: -7px; overflow: visible; font-family: Menlo, Consolas, monospace; }
    .tab-ann line { stroke:#9a9a9a; stroke-width:0.55; }
    .tab-ann .tab-label { fill:#111; font-size:8px; font-weight:900; }
    .tab-ann .tab-fret { fill:#050505; stroke:#fff; stroke-width:3.4; paint-order:stroke fill; font-size:10px; font-weight:900; dominant-baseline:middle; }
    .valves, .labels, .vocal, .drums { display:flex; flex-wrap:wrap; gap:8px; font-size:9px; margin-top:4px; }
    .ensemble-block .aligned-valves { position:relative; display:block; width:${scoreWidth}px; height:46px; min-height:46px; margin-top:6px; overflow:visible; }
    .aligned-valves span { position:absolute; top:0; transform:translateX(-50%); }
    .valves span { display:inline-grid; grid-template-rows:auto 9px 9px 9px; justify-items:center; gap:1px; }
    .valves i { width:7px; height:7px; border:1px solid #111; border-radius:50%; display:block; }
    .valves i.on { background:#111; }
    .overview { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .instrument-set-list { margin-bottom: 9px; }
    .instrument-set-list h3 { margin-bottom: 4px; }
    .instrument-set-list .card { margin-bottom: 4px; min-height: 0; }
  `;
}

function browserVexFlowScript() {
  return `
    <script src="${pathToFileURL(join(repoRoot,"node_modules/vexflow/build/cjs/vexflow-bravura.js")).href}"></script>
    <script>
      (() => {
        const VF = window.VexFlow;
        const naturalPitchClasses = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
        function keyAccidentals(fifths = 0) {
          const accidentals = { c: 0, d: 0, e: 0, f: 0, g: 0, a: 0, b: 0 };
          const sharpOrder = ["f", "c", "g", "d", "a", "e", "b"];
          const flatOrder = ["b", "e", "a", "d", "g", "c", "f"];
          if (fifths > 0) sharpOrder.slice(0, fifths).forEach((letter) => { accidentals[letter] = 1; });
          if (fifths < 0) flatOrder.slice(0, Math.abs(fifths)).forEach((letter) => { accidentals[letter] = -1; });
          return accidentals;
        }
        function spellMidi(midi, signature) {
          const pitchClass = ((midi % 12) + 12) % 12;
          const octave = Math.floor(midi / 12) - 1;
          const signatureAccidentals = keyAccidentals(signature.fifths);
          for (const [letter, natural] of Object.entries(naturalPitchClasses)) {
            const accidental = signatureAccidentals[letter] ?? 0;
            if (((natural + accidental) % 12 + 12) % 12 === pitchClass) return { key: letter + "/" + octave, accidental: null };
          }
          const preferFlats = signature.fifths < 0;
          const spellings = preferFlats
            ? [["c",0],["db",1],["d",2],["eb",3],["e",4],["f",5],["gb",6],["g",7],["ab",8],["a",9],["bb",10],["b",11]]
            : [["c",0],["c#",1],["d",2],["d#",3],["e",4],["f",5],["f#",6],["g",7],["g#",8],["a",9],["a#",10],["b",11]];
          const name = (spellings.find(([, pc]) => pc === pitchClass) ?? ["c"])[0];
          const letter = name[0];
          const writtenAccidental = name.includes("#") ? 1 : name.includes("b") ? -1 : 0;
          const signatureAccidental = signatureAccidentals[letter] ?? 0;
          const accidental = writtenAccidental === signatureAccidental ? null : writtenAccidental === 0 ? "n" : writtenAccidental > 0 ? "#" : "b";
          return { key: name + "/" + octave, accidental };
        }
        function staffTimeX(host,time,left,right) {
          const start=Number(host.dataset.timeStart), end=Number(host.dataset.timeEnd);
          const points=JSON.parse(host.dataset.positions||"[]");
          const all=new Map([[start,left],...points,[end,right]]);
          const sorted=[...all].sort((a,b)=>a[0]-b[0]);
          for(let i=1;i<sorted.length;i++) if(time<=sorted[i][0]) {
            const [a,x]=sorted[i-1],[b,y]=sorted[i];
            return x+(time-a)/Math.max(1,b-a)*(y-x);
          }
          return right;
        }
        function staffBeatX(host, beat, left, right) {
          const start=Number(host.dataset.beatStart), end=Number(host.dataset.beatEnd);
          const points=JSON.parse(host.dataset.beatPositions||"[]");
          const all=new Map([[start,left],...points,[end,right]]);
          const sorted=[...all].sort((a,b)=>a[0]-b[0]);
          for(let i=1;i<sorted.length;i++) if(beat<=sorted[i][0]) {
            const [a,x]=sorted[i-1],[b,y]=sorted[i];
            return x+(beat-a)/Math.max(.0001,b-a)*(y-x);
          }
          return right;
        }
        function addMeasureBars(host, stave) {
          const svg = host.querySelector("svg");
          if (!svg) return;
          const start = Number(host.dataset.timeStart), end = Number(host.dataset.timeEnd);
          const left = stave.getNoteStartX(), right = stave.getX() + stave.getWidth() - 12;
          for (const time of JSON.parse(host.dataset.measures || "[]")) {
            if (time <= start || time >= end) continue;
            const x = staffTimeX(host,time,left,right);
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("class", "vex-measure-bar");
            line.setAttribute("x1",String(x)); line.setAttribute("x2",String(x));
            line.setAttribute("y1",String(stave.getTopLineTopY())); line.setAttribute("y2",String(stave.getBottomLineBottomY()));
            line.setAttribute("stroke","#222"); line.setAttribute("stroke-width","1");
            svg.appendChild(line);
          }
        }
        function fitStaffViewport(host, width, height, tickables = []) {
          const svg = host.querySelector("svg");
          // VexFlow's note bounds describe the engraving. SVG text getBBox()
          // includes the music font's oversized em box, not just visible ink.
          const bounds = tickables.map(note => note.getBoundingBox()).filter(Boolean);
          const top = Math.min(0, ...bounds.map(box => Math.floor(box.getY() - 4)));
          const bottom = Math.max(height, ...bounds.map(box => Math.ceil(box.getY() + box.getH() + 4)));
          svg.setAttribute("viewBox", "0 " + top + " " + width + " " + (bottom - top));
          svg.setAttribute("height", String(bottom - top));
          svg.style.height = "84px";
          // Keep VexFlow's natural proportions. Stretching the SVG to fill a
          // short row makes noteheads and clefs look flattened.
          svg.setAttribute("preserveAspectRatio", "xMinYMin meet");
          svg.style.overflow = "visible";
        }
        const staffTieLinks = ${staffTieLinks.toString()};
        const rhythmicValue = ${rhythmicValue.toString()};
        const beamGroups = ${beamGroups.toString()};
        function renderStaff(host) {
          const notes = JSON.parse(host.dataset.notes || "[]");
          const signature = JSON.parse(host.dataset.key || '{"key":"C","fifths":0}');
          const clef = host.dataset.clef || "treble";
          const compact = host.dataset.compact === "1";
          const width = Number(host.dataset.width || 680);
          const height = Number(host.dataset.height || 118);
          const timePositioned = host.dataset.timePositioned === "1";
          host.innerHTML = "";
          const renderer = new VF.Renderer(host, VF.Renderer.Backends.SVG);
          renderer.resize(width, height);
          const context = renderer.getContext();
          const stave = new VF.Stave(12, compact ? 0 : 18, width - 24).addClef(clef);
          if(clef !== "percussion") stave.addKeySignature(signature.key || "C");
          stave.addTimeSignature((host.dataset.beats || "4") + "/" + (host.dataset.beatUnit || "4"));
          if (timePositioned && clef !== "percussion") {
            const otherClef = new VF.Stave(12, 10, width - 24).addClef(clef === "treble" ? "bass" : "treble").addKeySignature(signature.key || "C").addTimeSignature((host.dataset.beats || "4") + "/" + (host.dataset.beatUnit || "4"));
            stave.setNoteStartX(Math.max(stave.getNoteStartX(), otherClef.getNoteStartX(), 84) + 12);
          }
          stave.setContext(context).draw();
          const tickables = notes.map((note) => {
            const spellings = (note.midi || []).slice(0, 6).map((midi) => clef === "percussion" ? {key: ({36:"f/4",38:"c/5",42:"g/5/x2",49:"a/5/x2"})[midi] || "g/5/x2",accidental:null} : spellMidi(midi, signature));
            const value = note.tuplet === 3 ? {duration:"8",dots:0} : rhythmicValue(note.durationMs, Number(host.dataset.quarterMs || 600));
            const staveNote = new VF.StaveNote({
              clef,
              keys: spellings.length ? spellings.map((spelling) => spelling.key) : [clef === "bass" ? "c/3" : "c/4"],
              duration: value.duration + (!note.midi.length ? "r" : ""),
              autoStem: !note.stemDirection && clef !== "percussion",
              stemDirection: note.stemDirection === "up" ? VF.Stem.UP : note.stemDirection === "down" ? VF.Stem.DOWN : clef === "percussion" ? VF.Stem.UP : undefined,
            });
            if(value.dots) VF.Dot.buildAndAttach([staveNote], {all:true});
            spellings.forEach((spelling, index) => {
              if (spelling.accidental) staveNote.addModifier(new VF.Accidental(spelling.accidental), index);
            });
            return staveNote;
          });
          if (!tickables.length) { addMeasureBars(host, stave); fitStaffViewport(host, width, height); return; }
          const voice = new VF.Voice({ numBeats: Number(host.dataset.beats || 4), beatValue: Number(host.dataset.beatUnit || 4) }).setStrict(false);
          voice.addTickables(tickables);
          new VF.Formatter().joinVoices([voice]).format([voice], width - 120);
          if (timePositioned) {
            const firstTime = Number(host.dataset.timeStart ?? notes[0]?.timeMs ?? 0);
            const lastTime = Number(host.dataset.timeEnd || notes.at(-1)?.timeMs || firstTime + 1);
            const firstBeat = Number(host.dataset.beatStart ?? notes[0]?.beat ?? 0);
            const lastBeat = Number(host.dataset.beatEnd || notes.at(-1)?.beat || firstBeat + 1);
            const timeSpan = Math.max(1, lastTime - firstTime);
            const beatSpan = Math.max(.0001, lastBeat - firstBeat);
            const activeStart = stave.getNoteStartX();
            const activeEnd = stave.getX() + stave.getWidth() - 12;
            host.dataset.activeStart = String(activeStart);
            host.dataset.activeEnd = String(activeEnd);
            const positions=notes.map(note=>activeStart+Math.max(0,Math.min(1,((note.beat ?? firstBeat)-firstBeat)/beatSpan))*(activeEnd-activeStart));
            const gap=host.dataset.grand === "1" ? 0 : Math.min(Number(host.dataset.diagramGap)||(notes.some(n=>n.chord)?96:18),(activeEnd-activeStart)/Math.max(1,positions.length));
            for(let i=1;i<positions.length;i++)positions[i]=Math.max(positions[i],positions[i-1]+gap);
            if(positions.at(-1)>activeEnd-8){positions[positions.length-1]=activeEnd-8;for(let i=positions.length-2;i>=0;i--)positions[i]=Math.min(positions[i],positions[i+1]-gap);}
            host.dataset.positions=JSON.stringify(notes.map((note,i)=>[note.timeMs,positions[i]]));
            host.dataset.beatPositions=JSON.stringify(notes.map((note,i)=>[note.beat ?? (firstBeat + (note.timeMs-firstTime)/timeSpan*beatSpan),positions[i]]));
            tickables.forEach((tickable,index)=>tickable.getTickContext().setX(positions[index]-activeStart-12));
          }
          const tuplets=[];
          for(let i=0;i<notes.length-2;i++)if(notes[i].tuplet===3 && notes[i+1].tuplet===3 && notes[i+2].tuplet===3) {tuplets.push(new VF.Tuplet(tickables.slice(i,i+3),{numNotes:3,notesOccupied:2,bracketed:false}));i+=2;}
          const beams = beamGroups(notes, Number(host.dataset.quarterMs || 600), {beats:Number(host.dataset.beats||4),beatUnit:Number(host.dataset.beatUnit||4)}, JSON.parse(host.dataset.measures||"[]")).map(group => new VF.Beam(group.map(i=>tickables[i])));
          voice.draw(context, stave);
          beams.forEach(beam => beam.setContext(context).draw());
          tuplets.forEach(tuplet=>tuplet.setContext(context).draw());
          staffTieLinks(notes).forEach(link=>new VF.StaveTie({firstNote:link.from===null?undefined:tickables[link.from],lastNote:link.to===null?undefined:tickables[link.to],firstIndexes:link.fromIndices,lastIndexes:link.toIndices}).setContext(context).draw());
          const playbackSvg = host.querySelector("svg");
          if (playbackSvg) notes.forEach((note, noteIndex) => {
            if (!note.midi?.length) return;
            const heads = tickables[noteIndex].noteHeads || [];
            const ys = tickables[noteIndex].getYs();
            heads.forEach((head, headIndex) => {
              const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
              ring.setAttribute("class", "play-note-marker");
              ring.dataset.start = String(note.timeMs);
              ring.dataset.end = String(note.timeMs + note.durationMs);
              ring.setAttribute("cx", String(head.getAbsoluteX() + head.getWidth() / 2));
              ring.setAttribute("cy", String(ys[headIndex]));
              ring.setAttribute("r", "7");
              playbackSvg.appendChild(ring);
            });
          });
          if(host.dataset.noteNames === "1") {
            const svg=host.querySelector("svg");
            const namedInMeasure=new Set();
            notes.forEach((note,index)=>{
              const heads=tickables[index].noteHeads, ys=tickables[index].getYs();
              const placed=[];
              (note.midi||[]).slice(0,6).forEach((midi,keyIndex)=>{
                // An annotated practice score should identify the pitch, not
                // stamp the same name on every repeated accompaniment hit.
                const measure=note.measure ?? Math.floor((note.beat ?? 0)/4)+1;
                const labelKey=measure+":"+midi;
                if(namedInMeasure.has(labelKey)) return;
                namedInMeasure.add(labelKey);
                const spelling=spellMidi(midi,signature).key.split("/")[0];
                const letter=spelling[0];
                const modifier=spelling.length>1?spelling.slice(1):keyAccidentals(signature.fifths)[letter]===1?"#":keyAccidentals(signature.fifths)[letter]===-1?"b":"";
                const name=letter.toUpperCase()+modifier.replace("b","♭").replace("#","♯");
                const head=heads[keyIndex]; if(!head)return;
                const y=ys[keyIndex];
                const shift=placed.some(p=>Math.abs(p.y-y)<13 && p.shift===0)?17:0;placed.push({y,shift});
                const label=document.createElementNS("http://www.w3.org/2000/svg","text");
                label.setAttribute("class","piano-note-name");label.setAttribute("data-midi",String(midi));label.setAttribute("data-time",String(note.timeMs));
                label.setAttribute("x",String(head.getAbsoluteX()+head.getWidth()+3+shift));label.setAttribute("y",String(y+3.5));label.textContent=name;svg.appendChild(label);
              });
            });
          }
          addMeasureBars(host, stave);
          fitStaffViewport(host, width, height, tickables);
        }
        async function renderAll() {
          // Do not block first paint on font downloads. The rehearsal player
          // needs the staff geometry immediately for its synchronized cursor;
          // VexFlow can render with the bundled music font while any optional
          // web font continues to settle in the background.
          document.querySelectorAll(".vf-staff").forEach(renderStaff);
          document.querySelectorAll(".music-system").forEach(system => {
            const staff = system.querySelector(".vf-staff");
            if (!staff?.dataset.activeStart) return;
            const start = Number(staff.dataset.activeStart), end = Number(staff.dataset.activeEnd);
            const first = Number(staff.dataset.timeStart), span = Math.max(1, Number(staff.dataset.timeEnd) - first);
            system.querySelectorAll(".aligned-valves > span[data-time], .wind-diagrams > span[data-time], .chord-transition[data-time]").forEach(diagram => {
              diagram.style.left = (staffTimeX(staff, Number(diagram.dataset.time), start, end) + 5) + "px";
            });
            system.querySelectorAll('.tab-ann .tab-fret[data-time]').forEach(fret => {
              fret.setAttribute('x', String(staffTimeX(staff, Number(fret.dataset.time), start, end)+5));
            });
            system.querySelectorAll('.tab-ann line').forEach(line => {line.setAttribute('x1',String(start));line.setAttribute('x2',String(end));});
            system.querySelectorAll('.tab-ann .tab-label').forEach(label => label.setAttribute('x',String(start-13)));
          });
          document.querySelectorAll(".complete-system").forEach(system => {
            const staff = system.querySelector(".vf-staff");
            if (!staff?.dataset.activeStart) return;
            const start = Number(staff.dataset.activeStart), end = Number(staff.dataset.activeEnd);
            const beatStart = Number(staff.dataset.beatStart), beatEnd = Number(staff.dataset.beatEnd);
            system.querySelectorAll("[data-cue-row], [data-chord-timeline]").forEach(element => {
              element.style.left = start + "px";
              element.style.width = Math.max(1, end - start) + "px";
            });
            system.querySelectorAll(".complete-measure-line[data-beat]").forEach(line => {
              line.style.left = (staffBeatX(staff, Number(line.dataset.beat), start, end) - start) + "px";
            });
            system.querySelectorAll(".complete-chord-block[data-beat], .complete-piano-chord-block[data-beat]").forEach(chord => {
              const chordStart = staffBeatX(staff, Number(chord.dataset.beat), start, end);
              const chordEnd = staffBeatX(staff, Math.min(beatEnd, Number(chord.dataset.beat) + Number(chord.dataset.durationBeats ?? 4)), start, end);
              chord.style.left = (chordStart - start) + "px";
              chord.style.width = Math.max(8, chordEnd - chordStart) + "px";
            });
            let previousLyricEnd = start - 8;
            system.querySelectorAll(".complete-lyric[data-beat]").forEach(lyric => {
              let x = staffBeatX(staff, Number(lyric.dataset.beat), start, end);
              let width = lyric.getComputedTextLength();
              if (x < previousLyricEnd + 8) x = previousLyricEnd + 8;
              if (x + width > end - 3) {
                lyric.style.fontSize = "10px";
                width = lyric.getComputedTextLength();
                x = Math.min(x, end - width - 3);
              }
              lyric.setAttribute("x", String(Math.max(start, x)));
              previousLyricEnd = Math.max(previousLyricEnd, x + width);
            });
          });
          document.documentElement.dataset.vexflowReady = "true";
        }
        renderAll();
      })();
    </script>
  `;
}

function overviewPage(member) {
  const instrumentOrder = [
    "guitar",
    "bass",
    "piano",
    "keys",
    "drums",
    "vocals",
    "flute",
    "recorder",
    "trumpet",
  ];
  const instrumentGroups = new Map();
  data.rehearsalSongs.forEach((song, index) => {
    song.roles
      .filter((role) => role.player === member.name)
      .forEach((role) => {
        const instrument = (
          role.instrument ??
          role.part ??
          "part"
        ).toLowerCase();
        const key =
          instrumentOrder.find((name) => instrument.includes(name)) ??
          instrument;
        if (!instrumentGroups.has(key)) instrumentGroups.set(key, []);
        instrumentGroups.get(key).push({ song, role, index: index + 1 });
      });
  });
  const orderedGroups = [...instrumentGroups.entries()].sort(([a], [b]) => {
    const ai = instrumentOrder.indexOf(a);
    const bi = instrumentOrder.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  const setLists = orderedGroups
    .map(
      ([instrument, songs]) =>
        `<section class="instrument-set-list"><h3>${escapeHtml(instrument)} set list</h3>${songs.map(({ song, role, index }) => `<div class="card"><b>${index}. ${escapeHtml(song.title)}</b><p>${escapeHtml(song.artist)} - ${escapeHtml(role.part ?? role.instrument ?? "part")}</p><p>${escapeHtml(role.notes ?? song.status)}</p></div>`).join("")}</section>`,
    )
    .join("");
  return `<div class="page"><div class="top"><div><h1>${escapeHtml(member.name)} Packet</h1><p>Instrument set lists, equipment, and rendered parts</p></div><p>${escapeHtml(member.instruments.join(" / "))}</p></div>
    <div class="overview"><section><h3>Instrument set lists</h3>${setLists}</section>
    <section><h3>Equipment</h3><ul>${member.equipment.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><h3>Shared gear</h3><ul>${data.sharedEquipment.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section></div></div>`;
}

function partPages(song, songIndex, instrument, label, mode = "music") {
  const chart = chartForInstrument(loadChart(song),instrument);
  if (!chart) throw new Error(`Missing chart: ${song.title}`);
  const events = chartEvents(chart);
  const suppliedGuitar=instrument === "guitar" && chart.guitarArrangement;
  const accompaniment = isPianoChordAccompaniment(chart,instrument) || suppliedGuitar;
  const compiledAccompaniment = compileChartPart(chart,instrument);
  if (instrument === "guitar" && mode === "chords" && chart.rehearsalLyrics?.length) {
    return `<div class="page ensemble-page part-page guitar-song-page" data-instrument="guitar" data-mode="chords"><div class="top"><div><h1>${songIndex + 1}. ${escapeHtml(song.title)}</h1><p>${escapeHtml(song.artist)} · ${escapeHtml(label)} · capo ${chart.capo ?? 0}</p></div><p>Guitar chord sheet</p></div><p class="part-note">Each chord block states exactly where to hold it. “Bars 1–2 · 8 beats” means repeat the 4/4 strum pattern for both bars; four-beat blocks use it once.</p>${renderGuitarSongSheet(chart)}</div>`;
  }
  let systems = musicSystemsForInstrument(events, instrument, song.title);
  if(instrument === "guitar" && mode === "chords") {
    const end=suppliedGuitar?Math.max(...compiledAccompaniment.map(n=>n.timeMs+n.durationMs)):Math.max(...events.map(e=>e.timeMs+e.durationMs));
    const bars=measureBoundaries(chart,end).filter(t=>t<end-.01);bars.push(end);
    const count=4;
    const slices=[];for(let index=0;index<bars.length-1;){const size=index===0&&chart.pickupQuarters?5:count;const stop=Math.min(index+size,bars.length-1);slices.push([index,stop]);index=stop;}
    systems=slices.map(([index,stop])=>{
      const startMs=bars[index],endMs=bars[stop];
      const slice=[{timeMs:startMs,durationMs:endMs-startMs,midi:[]}];slice.startMs=startMs;slice.endMs=endMs;return slice;
    });
  }
  else if(suppliedGuitar) { systems=chunk(compiledAccompaniment,4); }
  else if(instrument !== "guitar") {
    const end=Math.max(...chart.tracks.flatMap(track=>track.events).map(event=>event.timeMs+event.durationMs));
    const bars=measureBoundaries(chart,end).filter(time=>time<end-.001);bars.push(end);
    systems=chunk(bars.slice(0,-1),["flute","recorder"].includes(instrument)?1:2).map((times,index)=>{
      const size=["flute","recorder"].includes(instrument)?1:2;
      const startMs=times[0],endMs=bars[index*size+times.length];
      const slice=compiledAccompaniment.filter(note=>note.timeMs>=startMs-.001 && note.timeMs<endMs-.001);
      if(!slice.length)slice.push({id:`rest-${startMs}`,timeMs:startMs,durationMs:endMs-startMs,midi:[]});
      slice.startMs=startMs;slice.endMs=endMs;return slice;
    });
  }
  // A grand staff is materially taller than a single staff. Two systems keep
  // the engraved piano/vocal reference inside letter-page margins.
  const systemsOnPage = ["piano", "keys", "vocals"].includes(instrument) ? 2 : systemsPerPage;
  const pages = chunk(systems, systemsOnPage);
  const guide=suppliedGuitar ? `<div class="page part-page"><h1>${escapeHtml(song.title)} — guitar chord guide</h1><p>Capo ${chart.capo}. All shapes and TAB relative to capo. Timed notation below is an estimated practice guide; follow the supplied sheet for lyric alignment.</p>${chart.guitarArrangement.sections.map(section=>`<p><b>${escapeHtml(section.label)}</b>: ${section.chords.map(c=>escapeHtml(c.chord)).join(" · ")}</p>`).join("")}${chart.guitarArrangement.riffs.map(r=>`<p>${escapeHtml(r.label)}</p><pre>${escapeHtml(r.tab)}</pre>`).join("")}<p>Source: ${escapeHtml(chart.guitarArrangement.sourceUrl.split("/").at(-1))}</p></div>` : "";
  return guide + pages
    .map((pageEvents, pageIndex) => {
      const content = pageEvents.map((eventSlice) => {
        const startMs = eventSlice.startMs ?? eventSlice[0]?.timeMs ?? 0;
        const endMs = eventSlice.endMs ??
          (eventSlice.at(-1)?.timeMs ?? 0) +
          (eventSlice.at(-1)?.durationMs ?? 1);
        const range = {
          startMs,
          endMs,
          measures: measureBoundaries(chart, endMs),
          quarterMs: 60000 / tempoAt(chart, startMs),
        };
        const notes = instrument !== "guitar" || accompaniment || (instrument === "guitar" && mode === "chords") ? eventSlice : notesForInstrument(
          eventSlice,
          instrument,
          events.indexOf(eventSlice[0]),
          song.title,
        );
        return renderMusicSystem(
          notes,
          instrument,
          writtenKey(keySignatureAt(chart, startMs), instrument),
          meterAt(chart, startMs),
          range,
          chart,
          mode,
        );
      });
      while (content.length < systemsOnPage)
        content.push(
          `<div class="packet-system music-system empty-system">${renderMusicSystem([], instrument, writtenKey(keySignatureAt(chart, 0), instrument), meterAt(chart, 0), { startMs: 0, endMs: 1, quarterMs: 60000 / tempoAt(chart, 0), measures: [] }, chart, mode).replace(/^<div[^>]*>|<\/div>$/g, "")}</div>`,
        );
      const note = suppliedGuitar ? `Capo ${chart.capo} · chord names and TAB relative to capo · ${chart.guitarArrangement.bpm} BPM. Supplied PDF chords; estimated practice timing. Chord names are grouped by beat; each ↓/↑ is a strum, · skips a subdivision. Four full measures per row; opening pickup included. ${chart.guitarArrangement.timingNotes ?? ""} ${chart.guitarArrangement.strumming.map(s=>s.label+": "+s.pattern).join("; ")}` :
        instrument === "guitar" && mode === "chords"
          ? chart.chordChanges?.length
            ? "Chord changes from the encoded chart."
            : "Suggested chords with practice downstrokes on each beat; verify in rehearsal."
          : accompaniment
            ? "Piano accompaniment transcribed from the supplied nine-page score; original right and left hands, voices, rhythms and ties."
          : instrument === "vocals" && !chart.lyrics?.length
            ? "Lyrics are not present in this encoded source; the center line is reserved for the lyric text."
            : song.id === "jerusalem-parry" && ["flute", "recorder"].includes(instrument)
              ? "Full trumpet melody and rhythm, one octave above trumpet concert pitch (A4–D6)."
            : instrument === "drums"
              ? "Drum key: kick = bottom space; snare = third space; hi-hat/crash = × above staff."
              : "";
      const layoutNote = ["piano", "keys", "vocals"].includes(instrument)
        ? "Two grand-staff systems per page · lyric phrases are aligned to the supplied chord-section timing."
        : "Four systems per page · follow the printed meter and measure bars.";
      return `<div class="page ensemble-page part-page" data-instrument="${instrument}" data-mode="${mode}"><div class="top"><div><h1>${songIndex + 1}. ${escapeHtml(song.title)}</h1><p>${escapeHtml(song.artist)} · ${escapeHtml(label)} · page ${pageIndex + 1} of ${pages.length}</p></div><p>${escapeHtml(instrument)}${mode === "chords" ? " chords" : instrument === "guitar" ? " + TAB" : ""}</p></div><p class="part-note">${escapeHtml(note || layoutNote)}</p>${renderPacketBlock(label, content.join(""), meterAt(chart, 0))}</div>`;
    })
    .join("");
}
function simplifiedGuitarChartPage(song, { capo = 0, titleSuffix = "" } = {}) {
  const chart = loadChart(song);
  const guide = chart?.simplifiedGuitarArrangement;
  if (!guide) return "";
  const shapeChart = capo === 4 && guide.capo4Shapes
    ? { ...chart, guitarArrangement: { ...chart.guitarArrangement, shapes: { ...chart.guitarArrangement.shapes, ...guide.capo4Shapes } } }
    : chart;
  const sections = guide.sections.map((section) => {
    const progression = section.progression.map((chord) => {
      const shape = guitarChordForChart(shapeChart, chord);
      return `<div class="simple-chord-cell"><b>${escapeHtml(chord)}</b>${shape ? `<div class="guitar-chord-box" data-chord="${dataAttr(shape)}"></div>` : ""}</div>`;
    }).join("");
    const loops = Array.from({ length: section.repeats }, (_, index) => `<div class="simple-loop"><span class="simple-loop-number">${section.repeats > 1 ? `${index + 1}.` : ""}</span>${progression}</div>`).join("");
    return `<section class="simple-guitar-section"><h2>${escapeHtml(section.label)}</h2>${loops}</section>`;
  }).join("");
  return `<div class="page simple-guitar-page"><div class="top"><div><h1>${escapeHtml(song.title)} — simplified guitar chords${escapeHtml(titleSuffix)}</h1><p>Four-chord practice chart · capo ${capo} · ${guide.tempoBpm} BPM</p></div><p>Guitar</p></div><div class="simple-guitar-box"><p><b>Section loops:</b> verses and choruses use four simplified chords; pre-choruses use the alternate four-chord turn; the final chorus lifts.</p><p>${escapeHtml(guide.strumPattern)} All chord names and diagrams are relative to capo ${capo}.</p>${sections}</div><p class="simple-guitar-note">${escapeHtml(guide.note)}</p></div>`;
}

function songPages(member) {
  return data.rehearsalSongs
    .flatMap((song, index) => {
      const role = roleFor(song, member.name);
      if (!role) return [];
      const instrument = role.instrument.includes("guitar")
        ? "guitar"
        : role.instrument;
      return [
        partPages(song, index, instrument, `${member.name} — ${role.part}`),
        ...(instrument === "guitar"
          ? [
              partPages(
                song,
                index,
                instrument,
                `${member.name} — chords`,
                "chords",
              ),
            ]
          : []),
      ];
    })
    .join("");
}

function instrumentMatchesLine(roleInstrument, lineInstrument) {
  const role = roleInstrument.toLowerCase();
  if (lineInstrument === "guitar") return role.includes("guitar");
  if (lineInstrument === "vocals") return role.includes("vocal");
  if (lineInstrument === "piano" || lineInstrument === "keys")
    return role.includes("keys") || role.includes("piano");
  return role.includes(lineInstrument);
}

function instrumentOverviewPage(instrument, label) {
  const songs = data.rehearsalSongs
    .map((song, index) => ({
      song,
      index: index + 1,
      role: song.roles.find((role) =>
        instrumentMatchesLine(role.instrument ?? role.part ?? "", instrument),
      ),
    }))
    .filter(({ role }) => role);
  const cards = songs
    .map(
      ({ song, index, role }) =>
        `<div class="card"><b>${index}. ${escapeHtml(song.title)}</b><p>${escapeHtml(song.artist)} - ${escapeHtml(role.part ?? role.instrument ?? label)}</p><p>${escapeHtml(role.notes ?? song.status)}</p></div>`,
    )
    .join("");
  return `<div class="page"><div class="top"><div><h1>${escapeHtml(label)} Packet</h1><p>Instrument set list and rendered parts</p></div><p>${songs.length} songs</p></div><section><h3>${escapeHtml(label)} set list</h3>${cards || "<p>No assigned songs yet.</p>"}</section><section><h3>Shared gear</h3><ul>${data.sharedEquipment.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section></div>`;
}

function instrumentSongPages(instrument, label, mode = "music") {
  return (instrument === "recorder" ? recorderReferencePage() : instrument === "flute" ? fluteReferencePage() : "") + data.rehearsalSongs
    .flatMap((song, index) =>
      song.roles.some((role) =>
        instrumentMatchesLine(role.instrument, instrument),
      )
        ? [partPages(song, index, instrument, label, mode)]
        : [],
    )
    .join("");
}

function fluteReferencePage() {
  return `<div class="page"><h1>Flute fingering guide</h1><p>Diagrams follow Basic Flute Fingering Chart by Karen Evans Moratz (Flute For Dummies / Wiley), supplied by the user. Black keys are pressed; outlined keys are released. Each diagram is rotated: left-hand keys appear above right-hand and footjoint keys. Thumb and side keys are included.</p><p>Fingerings are specific to the printed octave. B♭ uses the first alternative shown in the source (left index plus right index); other alternatives remain in the original reference PDF.</p><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:24px">${Array.from({length:24},(_,i)=>`<figure style="margin:0;text-align:center"><b>${midiName(i+60)}</b><div>${fluteFingeringSvg(i+60,{assetBase:pathToFileURL(join(repoRoot,"public/user-songs/sources/")).href+"/"})}</div></figure>`).join('')}</div><p>Full original chart: public/user-songs/sources/flute-fingering-reference.pdf. No open license is asserted.</p></div>`;
}

function recorderReferencePage() {
  return `<div class="page"><h1>Baroque recorder fingering reference</h1><p>Thumb 0 · left hand 1–3 · right hand 4–7. Filled = covered; white = open. Lower double holes show partial covering. A white crescent on the thumb means vent slightly. * Cover the bell.</p><p>Written C4–E♭6; C soprano sounds an octave above the written labels. These are Baroque fingerings, not German-system fingerings.</p><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:22px">${Array.from({length:28},(_,i)=>`<figure style="margin:0;text-align:center"><b>${midiName(i+60)}</b><div>${recorderFingeringSvg(i+60,{width:39,height:126,labels:true})}</div></figure>`).join('')}</div><p>Reference: user-provided American Recorder Society Fingering Chart for Soprano Recorder. Original PDF retained under public/user-songs/sources.</p></div>`;
}

function guitarChordReferencePages() {
  return chunk(printableChordReference, 12)
    .map(
      (chords, index) =>
        `<div class="page"><h1>Guitar chord reference — ${index + 1}</h1><p>Official VexChords demo shapes plus standard barre shapes. Finger numbers 1–4; standard tuning, low E to high E. ○ open · × muted · thick line = barre. Reference shapes; follow the score for timing.</p><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:24px">${chords.map((chord) => `<figure style="margin:0;text-align:center"><b>${escapeHtml(chord.id)}</b><div class="guitar-chord-box" data-chord="${dataAttr(chord)}" style="display:flex;justify-content:center"></div></figure>`).join("")}</div></div>`,
    )
    .join("");
}
function guitarChordScript() {
  const library = buildSync({
    stdin: {
      contents: 'export { draw } from "vexchords";',
      resolveDir: repoRoot,
    },
    bundle: true,
    write: false,
    format: "iife",
    globalName: "vexchords",
    minify: true,
  }).outputFiles[0].text;
  return `<script>${library}</script><script>const vexChordData = ${vexChordData.toString()}; const vexChordOptions = ${vexChordOptions.toString()}; document.querySelectorAll('.guitar-chord-box').forEach(host => { const chord = JSON.parse(host.dataset.chord); vexchords.draw(host, vexChordData(chord), host.dataset.complete ? {...vexChordOptions(true),width:58,height:70} : host.dataset.compact ? {...vexChordOptions(true),width:58,height:70} : vexChordOptions(!!host.dataset.small)); });</script>`;
}

function packetHtml(member) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(member.name)} packet</title><style>${css()}</style></head><body>${overviewPage(member)}${member.instruments.some((i) => i.includes("guitar")) ? guitarChordReferencePages() : ""}${songPages(member)}${browserVexFlowScript()}${guitarChordScript()}</body></html>`;
}

function instrumentPacketHtml(instrument, label, mode = instrument === "guitar" ? "chords" : "music") {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(label)} packet</title><style>${css()}</style></head><body>${instrumentOverviewPage(instrument, label)}${instrument === "guitar" && mode !== "chords" ? guitarChordReferencePages() : ""}${instrumentSongPages(instrument, label, mode)}${browserVexFlowScript()}${guitarChordScript()}</body></html>`;
}

function masterHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Master packet</title><style>${css()}</style></head><body><div class="page"><div class="top"><div><h1>Master Set List</h1><p>Scoreboard rehearsal packet</p></div><p>${data.rehearsalSongs.length} songs</p></div><h3>Set order</h3><ul>${data.rehearsalSongs.map((song, index) => `<li>${index + 1}. ${escapeHtml(song.title)} - ${escapeHtml(song.artist)} (${escapeHtml(song.status)})</li>`).join("")}</ul><h3>Band roster</h3><div class="grid">${data.bandMembers.map((member) => `<div class="card"><b>${escapeHtml(member.name)}</b><p>${escapeHtml(member.instruments.join(" / "))}</p></div>`).join("")}</div><h3>Equipment manifest</h3><ul>${data.sharedEquipment.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div></body></html>`;
}

function printPdf(htmlPath, pdfPath) {
  if (process.argv.includes("--web")) return;
  if (!existsSync(chromePath)) {
    throw new Error(`Chrome not found at ${chromePath}`);
  }
  // Snap Chromium is confined to the user's home directory and cannot load
  // file:// assets under /repos. Stage both the page and VexFlow when needed.
  const stageForSnap = chromePath.startsWith("/snap/");
  let printableHtml = htmlPath;
  let printablePdf = pdfPath;
  if (stageForSnap) {
    const stagingDir = resolve(process.env.PDF_STAGING_DIR ?? "/home/jjk/pluck-n-play-pdf-build");
    const vexflowSource = join(repoRoot, "node_modules/vexflow/build/cjs/vexflow-bravura.js");
    const stagedVexflow = join(stagingDir, "vexflow-bravura.js");
    mkdirSync(stagingDir, { recursive: true });
    copyFileSync(vexflowSource, stagedVexflow);
    printableHtml = join(stagingDir, basename(htmlPath));
    printablePdf = join(stagingDir, basename(pdfPath));
    writeFileSync(
      printableHtml,
      readFileSync(htmlPath, "utf8").replaceAll(
        pathToFileURL(vexflowSource).href,
        pathToFileURL(stagedVexflow).href,
      ),
    );
  }
  execFileSync(
    chromePath,
    [
      "--headless",
      "--disable-gpu",
      ...(process.env.CHROME_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=3000",
      "--no-pdf-header-footer",
      `--print-to-pdf=${printablePdf}`,
      pathToFileURL(printableHtml).href,
    ],
    { stdio: "ignore" },
  );
  if (stageForSnap) copyFileSync(printablePdf, pdfPath);
}

const instrumentPackets = [
  ["guitar", "Guitar"],
  ["bass", "Bass"],
  ["piano", "Piano"],
  ["drums", "Drums"],
  ["vocals", "Vocals"],
  ["trumpet", "Trumpet"],
  ["flute", "Flute"],
  ["recorder", "Recorder"],
];
const selectedArg=process.argv.find(arg=>arg.startsWith("--instruments="));
const selected=selectedArg?.split("=")[1].split(",");
if(selected) {
 for(const instrument of selected) {
  const definition=instrumentPackets.find(([id])=>id===instrument);
  if(!definition) throw Error(`Unknown instrument: ${instrument}`);
  const label=instrument==="guitar"?"Guitar chords":definition[1];
  const file=instrument==="guitar"?"guitar-chords-packet":`${instrument}-packet`;
  const htmlPath=join(htmlDir,`${file}.html`);
  writeFileSync(htmlPath,instrumentPacketHtml(instrument,label));
  printPdf(htmlPath,join(outputDir,`${file}.pdf`));
 }
 console.log(`Wrote only ${selected.length} instrument PDFs to ${outputDir}`);
} else if(!process.argv.includes("--web")) {
const masterPath = join(htmlDir, "master-setlist-and-equipment.html");
writeFileSync(masterPath, masterHtml());
printPdf(masterPath, join(outputDir, "master-setlist-and-equipment.pdf"));

for (const member of data.bandMembers) {
  const htmlPath = join(htmlDir, `${slugify(member.name)}-player-packet.html`);
  const pdfPath = join(outputDir, `${slugify(member.name)}-player-packet.pdf`);
  writeFileSync(htmlPath, packetHtml(member));
  printPdf(htmlPath, pdfPath);
}


for (const [instrument, label] of instrumentPackets) {
  const htmlPath = join(htmlDir, `${slugify(instrument)}-packet.html`);
  const pdfPath = join(outputDir, `${slugify(instrument)}-packet.pdf`);
  writeFileSync(htmlPath, instrumentPacketHtml(instrument, label));
  printPdf(htmlPath, pdfPath);
  if (instrument === "guitar") {
    const tabPath=join(htmlDir,"guitar-tab-packet.html");
    writeFileSync(tabPath,instrumentPacketHtml(instrument,"Guitar TAB","music"));
    printPdf(tabPath,join(outputDir,"guitar-tab-packet.pdf"));
  }
}

const assignments = data.rehearsalSongs
  .map(
    (song, index) =>
      `<div class="page"><h1>${index + 1}. ${escapeHtml(song.title)}</h1><p>${escapeHtml(song.artist)}</p><h3>Instrument assignments</h3>${song.roles.map((role) => `<div class="card"><b>${escapeHtml(role.player)} — ${escapeHtml(role.instrument)}</b><p>${escapeHtml(role.part)}</p><p>${escapeHtml(role.notes)}</p></div>`).join("")}</div>`,
  )
  .join("");
const masterPartsHtml = masterHtml().replace(
  "</body>",
  `${assignments}${guitarChordReferencePages()}${instrumentPackets.map(([instrument, label]) => instrumentSongPages(instrument, label)).join("")}${browserVexFlowScript()}${guitarChordScript()}</body>`,
);
const masterPartsPath = join(htmlDir, "master-all-instrument-parts.html");
const chordHtmlPath = join(htmlDir, "guitar-chords-packet.html");
writeFileSync(
  chordHtmlPath,
  `<!doctype html><html><head><meta charset="utf-8"><style>${css()}</style></head><body>${instrumentOverviewPage("guitar", "Guitar chords")}${instrumentSongPages("guitar", "Guitar chords", "chords")}${browserVexFlowScript()}${guitarChordScript()}</body></html>`,
);
printPdf(chordHtmlPath, join(outputDir, "guitar-chords-packet.pdf"));
const simpleMoana = data.rehearsalSongs.find((song) => song.id === "how-far-ill-go");
if (simpleMoana) {
  const simpleMoanaHtmlPath = join(htmlDir, "how-far-ill-go-simple-guitar-chords.html");
  writeFileSync(simpleMoanaHtmlPath, `<!doctype html><html><head><meta charset="utf-8"><style>${css()}</style></head><body>${simplifiedGuitarChartPage(simpleMoana)}${guitarChordScript()}</body></html>`);
  printPdf(simpleMoanaHtmlPath, join(outputDir, "how-far-ill-go-simple-guitar-chords.pdf"));
}

// A shared rehearsal booklet: the imported piano score, vocal reference, and
// supplied guitar chord diagrams for the two songs that have all three sources.
const pianoVocalReferenceSongs = new Set(["how-far-ill-go", "olivia-rodrigo-drivers-license"]);
const pianoVocalReferenceHtml = data.rehearsalSongs
  .flatMap((song, index) => {
    if (!pianoVocalReferenceSongs.has(song.id)) return [];
    return [
      partPages(song, index, "piano", "Piano — grand staff with lyric reference"),
      partPages(song, index, "vocals", "Vocals — lyric reference"),
      partPages(song, index, "guitar", "Guitar — chord diagrams", "chords"),
    ];
  })
  .join("");
const pianoVocalReferencePath = join(htmlDir, "moana-drivers-license-piano-vocal-reference.html");
writeFileSync(
  pianoVocalReferencePath,
  `<!doctype html><html><head><meta charset="utf-8"><title>Piano and vocal reference</title><style>${css()}</style></head><body>${pianoVocalReferenceHtml}${browserVexFlowScript()}${guitarChordScript()}</body></html>`,
);
printPdf(pianoVocalReferencePath, join(outputDir, "moana-drivers-license-piano-vocal-reference.pdf"));

for (const [songId, filename] of [
  ["how-far-ill-go", "moana-how-far-ill-go-complete.pdf"],
  ["olivia-rodrigo-drivers-license", "drivers-license-complete.pdf"],
  ["fleetwood-mac-landslide", "landslide-complete.pdf"],
]) {
  const songIndex = data.rehearsalSongs.findIndex((song) => song.id === songId);
  const song = data.rehearsalSongs[songIndex];
  const htmlPath = join(htmlDir, filename.replace(/\.pdf$/, ".html"));
  writeFileSync(
    htmlPath,
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(song.title)} complete reference</title><style>${css()}</style></head><body>${completeReferencePages(song, songIndex)}${browserVexFlowScript()}${guitarChordScript()}</body></html>`,
  );
  printPdf(htmlPath, join(outputDir, filename));
}

// Standalone piano practice scores. Piano rendering includes note-name labels
// on the engraved grand staff, making these the annotated counterparts to the
// Complete piano/vocal/guitar references above.
for (const [songId, filename] of [
  ["how-far-ill-go", "moana-how-far-ill-go-piano-annotated.pdf"],
  ["olivia-rodrigo-drivers-license", "drivers-license-piano-annotated.pdf"],
  ["fleetwood-mac-landslide", "landslide-piano-annotated.pdf"],
]) {
  const songIndex = data.rehearsalSongs.findIndex((song) => song.id === songId);
  const song = data.rehearsalSongs[songIndex];
  const htmlPath = join(htmlDir, filename.replace(/\.pdf$/, ".html"));
  writeFileSync(
    htmlPath,
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(song.title)} annotated piano</title><style>${css()}</style></head><body>${partPages(song, songIndex, "piano", "Piano — annotated note names")}${browserVexFlowScript()}${guitarChordScript()}</body></html>`,
  );
  printPdf(htmlPath, join(outputDir, filename));
}
writeFileSync(
  masterPartsPath,
  masterPartsHtml.replace(
    browserVexFlowScript(),
    `${instrumentSongPages("guitar", "Guitar chords", "chords")}${browserVexFlowScript()}`,
  ),
);
printPdf(masterPartsPath, join(outputDir, "master-all-instrument-parts.pdf"));

if (!process.argv.includes("--web")) console.log(
  `Wrote ${data.bandMembers.length + instrumentPackets.length + 4} VexFlow PDFs to ${outputDir}`,
);

}

// The website uses these same rendered parts and the same compilation as PDFs.
function writeWebScores() {
  const webDir = join(repoRoot, "public/rendered-scores");
  const publicBase = (process.env.VITE_BASE ?? "/").replace(/\/?$/, "/");
  const renderedScoreBase = `${publicBase}rendered-scores/`;
  const userSongSourceBase = `${publicBase}user-songs/sources/`;
  mkdirSync(webDir, {recursive:true});
  copyFileSync(join(repoRoot,"node_modules/vexflow/build/cjs/vexflow-bravura.js"),join(webDir,"vexflow.js"));
  const entries=[];
  for (const [instrument,label] of instrumentPackets) {
    for (const [index,song] of data.rehearsalSongs.entries()) {
      if (!song.roles.some(role=>instrumentMatchesLine(role.instrument,instrument))) continue;
      const source=chartForInstrument(loadChart(song),instrument);
      const events=chartEvents(source);
      const originals=new Map(source.tracks.flatMap(track=>track.events).map(event=>[event.id,event]));
      const compiled=compileChartPart(source,instrument);
      const chart={...source,instrument,tracks:[{id:`score-${instrument}`,name:label,instrument,clef:instrument==="bass"?"bass":"treble",events:compiled.map(note=>({...originals.get(note.sourceEventId),id:note.id,tuplet:note.tuplet,staff:note.staff,voice:note.voice,stemDirection:note.stemDirection,measure:note.measure,tieNext:note.tieNext,tiePrevious:note.tiePrevious,timeMs:note.timeMs,durationMs:note.durationMs,strings:[],expected:{...originals.get(note.sourceEventId).expected,midi:note.midi,kind:!note.midi.length?"rest":note.midi.length>1?"chord":"note"}}))}]};
      const file=`${instrument}-${song.id}`;
      const modes=instrument==="guitar"?["music","chords"]:["music"];
      for(const mode of modes) {
        const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css()}body{padding:16px;background:#e7e9ed}.page{width:680px;min-height:0;margin:0 auto 20px;padding:22px;background:white;box-shadow:0 2px 12px #0002}.music-system{position:relative}.score-playhead{position:absolute;top:0;bottom:0;width:2px;background:#dc2626;z-index:10;pointer-events:none;box-shadow:0 0 3px #dc2626} .page:last-child{margin-bottom:0}</style></head><body>${partPages(song,index,instrument,label,mode)}${browserVexFlowScript()}${mode==="chords"?guitarChordScript():""}</body></html>`
          .replaceAll(pathToFileURL(join(repoRoot,'node_modules/vexflow/build/cjs/vexflow-bravura.js')).href,`${renderedScoreBase}vexflow.js`)
          .replaceAll(pathToFileURL(join(repoRoot,"public/user-songs/sources/")).href+"/",userSongSourceBase);
        writeFileSync(join(webDir,`${file}-${mode}.html`),html);
      }
      writeFileSync(join(webDir,`${file}.json`),JSON.stringify(chart));
      entries.push({instrument,label,songId:song.id,title:song.title,artist:song.artist,url:`/rendered-scores/${file}-music.html`,chordsUrl:instrument==="guitar"?`/rendered-scores/${file}-chords.html`:undefined,chartUrl:`/rendered-scores/${file}.json`,durationMs:Math.max(...compiled.map(note=>note.timeMs+note.durationMs))});
    }
  }
  for (const [songId, filename] of [
    ["how-far-ill-go", "moana-how-far-ill-go-complete.html"],
    ["olivia-rodrigo-drivers-license", "drivers-license-complete.html"],
    ["fleetwood-mac-landslide", "landslide-complete.html"],
  ]) {
    const songIndex = data.rehearsalSongs.findIndex((song) => song.id === songId);
    const song = data.rehearsalSongs[songIndex];
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(song.title)} complete reference</title><style>${css()}body{padding:16px;background:#e7e9ed}.page{width:680px;min-height:0;margin:0 auto 20px;padding:22px;background:white;box-shadow:0 2px 12px #0002}.complete-page{width:960px;min-height:0;box-sizing:border-box}</style></head><body>${completeReferencePages(song, songIndex)}${browserVexFlowScript()}${guitarChordScript()}</body></html>`
      .replaceAll(pathToFileURL(join(repoRoot, "node_modules/vexflow/build/cjs/vexflow-bravura.js")).href, `${renderedScoreBase}vexflow.js`);
    writeFileSync(join(webDir, filename), html);
  }
  writeFileSync(join(webDir,"index.json"),JSON.stringify(entries,null,2));
  console.log(`Wrote ${entries.length} playable instrument scores to ${webDir}`);
}
if(!selected) writeWebScores();
