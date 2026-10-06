import { GuitarChordReference } from "../notation/GuitarChordDiagram";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, SlidersHorizontal, Waves } from "lucide-react";
import {
  demoChart,
  getPrimaryTrack,
  pianoDemoChart,
  type Chart,
} from "../shared/musicLibraryBackend";
import {
  MicAnalyzer,
  type AnalysisFrame,
  type MicAnalyzerState,
} from "../audio/micAnalyzer";
import { useArrangementAudio } from "../audio/arrangementPlayer";
import { midiToHz } from "../audio/noteMath";
import {
  advanceGameplay,
  createInitialSnapshot,
  pause,
  receiveInput,
  reset,
  start,
  type GameplaySnapshot,
  type PlayMode,
} from "../gameplay/engine";
import { VexTabView } from "../notation/VexTabView";
import { PianoRollView } from "../notation/PianoRollView";
import { PracticeScoreView } from "../notation/PracticeScoreView";
import { rehearsalSongs } from "../band/rehearsalSet";
import { compilePracticeChart } from "../music/practice";
import { ArrangementBoard } from "../arrangements/ArrangementBoard";
import {
  loadDemoSong,
  loadDemoSongIndex,
  type DemoSongIndexItem,
} from "../shared/songDatabaseBackend";
import { useGameLoop } from "./useGameLoop";
import "./styles.css";

