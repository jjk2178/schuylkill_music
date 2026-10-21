import { describe, it, expect } from "vitest";

import {
  parseSong,
  parseFretString,
} from "./parse.mjs";
import { parseArrangement, tabNoteMidi } from "./schema.mjs";
import { arrangementToMusicXML } from "./musicxml.mjs";
import { renderArrangementHtml } from "./html.mjs";
import { generateTab, withGeneratedTab } from "./tab.mjs";
import { generateBassTrack, generateRhythmGuitarTrack } from "./parts.mjs";
import { parseBassSong } from "./parse-bass.mjs";

describe("parseFretString", () => {
  it("parses digits and muted strings (low E -> high e)", () => {
    expect(parseFretString("320003")).toEqual([3, 2, 0, 0, 0, 3]);
    expect(parseFretString("x32010")).toEqual([-1, 3, 2, 0, 1, 0]);
    expect(parseFretString("nope")).toBeNull();
  });
});

describe("tabNoteMidi", () => {
  it("maps string/fret to MIDI in standard tuning", () => {
    const tuning = ["E2", "A2", "D3", "G3", "B3", "E4"];
    expect(tabNoteMidi({ string: 6, fret: 0 }, tuning)).toBe(40); // low E
    expect(tabNoteMidi({ string: 1, fret: 0 }, tuning)).toBe(64); // high e
    expect(tabNoteMidi({ string: 5, fret: 3 }, tuning)).toBe(48); // C3
  });
});

describe("parseSong: tab block", () => {
  const text = [
    "[Verse]",
    "e|----------------|",
    "B|-------6--------|",
    "G|-----5----------|",
    "D|-3--------------|",
    "A|----------------|",
    "E|----------------|",
    "   Load  up  now",
  ].join("\n");

  it("builds a measure with tab notes, MIDI, and lyrics", () => {
    const { arrangement } = parseSong(text, { id: "sample" });
    const measures = arrangement.tracks[0].measures;
    expect(measures.length).toBe(1);
    const notes = measures[0].events.filter((e) => e.kind !== "rest");
    expect(notes.length).toBeGreaterThanOrEqual(3);
    // D-string fret 3 -> F3 (53)
    const first = notes[0];
    expect(first.tab[0]).toMatchObject({ string: 4, fret: 3 });
    expect(first.midi).toContain(53);
    // lyrics landed on notes
    const lyrics = notes.map((n) => n.lyric?.text).filter(Boolean);
    expect(lyrics.join(" ")).toContain("Load");
  });

  it("validates against the schema", () => {
    const { arrangement } = parseSong(text, { id: "sample" });
    expect(() => parseArrangement(arrangement)).not.toThrow();
  });
});

describe("parseSong: techniques", () => {
  it("captures hammer-ons and slides", () => {
    const text = [
      "[Solo]",
      "e|----------------|",
      "B|----------------|",
      "G|-5h7------9/11---|",
      "D|----------------|",
      "A|----------------|",
      "E|----------------|",
    ].join("\n");
    const { arrangement } = parseSong(text, { id: "t" });
    const techniques = arrangement.tracks[0].measures[0].events
      .flatMap((e) => e.tab)
      .flatMap((t) => t.techniques);
    expect(techniques).toContain("hammer");
    expect(techniques).toContain("slide-up");
  });
});

describe("parseSong: chord grid + chords-over-lyrics", () => {
  const text = [
    "[Intro]",
    "| C G/B | Am7 G/B |",
    "[Verse]",
    "C          G/B",
    " I took my love",
  ].join("\n");

  it("parses grids into measures and chord/lyric pairs", () => {
    const { arrangement, referencedChords } = parseSong(text, { id: "ls" });
    const all = arrangement.tracks[0].measures.flatMap((m) => m.events);
    const symbols = all.map((e) => e.chordSymbol).filter(Boolean);
    expect(symbols).toContain("C");
    expect(symbols).toContain("Am7");
    expect(symbols).toContain("G/B");
    expect(referencedChords).toContain("Am7");
    const withLyric = all.find((e) => e.lyric);
    expect(withLyric?.lyric.text).toContain("took");
  });
});

