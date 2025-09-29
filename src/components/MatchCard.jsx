// src/components/MatchCard.jsx
import React, { useState, useMemo } from "react";
import PropTypes from "prop-types";
import ConfirmModal from "./ConfirmModal";
import {
  recordTeamWinner as apiRecordTeamWinner,
  undoWinner as apiUndoWinner,
} from "../api/supabase-actions";

/**
 * MatchCard — mobile-first, clickable team blocks to register winner.
 *
 * Behavior:
 *  - Clicking a team block opens confirmation modal to mark that team as winner.
 *  - After recording, the winning team block turns colored and shows a small trophy icon.
 *  - Clear button (undo) removes winner & points.
 *  - Completed matches get a stronger border to indicate finality.
 */
export default function MatchCard({ match, playersMap = {}, onChange }) {
  const [busy, setBusy] = useState(false);
  const [confirmState, setConfirmState] = useState({
    open: false,
    type: null,
    payload: null,
  });

  // normalize players array (some code paths call it players or player_ids)
  const playersArr = match.player_ids || match.players || [];
  const teamA = playersArr.slice(0, 2);
  const teamB = playersArr.slice(2, 4);
  const nameOf = (id) => (id ? playersMap[id] || id : "");

  // normalize winner to array form (we support either array of uuids or single uuid)
  const winnerArr = Array.isArray(match.winner)
    ? match.winner
    : match.winner
    ? [match.winner]
    : [];
  const hasWinner = winnerArr.length > 0;

  // whether team contains any winner id
  const teamAIsWinner = hasWinner && teamA.some((id) => winnerArr.includes(id));
  const teamBIsWinner = hasWinner && teamB.some((id) => winnerArr.includes(id));

  // compact display label for winner (not shown as text in row — team visuals indicate winner)
  const winnerLabel = useMemo(
    () => (hasWinner ? winnerArr.map(nameOf).join(" & ") : ""),
    [winnerArr, playersMap]
  );

  function openConfirmForTeam(teamPlayers) {
    setConfirmState({ open: true, type: "teamRecord", payload: teamPlayers });
  }
  function openConfirmUndo() {
    setConfirmState({ open: true, type: "undo", payload: null });
  }

  async function doRecordTeamWin(teamPlayers) {
    setConfirmState({ open: false, type: null, payload: null });
    if (!match?.id) return alert("Match ID missing");
    setBusy(true);
    try {
      const res = await apiRecordTeamWinner(match.id, teamPlayers);
      if (res.error) throw res.error;
      onChange && onChange();
      window.dispatchEvent(new Event("scores-changed"));
    } catch (err) {
      console.error("recordTeamWinner error", err);
      alert("Failed to record winner: " + (err.message || JSON.stringify(err)));
    } finally {
      setBusy(false);
    }
  }

  async function doUndo() {
    setConfirmState({ open: false, type: null, payload: null });
    if (!match?.id) return;
    setBusy(true);
    try {
      const res = await apiUndoWinner(match.id);
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

  // TEAM BLOCK: clickable - shows names stacked; when emphasized, uses color background and trophy
  function TeamBlock({ ids = [], label = "A", emphasized = false }) {
    const [p0 = "", p1 = ""] = ids;
    const isA = label === "A";
    const color = isA ? "#0b71d0" : "#059669"; // A: blue, B: green
    const bg = emphasized ? color : "#fff";
    const textColor = emphasized ? "#fff" : color;
    const subColor = emphasized ? "rgba(255,255,255,0.92)" : "#6b7280";

    return (
      // use CSS class team-block (defined in index.css) so sizing & flex behavior is consistent
      <button
        type="button"
        onClick={() => openConfirmForTeam(ids)}
        disabled={busy}
        aria-label={`Mark team ${label} as winner`}
        className={`team-block ${emphasized ? "team-winner" : ""}`}
        style={{
          // keep inline fallback but main rules live in CSS
          background: bg,
          color: textColor,
        }}
      >
        <div
          className="team-label"
          style={{
            background: emphasized ? "rgba(255,255,255,0.06)" : "#eef2ff",
            color: color,
          }}
          aria-hidden
        >
          {emphasized ? "🏆" : label}
        </div>

        <div className="team-names">
          <div className="team-name-main">{nameOf(p0) || "—"}</div>
          <div className="team-name-sub">{nameOf(p1) || "—"}</div>
        </div>
      </button>
    );
  }

  // row class includes .match-completed for stronger border if completed
  const rowClass = `match-card card compact-match ${
    hasWinner ? "match-completed" : ""
  }`;

  return (
    <div className={rowClass} style={{ padding: 12, marginBottom: 10 }}>
      {/* left: index + teams */}
      <div className="match-left" style={{ minWidth: 0 }}>
        <div className="match-index" aria-hidden style={{ flexShrink: 0 }}>
          #{match.match_index}
        </div>

        <div
          className="teams"
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <TeamBlock ids={teamA} label="A" emphasized={teamAIsWinner} />
          <div style={{ fontSize: 13, color: "#9ca3af", fontWeight: 700 }}>
            vs
          </div>
          <TeamBlock ids={teamB} label="B" emphasized={teamBIsWinner} />
        </div>
      </div>

      {/* right: actions */}
      <div className="match-right" style={{ marginLeft: 12 }}>
        <div className="court-pill" aria-hidden style={{ flexShrink: 0 }}>
          Court {match.court}
        </div>

        {hasWinner ? (
          <>
            <div className="trophy" title={winnerLabel} aria-hidden>
              🏆
            </div>
            <button
              className="btn btn-small btn-danger"
              onClick={openConfirmUndo}
              disabled={busy}
            >
              {busy ? "Working…" : "Clear"}
            </button>
          </>
        ) : (
          <>
            <button
              className="btn btn-small"
              onClick={() => openConfirmForTeam(teamA)}
              disabled={busy || teamA.length < 2}
            >
              {busy ? "Working…" : "A Win"}
            </button>
            <button
              className="btn btn-small"
              onClick={() => openConfirmForTeam(teamB)}
              disabled={busy || teamB.length < 2}
            >
              {busy ? "Working…" : "B Win"}
            </button>
          </>
        )}
      </div>

      {/* Confirm modal */}
      <ConfirmModal
        open={confirmState.open}
        title={
          confirmState.type === "undo"
            ? "Clear match winner?"
            : "Confirm winner"
        }
        message={
          confirmState.type === "undo"
            ? "This will remove the recorded winner and subtract awarded points for this match. This cannot be undone."
            : confirmState.type === "teamRecord"
            ? `Mark ${
                confirmState.payload
                  ? confirmState.payload.map(nameOf).join(" & ")
                  : ""
              } as winner for match #${match.match_index}?`
            : ""
        }
        onCancel={() =>
          setConfirmState({ open: false, type: null, payload: null })
        }
        onConfirm={() => {
          if (confirmState.type === "teamRecord")
            doRecordTeamWin(confirmState.payload);
          else if (confirmState.type === "undo") doUndo();
        }}
        confirmLabel={confirmState.type === "undo" ? "Clear" : "Confirm"}
        cancelLabel="Cancel"
        loading={busy}
      />
    </div>
  );
}

MatchCard.propTypes = {
  match: PropTypes.object.isRequired,
  playersMap: PropTypes.object,
  onChange: PropTypes.func,
};
