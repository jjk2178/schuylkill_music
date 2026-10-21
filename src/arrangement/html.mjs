// Render a SongArrangement as the combined guitar notation: for each measure,
// the chord diagram(s) of the shape being held sit above a monospace tab grid,
// with the sung lyric below. Chord-only chart measures (lyrics-with-chords
// sheets) drop the tab and show diagrams + lyric. Diagrams are drawn in-browser
// by VexChords; the caller injects the bundle + draw script via `chordScript`.

import { vexChordData } from "../music/vexChordReference.mjs";
import { withGeneratedTab } from "./tab.mjs";

// String row labels (string 1 = highest) derived from a low->high tuning.
function stringLabels(tuning) {
  return [...tuning].reverse().map((n) => n.replace(/[0-9]/g, ""));
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Convert a library shape (frets string 6 -> 1, absolute) into the ref shape
// that vexChordData() consumes.
function toRefShape(shape) {
  const position = shape.baseFret && shape.baseFret > 1 ? shape.baseFret : 1;
  return {
    id: shape.name,
    position,
    frets: shape.frets,
    chord: shape.frets.map((f, i) => [
      6 - i,
      f < 0 ? "x" : f === 0 ? 0 : f - position + 1,
    ]),
    barres: (shape.barres || []).map((b) => ({
      ...b,
      fret: b.fret - position + 1,
    })),
    tuning: ["E", "A", "D", "G", "B", "E"],
  };
}

function escAttr(s) {
  return esc(s).replace(/"/g, "&quot;");
}

function diagramHtml(name, shape) {
  const box = shape
    ? `<div class="chord-box" data-chord="${escAttr(
        JSON.stringify(vexChordData(toRefShape(shape))),
      )}"></div>`
    : "";
  return `<figure class="diagram"><figcaption>${esc(name)}</figcaption>${box}</figure>`;
}

// Monospace tab for one measure. 16th grid; two columns per slot. `labels` runs
// string 1 (highest) .. string N (lowest), so it adapts to 6-string guitar or
// 4-string bass.
function measureTab(measure, beats, labels) {
  const slots = Math.max(1, Math.round(beats * 4));
  const rows = labels.map((label, idx) => {
    const stringNum = idx + 1; // labels[0] = string 1 (highest)
    const cells = Array(slots).fill("--");
    for (const event of measure.events) {
      for (const t of event.tab || []) {
        if (t.string !== stringNum) continue;
        const slot = Math.min(slots - 1, Math.max(0, Math.round(event.beat * 4)));
        const dead = (t.techniques || []).includes("dead");
        const token = dead ? "x" : String(t.fret);
        cells[slot] = token.length >= 2 ? token : token + "-";
      }
    }
    return `${label}|${cells.join("-")}|`;
  });
  return rows.join("\n");
}

function measureHtml(measure, beats, changeIds) {
  const diagrams = [];
  let lyric = "";
  let seen = new Set();
  for (const event of measure.events) {
    if (event.chordSymbol && changeIds.has(event.id) && !seen.has(event.chordSymbol)) {
      diagrams.push({ name: event.chordSymbol });
      seen.add(event.chordSymbol);
    }
    if (event.lyric?.text) lyric += (lyric ? " " : "") + event.lyric.text;
  }
  const hasTab = measure.events.some((e) => (e.tab || []).length);
  return { diagrams, lyric, hasTab, measure };
}

export function renderArrangementHtml(
  arr,
  { chordScript = "", generateTabFromPitch = true, trackIndex = 0 } = {},
) {
  // Tab shown on the page is derived from the pitches, not the ingested fingering.
  if (generateTabFromPitch) arr = withGeneratedTab(arr);
  const track = arr.tracks[trackIndex] || arr.tracks[0];
  const beats = arr.timeSignature.beats;
  const labels = stringLabels(track.tuning || arr.tuning);

  // Mark chord *changes* (relative to the previous shown chord) across the song.
  const changeIds = new Set();
  let prevChord = null;
  for (const m of track.measures)
    for (const e of m.events)
      if (e.chordSymbol && e.chordSymbol !== prevChord) {
        changeIds.add(e.id);
        prevChord = e.chordSymbol;
      }

  const shapeFor = (name) =>
    arr.chordLibrary.find((c) => c.name === name) || null;

  // Group measures by section.
  const sectionById = new Map(arr.sections.map((s) => [s.id, s]));
  const groups = [];
  let current = null;
  for (const m of track.measures) {
    const sid = m.sectionId || "_";
    if (!current || current.sid !== sid) {
      current = { sid, section: sectionById.get(sid), measures: [] };
      groups.push(current);
    }
    current.measures.push(m);
  }

  const sectionsHtml = groups
    .map((g) => {
      const label = g.section ? esc(g.section.label) : "";
      const notes = g.section?.notes
        ? `<span class="section-note">${esc(g.section.notes)}</span>`
        : "";
      const repeat = g.section?.repeatText
        ? `<span class="section-note">${esc(g.section.repeatText)}</span>`
        : "";
      const cells = g.measures
        .map((m) => {
          const info = measureHtml(m, beats, changeIds);
          const diagrams = info.diagrams
            .map((d) => diagramHtml(d.name, shapeFor(d.name)))
            .join("");
          const tab = info.hasTab
            ? `<pre class="tab">${esc(measureTab(m, beats, labels))}</pre>`
            : "";
          const lyric = info.lyric
            ? `<div class="lyric">${esc(info.lyric)}</div>`
            : "";
          const cls = info.hasTab ? "measure" : "measure chart";
          return `<div class="${cls}"><div class="diagrams">${diagrams}</div>${tab}${lyric}<div class="barnum">${m.number}</div></div>`;
        })
        .join("");
      return `<section class="song-section"><h2>${label} ${notes} ${repeat}</h2><div class="systems">${cells}</div></section>`;
    })
    .join("");

  const snippetsHtml = arr.snippets.length
    ? `<section class="song-section"><h2>Reference patterns &amp; riffs</h2>${arr.snippets
        .map(
          (s) =>
            `<div class="snippet"><b>${esc(s.label || s.kind)}</b><pre>${esc(s.text)}</pre></div>`,
        )
        .join("")}</section>`
    : "";

  const legendHtml = arr.legend.length
    ? `<section class="song-section legend"><h2>Legend</h2><ul>${arr.legend
        .map((l) => `<li><code>${esc(l.symbol)}</code> ${esc(l.meaning)}</li>`)
        .join("")}</ul></section>`
    : "";

  const byline = [
    arr.artist,
    track.name,
    arr.capo && track.instrument !== "bass" ? `capo ${arr.capo}` : null,
    `♩=${Math.round(arr.tempoBpm)}`,
    `${arr.timeSignature.beats}/${arr.timeSignature.beatUnit}`,
  ]
    .filter(Boolean)
    .map(esc)
    .join(" · ");

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(
    arr.title,
  )} — guitar</title><style>${css()}</style></head><body>
<div class="sheet">
  <header><h1>${esc(arr.title)}</h1><p class="byline">${byline}</p></header>
  ${sectionsHtml}
  ${snippetsHtml}
  ${legendHtml}
</div>
${chordScript}
</body></html>`;
}

function css() {
  return `
  @page { size: letter; margin: 0.5in; }
  * { box-sizing: border-box; }
  body { font-family: Helvetica, Arial, sans-serif; color: #111; margin: 0; }
  .sheet { max-width: 7.5in; margin: 0 auto; }
  header h1 { margin: 0 0 2px; font-size: 22px; }
  .byline { margin: 0 0 12px; color: #555; font-size: 12px; }
  .song-section { margin: 0 0 14px; break-inside: avoid; }
  .song-section h2 { font-size: 14px; margin: 0 0 6px; padding-bottom: 2px;
    border-bottom: 1px solid #ddd; }
  .section-note { font-weight: 400; font-size: 11px; color: #777; }
  .systems { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: flex-start; }
  .measure { break-inside: avoid; }
  .measure.chart { min-width: 150px; }
  .diagrams { display: flex; gap: 8px; min-height: 2px; margin-bottom: 2px; }
  .diagram { margin: 0; text-align: center; }
  .diagram figcaption { font-size: 10px; font-weight: 700; }
  .chord-box svg { width: 54px !important; height: 66px !important; }
  .chord-box svg text { font-family: Helvetica, Arial, sans-serif !important; }
  pre.tab { font-family: "DejaVu Sans Mono", "Courier New", monospace;
    font-size: 10px; line-height: 1.25; margin: 2px 0; white-space: pre; }
  .lyric { font-size: 11px; color: #222; margin-top: 2px; max-width: 24em; }
  .barnum { font-size: 8px; color: #aaa; }
  .snippet pre, .legend code { font-family: "DejaVu Sans Mono", monospace; }
  .snippet pre { font-size: 9px; line-height: 1.2; background: #f7f7f7;
    padding: 6px; overflow: hidden; }
  .snippet b { font-size: 11px; }
  .legend ul { columns: 2; font-size: 11px; }
  `;
}
