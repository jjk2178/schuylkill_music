import { useEffect, useMemo, useRef, useState } from "react";
import { ArrangementAudioPlayer } from "../audio/arrangementPlayer";
import { parseChart, type Chart } from "../charts/schema";
import { scoreSystemIndex } from "../notation/scorePlayback";
import { GuitarChordDiagram } from "../notation/GuitarChordDiagram";
import type { GuitarChord } from "../music/guitarChords.mjs";
import "../app/styles.css";

type Song = {
  id: string;
  title: string;
  artist: string;
  chartUrl: string;
  completeUrl: string;
};
type Transport = "idle" | "playing" | "paused" | "complete";
type StoredGuitarShape = { frets: number[]; barres: { fromString: number; toString: number; fret: number }[] };
type TrackVisibility = { melody: boolean; rhythm: boolean; chords: boolean; pianoChords: boolean; lyrics: boolean };

const songs: Song[] = [
  {
    id: "how-far-ill-go",
    title: "How Far I'll Go",
    artist: "Lin-Manuel Miranda / Alessia Cara",
    chartUrl: "/user-songs/how-far-ill-go.json",
    completeUrl: "/rendered-scores/moana-how-far-ill-go-complete.html",
  },
  {
    id: "drivers-license",
    title: "drivers license",
    artist: "Olivia Rodrigo",
    chartUrl: "/user-songs/olivia-rodrigo-drivers-license-purchased.json",
    completeUrl: "/rendered-scores/drivers-license-complete.html",
  },
  {
    id: "fleetwood-mac-landslide",
    title: "Landslide",
    artist: "Fleetwood Mac",
    chartUrl: "/user-songs/fleetwood-mac-landslide.json",
    completeUrl: "/rendered-scores/landslide-complete.html",
  },
];

const timeLabel = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

// The arrangement chart stores the compact printable form (frets + barres).
// The interactive VexChords component also needs a string-by-string chord
// payload, so create that presentation-only shape without changing the source
// music data.
function displayChord(id: string, shape: StoredGuitarShape): GuitarChord {
  const position = Math.max(1, Math.min(...shape.frets.filter((fret) => fret > 0), 1));
  return {
    id,
    frets: shape.frets,
    position,
    chord: shape.frets.map((fret, index) => [
      6 - index,
      fret < 0 ? "x" : fret === 0 ? 0 : fret - position + 1,
    ]),
    barres: shape.barres,
    pitchClasses: [],
  };
}

