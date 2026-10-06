import React from "react";
import ReactDOM from "react-dom/client";
import { PluckAndPlayApp } from "./apps/PluckAndPlayApp";
import { ScorePlayerApp } from "./apps/ScorePlayerApp";
import { ScoreboardApp } from "./apps/ScoreboardApp";

const RootApp = window.location.pathname === "/score-player" ? ScorePlayerApp : import.meta.env.VITE_APP === "scoreboard" ? ScoreboardApp : PluckAndPlayApp;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>,
);
