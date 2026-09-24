import { useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, SlidersHorizontal, Waves } from "lucide-react";
import { demoChart } from "../charts/demoChart";
import { getPrimaryTrack } from "../charts/schema";
import { MicAnalyzer, type AnalysisFrame, type MicAnalyzerState } from "../audio/micAnalyzer";
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
import { useGameLoop } from "./useGameLoop";
import "./styles.css";

export function App() {
  const [mode, setMode] = useState<PlayMode>("practice-sticky");
  const [snapshot, setSnapshot] = useState<GameplaySnapshot>(() => createInitialSnapshot(mode));
  const [micState, setMicState] = useState<MicAnalyzerState>({ status: "idle" });
  const micRef = useRef<MicAnalyzer | null>(null);
  const chart = demoChart;
  const totalEvents = getPrimaryTrack(chart).events.length;
  const hitCount = Object.values(snapshot.eventStates).filter((state) => state.result === "hit").length;
  const accuracy = totalEvents ? Math.round((hitCount / totalEvents) * 100) : 0;

  useGameLoop(snapshot.transport === "playing", (deltaMs) => {
    setSnapshot((current) => advanceGameplay(chart, current, deltaMs));
  });

  const activeEvent = useMemo(
    () => getPrimaryTrack(chart).events.find((event) => event.id === snapshot.activeEventId),
    [chart, snapshot.activeEventId],
  );

  function setPlayMode(nextMode: PlayMode) {
    setMode(nextMode);
    setSnapshot(reset(nextMode));
  }

  function mockHit(eventId?: string) {
    const target =
      (eventId ? getPrimaryTrack(chart).events.find((event) => event.id === eventId) : undefined) ??
      activeEvent ??
      getPrimaryTrack(chart).events[0];
    setSnapshot((current) =>
      receiveInput(chart, current, {
        atMs: current.stickyEventId ? target.timeMs : Math.max(current.playheadMs, target.timeMs),
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
      await analyzer.start(handleAnalysisFrame);
      setMicState({ status: "running", rms: 0, pitchHz: null });
    } catch (error) {
      setMicState({
        status: "denied",
        message: error instanceof Error ? error.message : "Unable to start microphone.",
      });
    }
  }

  function handleAnalysisFrame(frame: AnalysisFrame) {
    setMicState({ status: "running", rms: frame.rms, pitchHz: frame.pitchHz });
    setSnapshot((current) =>
      receiveInput(chart, current, {
        atMs: current.playheadMs,
        pitchHz: frame.pitchHz,
        onset: frame.onset,
      }),
    );
  }

  return (
    <main className="app-shell">
      <aside className="side-panel">
        <div>
          <p className="eyebrow">Pluck n Play</p>
          <h1>Retro guitar trainer</h1>
        </div>

        <div className="song-card">
          <span className="song-art">PnP</span>
          <div>
            <strong>{chart.title}</strong>
            <small>{chart.artist}</small>
          </div>
        </div>

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
          <button type="button" onClick={() => setSnapshot((current) => start(current))}>
            <Play size={18} />
            Play
          </button>
          <button type="button" onClick={() => setSnapshot((current) => pause(current))}>
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

        <button className="mic-button" type="button" onClick={toggleMic}>
          <SlidersHorizontal size={18} />
          {micState.status === "running" ? "Stop mic" : "Start mic"}
        </button>
        <MicReadout state={micState} />
      </aside>

      <section className="play-area">
        <header className="hud">
          <HudTile label="Score" value={snapshot.score.toString()} />
          <HudTile label="Streak" value={snapshot.streak.toString()} />
          <HudTile label="Accuracy" value={`${accuracy}%`} />
          <HudTile label="Cursor" value={snapshot.stickyEventId ? "Stuck" : snapshot.transport} />
        </header>

        <VexTabView chart={chart} snapshot={snapshot} onMockHit={mockHit} />

        <section className="practice-strip">
          {getPrimaryTrack(chart).events.map((event) => {
            const result = snapshot.eventStates[event.id]?.result;
            return (
              <span key={event.id} className={result ?? "pending"}>
                {event.label ?? event.id}
              </span>
            );
          })}
        </section>
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
        <span>{state.pitchHz ? `${state.pitchHz.toFixed(1)} Hz` : "listening"}</span>
      </div>
    );
  }

  if (state.status === "denied" || state.status === "unsupported") {
    return <p className="mic-error">{state.message}</p>;
  }

  return <p className="mic-hint">Use mock hit, or start mic on localhost/HTTPS.</p>;
}
