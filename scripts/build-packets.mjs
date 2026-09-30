import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Bravura } from "../node_modules/vexflow/build/esm/src/fonts/bravura.js";
import { Academico } from "../node_modules/vexflow/build/esm/src/fonts/academico.js";
import { AcademicoBold } from "../node_modules/vexflow/build/esm/src/fonts/academicobold.js";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const dataPath = join(repoRoot, "src/band/rehearsalSet.json");
const outputDir = join(repoRoot, "output/pdf");
const htmlDir = join(outputDir, "html");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const scoreWidth = 680;
const eventsPerSystem = 24;
const systemsPerPage = 2;

mkdirSync(outputDir, { recursive: true });
mkdirSync(htmlDir, { recursive: true });

const data = JSON.parse(readFileSync(dataPath, "utf8"));
const songIndex = loadSongIndex();

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function midiName(midi) {
  const names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
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
      .findLast((signature) => signature.timeMs <= timeMs) ?? defaultKeySignature()
  );
}

function keyAccidentals(fifths = 0) {
  const accidentals = { c: 0, d: 0, e: 0, f: 0, g: 0, a: 0, b: 0 };
  const sharpOrder = ["f", "c", "g", "d", "a", "e", "b"];
  const flatOrder = ["b", "e", "a", "d", "g", "c", "f"];
  if (fifths > 0) sharpOrder.slice(0, fifths).forEach((letter) => { accidentals[letter] = 1; });
  if (fifths < 0) flatOrder.slice(0, Math.abs(fifths)).forEach((letter) => { accidentals[letter] = -1; });
  return accidentals;
}

const naturalPitchClasses = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

function spellMidi(midi, signature = defaultKeySignature()) {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const signatureAccidentals = keyAccidentals(signature.fifths);
  for (const [letter, natural] of Object.entries(naturalPitchClasses)) {
    const accidental = signatureAccidentals[letter];
    if (((natural + accidental) % 12 + 12) % 12 === pitchClass) {
      return { key: `${letter}/${octave}`, accidental: null };
    }
  }

  const preferFlats = signature.fifths < 0;
  const spellings = preferFlats
    ? [
        ["c", 0], ["db", 1], ["d", 2], ["eb", 3], ["e", 4], ["f", 5],
        ["gb", 6], ["g", 7], ["ab", 8], ["a", 9], ["bb", 10], ["b", 11],
      ]
    : [
        ["c", 0], ["c#", 1], ["d", 2], ["d#", 3], ["e", 4], ["f", 5],
        ["f#", 6], ["g", 7], ["g#", 8], ["a", 9], ["a#", 10], ["b", 11],
      ];
  const [name] = spellings.find(([, pc]) => pc === pitchClass) ?? ["c"];
  const letter = name[0];
  const writtenAccidental = name.includes("#") ? 1 : name.includes("b") ? -1 : 0;
  const signatureAccidental = signatureAccidentals[letter] ?? 0;
  const accidental =
    writtenAccidental === signatureAccidental ? null : writtenAccidental === 0 ? "n" : writtenAccidental > 0 ? "#" : "b";
  return { key: `${name}/${octave}`, accidental };
}

