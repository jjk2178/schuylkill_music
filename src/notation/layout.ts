import type { Chart, GuitarEvent } from "../charts/schema";
import { getPrimaryTrack } from "../charts/schema";

export type EventAnchor = {
  id: string;
  x: number;
  y: number;
  width: number;
  event: GuitarEvent;
};

export type TabLayout = {
  width: number;
  height: number;
  anchors: EventAnchor[];
};

export function createLinearTabLayout(chart: Chart, width: number): TabLayout {
  const events = getPrimaryTrack(chart).events;
  const height = 220;
  const padding = 72;
  const usable = Math.max(320, width - padding * 2);
  const lastTime = Math.max(...events.map((event) => event.timeMs), 1);

  return {
    width,
    height,
    anchors: events.map((event) => ({
      id: event.id,
      x: padding + (event.timeMs / lastTime) * usable,
      y: 98,
      width: event.expected.kind === "chord" ? 46 : 28,
      event,
    })),
  };
}

export function getCursorX(layout: TabLayout, activeEventId: string | null, playheadMs: number): number {
  const active = activeEventId
    ? layout.anchors.find((anchor) => anchor.id === activeEventId)
    : null;
  if (active) return active.x;

  const anchors = layout.anchors;
  const next = anchors.find((anchor) => anchor.event.timeMs >= playheadMs);
  const previous = [...anchors].reverse().find((anchor) => anchor.event.timeMs <= playheadMs);
  if (!previous) return anchors[0]?.x ?? 72;
  if (!next) return anchors.at(-1)?.x ?? previous.x;

  const span = next.event.timeMs - previous.event.timeMs || 1;
  const progress = (playheadMs - previous.event.timeMs) / span;
  return previous.x + (next.x - previous.x) * progress;
}
