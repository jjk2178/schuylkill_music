import clsx from "clsx";
import type { Chart } from "../charts/schema";
import { getPrimaryTrack } from "../charts/schema";
import type { GameplaySnapshot } from "../gameplay/engine";
import { createLinearTabLayout, getCursorX } from "./layout";

type Props = {
  chart: Chart;
  snapshot: GameplaySnapshot;
  onMockHit: (eventId: string) => void;
};

const whiteKeys = [0, 2, 4, 5, 7, 9, 11];
const blackKeys = new Set([1, 3, 6, 8, 10]);

export function PianoRollView({ chart, snapshot, onMockHit }: Props) {
  const layout = createLinearTabLayout(chart, Math.max(920, getPrimaryTrack(chart).events.length * 58));
  const cursorX = getCursorX(layout, snapshot.activeEventId, snapshot.playheadMs);
  const events = getPrimaryTrack(chart).events;

  return (
    <section className="piano-stage" aria-label="Piano roll">
      <div className="tab-toolbar">
        <span>{chart.title}</span>
        <span>Grand staff practice</span>
      </div>
      <div className="tab-scroll">
        <div className="piano-canvas" style={{ width: layout.width }}>
          <div
            className={clsx("play-cursor", snapshot.stickyEventId && "is-stuck")}
            style={{ transform: `translateX(${cursorX}px)` }}
          />
          <Keyboard />
          <div className="piano-roll-lanes">
            {events.map((event) => {
              const anchor = layout.anchors.find((item) => item.id === event.id);
              const state = snapshot.eventStates[event.id]?.result;
              if (!anchor) return null;
              return (
                <button
                  key={event.id}
                  className={clsx("piano-event", state, snapshot.activeEventId === event.id && "active")}
                  style={{
                    left: anchor.x - anchor.width / 2,
                    width: event.expected.kind === "chord" ? 54 : 38,
                  }}
                  type="button"
                  title={`Mock hit ${event.label ?? event.id}`}
                  onClick={() => onMockHit(event.id)}
                >
                  <span>{event.label}</span>
                  {event.expected.midi.map((midi) => (
                    <i key={midi} style={{ bottom: `${midiToLane(midi)}px` }} />
                  ))}
                </button>
              );
            })}
          </div>
          <div className="effects-layer" aria-hidden="true">
            {layout.anchors.map((anchor) => {
              const state = snapshot.eventStates[anchor.id]?.result;
              if (!state) return null;
              return (
                <span
                  key={`${anchor.id}-${state}`}
                  className={clsx("hit-burst", state)}
                  style={{ left: anchor.x, top: 102 }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function Keyboard() {
  const keys = [];
  for (let midi = 48; midi <= 72; midi += 1) {
    keys.push(
      <span
        key={midi}
        className={clsx("piano-key", blackKeys.has(midi % 12) ? "black" : "white")}
        style={{
          left: `${((midi - 48) / 24) * 100}%`,
          width: blackKeys.has(midi % 12) ? "2.2%" : `${100 / whiteKeys.length / 3.6}%`,
        }}
      />,
    );
  }
  return <div className="keyboard">{keys}</div>;
}

function midiToLane(midi: number): number {
  return Math.max(18, Math.min(150, (midi - 43) * 5.2));
}
