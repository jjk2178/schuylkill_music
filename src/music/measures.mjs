// Tempo values are quarter-note BPM. A meter change starts a new measure;
// a tempo change preserves progress within the current measure.
export function measureBoundaries(chart, endMs) {
  const tempos = [...chart.tempoMap].sort((a, b) => a.timeMs - b.timeMs);
  const meters = [...chart.timeSignatures].sort((a, b) => a.timeMs - b.timeMs);
  const changes = [
    ...new Set([
      0,
      ...tempos.map((e) => e.timeMs),
      ...meters.map((e) => e.timeMs),
    ]),
  ].sort((a, b) => a - b);
  let bpm = tempos[0]?.bpm ?? 100,
    meter = meters[0] ?? { beats: 4, beatUnit: 4 };
  let remaining = chart.pickupQuarters ?? (meter.beats * 4) / meter.beatUnit;
  const bars = [0];
  for (let i = 0; i < changes.length && changes[i] <= endMs; i++) {
    const start = changes[i],
      stop = Math.min(changes[i + 1] ?? endMs, endMs);
    const tempo = tempos.find((e) => e.timeMs === start);
    if (tempo) bpm = tempo.bpm;
    const nextMeter = meters.find((e) => e.timeMs === start);
    if (nextMeter) {
      meter = nextMeter;
      remaining = start === 0 && chart.pickupQuarters ? chart.pickupQuarters : (meter.beats * 4) / meter.beatUnit;
      if (start > 0 && Math.abs(bars.at(-1) - start) > 0.001) bars.push(start);
    }
    let time = start;
    while (time + (remaining * 60000) / bpm <= stop + 0.001) {
      time += (remaining * 60000) / bpm;
      if (Math.abs(bars.at(-1) - time) > 0.001) bars.push(time);
      remaining = (meter.beats * 4) / meter.beatUnit;
    }
    remaining -= ((stop - time) * bpm) / 60000;
  }
  return bars;
}
export function tempoAt(chart, timeMs) {
  return (
    [...chart.tempoMap]
      .sort((a, b) => a.timeMs - b.timeMs)
      .filter((e) => e.timeMs <= timeMs)
      .at(-1)?.bpm ?? 100
  );
}
export function meterAt(chart, timeMs) {
  return (
    [...chart.timeSignatures]
      .sort((a, b) => a.timeMs - b.timeMs)
      .filter((e) => e.timeMs <= timeMs)
      .at(-1) ?? { beats: 4, beatUnit: 4, timeMs: 0 }
  );
}