describe("parseSong: chord shape definitions", () => {
  it("reads chord diagrams from a header", () => {
    const text = ["G     320003", "Am7   x02010", "[Intro]", "| G | Am7 |"].join(
      "\n",
    );
    const { arrangement } = parseSong(text, { id: "defs" });
    const g = arrangement.chordLibrary.find((c) => c.name === "G");
    expect(g.frets).toEqual([3, 2, 0, 0, 0, 3]);
    expect(g.baseFret).toBe(1); // open strings -> window starts at nut
  });
});

describe("arrangementToMusicXML", () => {
  const text = [
    "G     320003",
    "C     x32010",
    "[Verse]",
    "C          G",
    " I took my love",
    "e|----------------|",
    "B|-------6--------|",
    "G|-----5----------|",
    "D|-3--------------|",
    "A|----------------|",
    "E|----------------|",
    "   Load  up  now",
  ].join("\n");

  it("produces well-formed MusicXML with harmony, frames, lyrics, and tab", () => {
    const { arrangement } = parseSong(text, { id: "x" });
    const normalized = parseArrangement(arrangement);
    const xml = arrangementToMusicXML(normalized);

    // well-formed (jsdom DOMParser flags parse errors)
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelector("score-partwise")).not.toBeNull();

    expect(xml).toContain("<harmony");
    expect(xml).toContain("<frame>");
    expect(xml).toContain("<lyric");
    expect(xml).toContain("<technical>");
    expect(xml).toContain("<string>");
    expect(xml).toContain("<fret>");
  });
});

describe("tab generated from pitch", () => {
  const tuning = ["E2", "A2", "D3", "G3", "B3", "E4"];

  it("assigns playable positions that reproduce the exact pitches", () => {
    // A3=57, C4=60, E4=64 as a melodic line
    const events = [
      { midi: [57] },
      { midi: [60] },
      { midi: [64] },
      { midi: [48, 52, 55] }, // C major triad
    ];
    const positions = generateTab(events, tuning);
    positions.forEach((pos, i) => {
      const got = pos.map((p) => tabNoteMidi(p, tuning)).sort((a, b) => a - b);
      expect(got).toEqual([...events[i].midi].sort((a, b) => a - b));
      // each note on a distinct string
      expect(new Set(pos.map((p) => p.string)).size).toBe(pos.length);
    });
  });

  it("withGeneratedTab derives tab from midi and keeps the source as reference", () => {
    const text = [
      "[Solo]",
      "e|----------------|",
      "B|----------------|",
      "G|-7--------------|", // G-string fret 7 = D4
      "D|----------------|",
      "A|----------------|",
      "E|----------------|",
    ].join("\n");
    const { arrangement } = parseSong(text, { id: "g" });
    const normalized = parseArrangement(arrangement);
    const ev = normalized.tracks[0].measures[0].events.find((e) => e.midi.length);
    const regen = withGeneratedTab(normalized);
    const regenEv = regen.tracks[0].measures[0].events.find((e) => e.midi.length);
    // same pitch, possibly a different string/fret, source kept for reference
    expect(tabNoteMidi(regenEv.tab[0], tuning)).toBe(ev.midi[0]);
    expect(regenEv.sourceFingering[0]).toMatchObject({ string: 3, fret: 7 });
  });
});

