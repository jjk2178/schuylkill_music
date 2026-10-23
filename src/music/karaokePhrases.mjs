// Karaoke phrases are intentionally smaller than source lyric lines. The
// imported chord sheets tell us where a line begins, while the highest piano
// notes give a practical visual proxy for where a singer's next phrase starts.
// This keeps the words legible under the score without claiming syllable-level
// transcription where the supplied source does not contain it.

function wordsForPhrase(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function phraseWordGroups(words) {
  const count = Math.max(1, Math.ceil(words.length / 5));
  const base = Math.floor(words.length / count);
  const extra = words.length % count;
  const groups = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const size = base + (index < extra ? 1 : 0);
    groups.push(words.slice(cursor, cursor + size));
    cursor += size;
  }
  return groups;
}

function melodyCandidates(chart, startMs, endMs) {
  return (chart.tracks ?? [])
    .flatMap((track) => track.events ?? [])
    .filter((event) => event.timeMs >= startMs && event.timeMs < endMs && event.midi?.length)
    .map((event) => ({ timeMs: event.timeMs, pitch: Math.max(...event.midi) }))
    .sort((a, b) => a.timeMs - b.timeMs);
}

function highNoteNear(candidates, targetMs, startMs, endMs) {
  if (!candidates.length) return targetMs;
  const span = Math.max(1, endMs - startMs);
  const highest = Math.max(...candidates.map((candidate) => candidate.pitch));
  // Favor high notes, while retaining enough proximity to prevent a phrase
  // jumping to a musically unrelated part of the line.
  const selected = candidates.reduce((best, candidate) => {
    const proximity = 1 - Math.min(1, Math.abs(candidate.timeMs - targetMs) / (span * 0.34));
    const height = (candidate.pitch - 36) / Math.max(1, highest - 36);
    const score = proximity * 0.62 + height * 0.38;
    return !best || score > best.score ? { ...candidate, score } : best;
  }, null);
  return selected?.timeMs ?? targetMs;
}

export function buildKaraokePhrases(chart) {
  const lyrics = [...(chart.lyrics ?? [])].sort((a, b) => a.timeMs - b.timeMs);
  const chartEnd = Math.max(
    ...((chart.tracks ?? []).flatMap((track) => track.events ?? []).map((event) => event.timeMs + event.durationMs)),
    0,
  );
  return lyrics.flatMap((lyric, lyricIndex) => {
    const words = wordsForPhrase(lyric.text);
    const groups = phraseWordGroups(words);
    const startMs = lyric.timeMs;
    const endMs = Math.max(startMs + 1, lyrics[lyricIndex + 1]?.timeMs ?? chartEnd);
    const candidates = melodyCandidates(chart, startMs, endMs);
    let previousStart = startMs - 1;
    return groups.map((group, groupIndex) => {
      const ideal = startMs + ((endMs - startMs) * groupIndex) / groups.length;
      const anchored = groupIndex === 0 ? startMs : highNoteNear(candidates, ideal, startMs, endMs);
      // Phrase starts must remain chronological, even if two high-note
      // candidates resolve to the same piano attack.
      const timeMs = Math.max(previousStart + 1, anchored);
      previousStart = timeMs;
      return {
        text: group.join(" "),
        timeMs,
        sourceTimeMs: startMs,
        verse: lyric.verse,
      };
    });
  });
}
