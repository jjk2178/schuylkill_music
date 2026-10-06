import { describe, expect, it } from "vitest";
import { compilePart, instrumentKey, writtenKey, writtenPitches } from "./parts.mjs";
import { compilePracticeChart } from "./practice";
import { measureBoundaries } from "./measures.mjs";
import { parseChart } from "../charts/schema";
import anthem from "../../public/demo-songs/star-spangled-banner-warmup.json";
import silentNight from "../../public/demo-songs/silent-night.json";
import jerusalem from "../../public/demo-songs/jerusalem-parry.json";
import { rehearsalSongs } from "../band/rehearsalSet";
import suppliedTrumpet from "../../public/user-songs/god-bless-america.json";
import { arrangeForFivePlayers } from "../arrangements/arranger";
import { judgeEvent } from "../gameplay/scoring";

const chart = parseChart(anthem);
describe("compiled set list training", () => {
  it("keeps every melody onset in other trumpet parts too", () => {
    const source=parseChart(silentNight);
    const events=source.tracks[0].events.filter(e=>e.expected.kind!=="rest" && e.expected.midi.length);
    const trumpet=compilePart(source.tracks[0].events,"trumpet",source.title);
    expect(trumpet.map(n=>[n.timeMs,n.durationMs])).toEqual(events.map(e=>[e.timeMs,e.durationMs]));
    expect(trumpet.every(n=>n.midi.length===1)).toBe(true);
  });
  it("uses the printable trumpet melody at concert pitch for scoring", () => {
    const notes = compilePart(chart.tracks[0].events, "trumpet", chart.title);
    const practice = compilePracticeChart(chart, "trumpet");
    expect(notes).toHaveLength(chart.tracks[0].events.length);
    expect(
      practice.tracks[0].events.map((event) => event.expected.midi),
    ).toEqual(notes.map((note) => note.midi));
    expect(writtenPitches([58], "trumpet")).toEqual([60]);
    expect(writtenKey(chart.keySignatures[0], "trumpet")).toMatchObject({
      key: "C",
      fifths: 0,
    });
  });
  it("compiles the full Jerusalem trumpet melody in a comfortable register", () => {
    const source = parseChart(jerusalem);
    const practice = compilePracticeChart(source, "trumpet");
    const events = practice.tracks[0].events;
    expect(events).toHaveLength(source.tracks[0].events.length);
    expect(events.map((event) => [event.timeMs, event.durationMs])).toEqual(
      source.tracks[0].events.map((event) => [event.timeMs, event.durationMs]),
    );
    expect(
      events.every(
        (event) => event.expected.midi[0] >= 57 && event.expected.midi[0] <= 74,
      ),
    ).toBe(true);
    expect(events.map((event) => event.expected.midi[0] % 12)).toEqual(
      source.tracks[0].events.map((event) => event.expected.midi[0] % 12),
    );
    expect(
      events.some((event) => event.timeMs >= source.sections[1].timeMs),
    ).toBe(true);
    expect(writtenKey(source.keySignatures[0], "trumpet")).toMatchObject({
      key: "E",
      fifths: 4,
    });
    expect(
      rehearsalSongs
        .find((song) => song.id === "jerusalem-parry")
        ?.roles.find((role) => role.player === "Jack")?.instrument,
    ).toBe("trumpet");
  });
  it("gives Jerusalem flute and recorder the entire trumpet melody one octave higher", () => {
    const source = parseChart(jerusalem);
    const trumpet = compilePart(source.tracks[0].events, "trumpet", source.title);
    for (const instrument of ["flute", "recorder"]) {
      const wind = compilePart(source.tracks[0].events, instrument, source.title);
      expect(wind.map(note=>[note.sourceEventId,note.timeMs,note.durationMs,note.midi])).toEqual(
        trumpet.map(note=>[note.sourceEventId,note.timeMs,note.durationMs,note.midi.map(pitch=>pitch+12)])
      );
      expect(compilePracticeChart(source,instrument).tracks[0].events.map(event=>event.expected.midi)).toEqual(wind.map(note=>note.midi));
      // Sliced PDF systems must use precisely the same melody as full playback.
      expect(compilePart(source.tracks[0].events.slice(12,24),instrument,source.title,12).map(note=>note.midi)).toEqual(wind.slice(12,24).map(note=>note.midi));
    }
  });
  it("gives flute every Silent Night melody note with source timing", () => {
    const source = parseChart(silentNight);
    const notes = compilePart(source.tracks[0].events, "flute", source.title);
    expect(notes.map(note=>[note.timeMs,note.durationMs,note.midi])).toEqual(source.tracks[0].events.map(event=>[event.timeMs,event.durationMs,event.expected.midi.map(pitch=>pitch+12)]));
    expect(compilePracticeChart(source,"flute").tracks[0].events.map(event=>event.expected.midi)).toEqual(notes.map(note=>note.midi));
    expect(compilePart(source.tracks[0].events.slice(12,24),"flute",source.title,12).map(note=>note.midi)).toEqual(notes.slice(12,24).map(note=>note.midi));
  });
  it("treats Keys and Piano as the same instrument", () => {
    expect(instrumentKey("Keys")).toBe("piano");
    expect(instrumentKey("Keyboard")).toBe("piano");
    expect(compilePracticeChart(chart,"keys").tracks[0].events).toEqual(compilePracticeChart(chart,"piano").tracks[0].events);
    expect(rehearsalSongs.every(song=>song.roles.every(role=>role.instrument!=="keys"))).toBe(true);
  });
  it("preserves the supplied God Bless America trumpet part without dropping notes", () => {
    const source = parseChart(suppliedTrumpet);
    const practice = compilePracticeChart(source, "trumpet");
    expect(practice.tracks[0].events).toHaveLength(119);
    expect(
      practice.tracks[0].events.map((event) => [
        event.timeMs,
        event.durationMs,
        event.expected.midi,
      ]),
    ).toEqual(
      source.tracks[0].events.map((event) => [
        event.timeMs,
        event.durationMs,
        event.expected.midi,
      ]),
    );
    expect(writtenKey(source.keySignatures[0], "trumpet")).toMatchObject({
      key: "D",
      fifths: 2,
    });
    expect(
      arrangeForFivePlayers(source).parts.map((part) => part.instrument),
    ).toEqual(["Bb Trumpet"]);
  });
  it("scores drums by onset timing without requiring a pitch", () => {
    const event = compilePracticeChart(chart, "drums").tracks[0].events[0];
    expect(
      judgeEvent(event, { atMs: event.timeMs, onset: true, pitchHz: null }),
    ).toBe("hit");
    expect(
      judgeEvent(event, { atMs: event.timeMs, onset: false, pitchHz: null }),
    ).toBe("pending");
  });
  it("retains absolute timing and produces playable bass tab positions", () => {
    const practice = compilePracticeChart(chart, "bass");
    expect(practice.tracks[0].events.map((event) => event.timeMs)).toEqual(
      chart.tracks[0].events.map((event) => event.timeMs),
    );
    expect(
      practice.tracks[0].events.every((event) => event.strings.length === 1),
    ).toBe(true);
  });
});
describe("measure timing", () => {
  it("uses meter denominators and quarter-note BPM", () => {
    expect(
      measureBoundaries(
        {
          tempoMap: [{ timeMs: 0, bpm: 120 }],
          timeSignatures: [{ timeMs: 0, beats: 6, beatUnit: 8 }],
        },
        4500,
      ),
    ).toEqual([0, 1500, 3000, 4500]);
    const bars = measureBoundaries(chart, 5000);
    expect(bars[1]).toBeCloseTo((3 * 60000) / 88);
  });
  it("preserves progress during tempo changes and starts a bar at meter changes", () => {
    expect(
      measureBoundaries(
        {
          tempoMap: [
            { timeMs: 0, bpm: 120 },
            { timeMs: 1000, bpm: 60 },
          ],
          timeSignatures: [
            { timeMs: 0, beats: 4, beatUnit: 4 },
            { timeMs: 4000, beats: 3, beatUnit: 4 },
          ],
        },
        7000,
      ),
    ).toEqual([0, 3000, 4000, 7000]);
  });
});
