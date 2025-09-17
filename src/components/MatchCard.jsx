// src/components/MatchCard.jsx
import React, { useState } from "react";
import { recordTeamWinner, undoWinner } from "../api/supabase-actions";

export default function MatchCard({ match, onChange, playersMap = {} }) {
  const [busy, setBusy] = useState(false);

  const playersArr = match.player_ids || match.players || [];
  const teamA = playersArr.slice(0, 2);
  const teamB = playersArr.slice(2, 4);

  const nameOf = (id) => (id ? playersMap[id] || id : "");

  // winner can be uuid (single player id) per earlier DB design;
  // for team winner we set matches.winner to first member's id in record_team_winner, so we'll
  // display winner name if present, and still allow undo.
  const hasWinner = !!match.winner;

  async function doTeamWin(teamPlayers) {
    if (!teamPlayers || teamPlayers.length === 0) return;
    try {
      setBusy(true);
      const res = await recordTeamWinner(match.id, teamPlayers);
      console.log("recordTeamWinner response", res);
      if (res.error) throw res.error;
      // success -> refresh parent
      onChange && onChange();
    } catch (err) {
      console.error("recordTeamWinner error", err);
      alert("Failed to record winner: " + (err.message || err));
    } finally {
      setBusy(false);
    }
  }

  // src/components/MatchCard.jsx  (relevant parts)

  async function doUndo() {
    if (!window.confirm("Clear winner and remove points for this match?"))
      return;
    try {
      setBusy(true);
      const { data, error } = await undoWinner(match.id); // calls RPC
      if (error) throw error;
      // call parent refresh
      onChange && onChange();
    } catch (err) {
      console.error("undoWinner error", err);
      alert("Failed to undo winner: " + (err.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="match-card card">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div className="match-index">#{match.match_index}</div>
        <div>
          <div className="team">
            {nameOf(teamA[0])} & {nameOf(teamA[1])}
          </div>
          <div style={{ color: "#666" }} className="team">
            {nameOf(teamB[0])} & {nameOf(teamB[1])}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {hasWinner ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                fontSize: 13,
                color: "#fff",
                background: "#0b71d0",
                padding: "6px 10px",
                borderRadius: 8,
              }}
            >
              Winner: {nameOf(match.winner)}
            </div>
            <button
              className="undo-btn btn small danger"
              onClick={doUndo}
              disabled={busy}
            >
              Clear
            </button>
          </div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
