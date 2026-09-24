import { useEffect, useMemo, useRef, useState } from "react";
import { Formatter, Renderer, TabNote, TabStave, Voice } from "vexflow";
import clsx from "clsx";
import type { Chart } from "../charts/schema";
import { getPrimaryTrack } from "../charts/schema";
import { createLinearTabLayout, getCursorX, type TabLayout } from "./layout";
import type { GameplaySnapshot } from "../gameplay/engine";

type Props = {
  chart: Chart;
  snapshot: GameplaySnapshot;
  onMockHit: (eventId: string) => void;
};

export function VexTabView({ chart, snapshot, onMockHit }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(920);
  const layout = useMemo<TabLayout>(() => createLinearTabLayout(chart, width), [chart, width]);
  const cursorX = getCursorX(layout, snapshot.activeEventId, snapshot.playheadMs);

  useEffect(() => {
    if (!hostRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(680, Math.floor(entry.contentRect.width)));
    });
    observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = "";

    const renderer = new Renderer(host, Renderer.Backends.SVG);
    renderer.resize(layout.width, layout.height);
    const context = renderer.getContext();
    const stave = new TabStave(36, 54, layout.width - 72);
    stave.addTabGlyph();
    stave.setContext(context).draw();

    const notes = getPrimaryTrack(chart).events.map((event) => {
      const positions = event.strings.length
        ? event.strings.map((stringEvent) => ({
            str: stringEvent.string,
            fret: String(stringEvent.fret),
          }))
        : [{ str: 3, fret: "x" }];

      return new TabNote({
        positions,
        duration: event.expected.kind === "chord" ? "4" : "8",
      });
    });

    const voice = new Voice({ numBeats: Math.max(4, notes.length), beatValue: 4 }).setStrict(false);
    voice.addTickables(notes);
    new Formatter().joinVoices([voice]).format([voice], layout.width - 160);
    voice.draw(context, stave);
  }, [chart, layout]);

  return (
    <section className="tab-stage" aria-label="Guitar tab">
      <div className="tab-toolbar">
        <span>{chart.title}</span>
        <span>{chart.tuning.join(" ")}</span>
      </div>
      <div className="tab-scroll">
        <div className="tab-canvas" style={{ width: layout.width, height: layout.height }}>
          <div ref={hostRef} className="vex-host" />
          <div
            className={clsx("play-cursor", snapshot.stickyEventId && "is-stuck")}
            style={{ transform: `translateX(${cursorX}px)` }}
          />
          {layout.anchors.map((anchor) => {
            const state = snapshot.eventStates[anchor.id]?.result;
            const isActive = snapshot.activeEventId === anchor.id || snapshot.stickyEventId === anchor.id;
            return (
              <button
                key={anchor.id}
                className={clsx("note-hotspot", state, isActive && "active")}
                style={{
                  left: anchor.x - anchor.width / 2,
                  top: anchor.y - 46,
                  width: anchor.width,
                }}
                type="button"
                title={`Mock hit ${anchor.event.label ?? anchor.id}`}
                onClick={() => onMockHit(anchor.id)}
              >
                <span>{anchor.event.label ?? anchor.event.id}</span>
              </button>
            );
          })}
          <EffectsLayer layout={layout} snapshot={snapshot} />
        </div>
      </div>
    </section>
  );
}

function EffectsLayer({
  layout,
  snapshot,
}: {
  layout: TabLayout;
  snapshot: GameplaySnapshot;
}) {
  return (
    <div className="effects-layer" aria-hidden="true">
      {layout.anchors.map((anchor) => {
        const state = snapshot.eventStates[anchor.id]?.result;
        if (!state) return null;
        return (
          <span
            key={`${anchor.id}-${state}`}
            className={clsx("hit-burst", state)}
            style={{ left: anchor.x, top: anchor.y - 22 }}
          />
        );
      })}
    </div>
  );
}
