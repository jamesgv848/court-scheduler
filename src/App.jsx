// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import SchedulePage from "./pages/SchedulePage";
import ScoreboardPage from "./pages/ScoreboardPage";
import PlayersPage from "./pages/PlayersPage";
import "./index.css";

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ padding: "12px 20px" }}>
        <nav style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <Link to="/">Schedule</Link>
          <Link to="/scoreboard">Scoreboard</Link>
          <Link to="/players">Players</Link>
        </nav>
        <Routes>
          <Route path="/" element={<SchedulePage />} />
          <Route path="/scoreboard" element={<ScoreboardPage />} />
          <Route path="/players" element={<PlayersPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
