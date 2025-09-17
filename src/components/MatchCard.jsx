// src/components/MatchCard.jsx
import React, { useState } from "react";
import { recordTeamWinner, undoWinner } from "../api/supabase-actions";

export default function MatchCard({ match, onChange }) {
  const [busy, setBusy] = useState(false);

  // support DB rows (player_ids) or in-memory (players)
  const playersArr = match.player_ids || match.players || [];
  const teamA = playersArr.slice(0, 2);
  const teamB = playersArr.slice(2, 4);

  async function doTeamWin(teamPlayers) {
    try {
      setBusy(true);
      const res = await recordTeamWinner(match.id, teamPlayers);
      if (res.error) throw res.error;
      onChange && onChange();
    } catch (err) {
      console.error(err);
      alert("Failed to record winner: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  async function doUndo() {
    try {
      setBusy(true);
      const res = await undoWinner(match.id);
      if (res.error) throw res.error;
      onChange && onChange();
    } catch (err) {
      console.error(err);
      alert("Failed to undo: " + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="match-card card">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="match-index">#{match.match_index}</div>
        <div>
          <div className="team">{teamA.join(" & ")}</div>
          <div style={{ color: "#666" }} className="team">
            {teamB.join(" & ")}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="winner-btn btn small"
          onClick={() => doTeamWin(teamA)}
          disabled={busy}
        >
          Team A Win
        </button>
        <button
          className="winner-btn btn small"
          onClick={() => doTeamWin(teamB)}
          disabled={busy}
        >
          Team B Win
        </button>
        <button className="undo-btn btn small" onClick={doUndo} disabled={busy}>
          Undo
        </button>
      </div>
    </div>
  );
}
