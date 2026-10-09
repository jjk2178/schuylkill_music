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
  return `<div class="vf-staff" data-note-names="${noteNames ? 1 : 0}" data-diagram-gap="${diagramGap}" data-grand="${range.grand ? 1 : 0}" data-measures="${dataAttr(range.measures ?? [])}" data-quarter-ms="${range.quarterMs ?? 600}" data-clef="${escapeHtml(clef)}" data-height="${height}" data-width="${width}" data-compact="${compact ? "1" : "0"}" data-key="${dataAttr(keySignature)}" data-beats="${timeSignature.beats}" data-beat-unit="${timeSignature.beatUnit}" data-time-start="${range.startMs}" data-time-end="${range.endMs}" data-time-positioned="${timePositioned ? "1" : "0"}" data-notes="${dataAttr(notes)}"></div>`;
}

function renderGrandStaff(
  notes,
  keySignature = defaultKeySignature(),
  compact = false,
  timeSignature = { beats: 4, beatUnit: 4 },
  timeRange,
  timePositioned = false,
  noteNames = false,
) {
  timeRange = {...timeRange, grand:true};
  const treble = notes
    .map((note) => ({ ...note, midi: note.midi.filter((midi) => note.staff ? note.staff === "treble" : midi >= 60) }))
    .filter((note) => note.midi.length || note.staff === "treble");
  const bass = notes
    .map((note) => ({ ...note, midi: note.midi.filter((midi) => note.staff ? note.staff === "bass" : midi < 60) }))
    .filter((note) => note.midi.length || note.staff === "bass");
  const height = 104;
  return `<div class="grand">${renderStaff(treble, { clef: "treble", height, compact: true, keySignature, timeSignature, timeRange, timePositioned, noteNames })}${renderStaff(bass, { clef: "bass", height, compact: true, keySignature, timeSignature, timeRange, timePositioned, noteNames })}</div>`;
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
  return `<div class="packet-system music-system instrument-${instrument}">${staff}${annotation}</div>`;
}

function renderPacketBlock(title, content, timeSignature) {
  return `<section class="score-block ensemble-block packet-part-block"><h3>${escapeHtml(title)}</h3><span class="time-signature">${timeSignature.beats}/${timeSignature.beatUnit}</span><div class="packet-systems">${content}</div></section>`;
}

