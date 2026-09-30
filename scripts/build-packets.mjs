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
const eventsPerPage = 12;

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

function renderStaff(notes, { clef = "treble", height = 118, width = scoreWidth, compact = false, keySignature = defaultKeySignature() } = {}) {
  return `<div class="vf-staff" data-clef="${escapeHtml(clef)}" data-height="${height}" data-width="${width}" data-compact="${compact ? "1" : "0"}" data-key="${dataAttr(keySignature)}" data-notes="${dataAttr(notes.slice(0, 12))}"></div>`;
}

function renderGrandStaff(notes, keySignature = defaultKeySignature()) {
  const treble = notes
    .map((note) => ({ ...note, midi: note.midi.filter((midi) => midi >= 60) }))
    .filter((note) => note.midi.length);
  const bass = notes
    .map((note) => ({ ...note, midi: note.midi.filter((midi) => midi < 60) }))
    .filter((note) => note.midi.length);
  return `<div class="grand">${renderStaff(treble, { clef: "treble", height: 104, compact: true, keySignature })}${renderStaff(bass, { clef: "bass", height: 104, compact: true, keySignature })}</div>`;
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
  const columns = notes.map((note) => bestFret(note.midi[0], tuning));
  const rowGap = tuning.length === 6 ? 16 : 21;
  const top = 14;
  const left = 32;
  const width = 620;
  const usableWidth = width - left - 12;
  const columnStep = usableWidth / Math.max(1, columns.length - 1);
  const height = top * 2 + rowGap * (tuning.length - 1);
  return `<svg class="tab-ann" viewBox="0 0 ${width} ${height}" role="img" aria-label="Tab annotation">
    ${tuning.map((stringInfo, stringIndex) => {
      const y = top + stringIndex * rowGap;
      return `<g><text class="tab-label" x="${left - 13}" y="${y + 3}" text-anchor="end">${escapeHtml(stringInfo.label)}</text><line x1="${left}" x2="${width - 8}" y1="${y}" y2="${y}"></line></g>`;
    }).join("")}
    ${columns.map((pos, index) => {
      const x = left + index * columnStep;
      const y = top + pos.stringIndex * rowGap;
      return `<text class="tab-fret" x="${x}" y="${y + 3}" text-anchor="middle">${pos.fret}</text>`;
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
  if (instrument.includes("drums")) {
    return `<div class="drums">${notes.map((note) => `<span>${secondsLabel(note.timeMs)} ${note.midi.map((midi) => ({ 36: "kick", 38: "snare", 42: "hat", 49: "crash" }[midi] ?? "hit")).join("/")}</span>`).join("")}</div>`;
  }
  if (instrument.includes("vocal")) {
    return `<div class="vocal">${notes.map((note) => `<span>${secondsLabel(note.timeMs)} cue ${midiName(note.midi[0])}</span>`).join("")}</div>`;
  }
  return `<div class="labels">${notes.map((note) => `<span>${secondsLabel(note.timeMs)} ${note.midi.map(midiName).join("/")}</span>`).join("")}</div>`;
}

function roleFor(song, memberName) {
  return song.roles.find((role) => role.player === memberName);
}

function notesForInstrument(events, instrument) {
  return events.map((event, index) => playerNote(event, instrument, index)).filter(Boolean);
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks.length ? chunks : [[]];
}

function renderScoreBlock(title, notes, instrument, isMaster = false, keySignature = defaultKeySignature()) {
  const clef = instrument.includes("bass") || instrument.includes("drums") ? "bass" : "treble";
  const staff = instrument.includes("keys") || isMaster ? renderGrandStaff(notes, keySignature) : renderStaff(notes, { clef, height: 118, keySignature });
  return `<section class="score-block"><h3>${escapeHtml(title)}</h3>${staff}${isMaster ? "" : renderInstrumentAnnotation(notes, instrument)}</section>`;
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
    svg { max-width: 100%; height: auto; display:block; }
    svg text { font-family: "Bravura", "Academico", Helvetica, Arial, sans-serif !important; }
    .vf-staff { width: ${scoreWidth}px; max-width: 100%; min-height: 104px; }
    .grand svg + svg { margin-top: -8px; }
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
          stave.setContext(context).draw();
          const tickables = notes.map((note) => {
            const spellings = (note.midi || []).slice(0, 4).map((midi) => spellMidi(midi, signature));
            const staveNote = new VF.StaveNote({
              clef,
              keys: spellings.length ? spellings.map((spelling) => spelling.key) : [clef === "bass" ? "c/3" : "c/4"],
              duration: note.durationMs >= 700 ? "q" : "8",
            });
            spellings.forEach((spelling, index) => {
              if (spelling.accidental) staveNote.addModifier(new VF.Accidental(spelling.accidental), index);
            });
            return staveNote;
          });
          if (!tickables.length) return;
          const voice = new VF.Voice({ numBeats: Math.max(4, tickables.length), beatValue: 4 }).setStrict(false);
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
  for (const [songIndexNumber, song] of data.rehearsalSongs.entries()) {
    const role = roleFor(song, member.name);
    const instrument = role?.instrument ?? role?.part ?? "part";
    const chart = loadChart(song);
    const events = chartEvents(chart);
    if (!events.length) {
      pages.push(`<div class="page"><div class="top"><div><h1>${escapeHtml(song.title)}</h1><p>${escapeHtml(song.artist)} - ${escapeHtml(member.name)}</p></div><p>${escapeHtml(instrument)}</p></div><h3>Master</h3><p>No imported chart is available yet.</p><h3>Your part</h3><p>${escapeHtml(role?.notes ?? "Role not assigned.")}</p></div>`);
      continue;
    }
    const master = masterNotes(events);
    const player = notesForInstrument(events, instrument);
    const pageCount = Math.max(chunk(master, eventsPerPage).length, chunk(player, eventsPerPage).length);
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const masterSlice = master.slice(pageIndex * eventsPerPage, pageIndex * eventsPerPage + eventsPerPage);
      const playerSlice = player.slice(pageIndex * eventsPerPage, pageIndex * eventsPerPage + eventsPerPage);
      const signature = keySignatureAt(chart, masterSlice[0]?.timeMs ?? playerSlice[0]?.timeMs ?? 0);
      pages.push(`<div class="page"><div class="top"><div><h1>${songIndexNumber + 1}. ${escapeHtml(song.title)}</h1><p>${escapeHtml(song.artist)} - ${escapeHtml(member.name)} - page ${pageIndex + 1}</p></div><p>${escapeHtml(instrument)}</p></div>
        ${pageIndex === 0 ? `<p><b>${escapeHtml(role?.part ?? instrument)}</b>: ${escapeHtml(role?.notes ?? "")}</p>` : ""}
        ${renderScoreBlock("Master", masterSlice, "keys", true, signature)}
        ${renderScoreBlock(`${member.name} - ${instrument}`, playerSlice, instrument, false, signature)}
      </div>`);
    }
  }
  return pages.join("");
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