export function RehearsalPlayerApp() {
  const [songId, setSongId] = useState(songs[0].id);
  const [chart, setChart] = useState<Chart | null>(null);
  const [ready, setReady] = useState(false);
  const [transport, setTransport] = useState<Transport>("idle");
  const [playhead, setPlayhead] = useState(0);
  const [tempoPercent, setTempoPercent] = useState(100);
  const [error, setError] = useState("");
  const [visibleTracks, setVisibleTracks] = useState<TrackVisibility>({ melody: true, rhythm: true, chords: true, pianoChords: true, lyrics: true });
  const frame = useRef<HTMLIFrameElement>(null);
  const player = useRef(new ArrangementAudioPlayer());
  const request = useRef(0);
  const playheadRef = useRef(0);
  const scrolledSystem = useRef<HTMLElement | null>(null);
  const song = songs.find((candidate) => candidate.id === songId) ?? songs[0];
  const duration = useMemo(
    () => Math.max(0, ...(chart?.tracks.flatMap((track) => track.events).map((event) => event.timeMs + event.durationMs) ?? [0])),
    [chart],
  );
  const currentLyric = [...(chart?.lyrics ?? [])].reverse().find((lyric) => lyric.timeMs <= playhead) ?? chart?.lyrics?.[0];
  const lyricSection = chart?.rehearsalLyrics?.find((section) => section.label === currentLyric?.verse);
  const lyricSectionIndex = lyricSection ? chart?.rehearsalLyrics?.indexOf(lyricSection) ?? -1 : -1;
  const previousLyricSection = lyricSectionIndex > 0 ? chart?.rehearsalLyrics?.[lyricSectionIndex - 1] : undefined;
  const nextLyricSection = lyricSectionIndex >= 0 ? chart?.rehearsalLyrics?.[lyricSectionIndex + 1] : undefined;
  const chordCues = chart?.lyricChordCues ?? [];
  const currentCue = [...chordCues].reverse().find((cue) => cue.timeMs <= playhead) ?? chordCues[0];
  const storedShape = currentCue ? chart?.guitarArrangement?.shapes[currentCue.chord] : undefined;
  const chord = currentCue && storedShape ? displayChord(currentCue.chord, storedShape) : undefined;
  const enabledInstruments = useMemo(
    () => [
      ...(visibleTracks.melody ? ["vocals"] : []),
      ...(visibleTracks.rhythm ? ["piano"] : []),
    ],
    [visibleTracks.melody, visibleTracks.rhythm],
  );
  const enabledTrackIds = useMemo(() => {
    if (!chart) return [];
    const recoveredPiano = chart.tracks.filter((track) => track.instrument === "piano" && track.role === "piano-accompaniment");
    const rhythmPiano = recoveredPiano.length
      ? recoveredPiano
      : chart.tracks.filter((track) => track.instrument === "piano" && track.role !== "piano-accompaniment");
    return chart.tracks
      .filter((track) =>
        (visibleTracks.melody && track.instrument === "vocals") ||
        // Where a score has recovered accompaniment staves, they are the
        // rhythm source; a mixed imported piano reduction can contain melody.
        (visibleTracks.rhythm && rhythmPiano.includes(track)),
      )
      .map((track) => track.id);
  }, [chart, visibleTracks.melody, visibleTracks.rhythm]);
  playheadRef.current = playhead;

  function stop(next: Transport = "paused") {
    request.current += 1;
    const time = player.current.getPlaybackTimeMs();
    if (time !== null) setPlayhead(Math.min(duration, time));
    player.current.stop();
    setTransport(next);
  }
  function seek(time: number) {
    stop();
    setPlayhead(Math.max(0, Math.min(duration, time)));
  }
  async function play() {
    if (!chart || !ready) return;
    if (tempoPercent === 0) { setTransport("paused"); return; }
    const id = ++request.current;
    try {
      await player.current.start(chart, playhead >= duration ? 0 : playhead, true, () => request.current === id, enabledInstruments, tempoPercent / 100, enabledTrackIds);
      if (request.current !== id) return;
      setTransport("playing");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start rehearsal audio.");
    }
  }

  useEffect(() => {
    request.current += 1;
    player.current.stop();
    setChart(null); setReady(false); setTransport("idle"); setPlayhead(0); setError(""); scrolledSystem.current = null;
    const controller = new AbortController();
    fetch(song.chartUrl, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Unable to load this chart.")))
      .then((data) => { if (!controller.signal.aborted) setChart(parseChart(data)); })
      .catch((caught) => { if (!controller.signal.aborted) setError(caught.message); });
    return () => controller.abort();
  }, [song]);
  useEffect(() => () => { request.current += 1; player.current.dispose(); }, []);
  useEffect(() => {
    if (transport !== "playing" || !chart) return;
    if (tempoPercent === 0) { stop(); return; }
    player.current.play(chart, player.current.getPlaybackTimeMs() ?? playheadRef.current, true, enabledInstruments, tempoPercent / 100, enabledTrackIds);
  }, [chart, enabledInstruments, enabledTrackIds, tempoPercent, transport]);
  useEffect(() => {
    if (transport !== "playing") return;
    let animation = 0;
    const tick = () => {
      const time = Math.min(duration, player.current.getPlaybackTimeMs() ?? 0);
      setPlayhead(time);
      if (time >= duration) { player.current.stop(); setTransport("complete"); return; }
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [duration, transport]);
  useEffect(() => {
    setReady(false);
    const timer = window.setInterval(() => {
      const doc = frame.current?.contentDocument;
      if (doc?.documentElement.dataset.vexflowReady === "true") { setReady(true); window.clearInterval(timer); }
    }, 100);
    return () => window.clearInterval(timer);
  }, [song.completeUrl]);
  useEffect(() => {
    if (!ready) return;
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    if (!doc.getElementById("rehearsal-playhead-style")) {
      const style = doc.createElement("style");
      style.id = "rehearsal-playhead-style";
      style.textContent = `
        /* Keep printable systems vertically stacked in the full-screen
           player, but remove fixed paper-height gaps and clipping. */
        html, body { width:auto !important; min-width:100% !important; overflow-x:hidden !important; overflow-y:auto !important; }
        .page.complete-page { display:block !important; break-after:auto !important; min-height:0 !important; margin:0 auto !important; padding-top:0 !important; padding-bottom:0 !important; box-shadow:none !important; }
        .page.complete-page:not(:first-of-type) > .top,
        .page.complete-page:not(:first-of-type) > .part-note { display:none !important; }
        .complete-score { display:block !important; width:auto !important; }
        .complete-empty-system { display:none !important; }
        .complete-system { position:relative; width:920px; height:auto !important; min-height:0; overflow:visible !important; border-right:0; }
        .complete-lyric-chord-lane { display:block !important; width:920px; height:150px !important; min-height:150px; overflow:visible !important; }
        .complete-chord-lane { position:relative !important; inset:auto !important; width:920px; height:120px !important; overflow:visible !important; }
        .complete-piano-chord-lane { position:relative !important; width:920px; height:116px !important; overflow:visible !important; }
        .complete-system .beat-lyrics { position:relative !important; top:auto !important; left:auto !important; width:920px; height:30px !important; overflow:visible !important; }
        html[data-show-melody="false"] .complete-melody,
        html[data-show-rhythm="false"] .complete-rhythm,
        html[data-show-chords="false"] .complete-chord-lane,
        html[data-show-piano-chords="false"] .complete-piano-chord-lane,
        html[data-show-lyrics="false"] .beat-lyrics { display:none !important; }
        .complete-lyric.is-active { fill:#c81e2b; font-weight:800; }
      `;
      doc.head.append(style);
    }
    doc.documentElement.dataset.showMelody = String(visibleTracks.melody);
    doc.documentElement.dataset.showRhythm = String(visibleTracks.rhythm);
    doc.documentElement.dataset.showChords = String(visibleTracks.chords);
    doc.documentElement.dataset.showPianoChords = String(visibleTracks.pianoChords);
    doc.documentElement.dataset.showLyrics = String(visibleTracks.lyrics);
    doc.querySelectorAll<SVGCircleElement>(".play-note-marker").forEach((marker) => {
      const start = Number(marker.dataset.start);
      const end = Number(marker.dataset.end);
      marker.classList.toggle("is-active", playhead >= start && playhead < end);
    });
    doc.querySelectorAll<HTMLElement>(".complete-chord[data-start-time], .complete-piano-chord[data-start-time]").forEach((chord) => {
      const start = Number(chord.dataset.startTime);
      const end = Number(chord.dataset.endTime);
      const beats = Math.max(1, Number(chord.dataset.durationBeats ?? 4));
      const beatMs = Math.max(1, (end - start) / beats);
      const completedBeats = Math.max(0, Math.min(beats, Math.floor((playhead - start) / beatMs + 0.0001)));
      const progress = chord.querySelector<HTMLElement>(".complete-chord-progress");
      if (progress) progress.style.width = `${(completedBeats / beats) * 100}%`;
    });
    const systems = Array.from(doc.querySelectorAll<HTMLElement>(".complete-system:not(.complete-empty-system)"));
    const staffs = systems.map((system) => system.querySelector<HTMLElement>(".vf-staff"));
    const index = scoreSystemIndex(playhead, staffs.map((staff) => ({ startMs: Number(staff?.dataset.timeStart ?? 0), endMs: Number(staff?.dataset.timeEnd ?? 0) })));
    systems.forEach((system, systemIndex) => {
      const staff = staffs[systemIndex];
      if (systemIndex !== index || !staff) return;
      if (scrolledSystem.current !== system) {
        frame.current?.contentWindow?.scrollTo({ top: Math.max(0, system.getBoundingClientRect().top + (frame.current.contentWindow?.scrollY ?? 0) - 70), behavior: "smooth" });
        scrolledSystem.current = system;
      }
    });
  }, [playhead, ready, visibleTracks]);

  return <main className="rehearsal-player-shell">
    <header className="rehearsal-heading"><div><p className="eyebrow">Band rehearsal</p><h1>Sing + play along</h1><p>Grand staff, karaoke lyric cue, and guitar harmony share one beat clock.</p></div><a href="/score-player">Instrument score player</a></header>
    <aside className="rehearsal-side-panel">
      <section className="rehearsal-controls">
        <label>Song<select value={songId} onChange={(event) => setSongId(event.target.value)}>{songs.map((option) => <option value={option.id} key={option.id}>{option.title} — {option.artist}</option>)}</select></label>
        <div className="rehearsal-buttons"><button disabled={!ready || !chart || transport === "playing"} onClick={() => void play()}>Play</button><button disabled={transport !== "playing"} onClick={() => stop()}>Pause</button><button disabled={!chart} onClick={() => { seek(0); setTransport("idle"); }}>Reset</button></div>
        <label className="rehearsal-seek">Position<input type="range" min="0" max={duration || 1} value={playhead} onChange={(event) => seek(Number(event.target.value))} /></label>
        <output>{timeLabel(playhead)} / {timeLabel(duration)}</output>
        <label className="rehearsal-tempo">Tempo <output>{tempoPercent}%</output><input type="range" min="0" max="200" step="5" value={tempoPercent} onChange={(event) => setTempoPercent(Number(event.target.value))} /></label>
      </section>
      {visibleTracks.lyrics && <section className="rehearsal-lyrics-reader" aria-live="polite" aria-label="Song section lyrics">
        <div className="lyric-context lyric-previous"><span>Previous</span>{previousLyricSection ? <><strong>{previousLyricSection.label}</strong>{previousLyricSection.lines.map((line) => <p key={line}>{line}</p>)}</> : <p>—</p>}</div>
        <div className="lyric-context lyric-current"><span>Now</span><strong>{lyricSection?.label ?? currentLyric?.verse ?? "Instrumental"}</strong>{lyricSection?.lines.map((line) => <p key={line}>{line}</p>) ?? <p>Instrumental</p>}</div>
        <div className="lyric-context lyric-next"><span>Next</span>{nextLyricSection ? <><strong>{nextLyricSection.label}</strong>{nextLyricSection.lines.map((line) => <p key={line}>{line}</p>)}</> : <p>—</p>}</div>
      </section>}
      <fieldset className="rehearsal-track-picker">
        <legend>Visible score tracks</legend>
        {([ ["melody", "Lead Melody"], ["rhythm", "Rhythm Piano"], ["chords", "Guitar Chords"], ["pianoChords", "Piano Chords"], ["lyrics", "Lyrics"] ] as const).map(([track, label]) => <label key={track}><input type="checkbox" checked={visibleTracks[track]} onChange={() => setVisibleTracks((current) => ({ ...current, [track]: !current[track] }))} />{label}</label>)}
      </fieldset>
    </aside>
    {visibleTracks.chords && <section className="karaoke-panel chord-only" aria-live="polite"><div className="karaoke-chord"><span>Guitar chord now</span>{chord ? <GuitarChordDiagram chord={chord} /> : <strong>{currentCue?.chord ?? "—"}</strong>}</div></section>}
    {error && <p role="alert">{error}</p>}
    <iframe ref={frame} className="rehearsal-score-frame" title={`${song.title} interactive complete score`} src={song.completeUrl} />
  </main>;
}
