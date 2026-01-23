// src/components/MatchCard.jsx
import React, { useState, useMemo } from "react";

import PropTypes from "prop-types";
import ConfirmModal from "./ConfirmModal";
import {
  recordTeamWinner as apiRecordTeamWinner,
  undoWinner as apiUndoWinner,
  deleteMatchById as apiDeleteMatchById,
  updateMatchPlayers as apiUpdateMatchPlayers, // NEW
} from "../api/supabase-actions";

/**
 * MatchCard — mobile-first, clickable team blocks to register winner.
 *
 * Behavior:
 *  - Clicking a team block opens confirmation modal to mark that team as winner.
 *  - After recording, the winning team block turns colored and shows a small trophy icon.
 *  - Clear button (undo) removes winner & points.
 *  - Completed matches get a stronger border to indicate finality.
 *  - Remove (delete) button only when no winner.
 *  - Edit players only when no winner (no extra confirm).
 */
export default function MatchCard({ match, playersMap = {}, onChange }) {
  const [busy, setBusy] = useState(false);
  const [scoreInput, setScoreInput] = useState("");

  // NEW: edit players state
  const [editPlayers, setEditPlayers] = useState([]);
  const [editOpen, setEditOpen] = useState(false);

  const [confirmState, setConfirmState] = useState({
    open: false,
    type: null, // teamRecord | undo | delete
    payload: null,
  });

  // normalize players array (some code paths call it players or player_ids)
  const playersArr = match.player_ids || match.players || [];
  const teamA = playersArr.slice(0, 2);
  const teamB = playersArr.slice(2, 4);
  const nameOf = (id) => (id ? playersMap[id] || id : "");

  // normalize winner to array form
  const winnerArr = Array.isArray(match.winner)
    ? match.winner
    : match.winner
      ? [match.winner]
      : [];
  const hasWinner = winnerArr.length > 0;

  const teamAIsWinner = hasWinner && teamA.some((id) => winnerArr.includes(id));
  const teamBIsWinner = hasWinner && teamB.some((id) => winnerArr.includes(id));

  const winnerLabel = useMemo(
    () => (hasWinner ? winnerArr.map(nameOf).join(" & ") : ""),
    [winnerArr, playersMap],
  );

  function openConfirmForTeam(teamPlayers) {
    setScoreInput("21-");
    setConfirmState({ open: true, type: "teamRecord", payload: teamPlayers });
  }

  function openConfirmUndo() {
    setScoreInput("");
    setConfirmState({ open: true, type: "undo", payload: null });
  }

  function openConfirmDelete() {
    setScoreInput("");
    setConfirmState({ open: true, type: "delete", payload: null });
  }

  // NEW: open edit players directly (no confirm)
  function openEditPlayers() {
    setEditPlayers(playersArr);
    setEditOpen(true);
  }

  async function doRecordTeamWin(teamPlayers) {
    setConfirmState({ open: false, type: null, payload: null });
    if (!match?.id) return alert("Match ID missing");

    const normalizedScore =
      scoreInput && scoreInput.trim() === "21-" ? "" : scoreInput.trim();

    if (normalizedScore) {
      const err = validateScore(normalizedScore);
      if (err) {
        alert(err);
        return;
      }
    }

    setBusy(true);
    try {
      const res = await apiRecordTeamWinner(
        match.id,
        teamPlayers,
        normalizedScore || null,
      );
      if (res.error) throw res.error;
      onChange && onChange();
      window.dispatchEvent(new Event("scores-changed"));
    } catch (err) {
      console.error("recordTeamWinner error", err);
      alert("Failed to record winner: " + (err.message || JSON.stringify(err)));
    } finally {
      setBusy(false);
      setScoreInput("");
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

  async function doDeleteMatch() {
    setConfirmState({ open: false, type: null, payload: null });
    if (!match?.id) return alert("Match ID missing");
    setBusy(true);
    try {
      const res = await apiDeleteMatchById(match.id);
      if (res.error) throw res.error;
      onChange && onChange();
      window.dispatchEvent(new Event("scores-changed"));
    } catch (err) {
      console.error("deleteMatchById error", err);
      alert("Failed to delete match: " + (err.message || JSON.stringify(err)));
    } finally {
      setBusy(false);
    }
  }

  // NEW: save edited players with duplicate validation
  async function doSaveEditedPlayers() {
    const unique = new Set(editPlayers.filter(Boolean));
    if (unique.size !== 4) {
      alert("Duplicate players detected. Each player must be unique.");
      return;
    }

    setBusy(true);
    try {
      const res = await apiUpdateMatchPlayers(match.id, editPlayers);
      if (res.error) throw res.error;
      setEditOpen(false);
      onChange && onChange();
      window.dispatchEvent(new Event("scores-changed"));
    } catch (err) {
      console.error("updateMatchPlayers error", err);
      alert("Failed to update players");
    } finally {
      setBusy(false);
    }
  }

  // TEAM BLOCK
  function TeamBlock({ ids = [], label = "A", emphasized = false }) {
    const [p0 = "", p1 = ""] = ids;
    const isA = label === "A";
    const color = isA ? "#0b71d0" : "#059669";
    const bg = emphasized ? color : "#fff";
    const textColor = emphasized ? "#fff" : color;

    return (
      <button
        type="button"
        onClick={() => openConfirmForTeam(ids)}
        disabled={busy}
        className={`team-block ${emphasized ? "team-winner" : ""}`}
        style={{ background: bg, color: textColor }}
      >
        <div
          className="team-label"
          style={{
            background: emphasized ? "rgba(255,255,255,0.06)" : "#eef2ff",
            color,
          }}
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

  function validateScore(score) {
    if (!/^\d{1,2}-\d{1,2}$/.test(score)) {
      return "Enter score like 21-18 or 11-9";
    }
    const [w, l] = score.split("-").map(Number);
    if (w <= l) return "Winning score must be higher than losing score";
    if (w - l < 2) return "Winning score must be at least 2 points higher";
    return null;
  }

  function handleScoreChange(e) {
    let v = e.target.value;
    if (v === "") {
      setScoreInput("");
      return;
    }
    v = v.replace(/[^\d-]/g, "");
    if ((v.match(/-/g) || []).length > 1) return;
    if (v.length === 2 && !v.includes("-")) v = v + "-";
    setScoreInput(v);
  }

  const rowClass = `match-card card compact-match ${
    hasWinner ? "match-completed" : ""
  }`;

  return (
    <div className={rowClass} style={{ padding: 12, marginBottom: 10 }}>
      {/* left */}
      <div className="match-left">
        <div className="match-index">#{match.match_index}</div>

        <div className="teams">
          <TeamBlock ids={teamA} label="A" emphasized={teamAIsWinner} />
          <div className="vs">vs</div>
          <TeamBlock ids={teamB} label="B" emphasized={teamBIsWinner} />
        </div>

        {match.score_text && <div>Score: {match.score_text}</div>}
      </div>

      {/* right */}
      <div className="match-right">
        <div className="court-pill">Court {match.court}</div>

        {!hasWinner && (
          <>
            <button className="btn btn-small" onClick={openEditPlayers}>
              Edit Players
            </button>

            <button
              className="btn btn-small btn-danger-outline"
              onClick={openConfirmDelete}
            >
              Remove
            </button>
          </>
        )}

        {hasWinner && (
          <>
            <div className="trophy" title={winnerLabel}>
              🏆
            </div>
            <button
              className="btn btn-small btn-danger"
              onClick={openConfirmUndo}
            >
              Clear
            </button>
          </>
        )}
      </div>

      {/* Winner / Delete Confirm Modal (UNCHANGED) */}
      <ConfirmModal
        open={confirmState.open}
        title={
          confirmState.type === "undo"
            ? "Clear match winner?"
            : confirmState.type === "delete"
              ? "Remove match?"
              : "Confirm winner"
        }
        message={
          confirmState.type === "undo" ? (
            "This will remove the recorded winner and subtract awarded points for this match. This cannot be undone."
          ) : confirmState.type === "delete" ? (
            "This will permanently remove this match (and any associated scores). This action cannot be undone."
          ) : confirmState.type === "teamRecord" ? (
            <div>
              <div style={{ marginBottom: 8 }}>
                Mark{" "}
                <strong>
                  {confirmState.payload
                    ? confirmState.payload.map(nameOf).join(" & ")
                    : ""}
                </strong>{" "}
                as winner for match #{match.match_index}?
              </div>

              <input
                type="text"
                placeholder="21-18"
                value={scoreInput}
                onChange={handleScoreChange}
                maxLength={5}
                autoFocus
                inputMode="numeric"
                style={{ width: "100%", padding: "6px 8px", fontSize: 14 }}
              />
            </div>
          ) : null
        }
        onCancel={() =>
          setConfirmState({ open: false, type: null, payload: null })
        }
        onConfirm={() => {
          if (confirmState.type === "teamRecord")
            doRecordTeamWin(confirmState.payload);
          else if (confirmState.type === "undo") doUndo();
          else if (confirmState.type === "delete") doDeleteMatch();
        }}
        confirmLabel={
          confirmState.type === "undo"
            ? "Clear"
            : confirmState.type === "delete"
              ? "Remove"
              : "Confirm"
        }
        cancelLabel="Cancel"
        loading={busy}
      />

      {/* Edit Players Modal */}
      <ConfirmModal
        open={editOpen}
        title="Edit players"
        message={
          <div style={{ display: "grid", gap: 8 }}>
            {editPlayers.map((pid, idx) => (
              <select
                key={idx}
                value={pid}
                onChange={(e) => {
                  const next = [...editPlayers];
                  next[idx] = e.target.value;
                  setEditPlayers(next);
                }}
              >
                {Object.entries(playersMap).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            ))}
          </div>
        }
        onCancel={() => setEditOpen(false)}
        onConfirm={doSaveEditedPlayers}
        confirmLabel="Save"
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
