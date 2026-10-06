export function rhythmicValue(durationMs, quarterMs) {
  const values = [
    [4, "w", 0],
    [3, "h", 1],
    [2, "h", 0],
    [1.5, "q", 1],
    [1, "q", 0],
    [0.75, "8", 1],
    [0.5, "8", 0],
    [0.375, "16", 1],
    [0.25, "16", 0],
  ];
  const ratio = durationMs / quarterMs;
  const best = values.reduce((a, b) =>
    Math.abs(a[0] - ratio) <= Math.abs(b[0] - ratio) ? a : b,
  );
  return { duration: best[1], dots: best[2] };
}
// Group short notes inside a beat (dotted quarter for compound meters),
// stopping at a rest, a measure boundary, or a longer note.
export function beamGroups(notes, quarterMs, meter, measures = [0]) {
  const groups = [];
  let group = [];
  let bucket = "";
  const flush = () => {
    if (group.length > 1) groups.push(group);
    group = [];
  };
  const beatQuarters =
    meter.beatUnit === 8 && meter.beats % 3 === 0 ? 1.5 : 4 / meter.beatUnit;
  notes.forEach((note, index) => {
    const value = rhythmicValue(note.durationMs, quarterMs);
    const start = measures.filter((t) => t <= note.timeMs + 2).at(-1) ?? 0;
    const key = `${start}:${Math.floor((note.timeMs - start + 2) / (quarterMs * beatQuarters))}`;
    const prior = notes[index - 1];
    if (!["8", "16"].includes(value.duration) || !note.midi.length) {
      flush();
      bucket = "";
      return;
    }
    if (
      key !== bucket ||
      (prior && note.timeMs - prior.timeMs - prior.durationMs > quarterMs * 0.1)
    )
      flush();
    group.push(index);
    bucket = key;
  });
  flush();
  return groups;
}
