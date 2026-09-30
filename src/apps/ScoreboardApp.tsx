import { useEffect, useMemo, useState } from "react";
import { Pause, Play, RotateCcw, UserRound, Users } from "lucide-react";
import { ArrangementBoard } from "../arrangements/ArrangementBoard";
import {
  demoChart,
  getChartDurationMs,
  type Chart,
} from "../shared/musicLibraryBackend";
import {
  loadDemoSong,
  loadDemoSongIndex,
  type DemoSongIndexItem,
} from "../shared/songDatabaseBackend";
import { useGameLoop } from "../app/useGameLoop";
import { useArrangementAudio } from "../audio/arrangementPlayer";
import { bandMembers, rehearsalSongs } from "../band/rehearsalSet";
import "../app/styles.css";

type Transport = "idle" | "playing" | "paused";
type ScoreView = "arrangement" | "player";

export function ScoreboardApp() {
  const [chart, setChart] = useState<Chart>(demoChart);
  const [songIndex, setSongIndex] = useState<DemoSongIndexItem[]>([]);
  const [selectedSongId, setSelectedSongId] = useState("built-in-demo");
  const [libraryStatus, setLibraryStatus] = useState("Loading shared song database...");
  const [transport, setTransport] = useState<Transport>("idle");
  const [playheadMs, setPlayheadMs] = useState(0);
  const [scoreView, setScoreView] = useState<ScoreView>("arrangement");
  const [selectedPlayer, setSelectedPlayer] = useState("Nana");

  const durationMs = useMemo(() => getChartDurationMs(chart), [chart]);

  useArrangementAudio(chart, transport, playheadMs);

  useGameLoop(transport === "playing", (deltaMs) => {
    setPlayheadMs((current) => {
      const next = Math.min(durationMs, current + deltaMs);
      if (next >= durationMs) setTransport("paused");
      return next;
    });
  });

  useEffect(() => {
    let mounted = true;
    loadDemoSongIndex()
      .then((songs) => {
        if (!mounted) return;
        setSongIndex(songs);
        setLibraryStatus(`${songs.length} shared songs loaded`);
        const purchasedLinger = songs.find((song) => song.id === "cranberries-linger-purchased");
        if (purchasedLinger) {
          loadDemoSong(purchasedLinger.chartUrl)
            .then((nextChart) => {
              if (!mounted) return;
              setChart(nextChart);
              setSelectedSongId(purchasedLinger.id);
              setPlayheadMs(0);
              setTransport("idle");
            })
            .catch(() => {
              if (!mounted) return;
              setLibraryStatus(`${songs.length} shared songs loaded`);
            });
        }
      })
      .catch((error) => {
        if (!mounted) return;
        setLibraryStatus(error instanceof Error ? error.message : "Unable to load shared songs.");
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function selectSong(songId: string) {
    if (songId === "built-in-demo") {
      setSelectedSongId(songId);
      setChart(demoChart);
      setPlayheadMs(0);
      setTransport("idle");
      return;
    }

    const song = songIndex.find((item) => item.id === songId);
    if (!song) return;
    setLibraryStatus(`Loading ${song.title}...`);
    try {
      setChart(await loadDemoSong(song.chartUrl));
      setSelectedSongId(songId);
      setPlayheadMs(0);
      setTransport("idle");
      setLibraryStatus(`${songIndex.length} shared songs loaded`);
    } catch (error) {
      setLibraryStatus(error instanceof Error ? error.message : "Unable to load selected song.");
    }
  }

  return (
    <main className="app-shell scoreboard-shell">
      <aside className="side-panel">
        <div>
          <p className="eyebrow">Scoreboard</p>
          <h1>Band score builder</h1>
        </div>

        <div className="song-card">
          <span className="song-art">SB</span>
          <div>
            <strong>{chart.title}</strong>
            <small>{chart.artist}</small>
          </div>
        </div>

        <section className="song-library" aria-label="Shared song database">
          <div className="library-head">
            <strong>Songs</strong>
            <small>{libraryStatus}</small>
          </div>
          <button
            className={selectedSongId === "built-in-demo" ? "selected" : ""}
            type="button"
            onClick={() => void selectSong("built-in-demo")}
          >
            <span>Neon Open Strings</span>
            <small>Shared built-in fixture</small>
          </button>
          {songIndex.map((song) => (
            <button
              key={song.id}
              className={selectedSongId === song.id ? "selected" : ""}
              type="button"
              onClick={() => void selectSong(song.id)}
            >
              <span>{song.title}</span>
              <small>
                {song.instrument} - {song.license}
              </small>
            </button>
          ))}
        </section>

        <div className="control-grid">
          <button type="button" onClick={() => setTransport("playing")}>
            <Play size={18} />
            Play
          </button>
          <button type="button" onClick={() => setTransport("paused")}>
            <Pause size={18} />
            Pause
          </button>
          <button
            type="button"
            onClick={() => {
              setPlayheadMs(0);
              setTransport("idle");
            }}
          >
            <RotateCcw size={18} />
            Reset
          </button>
        </div>

        <section className="player-view-controls" aria-label="Score view">
          <div className="library-head">
            <strong>View</strong>
            <small>{scoreView === "player" ? `${selectedPlayer}'s part` : "Full band"}</small>
          </div>
          <div className="mode-switch">
            <button
              className={scoreView === "arrangement" ? "selected" : ""}
              type="button"
              onClick={() => setScoreView("arrangement")}
            >
              <Users size={15} />
              Band
            </button>
            <button
              className={scoreView === "player" ? "selected" : ""}
              type="button"
              onClick={() => setScoreView("player")}
            >
              <UserRound size={15} />
              Player
            </button>
          </div>
          {scoreView === "player" ? (
            <label className="player-select">
              <span>Player</span>
              <select value={selectedPlayer} onChange={(event) => setSelectedPlayer(event.target.value)}>
                {bandMembers.map((member) => <option key={member.name} value={member.name}>{member.name}</option>)}
              </select>
            </label>
          ) : null}
        </section>

        <section className="band-roster" aria-label="Available band members">
          <div className="library-head">
            <strong>Band</strong>
            <small>{bandMembers.length} players</small>
          </div>
          <div className="roster-list">
            {bandMembers.map((member) => (
              <span key={member.name}>
                <strong>{member.name}</strong>
                <small>{member.instruments.join(" / ")}</small>
              </span>
            ))}
          </div>
        </section>
      </aside>

      <section className="play-area">
        <header className="hud">
          <HudTile label="App" value="Scoreboard" />
          <HudTile label="Mode" value="Arrangement" />
          <HudTile label="Time" value={`${Math.round(playheadMs / 100) / 10}s`} />
          <HudTile label="Songs" value={String(songIndex.length + 1)} />
        </header>
        {scoreView === "arrangement" ? <section className="setlist-board" aria-label="Rehearsal song setup">
          {rehearsalSongs.map((song) => (
            <article key={song.id} className="setlist-card">
              <header>
                <div>
                  <p className="eyebrow">Setlist</p>
                  <h3>{song.title}</h3>
                  <small>{song.artist}</small>
                </div>
                <span>{song.status}</span>
              </header>
              <div className="role-grid">
                {song.roles.map((role) => (
                  <div key={`${song.id}-${role.player}`} className="role-chip">
                    <strong>{role.player}</strong>
                    <span>{role.part}</span>
                    <small>{role.notes}</small>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section> : null}
        <ArrangementBoard chart={chart} playheadMs={playheadMs} playerName={scoreView === "player" ? selectedPlayer : undefined} />
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