describe("generated parts (bass + rhythm guitar)", () => {
  const chordText = [
    "G     320003",
    "C     x32010",
    "[Verse]",
    "C          G",
    " I took my love",
  ].join("\n");

  it("generates a 4-string bass line from the chord roots", () => {
    const { arrangement } = parseSong(chordText, { id: "b" });
    const bass = generateBassTrack(parseArrangement(arrangement));
    expect(bass.instrument).toBe("bass");
    expect(bass.tuning).toHaveLength(4);
    const notes = bass.measures.flatMap((m) => m.events).filter((e) => e.kind !== "rest");
    expect(notes.length).toBeGreaterThan(0);
    // every bass note is a single pitch in the bass register
    for (const n of notes) {
      expect(n.midi).toHaveLength(1);
      expect(n.midi[0]).toBeLessThan(60); // below middle C-ish
    }
  });

  it("generates a rhythm Guitar 2 of strummed chords", () => {
    const { arrangement } = parseSong(chordText, { id: "r" });
    const { track, chordNames } = generateRhythmGuitarTrack(parseArrangement(arrangement));
    expect(track.name).toBe("Guitar 2");
    const symbols = track.measures.flatMap((m) => m.events).map((e) => e.chordSymbol).filter(Boolean);
    expect(symbols).toContain("C");
    expect(chordNames).toContain("C");
  });

  it("infers chords from guitar pitches when the source has none", () => {
    // A measure spelling a C major triad (C E G) with no chord symbol.
    const tabText = [
      "[Riff]",
      "e|----------------|",
      "B|-1--------------|", // C4
      "G|-0--------------|", // G3
      "D|-2--------------|", // E3
      "A|-3--------------|", // C3
      "E|----------------|",
    ].join("\n");
    const { arrangement } = parseSong(tabText, { id: "i" });
    const { chordNames } = generateRhythmGuitarTrack(parseArrangement(arrangement));
    expect(chordNames).toContain("C");
  });
});

describe("parseBassSong (4-string tab)", () => {
  it("parses an EADG bass tab into a bass track", () => {
    const text = [
      "S=Slap",
      "X = Ghost Note",
      "Intro:",
      "G|-------------|",
      "D|-------------|",
      "A|-------------|",
      "E|-0--3--5--7--|",
    ].join("\n");
    const arr = parseBassSong(text, { id: "cant_stop" });
    const parsed = parseArrangement(arr);
    expect(parsed.tracks[0].instrument).toBe("bass");
    expect(parsed.tuning).toEqual(["E1", "A1", "D2", "G2"]);
    expect(parsed.legend.map((l) => l.symbol)).toContain("S");
    const frets = parsed.tracks[0].measures[0].events.flatMap((e) => e.tab).map((t) => t.fret);
    expect(frets).toEqual(expect.arrayContaining([0, 3, 5, 7]));
  });
});

describe("renderArrangementHtml", () => {
  const text = [
    "G     320003",
    "C     x32010",
    "[Verse]",
    "C          G",
    " I took my love",
    "e|----------------|",
    "B|-------6--------|",
    "G|-----5----------|",
    "D|-3--------------|",
    "A|----------------|",
    "E|----------------|",
    "   Load  up  now",
  ].join("\n");

  it("renders diagrams, monospace tab, and lyrics as valid HTML", () => {
    const { arrangement } = parseSong(text, { id: "h" });
    const normalized = parseArrangement(arrangement);
    const html = renderArrangementHtml(normalized, { chordScript: "" });

    const doc = new DOMParser().parseFromString(html, "text/html");
    const box = doc.querySelector(".chord-box");
    expect(box).not.toBeNull();
    // data-chord must be valid JSON (quotes correctly escaped in the attribute)
    expect(() => JSON.parse(box.getAttribute("data-chord"))).not.toThrow();
    expect(doc.querySelector("pre.tab")).not.toBeNull();
    const lyrics = [...doc.querySelectorAll(".lyric")].map((n) => n.textContent);
    expect(lyrics.join(" | ")).toContain("Load"); // lyric under the tab measure
    expect(lyrics.join(" | ")).toContain("took"); // lyric under the chord-chart measure
  });

  it("escapes double quotes in the data-chord attribute", () => {
    const { arrangement } = parseSong(text, { id: "h" });
    const html = renderArrangementHtml(parseArrangement(arrangement), {});
    // The raw markup must carry &quot; (not an unescaped " that closes the attr).
    expect(html).toMatch(/data-chord="[^"]*&quot;/);
  });
});
