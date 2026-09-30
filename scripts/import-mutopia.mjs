import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mirrorRoot = process.env.MUTOPIA_ROOT ?? "/private/tmp/mutopia";
const sourceDir = join(root, "public", "demo-songs", "sources");
const chartDir = join(root, "public", "demo-songs");
const tuning = ["E2", "A2", "D3", "G3", "B3", "E4"];
const tuningMidiByString = new Map([
  [6, 40],
  [5, 45],
  [4, 50],
  [3, 55],
  [2, 59],
  [1, 64],
]);

const sources = [
  {
    id: "bach-menuet-g",
    title: "Menuet in G",
    artist: "J. S. Bach",
    license: "Public Domain",
    instrument: "guitar",
    pageUrl: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=102",
    sourcePath: "ftp/BachJS/BWVAnh114/anna-magdalena-04-guitar-tab/anna-magdalena-04-guitar-tab.ly",
    voices: ["partGtrAa", "partGtrAb"],
    relative: [null, null],
    bpm: 130,
    beats: 3,
    beatUnit: 4,
    maxEvents: 64,
  },
  {
    id: "carcassi-etude-1",
    title: "Etude 1",
    artist: "M. Carcassi",
    license: "Public Domain",
    instrument: "guitar",
    pageUrl: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=13",
    sourcePath: "ftp/CarcassiM/O60/carcassi-op60-01/carcassi-op60-01.ly",
    voices: ["melody", "bass"],
    relative: ["c''", "c'"],
    bpm: 160,
    beats: 4,
    beatUnit: 4,
    maxEvents: 72,
  },
  {
    id: "carcassi-etude-3",
    title: "Etude 3",
    artist: "M. Carcassi",
    license: "Public Domain",
    instrument: "guitar",
    pageUrl: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=14",
    sourcePath: "ftp/CarcassiM/O60/carcassi-op60-03/carcassi-op60-03.ly",
    voices: ["melody", "middlevoice"],
    relative: ["c''", "c''"],
    bpm: 120,
    beats: 4,
    beatUnit: 4,
    maxEvents: 72,
  },
  {
    id: "galilei-saltarello",
    title: "Saltarello",
    artist: "V. Galilei",
    license: "Public Domain",
    instrument: "guitar",
    pageUrl: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=110",
    sourcePath: "ftp/GalileiV/saltarello/saltarello.ly",
    voices: ["first", "second"],
    relative: ["c'", "c"],
    bpm: 126,
    beats: 3,
    beatUnit: 4,
    maxEvents: 72,
  },
  {
    id: "greensleeves-guitar",
    title: "Greensleeves",
    artist: "Traditional, arr. David Kastrup",
    license: "Creative Commons Attribution-ShareAlike 4.0",
    instrument: "guitar",
    pageUrl: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1943",
    sourcePath: "ftp/Traditional/greensleeves_guitar/greensleeves_guitar.ly",
    voices: ["guitar"],
    relative: ["c'"],
    bpm: 120,
    beats: 3,
    beatUnit: 4,
    maxEvents: 64,
  },
  {
    id: "piano-bach-menuet-g",
    title: "Menuet in G",
    artist: "J. S. Bach",
    license: "Public Domain",
    instrument: "piano",
    pageUrl: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=75",
    sourcePath: "ftp/BachJS/BWVAnh114/anna-magdalena-04/anna-magdalena-04.ly",
    voices: ["voiceone", "voicetwo"],
    relative: ["c''", "c'"],
    bpm: 140,
    beats: 3,
    beatUnit: 4,
    maxEvents: 72,
  },
  {
    id: "piano-bach-menuet-g-minor",
    title: "Menuet in G Minor",
    artist: "J. S. Bach",
    license: "Public Domain",
    instrument: "piano",
    pageUrl: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=76",
    sourcePath: "ftp/BachJS/BWVAnh115/anna-magdalena-05/anna-magdalena-05.ly",
    voices: ["voiceone", "voicetwo"],
    relative: ["c'''", "c'"],
    bpm: 140,
    beats: 3,
    beatUnit: 4,
    maxEvents: 72,
  },
  {
    id: "piano-bach-menuet-bwv-anh-116",
    title: "Menuet BWV Anh. 116",
    artist: "J. S. Bach",
    license: "Public Domain",
    instrument: "piano",
    pageUrl: "https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=77",
    sourcePath: "ftp/BachJS/BWVAnh116/anna-magdalena-07/anna-magdalena-07.ly",
    voices: ["voiceone", "voicetwo"],
    relative: ["c''", "c'"],
    bpm: 125,
    beats: 3,
    beatUnit: 4,
    maxEvents: 72,
  },
];

