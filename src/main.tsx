import React from "react";
import ReactDOM from "react-dom/client";
import { PluckAndPlayApp } from "./apps/PluckAndPlayApp";
import { ScorePlayerApp } from "./apps/ScorePlayerApp";
import { ScoreboardApp } from "./apps/ScoreboardApp";
import { RehearsalPlayerApp } from "./apps/RehearsalPlayerApp";

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <main style={{ padding: 24, color: "#fee2e2", fontFamily: "system-ui" }}>
        <h1>Unable to load this music view</h1>
        <p>{this.state.error.message}</p>
      </main>;
    }
    return this.props.children;
  }
}

const RootApp = window.location.pathname === "/rehearsal-player" ? RehearsalPlayerApp : window.location.pathname === "/score-player" ? ScorePlayerApp : import.meta.env.VITE_APP === "scoreboard" ? ScoreboardApp : PluckAndPlayApp;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary><RootApp /></AppErrorBoundary>
  </React.StrictMode>,
);
