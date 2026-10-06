import { useEffect, useMemo, useRef } from "react";
import type { Chart } from "../charts/schema";
import { getChartDurationMs, getPrimaryTrack } from "../charts/schema";
import type { GameplaySnapshot } from "../gameplay/engine";
import { renderVexflowStaff } from "./vexflowStaffRenderer";
import { measureBoundaries, meterAt, tempoAt } from "../music/measures.mjs";
import { writtenPitches, writtenKey } from "../music/parts.mjs";
import { keySignatureAt, midiName } from "../arrangements/arranger";

export function PracticeScoreView({
  chart,
  snapshot,
  onMockHit,
}: {
  chart: Chart;
  snapshot: GameplaySnapshot;
  onMockHit: (id: string) => void;
}) {
  const treble = useRef<HTMLDivElement>(null),
    bass = useRef<HTMLDivElement>(null);
  const bars = useMemo(
    () => measureBoundaries(chart, getChartDurationMs(chart)),
    [chart],
  );
  const barIndex = Math.max(
    0,
    bars.reduce(
      (last, time, index) => (time <= snapshot.playheadMs ? index : last),
      0,
    ),
  );
  const page = Math.floor(barIndex / 4) * 4;
  const startMs = bars[page] ?? 0,
    endMs = bars[page + 4] ?? Math.max(startMs + 1, getChartDurationMs(chart));
  const events = useMemo(
    () =>
      getPrimaryTrack(chart).events.filter(
        (event) => event.timeMs >= startMs && event.timeMs < endMs,
      ),
    [chart, startMs, endMs],
  );
  useEffect(() => {
    const signature = writtenKey(
      keySignatureAt(chart, startMs),
      chart.instrument,
    );
    const notes = events.map((event) => ({
      ...event,
      midi: writtenPitches(event.expected.midi, chart.instrument),
    }));
    for (const [host, clef] of [
      [treble.current, "treble"],
      [bass.current, "bass"],
    ] as const) {
      if (!host) continue;
      const split = chart.instrument === "keys" || chart.instrument === "piano";
      const selected = split
        ? notes
            .map((note) => ({
              ...note,
              midi: note.midi.filter((pitch) =>
                note.staff ? note.staff === clef : clef === "treble" ? pitch >= 60 : pitch < 60,
              ),
            }))
            .filter((note) => note.midi.length || note.staff === clef)
        : notes;
      renderVexflowStaff(host, {
        notes:
          chart.instrument === "vocals"
            ? selected.map((note) => ({
                ...note,
                midi: note.midi.map((pitch) => {
                  const min = clef === "treble" ? 60 : 48,
                    max = clef === "treble" ? 81 : 60;
                  while (pitch < min) pitch += 12;
                  while (pitch > max) pitch -= 12;
                  return pitch;
                }),
              }))
            : selected,
        clef: chart.instrument === "drums" ? "percussion" : clef,
        keySignature: signature,
        width: 1000,
        height: 130,
        timeSignature: meterAt(chart, startMs),
        quarterMs: 60000 / tempoAt(chart, startMs),
        timePositioned: true,
        timeRange: { startMs, endMs },
        measureTimes: bars,
      });
    }
  }, [chart, events, startMs, endMs, bars]);
  const drums = chart.instrument === "drums";
  const drumLabels: Record<number, string> = {
    49: "Crash",
    42: "Hi-hat",
    38: "Snare",
    36: "Kick",
  };
  const drumY: Record<number, number> = { 49: 30, 42: 55, 38: 80, 36: 105 };
  const grand = ["keys", "piano", "vocals"].includes(chart.instrument);
  return (
    <section className="practice-score" aria-label="Instrument practice score">
      <div className="tab-toolbar">
        <strong>
          {chart.instrument} · measures {page + 1}–
          {Math.min(page + 4, bars.length)}
        </strong>
        <span>
          {chart.instrument === "trumpet"
            ? "B♭ trumpet · written pitch"
            : "Concert pitch"}
        </span>
      </div>
      <div className="practice-score-scroll">
        <div style={{ width: 1000, position: "relative" }}>
          <div ref={chart.instrument === "bass" ? bass : treble} />
          {chart.instrument === "vocals" && (
            <div className="practice-lyrics">
              {(chart.lyrics ?? [])
                .filter((l) => l.timeMs >= startMs && l.timeMs < endMs)
                .map((l) => l.text)
                .join(" · ") || "Lyric line — source lyrics not encoded"}
            </div>
          )}
          {grand && <div ref={bass} />}
          <div
            className="practice-score-cursor"
            style={{
              left:
                84 +
                Math.max(
                  0,
                  Math.min(
                    1,
                    (snapshot.playheadMs - startMs) / (endMs - startMs),
                  ),
                ) *
                  892,
            }}
          />
        </div>
      </div>
      <div className="practice-note-buttons">
        {events.map((event) => (
          <button
            type="button"
            key={event.id}
            onClick={() => onMockHit(event.id)}
            className={snapshot.eventStates[event.id]?.result ?? ""}
            aria-pressed={snapshot.activeEventId === event.id}
          >
            {drums
              ? event.expected.midi
                  .map((pitch) => drumLabels[pitch])
                  .join(" / ")
              : writtenPitches(event.expected.midi, chart.instrument)
                  .map(midiName)
                  .join(" ")}
            {snapshot.eventStates[event.id]?.result === "hit" ? " ✓" : ""}
          </button>
        ))}
      </div>
    </section>
  );
}