await mkdir(sourceDir, { recursive: true });
await mkdir(chartDir, { recursive: true });

const index = [];
for (const source of sources) {
  const mirrorPath = join(mirrorRoot, source.sourcePath);
  if (!existsSync(mirrorPath)) {
    throw new Error(
      `Missing Mutopia source: ${mirrorPath}. Clone https://github.com/MutopiaProject/MutopiaProject to ${mirrorRoot}.`,
    );
  }

  const sourceFileName = `${source.id}.ly`;
  await copyFile(mirrorPath, join(sourceDir, sourceFileName));
  const lilypond = await readFile(mirrorPath, "utf8");
  const chart = lilypondToChart(lilypond, source, `/demo-songs/sources/${sourceFileName}`);
  const chartPath = `${source.id}.json`;
  await writeFile(join(chartDir, chartPath), `${JSON.stringify(chart, null, 2)}\n`);
  index.push({
    id: source.id,
    title: source.title,
    artist: source.artist,
    instrument: source.instrument,
    license: source.license,
    chartUrl: `/demo-songs/${chartPath}`,
    sourcePageUrl: source.pageUrl,
  });
}

await writeFile(join(chartDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(`Imported ${index.length} Mutopia LilyPond demo charts.`);

function lilypondToChart(lilypond, source, localSourceUrl) {
  const quarterMs = 60000 / source.bpm;
  const voiceEvents = source.voices.flatMap((voiceName, index) => {
    const body = extractAssignment(lilypond, voiceName);
    return parseLilyVoice(body, source.relative[index] === undefined ? "c'" : source.relative[index], quarterMs);
  });
  const groups = groupVoiceEvents(voiceEvents).slice(0, source.maxEvents);
  const firstTime = groups[0]?.timeMs ?? 0;

  return {
    schemaVersion: 1,
    title: source.title,
    artist: source.artist,
    instrument: source.instrument,
    tuning,
    tempoMap: [{ timeMs: 0, bpm: source.bpm }],
    timeSignatures: [{ timeMs: 0, beats: source.beats, beatUnit: source.beatUnit }],
    sections: [{ id: "excerpt", label: "Mutopia excerpt", timeMs: 0 }],
    assets: {
      sourceUrl: localSourceUrl,
      sourcePageUrl: source.pageUrl,
      license: source.license,
    },
    tracks: [
      {
        id: source.instrument,
        name: source.instrument === "piano" ? "Piano" : "Guitar",
        instrument: source.instrument,
        clef: source.instrument === "piano" ? "grand" : undefined,
        events: groups.map((group, index) => {
          const midi = [...new Set(group.notes.map((note) => note.midi))]
            .filter((note) => note >= 40 && note <= 88)
            .sort((a, b) => a - b)
            .slice(0, 6);
          return {
            id: `m${index + 1}`,
            label: midi.map(midiName).join(" "),
            timeMs: Math.max(0, Math.round(group.timeMs - firstTime)),
            durationMs: Math.max(160, Math.round(group.durationMs)),
            strings:
              source.instrument === "guitar"
                ? midi.map(midiToStringEvent).filter(Boolean).slice(0, 6)
                : [],
            expected: {
              kind: midi.length > 1 ? "chord" : "note",
              midi,
              toleranceCents: midi.length > 1 ? 45 : 35,
              timingWindowMs: { early: 150, late: 220 },
            },
          };
        }),
      },
    ],
  };
}

function extractAssignment(source, name) {
  const match = new RegExp(`${escapeRegExp(name)}\\s*=\\s*(?:\\\\relative(?:\\s+[^\\s{]+)?\\s*)?\\{`, "m").exec(source);
  if (!match) throw new Error(`Could not find LilyPond assignment ${name}.`);
  const openBrace = source.indexOf("{", match.index);
  return source.slice(openBrace + 1, findMatchingBrace(source, openBrace));
}

function findMatchingBrace(source, openBrace) {
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return index;
  }
  throw new Error("Unbalanced LilyPond braces.");
}

function parseLilyVoice(body, relativeRoot, quarterMs) {
  const tokens = tokenizeLily(expandKnownMacros(body));
  let timeMs = 0;
  let lastDuration = quarterMs;
  let previousMidi = relativeRoot ? lilyPitchToMidi(relativeRoot) : 60;
  const events = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "\\skip") {
      const duration = parseDurationToken(tokens[index + 1], lastDuration, quarterMs);
      if (duration.consumed) index += 1;
      timeMs += duration.ms;
      lastDuration = duration.ms;
      continue;
    }
    if (
      token.startsWith("\\") ||
      token === "{" ||
      token === "}" ||
      token === "|" ||
      token === "[" ||
      token === "]" ||
      token === "(" ||
      token === ")"
    ) {
      continue;
    }

    const chord = /^<([^>]+)>(.*)$/.exec(token);
    if (chord) {
      const duration = parseDurationToken(chord[2], lastDuration, quarterMs);
      const notes = chord[1]
        .split(/\s+/)
        .map((pitch) => (relativeRoot ? parseRelativePitch(pitch, previousMidi) : parseAbsolutePitch(pitch)))
        .filter(Boolean);
      if (notes.length) {
        previousMidi = notes.at(-1);
        events.push({ timeMs, durationMs: duration.ms, midi: notes });
      }
      timeMs += duration.ms;
      lastDuration = duration.ms;
      continue;
    }

    const rest = /^(?:r|s|R)(.*)$/.exec(token);
    if (rest) {
      const duration = parseDurationToken(rest[1], lastDuration, quarterMs);
      timeMs += duration.ms;
      lastDuration = duration.ms;
      continue;
    }

    const note = /^([a-g](?:is|es|isis|eses)?[,']*)(.*)$/.exec(token);
    if (note) {
      const midi = relativeRoot ? parseRelativePitch(note[1], previousMidi) : parseAbsolutePitch(note[1]);
      if (midi) {
        previousMidi = midi;
        const duration = parseDurationToken(note[2], lastDuration, quarterMs);
        events.push({ timeMs, durationMs: duration.ms, midi: [midi] });
        timeMs += duration.ms;
        lastDuration = duration.ms;
      }
    }
  }

  return events;
}

function expandKnownMacros(body) {
  return body.replace(
    /\\pattern\s+([a-g](?:is|es|isis|eses)?[,']*)\s+([a-g](?:is|es|isis|eses)?[,']*)\s+([a-g](?:is|es|isis|eses)?[,']*)\s+([a-g](?:is|es|isis|eses)?[,']*)/g,
    "r8 $2 < $3 $4 >8 $2 < $3 $4 >8 $2 $1 2.",
  );
}

function tokenizeLily(body) {
  const noComments = body.replace(/%.*$/gm, " ");
  const noStrings = noComments.replace(/"[^"]*"/g, " ");
  const raw = noStrings.match(
    /<[^>]+>[0-9.*\/]*|\\[A-Za-z]+|[a-g](?:isis|eses|is|es)?[,']*[0-9.*\/]*|[rsR][0-9.*\/]*|[{}|\[\]()]/g,
  );
  return raw ?? [];
}

function parseRelativePitch(token, previousMidi) {
  const match = /^([a-g])((?:isis|eses|is|es)?)([,']*)/.exec(token);
  if (!match) return null;
  const [, letter, accidental, octaveMarks] = match;
  const pitchClasses = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const accidentalOffset =
    accidental === "is" ? 1 : accidental === "es" ? -1 : accidental === "isis" ? 2 : accidental === "eses" ? -2 : 0;
  const pitchClass = pitchClasses[letter] + accidentalOffset;
  let candidate = Math.floor(previousMidi / 12) * 12 + pitchClass;
  while (candidate - previousMidi > 6) candidate -= 12;
  while (previousMidi - candidate > 6) candidate += 12;

  for (const mark of octaveMarks) {
    candidate += mark === "'" ? 12 : -12;
  }
  return candidate;
}

function parseAbsolutePitch(token) {
  const match = /^([a-g])((?:isis|eses|is|es)?)([,']*)/.exec(token);
  if (!match) return null;
  const pitchClasses = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const accidental =
    match[2] === "is" ? 1 : match[2] === "es" ? -1 : match[2] === "isis" ? 2 : match[2] === "eses" ? -2 : 0;
  let midi = 48 + pitchClasses[match[1]] + accidental;
  for (const mark of match[3]) midi += mark === "'" ? 12 : -12;
  return midi;
}

function lilyPitchToMidi(token) {
  const match = /^([a-g])((?:isis|eses|is|es)?)([,']*)$/.exec(token);
  if (!match) return 60;
  const pitchClasses = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  let midi = 48 + pitchClasses[match[1]];
  for (const mark of match[3]) midi += mark === "'" ? 12 : -12;
  return midi;
}

function parseDurationToken(token = "", fallbackMs, quarterMs) {
  const match = /^(\d+)?(\.)?(?:\*(\d+)\/(\d+)|\*(\d+))?/.exec(token);
  if (!match || (!match[1] && !match[2] && !match[3] && !match[5])) {
    return { ms: fallbackMs, consumed: false };
  }
  const denominator = match[1] ? Number(match[1]) : Math.round(quarterMs / fallbackMs) * 4;
  let ms = quarterMs * (4 / denominator);
  if (match[2]) ms *= 1.5;
  if (match[3] && match[4]) ms *= Number(match[3]) / Number(match[4]);
  if (match[5]) ms *= Number(match[5]);
  return { ms, consumed: true };
}

function groupVoiceEvents(events) {
  const groups = [];
  const sorted = events
    .flatMap((event) => event.midi.map((midi) => ({ timeMs: event.timeMs, durationMs: event.durationMs, midi })))
    .filter((event) => event.midi >= 40 && event.midi <= 88)
    .sort((a, b) => a.timeMs - b.timeMs || a.midi - b.midi);

  for (const event of sorted) {
    const previous = groups.at(-1);
    if (previous && Math.abs(previous.timeMs - event.timeMs) <= 35) {
      previous.notes.push(event);
      previous.durationMs = Math.max(previous.durationMs, event.durationMs);
    } else {
      groups.push({ timeMs: event.timeMs, durationMs: event.durationMs, notes: [event] });
    }
  }
  return groups;
}

function midiToStringEvent(midi) {
  const candidates = [...tuningMidiByString.entries()]
    .map(([string, openMidi]) => ({ string, fret: midi - openMidi }))
    .filter((candidate) => candidate.fret >= 0 && candidate.fret <= 20)
    .sort((a, b) => Math.abs(a.fret - 5) - Math.abs(b.fret - 5) || b.string - a.string);
  return candidates[0] ?? null;
}

function midiName(midi) {
  const names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
