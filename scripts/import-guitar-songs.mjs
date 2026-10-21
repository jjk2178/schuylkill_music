// Import plain-text guitar tab/chord sheets into the beat-based arrangement
// format and emit the main guitar parts.
//
//   node scripts/import-guitar-songs.mjs [srcDir] [outDir]
//
// Defaults: srcDir = ~/Music/songs, outDir = public/arrangements
//
// For every *.txt (and extension-less) file it writes:
//   <id>.json             the lossless SongArrangement (source of truth)
//   <id>.guitar.musicxml  the main guitar part as MusicXML 4.0
//
// Referenced chords are resolved to standard fretboard shapes from the existing
// VexChords reference so each JSON is self-contained.

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { parseSong } from "../src/arrangement/parse.mjs";
import { parseBassSong } from "../src/arrangement/parse-bass.mjs";
import {
  generateBassTrack,
  generateRhythmGuitarTrack,
} from "../src/arrangement/parts.mjs";
import { parseArrangement } from "../src/arrangement/schema.mjs";
import { arrangementToMusicXML } from "../src/arrangement/musicxml.mjs";
import { guitarChordReference } from "../src/music/vexChordReference.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const srcDir = process.argv[2] || join(homedir(), "Music", "songs");
const outDir = process.argv[3] || join(repoRoot, "public", "arrangements");

// Resolve a chord symbol to a fretboard shape (string 6 -> string 1, absolute frets).
function standardShape(name) {
  const find = (id) =>
    guitarChordReference.find((c) => c.id === id && !c.form) ||
    guitarChordReference.find((c) => c.id === id);
  let ref = find(name);
  if (!ref) ref = find(name.split("/")[0]); // drop slash bass
  if (!ref) {
    // crude fallbacks for common extensions not in the reference
    const base = name.replace(/\/.+$/, "");
    ref =
      find(base.replace(/(maj7|maj|M7|7|9|6|sus2|sus4|sus|add\d+)/g, "")) ||
      find(base.replace(/7|9|6/g, ""));
  }
  if (!ref) return null;
  const baseFret = ref.position || 1;
  return {
    name,
    frets: ref.frets,
    baseFret,
    barres: (ref.barres || []).map((b) => ({
      fromString: b.fromString,
      toString: b.toString,
      fret: (b.fret || 1) + baseFret - 1,
    })),
  };
}

const BINARY_RE = /\.(pdf|mid|midi|mxl|musicxml|xml|png|jpe?g|gif|mp3|wav|json)$/i;

function toId(fileName) {
  return basename(fileName)
    .replace(/\.[^.]+$/, "")
    .trim()
    .replace(/\s+/g, "_")
    .toLowerCase();
}

// Convert a supplied guitarArrangement shape {frets, barres} into a ChordShape.
function shapeFromSupplied(name, shape) {
  const positive = shape.frets.filter((f) => f > 0);
  const hasOpen = shape.frets.some((f) => f === 0);
  const baseFret =
    !hasOpen && positive.length && Math.min(...positive) > 1
      ? Math.min(...positive)
      : 1;
  return { name, frets: shape.frets, barres: shape.barres || [], baseFret };
}

// Per-song authoritative chord diagrams (name -> ChordShape), keyed by song id.
// How Far I'll Go uses the capo-4 shapes from the supplied official arrangement
// (they match the chord-diagram PDF in ~/Music/songs), so slash/sus/half-dim
// chords resolve correctly instead of falling back to generic shapes.
async function songShapeOverrides(id) {
  if (!/how.?far.?ill.?go/i.test(id)) return new Map();
  const src = join(repoRoot, "public", "user-songs", "how-far-ill-go.json");
  if (!existsSync(src)) return new Map();
  const chart = JSON.parse(await readFile(src, "utf8"));
  const shapes = chart.guitarArrangement?.shapes || {};
  return new Map(
    Object.entries(shapes).map(([name, s]) => [name, shapeFromSupplied(name, s)]),
  );
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const entries = await readdir(srcDir);
  const files = entries.filter((f) => !f.startsWith(".") && !BINARY_RE.test(f));
  if (!files.length) {
    console.error(`No song files found in ${srcDir}`);
    process.exit(1);
  }

  const summary = [];
  for (const file of files.sort()) {
    const text = await readFile(join(srcDir, file), "utf8");

    let arrangement;
    let referencedChords = [];
    const isBass = /bass/i.test(file);
    // Drop a trailing "_bass" so a bass tab file lands at <song>.json, not <song>_bass.json.
    const id = isBass ? toId(file).replace(/_bass$/, "") : toId(file);

    if (isBass) {
      // A provided bass tab (e.g. Can't Stop): bass-only, no generated parts.
      arrangement = parseBassSong(text, { id });
    } else {
      const parsed = parseSong(text, { id });
      arrangement = parsed.arrangement;
      referencedChords = [...parsed.referencedChords];
      // Guitar 1 is the primary part; add a generated rhythm Guitar 2 and bass.
      arrangement.tracks[0].id = "guitar1";
      arrangement.tracks[0].name = "Guitar 1";
      const { track: guitar2, chordNames } = generateRhythmGuitarTrack(arrangement);
      const bass = generateBassTrack(arrangement);
      arrangement.tracks.push(guitar2, bass);
      referencedChords = [...new Set([...referencedChords, ...chordNames])];
    }

    // Authoritative per-song diagrams take precedence over generic resolution.
    const overrides = await songShapeOverrides(id);
    const have = new Set(arrangement.chordLibrary.map((c) => c.name));
    const unresolved = [];
    for (const name of referencedChords) {
      if (have.has(name)) continue;
      const shape = overrides.get(name) || standardShape(name);
      if (shape) {
        arrangement.chordLibrary.push(shape);
        have.add(name);
      } else {
        unresolved.push(name);
      }
    }

    let normalized;
    try {
      normalized = parseArrangement(arrangement);
    } catch (err) {
      console.error(`✗ ${id}: schema validation failed`);
      console.error(err.errors ? JSON.stringify(err.errors.slice(0, 5), null, 2) : err);
      process.exitCode = 1;
      continue;
    }

    const resolveChord = (name) =>
      normalized.chordLibrary.find((c) => c.name === name) ||
      standardShape(name);
    const xml = arrangementToMusicXML(normalized, { resolveChord });

    await writeFile(join(outDir, `${id}.json`), JSON.stringify(normalized, null, 2));
    await writeFile(join(outDir, `${id}.musicxml`), xml);

    const parts = normalized.tracks.map((t) => t.name).join(", ");
    summary.push({ id, title: normalized.title, parts });
    console.log(
      `✓ ${id.padEnd(24)} ${String(normalized.tracks[0].measures.length).padStart(4)} measures  parts: ${parts}` +
        (unresolved.length ? `  (unresolved: ${unresolved.join(", ")})` : ""),
    );
  }

  console.log(`\nWrote ${summary.length} arrangement(s) to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
