// App.jsx
import React from "react";
import { Routes, Route, Link, Navigate } from "react-router-dom";
import SchedulePage from "./pages/SchedulePage";
import ScoreboardPage from "./pages/ScoreboardPage";
import PlayersPage from "./pages/PlayersPage";
import AuthPage from "./pages/AuthPage";
import ProtectedRoute from "./components/ProtectedRoute";
import PairingStats from "./pages/PairingStats";

export default function App() {
  // ✅ export default
  return (
    <div style={{ padding: "12px 20px" }}>
      <nav style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <Link to="/auth">SignUp</Link>
        <Link to="/">Schedule</Link>
        <Link to="/scoreboard">Scoreboard</Link>
        <Link to="/players">Players</Link>
        <Link to="/pairing-stats">Pairing Stats</Link>
      </nav>

      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <SchedulePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scoreboard"
          element={
            <ProtectedRoute>
              <ScoreboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/players"
          element={
            <ProtectedRoute>
              <PlayersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pairing-stats"
          element={
            <ProtectedRoute>
              <PairingStats />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