function loadSongIndex() {
  const indexPath = join(repoRoot, "public/demo-songs/index.json");
  if (!existsSync(indexPath)) return new Map();
  return new Map(JSON.parse(readFileSync(indexPath, "utf8")).map((song) => [song.title.toLowerCase(), song]));
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

function renderStaff(notes, { clef = "treble", height = 118, width = scoreWidth, compact = false, keySignature = defaultKeySignature(), timeSignature = { beats: 4, beatUnit: 4 } } = {}) {
  return `<div class="vf-staff" data-clef="${escapeHtml(clef)}" data-height="${height}" data-width="${width}" data-compact="${compact ? "1" : "0"}" data-key="${dataAttr(keySignature)}" data-beats="${timeSignature.beats}" data-beat-unit="${timeSignature.beatUnit}" data-notes="${dataAttr(notes.slice(0, 24))}"></div>`;
}

function renderGrandStaff(notes, keySignature = defaultKeySignature(), compact = false, timeSignature = { beats: 4, beatUnit: 4 }) {
  const treble = notes
    .map((note) => ({ ...note, midi: note.midi.filter((midi) => midi >= 60) }))
    .filter((note) => note.midi.length);
  const bass = notes
    .map((note) => ({ ...note, midi: note.midi.filter((midi) => midi < 60) }))
    .filter((note) => note.midi.length);
  const height = compact ? 104 : 124;
  return `<div class="grand">${renderStaff(treble, { clef: "treble", height, compact: true, keySignature, timeSignature })}${renderStaff(bass, { clef: "bass", height, compact: true, keySignature, timeSignature })}</div>`;
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

function playerNote(event, instrument, index) {
  const midi = eventMidi(event);
  if (!midi.length) return null;
  const low = midi[0];
  const high = midi.at(-1);
  const base = { timeMs: event.timeMs, durationMs: event.durationMs };
  if (instrument.includes("bass")) return { ...base, midi: [transposeIntoRange(low, 28, 52)] };
  if (instrument.includes("trumpet")) return index % 4 === 0 ? { ...base, midi: [transposeIntoRange(high, 58, 82)] } : null;
  if (instrument.includes("flute")) return index % 3 === 0 ? { ...base, midi: [transposeIntoRange(high, 60, 84)] } : null;
  if (instrument.includes("recorder")) return index % 4 === 2 ? { ...base, midi: [transposeIntoRange(high, 60, 79)] } : null;
  if (instrument.includes("vocal")) return index % 2 === 0 ? { ...base, midi: [transposeIntoRange(high, 55, 76)] } : null;
  if (instrument.includes("drums")) return { ...base, midi: drumMidi(index, midi.length > 1, event.durationMs >= 700) };
  if (instrument.includes("keys")) return { ...base, midi: midi.slice(0, 4).map((note) => transposeIntoRange(note, 48, 81)) };
  return { ...base, midi: [transposeIntoRange(high, 45, 76)] };
}

function drumMidi(index, isChord, isLong) {
  const hits = [42];
  if (index % 2 === 0 || isChord) hits.push(36);
  if (index % 4 === 2 || isLong) hits.push(38);
  if (index % 8 === 0) hits.push(49);
  return hits;
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
  return tuning
    .map((stringInfo, stringIndex) => ({ stringIndex, fret: midi - stringInfo.open }))
    .filter((position) => position.fret >= 0 && position.fret <= 24)
    .sort((a, b) => Math.abs(a.fret - 5) - Math.abs(b.fret - 5))[0] ?? { stringIndex: tuning.length - 1, fret: 0 };
}

function renderTabAnnotation(notes, tuning) {
  const columns = notes.map((note) => ({ note, position: bestFret(note.midi[0], tuning) }));
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
    ${tuning.map((stringInfo, stringIndex) => {
      const y = top + stringIndex * rowGap;
      return `<g><text class="tab-label" x="${left - 13}" y="${y + 3}" text-anchor="end">${escapeHtml(stringInfo.label)}</text><line x1="${left}" x2="${width - 8}" y1="${y}" y2="${y}"></line></g>`;
    }).join("")}
    ${columns.map(({ note, position }) => {
      const x = left + ((note.timeMs - firstTime) / timeSpan) * usableWidth;
      const y = top + position.stringIndex * rowGap;
      return `<text class="tab-fret" data-time="${note.timeMs}" x="${x}" y="${y + 3}" text-anchor="middle">${position.fret}</text>`;
    }).join("")}
  </svg>`;
}

function trumpetFingering(midi) {
  return { 0: "0", 1: "123", 2: "13", 3: "23", 4: "12", 5: "1", 6: "2", 7: "0", 8: "23", 9: "12", 10: "1", 11: "2" }[((midi % 12) + 12) % 12] ?? "0";
}

function renderInstrumentAnnotation(notes, instrument) {
  if (instrument.includes("guitar")) return renderTabAnnotation(notes, guitarTuning);
  if (instrument.includes("bass")) return renderTabAnnotation(notes, bassTuning);
  if (instrument.includes("trumpet")) {
    return `<div class="valves">${notes.map((note) => {
      const f = trumpetFingering(note.midi[0]);
      return `<span><b>${midiName(note.midi[0])}</b><i class="${f.includes("1") ? "on" : ""}"></i><i class="${f.includes("2") ? "on" : ""}"></i><i class="${f.includes("3") ? "on" : ""}"></i></span>`;
    }).join("")}</div>`;
  }
  if (instrument.includes("flute") || instrument.includes("recorder")) {
    return renderWindAnnotation(notes, instrument);
  }
  if (instrument.includes("drums")) {
    return `<div class="drums">${notes.map((note) => `<span>${secondsLabel(note.timeMs)} ${note.midi.map((midi) => ({ 36: "kick", 38: "snare", 42: "hat", 49: "crash" }[midi] ?? "hit")).join("/")}</span>`).join("")}</div>`;
  }
  if (instrument.includes("vocal")) {
    return `<div class="vocal">${notes.map((note) => `<span>${secondsLabel(note.timeMs)} cue ${midiName(note.midi[0])}</span>`).join("")}</div>`;
  }
  return `<div class="labels">${notes.map((note) => `<span>${secondsLabel(note.timeMs)} ${note.midi.map(midiName).join("/")}</span>`).join("")}</div>`;
}

function renderWindAnnotation(notes, instrument) {
  const kind = instrument.includes("flute") ? "flute" : "recorder";
  return `<div class="wind-diagrams">${notes.map((note) => {
    const holes = windHoles(note.midi[0], kind);
    return `<span><b>${midiName(note.midi[0])}</b><i>${holes.map((pressed) => `<em class="${pressed ? "on" : ""}"></em>`).join("")}</i></span>`;
  }).join("")}</div>`;
}

function windHoles(midi, kind) {
  const flutePatterns = {
    0: [true, true, true, true, true, true, true],
    2: [true, true, true, true, true, true, false],
    4: [true, true, true, true, true, false, false],
    5: [true, true, true, true, false, false, false],
    7: [true, true, true, false, false, false, false],
    9: [true, true, false, false, false, false, false],
    11: [true, false, false, false, false, false, false],
  };
  const recorderPatterns = {
    0: [true, true, true, true, true, true, true, true],
    2: [true, true, true, true, true, true, true, false],
    4: [true, true, true, true, true, true, false, false],
    5: [true, true, true, true, true, false, false, false],
    7: [true, true, true, true, false, false, false, false],
    9: [true, true, true, false, false, false, false, false],
    11: [true, true, false, false, false, false, false, false],
  };
  const patterns = kind === "flute" ? flutePatterns : recorderPatterns;
  return patterns[((midi % 12) + 12) % 12] ?? patterns[0];
}

function roleFor(song, memberName) {
  return song.roles.find((role) => role.player === memberName);
}

function notesForInstrument(events, instrument, indexOffset = 0) {
  return events.map((event, index) => playerNote(event, instrument, index + indexOffset)).filter(Boolean);
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks.length ? chunks : [[]];
}

function renderScoreBlock(title, notes, instrument, keySignature = defaultKeySignature(), compact = false, selected = false, timeSignature = { beats: 4, beatUnit: 4 }) {
  const clef = instrument.includes("bass") || instrument.includes("drums") ? "bass" : "treble";
  const staff = !instrument.includes("drums")
    ? renderGrandStaff(notes, keySignature, compact, timeSignature)
    : renderStaff(notes, { clef, height: compact ? 78 : 118, keySignature, compact, timeSignature });
  return `<section class="score-block ensemble-block${selected ? " selected-part" : ""}"><h3>${escapeHtml(title)}</h3><span class="time-signature">${timeSignature.beats}/${timeSignature.beatUnit}</span>${staff}${renderInstrumentAnnotation(notes, instrument)}</section>`;
}

function renderMusicSystem(notes, instrument, keySignature, timeSignature) {
  const clef = instrument.includes("bass") || instrument.includes("drums") ? "bass" : "treble";
  const staff = !instrument.includes("drums")
    ? renderGrandStaff(notes, keySignature, true, timeSignature)
    : renderStaff(notes, { clef, height: 78, keySignature, compact: true, timeSignature });
  const annotation = instrument.includes("guitar") || instrument.includes("bass") ? "" : renderInstrumentAnnotation(notes, instrument);
  return `<div class="packet-system music-system">${staff}${annotation}</div>`;
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
    .ensemble-block .vf-staff { min-height: 104px; height: 104px; overflow: visible; }
    .ensemble-block .grand { display: grid; grid-template-rows: 104px 104px; row-gap: 8px; min-height: 216px; }
    .ensemble-block .grand svg + svg { margin-top: 0; }
    .packet-part-block { position: relative; padding-top: 5px; }
    .packet-part-block h3 { padding-right: 40px; }
    .packet-part-block .time-signature { position: absolute; top: 4px; right: 7px; font-size: 9px; font-weight: 700; }
    .packet-systems { display: grid; gap: 7px; }
    .packet-system { min-height: 54px; padding: 4px 0; box-sizing: border-box; }
    .packet-system.music-system { min-height: 216px; }
    .packet-system .grand { margin-bottom: 2px; }
    .ensemble-block .tab-ann { margin: 0; padding: 3px 0; box-sizing: content-box; }
    .ensemble-block .valves, .ensemble-block .labels, .ensemble-block .vocal, .ensemble-block .drums { gap: 5px; font-size: 7px; margin-top: 0; max-height: 16px; overflow: hidden; }
    .wind-diagrams { display:flex; flex-wrap:wrap; gap:5px; margin-top:2px; font-size:7px; max-height:54px; overflow:hidden; }
    .wind-diagrams > span { display:grid; justify-items:center; gap:1px; }
    .wind-diagrams i { display:grid; grid-auto-flow:row; gap:1px; font-style:normal; }
    .wind-diagrams em { width:6px; height:6px; border:1px solid #111; border-radius:50%; display:block; }
    .wind-diagrams em.on { background:#111; }
    svg { max-width: 100%; height: auto; display:block; }
    svg text { font-family: "Bravura", "Academico", Helvetica, Arial, sans-serif !important; }
    .vf-staff { width: ${scoreWidth}px; max-width: 100%; min-height: 104px; }
    .grand svg + svg { margin-top: 0; }
    .tab-ann { width: 100%; height: auto; margin-top: -7px; overflow: visible; font-family: Menlo, Consolas, monospace; }
    .tab-ann line { stroke:#9a9a9a; stroke-width:0.55; }
    .tab-ann .tab-label { fill:#111; font-size:8px; font-weight:900; }
    .tab-ann .tab-fret { fill:#050505; stroke:#fff; stroke-width:3.4; paint-order:stroke fill; font-size:10px; font-weight:900; dominant-baseline:middle; }
    .valves, .labels, .vocal, .drums { display:flex; flex-wrap:wrap; gap:8px; font-size:9px; margin-top:4px; }
    .valves span { display:inline-grid; grid-template-rows:auto 9px 9px 9px; justify-items:center; gap:1px; }
    .valves i { width:7px; height:7px; border:1px solid #111; border-radius:50%; display:block; }
    .valves i.on { background:#111; }
    .overview { display:grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  `;
}

function browserVexFlowScript() {
  return `
    <script src="../../../node_modules/vexflow/build/cjs/vexflow-bravura.js"></script>
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
        function renderStaff(host) {
          const notes = JSON.parse(host.dataset.notes || "[]");
          const signature = JSON.parse(host.dataset.key || '{"key":"C","fifths":0}');
          const clef = host.dataset.clef || "treble";
          const compact = host.dataset.compact === "1";
          const width = Number(host.dataset.width || 680);
          const height = Number(host.dataset.height || 118);
          host.innerHTML = "";
          const renderer = new VF.Renderer(host, VF.Renderer.Backends.SVG);
          renderer.resize(width, height);
          const context = renderer.getContext();
          const stave = new VF.Stave(12, compact ? 10 : 18, width - 24).addClef(clef).addKeySignature(signature.key || "C");
          stave.addTimeSignature((host.dataset.beats || "4") + "/" + (host.dataset.beatUnit || "4"));
          stave.setContext(context).draw();
          const tickables = notes.map((note) => {
            const spellings = (note.midi || []).slice(0, 4).map((midi) => spellMidi(midi, signature));
            const staveNote = new VF.StaveNote({
              clef,
              keys: spellings.length ? spellings.map((spelling) => spelling.key) : [clef === "bass" ? "c/3" : "c/4"],
              duration: (() => {
                const ratio = Math.max(0.125, note.durationMs / 600);
                return ratio >= 1.75 ? "h" : ratio >= 0.875 ? "q" : ratio >= 0.4375 ? "8" : "16";
              })(),
            });
            spellings.forEach((spelling, index) => {
              if (spelling.accidental) staveNote.addModifier(new VF.Accidental(spelling.accidental), index);
            });
            return staveNote;
          });
          if (!tickables.length) return;
          const voice = new VF.Voice({ numBeats: Number(host.dataset.beats || 4), beatValue: Number(host.dataset.beatUnit || 4) }).setStrict(false);
          voice.addTickables(tickables);
          new VF.Formatter().joinVoices([voice]).format([voice], width - 120);
          voice.draw(context, stave);
        }
        async function renderAll() {
          if (document.fonts?.ready) await document.fonts.ready;
          document.querySelectorAll(".vf-staff").forEach(renderStaff);
          document.documentElement.dataset.vexflowReady = "true";
        }
        renderAll();
      })();
    </script>
  `;
}

function overviewPage(member) {
  const roles = data.rehearsalSongs.map((song, index) => ({ song, role: roleFor(song, member.name), index: index + 1 }));
  return `<div class="page"><div class="top"><div><h1>${escapeHtml(member.name)} Packet</h1><p>Roles, set list, equipment, and rendered parts</p></div><p>${escapeHtml(member.instruments.join(" / "))}</p></div>
    <div class="overview"><section><h3>Your songs</h3>${roles.map(({ song, role, index }) => `<div class="card"><b>${index}. ${escapeHtml(song.title)}</b><p>${escapeHtml(song.artist)} - ${escapeHtml(role?.instrument ?? role?.part ?? "part")}</p><p>${escapeHtml(role?.notes ?? song.status)}</p></div>`).join("")}</section>
    <section><h3>Equipment</h3><ul>${member.equipment.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><h3>Shared gear</h3><ul>${data.sharedEquipment.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section></div></div>`;
}

function songPages(member) {
  const pages = [];
  const ensembleLines = [
    { label: "Keys", instrument: "keys" },
    { label: "Guitar", instrument: "guitar" },
    { label: "Bass", instrument: "bass" },
    { label: "Drums", instrument: "drums" },
    { label: "Flute", instrument: "flute" },
    { label: "Recorder", instrument: "recorder" },
    { label: "Trumpet", instrument: "trumpet" },
    { label: "Voices", instrument: "vocals" },
  ];
  for (const [songIndexNumber, song] of data.rehearsalSongs.entries()) {
    const role = roleFor(song, member.name);
    const instrument = role?.instrument ?? role?.part ?? "part";
    const chart = loadChart(song);
    const events = chartEvents(chart);
    if (!events.length) {
      pages.push(`<div class="page"><div class="top"><div><h1>${escapeHtml(song.title)}</h1><p>${escapeHtml(song.artist)} - ${escapeHtml(member.name)}</p></div><p>${escapeHtml(instrument)}</p></div><h3>Ensemble parts</h3><p>No imported chart is available yet.</p><h3>Your part</h3><p>${escapeHtml(role?.notes ?? "Role not assigned.")}</p></div>`);
      continue;
    }
    const selectedLine = ensembleLines.find((line) => instrumentMatchesLine(instrument, line.instrument)) ?? {
        label: instrument,
        instrument,
      };
    const isString = selectedLine.instrument === "guitar" || selectedLine.instrument === "bass";
    const tabPages = isString ? chunk(events, eventsPerSystem * 8) : [];
    const musicPages = chunk(events, eventsPerSystem * systemsPerPage);
    const totalPages = tabPages.length + musicPages.length;
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      const isTabPage = pageIndex < tabPages.length;
      const pageEvents = isTabPage ? tabPages[pageIndex] : musicPages[pageIndex - tabPages.length];
      const systems = chunk(pageEvents, eventsPerSystem);
      const timeSignature = chart.timeSignatures?.[0] ?? { beats: 4, beatUnit: 4 };
      const content = systems.map((eventSlice, lineIndex) => {
        const eventOffset = (isTabPage ? pageIndex * eventsPerSystem * 8 : (pageIndex - tabPages.length) * eventsPerSystem * systemsPerPage) + lineIndex * eventsPerSystem;
        const signature = keySignatureAt(chart, eventSlice[0]?.timeMs ?? 0);
        const notes = notesForInstrument(eventSlice, selectedLine.instrument, eventOffset);
        if (isTabPage) {
          const tuning = selectedLine.instrument === "bass" ? bassTuning : guitarTuning;
          return `<div class="packet-system tab-system">${renderTabAnnotation(notes, tuning)}</div>`;
        }
        return renderMusicSystem(notes, selectedLine.instrument, signature, timeSignature);
      }).join("");
      const block = isTabPage
        ? renderPacketBlock(`${member.name} - ${selectedLine.label} - tab`, content, timeSignature)
        : renderPacketBlock(`${member.name} - ${selectedLine.label} - music`, content, timeSignature);
      pages.push(`<div class="page ensemble-page"><div class="top"><div><h1>${songIndexNumber + 1}. ${escapeHtml(song.title)}</h1><p>${escapeHtml(song.artist)} - ${escapeHtml(member.name)} - page ${pageIndex + 1} of ${totalPages}</p></div><p>${escapeHtml(instrument)}</p></div>
        ${pageIndex === 0 ? `<p class="role-note"><b>${escapeHtml(role?.part ?? instrument)}</b>: ${escapeHtml(role?.notes ?? "")}</p>` : ""}
        <div class="ensemble-score">${block}</div>
      </div>`);
    }
  }
  return pages.join("");
}

function instrumentMatchesLine(roleInstrument, lineInstrument) {
  const role = roleInstrument.toLowerCase();
  if (lineInstrument === "guitar") return role.includes("guitar");
  if (lineInstrument === "vocals") return role.includes("vocal");
  return role.includes(lineInstrument);
}

function packetHtml(member) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(member.name)} packet</title><style>${css()}</style></head><body>${overviewPage(member)}${songPages(member)}${browserVexFlowScript()}</body></html>`;
}

function masterHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Master packet</title><style>${css()}</style></head><body><div class="page"><div class="top"><div><h1>Master Set List</h1><p>Scoreboard rehearsal packet</p></div><p>${data.rehearsalSongs.length} songs</p></div><h3>Set order</h3><ul>${data.rehearsalSongs.map((song, index) => `<li>${index + 1}. ${escapeHtml(song.title)} - ${escapeHtml(song.artist)} (${escapeHtml(song.status)})</li>`).join("")}</ul><h3>Band roster</h3><div class="grid">${data.bandMembers.map((member) => `<div class="card"><b>${escapeHtml(member.name)}</b><p>${escapeHtml(member.instruments.join(" / "))}</p></div>`).join("")}</div><h3>Equipment manifest</h3><ul>${data.sharedEquipment.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div></body></html>`;
}

function printPdf(htmlPath, pdfPath) {
  if (!existsSync(chromePath)) {
    throw new Error(`Chrome not found at ${chromePath}`);
  }
  execFileSync(chromePath, [
    "--headless",
    "--disable-gpu",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=3000",
    "--no-pdf-header-footer",
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ], { stdio: "ignore" });
}

const masterPath = join(htmlDir, "master-setlist-and-equipment.html");
writeFileSync(masterPath, masterHtml());
printPdf(masterPath, join(outputDir, "master-setlist-and-equipment.pdf"));

for (const member of data.bandMembers) {
  const htmlPath = join(htmlDir, `${slugify(member.name)}-player-packet.html`);
  const pdfPath = join(outputDir, `${slugify(member.name)}-player-packet.pdf`);
  writeFileSync(htmlPath, packetHtml(member));
  printPdf(htmlPath, pdfPath);
}

console.log(`Wrote ${data.bandMembers.length + 1} VexFlow PDFs to ${outputDir}`);
