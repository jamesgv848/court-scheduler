// src/components/MatchCard.jsx
import React, { useState, useMemo } from "react";
import PropTypes from "prop-types";
import ConfirmModal from "./ConfirmModal";
import {
  recordTeamWinner as apiRecordTeamWinner,
  undoWinner as apiUndoWinner,
} from "../api/supabase-actions";

export default function MatchCard({ match, playersMap = {}, onChange }) {
  const [busy, setBusy] = useState(false);
  const [confirmState, setConfirmState] = useState({
    open: false,
    type: null,
    payload: null,
  });

  const playersArr = match.player_ids || match.players || [];
  const teamA = playersArr.slice(0, 2);
  const teamB = playersArr.slice(2, 4);

  const nameOf = (id) => (id ? playersMap[id] || id : "");

  const winnerArr = Array.isArray(match.winner)
    ? match.winner
    : match.winner
    ? [match.winner]
    : [];
  const hasWinner = winnerArr.length > 0;

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

  // tiny trophy SVG
  function TrophyIcon({ size = 14, color = "#fff" }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8 3H16V5C16 6.65685 14.6569 8 13 8H11C9.34315 8 8 6.65685 8 5V3Z"
          stroke={color}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6 3H5C3.89543 3 3 3.89543 3 5V7C3 8.65685 4.34315 10 6 10"
          stroke={color}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M18 3H19C20.1046 3 21 3.89543 21 5V7C21 8.65685 19.6569 10 18 10"
          stroke={color}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M12 10V15" stroke={color} strokeWidth="1.4" />
        <path d="M8 20H16" stroke={color} strokeWidth="1.4" />
      </svg>
    );
  }

  function TeamBlock({
    ids = [],
    label = "A",
    emphasized = false,
    onActivate,
  }) {
    const [p0 = "", p1 = ""] = ids;
    const isA = label === "A";
    const baseColor = isA ? "#0b71d0" : "#059669";
    const bg = emphasized ? baseColor : "#fff";
    const border = emphasized
      ? `1px solid ${baseColor}`
      : "1px solid rgba(15,23,36,0.04)";
    const titleColor = emphasized ? "#fff" : baseColor;
    const subColor = emphasized ? "rgba(255,255,255,0.92)" : "#6b7280";
    const clickable = typeof onActivate === "function" && !hasWinner;

    return (
      <div
        role={clickable ? "button" : "group"}
        tabIndex={clickable ? 0 : -1}
        onClick={() => clickable && onActivate(ids)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 8,
          background: bg,
          border,
          minWidth: 140,
          cursor: clickable ? "pointer" : "default",
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 6,
            background: emphasized ? "rgba(255,255,255,0.06)" : "#eef2ff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: baseColor,
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          {emphasized ? <TrophyIcon size={14} color="#fff" /> : label}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <div
            style={{
              fontWeight: 600,
              color: titleColor,
              fontSize: 13,
              lineHeight: "16px",
            }}
          >
            {nameOf(p0) || "—"}
          </div>
          <div
            style={{
              fontWeight: 500,
              color: subColor,
              fontSize: 12,
              lineHeight: "14px",
            }}
          >
            {nameOf(p1) || "—"}
          </div>
        </div>
      </div>
    );
  }

  // pick border color for completed match
  const borderColor = hasWinner
    ? teamA.some((id) => winnerArr.includes(id))
      ? "#0b71d0"
      : "#059669"
    : "rgba(15,23,36,0.04)";

  return (
    <div
      className="match-card card compact-match"
      style={{
        padding: 10,
        marginBottom: 8,
        border: `2px solid ${borderColor}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 10,
              background: "#0b71d0",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 16,
            }}
          >
            #{match.match_index}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <TeamBlock
              ids={teamA}
              label="A"
              emphasized={
                hasWinner && teamA.some((id) => winnerArr.includes(id))
              }
              onActivate={openConfirmForTeam}
            />
            <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 700 }}>
              vs
            </div>
            <TeamBlock
              ids={teamB}
              label="B"
              emphasized={
                hasWinner && teamB.some((id) => winnerArr.includes(id))
              }
              onActivate={openConfirmForTeam}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div
            style={{
              minWidth: 78,
              textAlign: "center",
              padding: "6px 10px",
              borderRadius: 8,
              background: "#eef2ff",
              color: "#0b71d0",
              fontWeight: 700,
              fontSize: 13,
              border: "1px solid rgba(11,113,208,0.08)",
            }}
          >
            Court {match.court}
          </div>
          {hasWinner ? (
            <button
              className="btn danger btn-small"
              onClick={openConfirmUndo}
              disabled={busy}
            >
              {busy ? "Working…" : "Clear"}
            </button>
          ) : (
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              Tap a team to record winner
            </div>
          )}
        </div>
      </div>

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