function css() {
  return `
    @page { size: letter; margin: 0.45in; }
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
          svg.setAttribute("preserveAspectRatio", "none");
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
            const timeSpan = Math.max(1, lastTime - firstTime);
            const activeStart = stave.getNoteStartX();
            const activeEnd = stave.getX() + stave.getWidth() - 12;
            host.dataset.activeStart = String(activeStart);
            host.dataset.activeEnd = String(activeEnd);
            const positions=notes.map(note=>activeStart+Math.max(0,Math.min(1,(note.timeMs-firstTime)/timeSpan))*(activeEnd-activeStart));
            const gap=host.dataset.grand === "1" ? 0 : Math.min(Number(host.dataset.diagramGap)||(notes.some(n=>n.chord)?96:18),(activeEnd-activeStart)/Math.max(1,positions.length));
            for(let i=1;i<positions.length;i++)positions[i]=Math.max(positions[i],positions[i-1]+gap);
            if(positions.at(-1)>activeEnd-8){positions[positions.length-1]=activeEnd-8;for(let i=positions.length-2;i>=0;i--)positions[i]=Math.min(positions[i],positions[i+1]-gap);}
            host.dataset.positions=JSON.stringify(notes.map((note,i)=>[note.timeMs,positions[i]]));
            tickables.forEach((tickable,index)=>tickable.getTickContext().setX(positions[index]-activeStart-12));
          }
          const tuplets=[];
          for(let i=0;i<notes.length-2;i++)if(notes[i].tuplet===3 && notes[i+1].tuplet===3 && notes[i+2].tuplet===3) {tuplets.push(new VF.Tuplet(tickables.slice(i,i+3),{numNotes:3,notesOccupied:2,bracketed:false}));i+=2;}
          const beams = beamGroups(notes, Number(host.dataset.quarterMs || 600), {beats:Number(host.dataset.beats||4),beatUnit:Number(host.dataset.beatUnit||4)}, JSON.parse(host.dataset.measures||"[]")).map(group => new VF.Beam(group.map(i=>tickables[i])));
          voice.draw(context, stave);
          beams.forEach(beam => beam.setContext(context).draw());
          tuplets.forEach(tuplet=>tuplet.setContext(context).draw());
          staffTieLinks(notes).forEach(link=>new VF.StaveTie({firstNote:link.from===null?undefined:tickables[link.from],lastNote:link.to===null?undefined:tickables[link.to],firstIndexes:link.fromIndices,lastIndexes:link.toIndices}).setContext(context).draw());
          if(host.dataset.noteNames === "1") {
            const svg=host.querySelector("svg");
            notes.forEach((note,index)=>{
              const heads=tickables[index].noteHeads, ys=tickables[index].getYs();
              const placed=[];
              (note.midi||[]).slice(0,6).forEach((midi,keyIndex)=>{
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
          if (document.fonts?.ready) await document.fonts.ready;
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
  const pages = chunk(systems, systemsPerPage);
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
      while (content.length < systemsPerPage)
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
      return `<div class="page ensemble-page part-page" data-instrument="${instrument}" data-mode="${mode}"><div class="top"><div><h1>${songIndex + 1}. ${escapeHtml(song.title)}</h1><p>${escapeHtml(song.artist)} · ${escapeHtml(label)} · page ${pageIndex + 1} of ${pages.length}</p></div><p>${escapeHtml(instrument)}${mode === "chords" ? " chords" : instrument === "guitar" ? " + TAB" : ""}</p></div><p class="part-note">${escapeHtml(note || "Four systems per page · follow the printed meter and measure bars.")}</p>${renderPacketBlock(label, content.join(""), meterAt(chart, 0))}</div>`;
    })
    .join("");
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
  return `<script>${library}</script><script>const vexChordData = ${vexChordData.toString()}; const vexChordOptions = ${vexChordOptions.toString()}; document.querySelectorAll('.guitar-chord-box').forEach(host => { const chord = JSON.parse(host.dataset.chord); vexchords.draw(host, vexChordData(chord), host.dataset.compact ? {...vexChordOptions(true),width:58,height:70} : vexChordOptions(!!host.dataset.small)); });</script>`;
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
  execFileSync(
    chromePath,
    [
      "--headless",
      "--disable-gpu",
      ...(process.env.CHROME_NO_SANDBOX === "1" ? ["--no-sandbox"] : []),
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=3000",
      "--no-pdf-header-footer",
      `--print-to-pdf=${pdfPath}`,
      pathToFileURL(htmlPath).href,
    ],
    { stdio: "ignore" },
  );
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
          .replaceAll(pathToFileURL(join(repoRoot,'node_modules/vexflow/build/cjs/vexflow-bravura.js')).href,'/rendered-scores/vexflow.js')
          .replaceAll(pathToFileURL(join(repoRoot,"public/user-songs/sources/")).href+"/",'/user-songs/sources/');
        writeFileSync(join(webDir,`${file}-${mode}.html`),html);
      }
      writeFileSync(join(webDir,`${file}.json`),JSON.stringify(chart));
      entries.push({instrument,label,songId:song.id,title:song.title,artist:song.artist,url:`/rendered-scores/${file}-music.html`,chordsUrl:instrument==="guitar"?`/rendered-scores/${file}-chords.html`:undefined,chartUrl:`/rendered-scores/${file}.json`,durationMs:Math.max(...compiled.map(note=>note.timeMs+note.durationMs))});
    }
  }
  writeFileSync(join(webDir,"index.json"),JSON.stringify(entries,null,2));
  console.log(`Wrote ${entries.length} playable instrument scores to ${webDir}`);
}
if(!selected) writeWebScores();
