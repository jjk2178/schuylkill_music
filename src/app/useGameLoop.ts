import { useEffect, useRef } from "react";

export function useGameLoop(enabled: boolean, onFrame: (deltaMs: number) => void): void {
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    if (!enabled) return undefined;

    let raf = 0;
    let previous = performance.now();

    const tick = (now: number) => {
      const delta = Math.min(80, now - previous);
      previous = now;
      onFrameRef.current(delta);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);
}
