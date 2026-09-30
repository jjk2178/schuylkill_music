import { readFile, writeFile } from "node:fs/promises";

const inputPath = process.argv[2] ?? "/private/tmp/jerusalem.mid";
const outputPath = process.argv[3] ?? "public/demo-songs/jerusalem-parry.json";
const bytes = await readFile(inputPath);
let offset = 0;

function u16() {
  const value = bytes.readUInt16BE(offset);
  offset += 2;
  return value;
}

function u32() {
  const value = bytes.readUInt32BE(offset);
  offset += 4;
  return value;
}

function vlq(end) {
  let value = 0;
  while (offset < end) {
    const byte = bytes[offset++];
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  return value;
}

function parseTrack(start, length) {
  offset = start;
  const end = start + length;
  let ticks = 0;
  let runningStatus = 0;
  const active = new Map();
  const notes = [];

  while (offset < end) {
    ticks += vlq(end);
    let status = bytes[offset];
    if (status < 0x80) status = runningStatus;
    else {
      offset += 1;
      runningStatus = status;
    }
    const type = status >> 4;
    if (type === 0x8 || type === 0x9) {
      const pitch = bytes[offset++];
      const velocity = bytes[offset++];
      const key = pitch;
      if (type === 0x9 && velocity > 0) {
        const starts = active.get(key) ?? [];
        starts.push(ticks);
        active.set(key, starts);
      } else {
        const starts = active.get(key) ?? [];
        const startTick = starts.shift();
        if (startTick !== undefined) notes.push({ startTick, endTick: ticks, pitch });
      }
    } else if (type === 0xa || type === 0xb || type === 0xe) offset += 2;
    else if (type === 0xc || type === 0xd) offset += 1;
    else if (status === 0xff) {
      const metaType = bytes[offset++];
      const length = vlq(end);
      offset += length;
      if (metaType === 0x2f) break;
    } else if (status === 0xf0 || status === 0xf7) offset += vlq(end);
  }
  return notes;
}

if (bytes.toString("ascii", 0, 4) !== "MThd") throw new Error("Not a MIDI file");
offset = 4;
const headerLength = u32();
const format = u16();
const trackCount = u16();
const ticksPerQuarter = u16();
if (format !== 1) throw new Error(`Expected type 1 MIDI, received ${format}`);
offset = 8 + headerLength;
const tracks = [];
for (let index = 0; index < trackCount; index += 1) {
  if (bytes.toString("ascii", offset, offset + 4) !== "MTrk") throw new Error("Invalid MIDI track");
  offset += 4;
  const length = u32();
  tracks.push(parseTrack(offset, length));
}

// The CC0 reference has the melody in track 1 for the first statement and
// a doubled melody in track 3 for the second statement.
const first = tracks[1].filter((note) => note.startTick < 19000);
const secondSource = tracks[3].filter((note) => note.startTick >= 19000);
const second = [];
for (const note of secondSource.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch)) {
  const previous = second.at(-1);
  if (previous && previous.startTick === note.startTick) previous.pitch = Math.max(previous.pitch, note.pitch);
  else second.push({ ...note });
}
const sourceNotes = [...first, ...second];
const firstTick = sourceNotes[0]?.startTick ?? 0;
const microsPerQuarter = 833333;
const toMs = (ticks) => Math.round((ticks * microsPerQuarter) / ticksPerQuarter / 1000);
const events = sourceNotes.map((note, index) => ({
  id: `jerusalem-${index + 1}`,
  label: "melody",
  timeMs: toMs(note.startTick - firstTick),
  durationMs: Math.max(120, toMs(note.endTick - note.startTick)),
  strings: [],
  expected: {
    kind: "note",
    midi: [note.pitch],
    toleranceCents: 40,
    timingWindowMs: { early: 140, late: 220 },
  },
}));
const secondStart = events.find((event, index) => index > first.length && event.timeMs > events[first.length - 1].timeMs)?.timeMs ?? 0;
const chart = {
  schemaVersion: 1,
  title: "And did those feet in ancient time (Jerusalem)",
  artist: "Hubert Parry, text by William Blake",
  instrument: "piano",
  tuning: ["C", "D", "E", "F", "G", "A"],
  tempoMap: [{ timeMs: 0, bpm: 72 }],
  timeSignatures: [{ timeMs: 0, beats: 4, beatUnit: 4 }],
  keySignatures: [{ timeMs: 0, key: "D", fifths: 2, mode: "major" }],
  tracks: [{ id: "melody", name: "Jerusalem melody", instrument: "piano", clef: "treble", events }],
  sections: [
    { id: "verse-one", label: "Verse 1", timeMs: 0 },
    { id: "verse-two", label: "Verse 2", timeMs: secondStart },
  ],
  assets: {
    sourcePageUrl: "https://en.wikipedia.org/wiki/And_did_those_feet_in_ancient_time",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:And_Did_Those_Feet_In_Ancient_Time_(Jerusalem).mid",
    license: "CC0 MIDI reference; arrangement generated for Schuylkill Music",
  },
};
await writeFile(outputPath, `${JSON.stringify(chart, null, 2)}\n`);
console.log(`Wrote ${events.length} melody events to ${outputPath}`);
