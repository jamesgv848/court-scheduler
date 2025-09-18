// src/components/MatchCard.jsx
import React, { useState, useMemo } from "react";
import PropTypes from "prop-types";
import {
  recordTeamWinner as apiRecordTeamWinner,
  undoWinner as apiUndoWinner,
} from "../api/supabase-actions";

/**
 * MatchCard
 * Props:
 *  - match: { id, match_index, court, player_ids: [...], winner: null | [uuid, uuid], match_date, ... }
 *  - playersMap: { [id]: name } // optional for display
 *  - onChange: callback to notify parent to refresh (optional)
 */
export default function MatchCard({ match, playersMap = {}, onChange }) {
  const [busy, setBusy] = useState(false);

  // Normalize players array (support legacy 'players' property as well)
  const playersArr = match.player_ids || match.players || [];
  const teamA = playersArr.slice(0, 2);
  const teamB = playersArr.slice(2, 4);

  // helper to show name from id
  const nameOf = (id) => (id ? playersMap[id] || id : "");

  // winner as array (new behavior) or null
  const winnerArr = Array.isArray(match.winner)
    ? match.winner
    : match.winner
    ? [match.winner]
    : [];
  const hasWinner = Array.isArray(winnerArr) && winnerArr.length > 0;

  // user-friendly winner label
  const winnerLabel = useMemo(() => {
    if (!hasWinner) return "";
    if (winnerArr.length === 1) return nameOf(winnerArr[0]);
    if (winnerArr.length === 2)
      return `${nameOf(winnerArr[0])} & ${nameOf(winnerArr[1])}`;
    return winnerArr.map((id) => nameOf(id)).join(", ");
  }, [winnerArr, playersMap]);

  // helper: call RPC to record team winner (pass both player ids)
  async function recordTeamWin(teamPlayers) {
    if (!Array.isArray(teamPlayers) || teamPlayers.length === 0) return;
    if (!match?.id) {
      alert("Match ID missing");
      return;
    }

    if (
      !window.confirm(
        `Confirm: mark ${teamPlayers
          .map(nameOf)
          .join(" & ")} as winners for match #${match.match_index}?`
      )
    ) {
      return;
    }

    try {
      setBusy(true);
      const res = await apiRecordTeamWinner(match.id, teamPlayers);
      console.debug("recordTeamWinner result", res);
      if (res.error) throw res.error;
      // notify parent to refresh
      onChange && onChange();
      // also dispatch a global event so scoreboard & other listeners refresh reliably
      window.dispatchEvent(new Event("scores-changed"));
    } catch (err) {
      console.error("recordTeamWinner error", err);
      alert("Failed to record winner: " + (err.message || JSON.stringify(err)));
    } finally {
      setBusy(false);
    }
  }

  // helper: undo winner (clear winners & delete scores)
  async function handleUndo() {
    if (!match?.id) return;
    if (!window.confirm("Clear winner and remove points for this match?"))
      return;
    try {
      setBusy(true);
      const res = await apiUndoWinner(match.id);
      console.debug("undoWinner result", res);
      if (res.error) throw res.error;
      onChange && onChange();
      window.dispatchEvent(new Event("scores-changed"));
    } catch (err) {
      console.error("undoWinner error", err);
      alert("Failed to undo winner: " + (err.message || JSON.stringify(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="match-card card" style={{ padding: 12, marginBottom: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 8,
              background: "#0b71d0",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
            }}
          >
            #{match.match_index}
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>
              {nameOf(teamA[0] || "")} & {nameOf(teamA[1] || "")}
            </div>
            <div style={{ color: "#666" }}>
              {nameOf(teamB[0] || "")} & {nameOf(teamB[1] || "")}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ textAlign: "right", minWidth: 110 }}>
            <div style={{ fontSize: 12, color: "#444" }}>
              Court {match.court}
            </div>
            <div style={{ fontSize: 12, color: "#666" }}>
              {match.match_date || ""}
            </div>
          </div>

          {hasWinner ? (
            <>
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: "#0b71d0",
                  color: "#fff",
                  fontWeight: 700,
                }}
              >
                Winner: {winnerLabel}
              </div>
              <button
                className="btn danger"
                onClick={handleUndo}
                disabled={busy}
                aria-label="Clear winner"
              >
                {busy ? "Working…" : "Clear"}
              </button>
            </>
          ) : (
            <>
              <button
                className="btn"
                onClick={() => recordTeamWin(teamA)}
                disabled={busy || teamA.length < 2}
                aria-label="Team A wins"
              >
                {busy ? "Working…" : "Team A Win"}
              </button>

              <button
                className="btn"
                onClick={() => recordTeamWin(teamB)}
                disabled={busy || teamB.length < 2}
                aria-label="Team B wins"
              >
                {busy ? "Working…" : "Team B Win"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

MatchCard.propTypes = {
  match: PropTypes.object.isRequired,
  playersMap: PropTypes.object,
  onChange: PropTypes.func,
};
