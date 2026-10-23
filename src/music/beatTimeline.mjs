// A chart's musical coordinate system. Beats are quarter-note positions from
// the beginning of the chart; milliseconds are retained for playback.
export function timeToBeat(chart, timeMs) {
  const tempos = [...(chart.tempoMap ?? [])].sort((a, b) => a.timeMs - b.timeMs);
  if (!tempos.length) return 0;
  let beat = 0;
  for (let index = 0; index < tempos.length; index += 1) {
    const tempo = tempos[index];
    const end = tempos[index + 1]?.timeMs ?? timeMs;
    if (timeMs <= tempo.timeMs) break;
    beat += (Math.min(timeMs, end) - tempo.timeMs) * tempo.bpm / 60000;
    if (timeMs <= end) break;
  }
  return Number(beat.toFixed(6));
}

export function beatToTime(chart, beat) {
  const tempos = [...(chart.tempoMap ?? [])].sort((a, b) => a.timeMs - b.timeMs);
  if (!tempos.length) return 0;
  let remaining = beat;
  for (let index = 0; index < tempos.length; index += 1) {
    const tempo = tempos[index];
    const next = tempos[index + 1];
    const available = next ? (next.timeMs - tempo.timeMs) * tempo.bpm / 60000 : Infinity;
    if (remaining <= available) return Number((tempo.timeMs + remaining * 60000 / tempo.bpm).toFixed(6));
    remaining -= available;
  }
  return 0;
}

export function addBeatCoordinates(chart) {
  chart.beatUnit = "quarter";
  for (const track of chart.tracks ?? []) {
    for (const event of track.events ?? []) {
      event.beat = timeToBeat(chart, event.timeMs);
      event.durationBeats = Number((timeToBeat(chart, event.timeMs + event.durationMs) - event.beat).toFixed(6));
    }
  }
  for (const lyric of chart.lyrics ?? []) lyric.beat = timeToBeat(chart, lyric.timeMs);
  for (const cue of chart.lyricChordCues ?? []) cue.beat = timeToBeat(chart, cue.timeMs);
  return chart;
}