export function App() {
  const [mode, setMode] = useState<PlayMode>("practice-sticky");
  const [sourceChart, setChart] = useState<Chart>(demoChart);
  const [songIndex, setSongIndex] = useState<DemoSongIndexItem[]>([]);
  const [selectedSongId, setSelectedSongId] = useState("built-in-demo");
  const [libraryStatus, setLibraryStatus] = useState("Loading demo songs...");
  const [snapshot, setSnapshot] = useState<GameplaySnapshot>(() =>
    createInitialSnapshot(mode),
  );
  const [micState, setMicState] = useState<MicAnalyzerState>({
    status: "idle",
  });
  const micRef = useRef<MicAnalyzer | null>(null);
  const [selectedPart, setSelectedPart] = useState("");
  const [inputDevice, setInputDevice] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [guideAudio, setGuideAudio] = useState(false);
  const rehearsalSong = rehearsalSongs.find(
    (song) => song.title.toLowerCase() === sourceChart.title.toLowerCase(),
  );
  const roles = rehearsalSong?.roles ?? [];
  const role =
    roles.find(
      (candidate) =>
        `${candidate.player}:${candidate.instrument}` === selectedPart,
    ) ?? roles[0];
  const chart = useMemo(
    () =>
      role ? compilePracticeChart(sourceChart, role.instrument) : sourceChart,
    [sourceChart, role],
  );
  const chartRef = useRef(chart);
  chartRef.current = chart;
  useEffect(() => () => micRef.current?.stop(), []);
  const totalEvents = getPrimaryTrack(chart).events.length;
  const hitCount = Object.values(snapshot.eventStates).filter(
    (state) => state.result === "hit",
  ).length;
  const accuracy = totalEvents ? Math.round((hitCount / totalEvents) * 100) : 0;

  useArrangementAudio(
    chart,
    guideAudio && !snapshot.stickyEventId ? snapshot.transport : "paused",
    snapshot.playheadMs,
    !!role,
  );

  useGameLoop(snapshot.transport === "playing", (deltaMs) => {
    setSnapshot((current) => advanceGameplay(chart, current, deltaMs));
  });

  useEffect(() => {
    let mounted = true;
    loadDemoSongIndex()
      .then((songs) => {
        if (!mounted) return;
        setSongIndex(songs);
        setLibraryStatus(`${songs.length} songs loaded`);
        const first = songs.find(
          (song) => song.title === rehearsalSongs[0].title,
        );
        if (first) void selectSongFromIndex(first, songs.length);
      })
      .catch((error) => {
        if (!mounted) return;
        setLibraryStatus(
          error instanceof Error ? error.message : "Unable to load demo songs.",
        );
      });
    return () => {
      mounted = false;
    };
  }, []);

  const activeEvent = useMemo(
    () =>
      getPrimaryTrack(chart).events.find(
        (event) => event.id === snapshot.activeEventId,
      ),
    [chart, snapshot.activeEventId],
  );

  function setPlayMode(nextMode: PlayMode) {
    setMode(nextMode);
    setSnapshot(reset(nextMode));
  }

  async function selectSong(songId: string) {
    if (songId === "built-in-demo") {
      setSelectedSongId(songId);
      setChart(demoChart);
      setSnapshot(reset(mode));
      return;
    }
    if (songId === "built-in-piano-demo") {
      setSelectedSongId(songId);
      setChart(pianoDemoChart);
      setSnapshot(reset(mode));
      return;
    }

    const song = songIndex.find((item) => item.id === songId);
    if (!song) return;
    await selectSongFromIndex(song, songIndex.length);
  }

  async function selectSongFromIndex(
    song: DemoSongIndexItem,
    libraryCount: number,
  ) {
    setLibraryStatus(`Loading ${song.title}...`);
    try {
      const nextChart = await loadDemoSong(song.chartUrl);
      setSelectedSongId(song.id);
      setSelectedPart("");
      setChart(nextChart);
      setSnapshot(reset(mode));
      setLibraryStatus(`${libraryCount} songs loaded`);
    } catch (error) {
      setLibraryStatus(
        error instanceof Error
          ? error.message
          : "Unable to load selected song.",
      );
    }
  }

  function mockHit(eventId?: string) {
    const target =
      (eventId
        ? getPrimaryTrack(chart).events.find((event) => event.id === eventId)
        : undefined) ??
      activeEvent ??
      getPrimaryTrack(chart).events[0];
    if (!target) return;
    setSnapshot((current) =>
      receiveInput(chart, current, {
        atMs: current.stickyEventId
          ? target.timeMs
          : Math.max(current.playheadMs, target.timeMs),
        pitchHz: midiToHz(target.expected.midi[0] ?? 40),
        onset: true,
      }),
    );
  }

  async function toggleMic() {
    if (micState.status === "running") {
      micRef.current?.stop();
      micRef.current = null;
      setMicState({ status: "idle" });
      return;
    }

    try {
      setMicState({ status: "requesting" });
      const analyzer = new MicAnalyzer();
      micRef.current = analyzer;
      await analyzer.start(handleAnalysisFrame, inputDevice || undefined);
      setDevices(
        (await navigator.mediaDevices.enumerateDevices()).filter(
          (device) => device.kind === "audioinput",
        ),
      );
      setMicState({ status: "running", rms: 0, pitchHz: null });
    } catch (error) {
      micRef.current?.stop();
      micRef.current = null;
      setMicState({
        status: "denied",
        message:
          error instanceof Error
            ? error.message
            : "Unable to start microphone.",
      });
    }
  }

  function handleAnalysisFrame(frame: AnalysisFrame) {
    setMicState({ status: "running", rms: frame.rms, pitchHz: frame.pitchHz });
    setSnapshot((current) =>
      current.transport !== "playing"
        ? current
        : receiveInput(chartRef.current, current, {
            atMs: current.playheadMs,
            pitchHz: frame.pitchHz,
            onset:
              chartRef.current.instrument === "drums"
                ? frame.onset
                : frame.rms > 0.015 && frame.pitchHz !== null,
          }),
    );
  }

  return (
    <main className="app-shell trainer-shell">
      <aside className="side-panel">
        <a className="score-player-link" href="/score-player">Browse & play instrument scores →</a>
        <div>
          <p className="eyebrow">Pluck and Play</p>
          <h1>Retro play-along trainer</h1>
        </div>

        <div className="song-card">
          <span className="song-art">PnP</span>
          <div>
            <strong>{chart.title}</strong>
            <small>{chart.artist}</small>
          </div>
        </div>

        {role && (
          <label className="trainer-field">
            Instrument / player
            <select
              aria-label="Instrument / player"
              value={`${role.player}:${role.instrument}`}
              onChange={(event) => {
                setSelectedPart(event.target.value);
                setSnapshot(reset(mode));
              }}
            >
              {roles.map((item) => (
                <option
                  key={`${item.player}:${item.instrument}`}
                  value={`${item.player}:${item.instrument}`}
                >
                  {item.instrument} · {item.player}
                </option>
              ))}
            </select>
            <small>{role.notes}</small>
          </label>
        )}
        <label className="trainer-field">
          Audio input
          <select
            aria-label="Audio input"
            disabled={
              micState.status === "running" || micState.status === "requesting"
            }
            value={inputDevice}
            onChange={(event) => setInputDevice(event.target.value)}
          >
            <option value="">Default microphone / interface</option>
            {devices.map((device) => (
              <option value={device.deviceId} key={device.deviceId}>
                {device.label || "Audio input"}
              </option>
            ))}
          </select>
          <small>
            Start mic to discover inputs. Use a microphone or USB audio
            interface.{" "}
            {chart.instrument === "drums"
              ? "Drums score hit timing."
              : "Pitch scoring listens to one note at a time."}
          </small>
        </label>
        <label className="trainer-field">
          <span>
            <input
              type="checkbox"
              checked={guideAudio}
              onChange={(event) => setGuideAudio(event.target.checked)}
            />{" "}
            Play guide audio
          </span>
          <small>Use headphones while recording.</small>
        </label>

        <div className="mode-switch" role="group" aria-label="Play mode">
          <button
            className={mode === "practice-sticky" ? "selected" : ""}
            type="button"
            onClick={() => setPlayMode("practice-sticky")}
          >
            Sticky
          </button>
          <button
            className={mode === "performance" ? "selected" : ""}
            type="button"
            onClick={() => setPlayMode("performance")}
          >
            Run
          </button>
        </div>

        <div className="control-grid">
          <button
            type="button"
            onClick={() => setSnapshot((current) => start(current))}
          >
            <Play size={18} />
            Play
          </button>
          <button
            type="button"
            onClick={() => setSnapshot((current) => pause(current))}
          >
            <Pause size={18} />
            Pause
          </button>
          <button type="button" onClick={() => setSnapshot(reset(mode))}>
            <RotateCcw size={18} />
            Reset
          </button>
          <button type="button" onClick={() => mockHit()}>
            <Waves size={18} />
            Mock hit
          </button>
        </div>

        <button
          className="mic-button"
          type="button"
          disabled={micState.status === "requesting"}
          onClick={toggleMic}
        >
          <SlidersHorizontal size={18} />
          {micState.status === "running" ? "Stop mic" : "Start mic"}
        </button>
        <MicReadout state={micState} />
        <section className="song-library" aria-label="Song library">
          <div className="library-head">
            <strong>Song library</strong>
            <small>{libraryStatus}</small>
          </div>
          <button
            className={selectedSongId === "built-in-demo" ? "selected" : ""}
            type="button"
            onClick={() => void selectSong("built-in-demo")}
          >
            <span>Neon Open Strings</span>
            <small>Guitar - built-in fixture</small>
          </button>
          <button
            className={
              selectedSongId === "built-in-piano-demo" ? "selected" : ""
            }
            type="button"
            onClick={() => void selectSong("built-in-piano-demo")}
          >
            <span>Tiny C Major Study</span>
            <small>Piano - built-in fixture</small>
          </button>
          {[...songIndex]
            .sort((a, b) => {
              const ai = rehearsalSongs.findIndex(
                  (song) => song.title === a.title,
                ),
                bi = rehearsalSongs.findIndex((song) => song.title === b.title);
              return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
            })
            .map((song) => (
              <button
                key={song.id}
                className={selectedSongId === song.id ? "selected" : ""}
                type="button"
                onClick={() => void selectSong(song.id)}
              >
                <span>{song.title}</span>
                <small>
                  {rehearsalSongs.some((item) => item.title === song.title)
                    ? "Set list · "
                    : ""}
                  {song.instrument} - {song.license}
                </small>
              </button>
            ))}
          {rehearsalSongs
            .filter(
              (song) => !songIndex.some((item) => item.title === song.title),
            )
            .map((song) => (
              <button type="button" key={song.id} disabled>
                <span>{song.title}</span>
                <small>Set list · source chart unavailable</small>
              </button>
            ))}
        </section>
      </aside>

      <section className="play-area">
        <header className="hud">
          <HudTile label="Score" value={snapshot.score.toString()} />
          <HudTile label="Streak" value={snapshot.streak.toString()} />
          <HudTile label="Accuracy" value={`${accuracy}%`} />
          <HudTile
            label="Cursor"
            value={snapshot.stickyEventId ? "Stuck" : snapshot.transport}
          />
        </header>

        {role ? (
          <PracticeScoreView
            chart={chart}
            snapshot={snapshot}
            onMockHit={mockHit}
          />
        ) : chart.instrument === "piano" ? (
          <PianoRollView
            chart={chart}
            snapshot={snapshot}
            onMockHit={mockHit}
          />
        ) : (
          <VexTabView chart={chart} snapshot={snapshot} onMockHit={mockHit} />
        )}

        {chart.instrument === "guitar" ? <GuitarChordReference /> : null}

        {chart.assets?.sourcePageUrl && (
          <p className="source-line">
            Source:{" "}
            <a
              href={chart.assets.sourcePageUrl}
              target="_blank"
              rel="noreferrer"
            >
              Score source
            </a>
            {chart.assets.license ? ` - ${chart.assets.license}` : ""}
          </p>
        )}

        <section className="practice-strip" aria-label="Practice progress">
          {getPrimaryTrack(chart).events.map((event) => {
            const result = snapshot.eventStates[event.id]?.result;
            return (
              <span key={event.id} className={result ?? "pending"}>
                {event.label ?? event.id}
              </span>
            );
          })}
        </section>

        <ArrangementBoard
          chart={sourceChart}
          playheadMs={snapshot.playheadMs}
          playerName={role?.player}
        />
      </section>
    </main>
  );
}

function HudTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="hud-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MicReadout({ state }: { state: MicAnalyzerState }) {
  if (state.status === "running") {
    return (
      <div className="mic-readout">
        <span>RMS {(state.rms * 100).toFixed(1)}</span>
        <span>
          {state.pitchHz ? `${state.pitchHz.toFixed(1)} Hz` : "listening"}
        </span>
      </div>
    );
  }

  if (state.status === "denied" || state.status === "unsupported") {
    return <p className="mic-error">{state.message}</p>;
  }

  return (
    <p className="mic-hint">Use mock hit, or start mic on localhost/HTTPS.</p>
  );
}
