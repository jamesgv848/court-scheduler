// src/components/MatchCard.jsx
import React, { useState } from "react";
import {
  recordTeamWinner,
  undoWinner,
  updateMatchPlayers,
  updateMatchRating,
  deleteMatchById,
} from "../api/supabase-actions";

// ── StarRating component ──────────────────────────────────────────────────────
// Used in both the winner dialog (during recording) and inline on the card footer
// (for editing completed matches).
//
// Props:
//   value      — current rating 1-5 or null
//   onChange   — called with new rating (1-5) or null (clear)
//   size       — "sm" (footer) | "md" (dialog)
//   disabled   — greys out, no interaction
function StarRating({ value, onChange, size = "md", disabled = false }) {
  const [hovered, setHovered] = useState(null);

  const starSize = size === "sm" ? 16 : 22;
  const gap = size === "sm" ? 3 : 6;
  const activeCol = "#f5a623"; // warm amber
  const emptyCol = "#dde1e7";

  return (
    <div
      style={{
        display: "inline-flex",
        gap,
        alignItems: "center",
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = (hovered ?? value ?? 0) >= n;
        return (
          <button
            key={n}
            type="button"
            onMouseEnter={() => !disabled && setHovered(n)}
            onMouseLeave={() => !disabled && setHovered(null)}
            onClick={() => {
              if (disabled) return;
              // Tapping the current exact value clears it
              onChange(value === n ? null : n);
            }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: disabled ? "default" : "pointer",
              fontSize: starSize,
              lineHeight: 1,
              color: filled ? activeCol : emptyCol,
              transition: "color .1s",
            }}
            title={`${n} star${n > 1 ? "s" : ""}`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

// ── Score formats & validation ────────────────────────────────────────────────
// "21" — classic: first to 21, win by 2, hard cap at 30 (30-29).
// "15" — new:     first to 15, deuce at 14-14 (win by 2),
//                 sudden death at 20-20 → first to 21 wins (21-20).
//
// Valid finished games in the 15-point format (winner-loser):
//   15-0 … 15-13
//   16-14, 17-15, 18-16, 19-17, 20-18   (2-point lead after deuce)
//   21-19, 21-20                        (cap: 20-19 → 21-19, 20-20 → 21-20)
const SCORE_FORMATS = {
  21: { label: "21-point", target: 21, example: "21-15", multi: "21-15,22-20" },
  15: { label: "15-point", target: 15, example: "15-9", multi: "15-9,17-15" },
};

const FORMAT_STORAGE_KEY = "ib-score-format";

function loadSavedFormat() {
  try {
    const v = window.localStorage.getItem(FORMAT_STORAGE_KEY);
    return v === "15" || v === "21" ? v : "21";
  } catch {
    return "21";
  }
}

function saveFormat(fmt) {
  try {
    window.localStorage.setItem(FORMAT_STORAGE_KEY, fmt);
  } catch {
    /* ignore */
  }
}

// Returns an error string, or null when valid. Empty score is valid (optional).
function validateSet21(winner, loser) {
  if (winner < 21) return "Winning score must be at least 21";
  if (winner > 30) return "Maximum score allowed is 30";
  if (winner < 30 && winner - loser < 2)
    return "Set must be won by at least 2 points";
  if (winner === 30 && loser !== 29) return "At 29-29, next point wins (30-29)";
  return null;
}

function validateSet15(winner, loser) {
  if (winner < 15) return "Winning score must be at least 15";
  if (winner > 21) return "Maximum score allowed is 21";

  // Straight win to 15 — opponent must be on 13 or fewer
  if (winner === 15) {
    if (loser <= 13) return null;
    return "From 14-14 you need a 2-point lead (e.g. 16-14)";
  }

  // 16–20: only reachable from deuce, so the lead is exactly 2
  if (winner <= 20) {
    if (loser === winner - 2) return null;
    if (loser === winner - 1) return "Set must be won by at least 2 points";
    return `Not a valid score — game ends at 15, or by 2 points after 14-14 (e.g. ${winner}-${winner - 2})`;
  }

  // 21: cap — 21-19 (from 20-19) or 21-20 (sudden death at 20-20)
  if (loser === 19 || loser === 20) return null;
  return "21 is only reached as 21-19 or 21-20 (sudden death at 20-20)";
}

function validateMatchScore(scoreText, format = "21") {
  if (!scoreText) return null;
  const sets = scoreText
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (sets.length === 0) return "Invalid score format";
  const example = format === "15" ? "15-9" : "21-18";
  for (const set of sets) {
    if (!/^\d{1,2}-\d{1,2}$/.test(set))
      return `Each set must look like ${example}`;
    const [winner, loser] = set.split("-").map(Number);
    if (winner <= loser) return "Score must be written as winner-loser";
    const err =
      format === "15"
        ? validateSet15(winner, loser)
        : validateSet21(winner, loser);
    if (err) return err;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function MatchCard({ match, playersMap, onChange }) {
  const [busy, setBusy] = useState(false);

  const [scoreFormat, setScoreFormat] = useState(loadSavedFormat); // "21" | "15"
  const [scoreInput, setScoreInput] = useState("");
  const [prevScoreInput, setPrevScoreInput] = useState("");
  const [ratingInput, setRatingInput] = useState(null); // rating in winner dialog

  const [editOpen, setEditOpen] = useState(false);
  const [editPlayers, setEditPlayers] = useState([]);

  const [winnerOpen, setWinnerOpen] = useState(false);
  const [pendingTeam, setPendingTeam] = useState(null);

  const [undoOpen, setUndoOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const pids = match.player_ids || match.players || [];
  const teamA = pids.slice(0, 2);
  const teamB = pids.slice(2, 4);

  const winnerIds = Array.isArray(match.winner)
    ? match.winner
    : match.winner
      ? [match.winner]
      : [];

  const hasWinner = winnerIds.length > 0;
  const teamAWins = hasWinner && teamA.some((id) => winnerIds.includes(id));
  const teamBWins = hasWinner && teamB.some((id) => winnerIds.includes(id));

  // Current rating from match data (may be null)
  const currentRating = match.match_rating ?? null;

  const nameOf = (id) => playersMap?.[id] || id;

  // ── Score input ───────────────────────────────────────────────────────────
  function handleScoreChange(e) {
    let v = e.target.value;
    if (!v) {
      setScoreInput("");
      setPrevScoreInput("");
      return;
    }
    v = v.replace(/[^\d-,]/g, "");
    const isDeleting = v.length < prevScoreInput.length;
    const parts = v.split(",");
    if (parts.some((p) => (p.match(/-/g) || []).length > 1)) return;
    if (!isDeleting) {
      const last = parts[parts.length - 1];
      if (last.length === 2 && !last.includes("-")) {
        parts[parts.length - 1] = last + "-";
        v = parts.join(",");
      }
    }
    setPrevScoreInput(v);
    setScoreInput(v);
  }

  // ── Record winner ─────────────────────────────────────────────────────────
  function openWinnerConfirm(team) {
    if (hasWinner || busy) return;
    setPendingTeam(team);
    setScoreInput(`${scoreFormat}-`);
    setPrevScoreInput(`${scoreFormat}-`);
    setRatingInput(null); // start with no rating
    setWinnerOpen(true);
  }

  // Switch between 21 / 15-point. If the field still holds only the untouched
  // prefill ("21-" / "15-" or empty), swap the prefill; otherwise leave what
  // the user typed alone (it is re-validated against the new format on confirm).
  function switchFormat(fmt) {
    if (fmt === scoreFormat) return;
    const untouched = !scoreInput || scoreInput.trim() === `${scoreFormat}-`;
    setScoreFormat(fmt);
    saveFormat(fmt);
    if (untouched) {
      setScoreInput(`${fmt}-`);
      setPrevScoreInput(`${fmt}-`);
    }
  }

  async function doRecordWinner() {
    if (!pendingTeam) return;
    // The untouched prefill ("21-" / "15-") means "no score entered"
    let normalized =
      scoreInput && scoreInput.trim() === `${scoreFormat}-`
        ? ""
        : scoreInput.trim();
    if (normalized.endsWith(",")) normalized = normalized.slice(0, -1);
    if (normalized) {
      const err = validateMatchScore(normalized, scoreFormat);
      if (err) {
        alert(err);
        return;
      }
    }
    setBusy(true);
    try {
      // recordTeamWinner uses an RPC — does not support rating param
      const { error } = await recordTeamWinner(
        match.id,
        pendingTeam,
        normalized || null,
      );
      if (error) throw error;

      // Save rating separately if user tapped stars
      if (ratingInput) {
        await updateMatchRating(match.id, ratingInput);
      }

      setWinnerOpen(false);
      setScoreInput("");
      setPrevScoreInput("");
      setRatingInput(null);
      onChange?.();
      window.dispatchEvent(new Event("scores-changed"));
    } catch {
      alert("Failed to record winner");
    } finally {
      setBusy(false);
    }
  }

  // ── Inline rating update (Option B — on completed card) ───────────────────
  async function handleInlineRating(newRating) {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await updateMatchRating(match.id, newRating);
      if (error) throw error;
      onChange?.();
    } catch {
      alert("Failed to update rating");
    } finally {
      setBusy(false);
    }
  }

  // ── Undo ──────────────────────────────────────────────────────────────────
  async function doUndo() {
    setBusy(true);
    try {
      const { error } = await undoWinner(match.id);
      if (error) throw error;

      // Clear rating separately — undoWinner RPC may not touch match_rating
      await updateMatchRating(match.id, null);

      setUndoOpen(false);
      onChange?.();
      window.dispatchEvent(new Event("scores-changed"));
    } catch {
      alert("Failed to undo");
    } finally {
      setBusy(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function doDeleteMatch() {
    setBusy(true);
    try {
      const { error } = await deleteMatchById(match.id);
      if (error) throw error;
      setDeleteOpen(false);
      onChange?.();
      window.dispatchEvent(new Event("scores-changed"));
    } catch {
      alert("Failed to delete match");
    } finally {
      setBusy(false);
    }
  }

  // ── Edit players ──────────────────────────────────────────────────────────
  function openEdit() {
    setEditPlayers([...pids]);
    setEditOpen(true);
  }

  async function doSaveEditedPlayers() {
    const unique = new Set(editPlayers.filter(Boolean));
    if (unique.size !== 4) {
      alert("Each player must be unique.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await updateMatchPlayers(match.id, editPlayers);
      if (error) throw error;
      setEditOpen(false);
      onChange?.();
      window.dispatchEvent(new Event("scores-changed"));
    } catch {
      alert("Failed to update players");
    } finally {
      setBusy(false);
    }
  }

  // ── Dialog wrapper ────────────────────────────────────────────────────────
  function Dialog({ onClose, children }) {
    return (
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 2000,
          padding: 20,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 22,
            width: "100%",
            maxWidth: 340,
            boxShadow: "0 20px 60px rgba(0,0,0,.22)",
            border: "1px solid var(--border)",
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className={`match-card${hasWinner ? " match-completed" : ""}`}>
        {/* Top row */}
        <div className="match-top-row">
          <span className="match-game-label">Game #{match.match_index}</span>
          <span className="badge yellow">Court {match.court}</span>
        </div>

        {/* Teams */}
        <div className="teams-column">
          <button
            className={`team-block${teamAWins ? " team-winner" : ""}${hasWinner && !teamAWins ? " team-lost" : ""}`}
            onClick={() => openWinnerConfirm(teamA)}
            type="button"
          >
            <div className="team-label">A</div>
            <div className="team-names">
              <div className="team-name-main">{nameOf(teamA[0])}</div>
              <div className="team-name-sub">{nameOf(teamA[1])}</div>
            </div>
            {teamAWins && <span className="trophy">🏆</span>}
            {!hasWinner && <span className="tap-hint">tap</span>}
          </button>

          <div className="vs-divider">
            <div className="vs-line" />
            <span className="vs">vs</span>
            <div className="vs-line" />
          </div>

          <button
            className={`team-block${teamBWins ? " team-winner" : ""}${hasWinner && !teamBWins ? " team-lost" : ""}`}
            onClick={() => openWinnerConfirm(teamB)}
            type="button"
          >
            <div className="team-label team-label-b">B</div>
            <div className="team-names">
              <div className="team-name-main">{nameOf(teamB[0])}</div>
              <div className="team-name-sub">{nameOf(teamB[1])}</div>
            </div>
            {teamBWins && <span className="trophy">🏆</span>}
            {!hasWinner && <span className="tap-hint">tap</span>}
          </button>
        </div>

        {/* ── Footer — two-row layout on completed cards ── */}
        <div
          className="match-footer"
          style={{ flexDirection: "column", alignItems: "stretch", gap: 0 }}
        >
          {/* Row 1: status + score + undo/edit/delete */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div className="footer-left">
              {hasWinner ? (
                <>
                  <span className="footer-status done">✓</span>
                  {match.score_text && (
                    <span className="score-display">{match.score_text}</span>
                  )}
                </>
              ) : (
                <span className="footer-status pending">⏳</span>
              )}
            </div>
            <div className="footer-actions">
              {hasWinner ? (
                <button
                  className="footer-icon-btn"
                  title="Clear result"
                  onClick={() => setUndoOpen(true)}
                  disabled={busy}
                >
                  ↩
                </button>
              ) : (
                <>
                  <button
                    className="footer-icon-btn"
                    title="Edit players"
                    onClick={openEdit}
                    disabled={busy}
                  >
                    ✏️
                  </button>
                  <button
                    className="footer-icon-btn danger"
                    title="Remove game"
                    onClick={() => setDeleteOpen(true)}
                    disabled={busy}
                  >
                    🗑
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Row 2: star rating — only on completed cards */}
          {hasWinner && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                paddingTop: 6,
                borderTop: "1px solid var(--border)",
                marginTop: 6,
              }}
            >
              <StarRating
                value={currentRating}
                onChange={handleInlineRating}
                size="sm"
                disabled={busy}
              />
              {currentRating && (
                <button
                  type="button"
                  onClick={() => handleInlineRating(null)}
                  disabled={busy}
                  title="Clear rating"
                  style={{
                    background: "none",
                    border: "none",
                    padding: "0 2px",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "var(--muted2)",
                    lineHeight: 1,
                    marginLeft: 2,
                  }}
                >
                  ✕
                </button>
              )}
              {!currentRating && (
                <span
                  style={{
                    fontSize: 10,
                    color: "var(--muted2)",
                    marginLeft: 2,
                  }}
                >
                  Rate game
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Winner dialog ── */}
      {winnerOpen && (
        <Dialog onClose={() => !busy && setWinnerOpen(false)}>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 16,
                color: "var(--text)",
                marginBottom: 8,
              }}
            >
              Record Winner
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--success)",
                background: "var(--success-dim)",
                border: "1px solid var(--success-border)",
                borderRadius: 8,
                padding: "6px 12px",
              }}
            >
              {pendingTeam?.map(nameOf).join(" & ")}
            </div>
          </div>

          {/* Score input */}
          <div style={{ marginBottom: 16 }}>
            {/* Format toggle */}
            <div
              role="group"
              aria-label="Game format"
              style={{
                display: "flex",
                gap: 4,
                padding: 3,
                marginBottom: 12,
                background: "var(--surface3, var(--surface2))",
                border: "1px solid var(--border)",
                borderRadius: 10,
              }}
            >
              {Object.entries(SCORE_FORMATS).map(([key, f]) => {
                const active = scoreFormat === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => switchFormat(key)}
                    aria-pressed={active}
                    style={{
                      flex: 1,
                      padding: "7px 0",
                      borderRadius: 8,
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 12,
                      fontWeight: 700,
                      background: active ? "#fff" : "transparent",
                      color: active ? "var(--primary)" : "var(--muted)",
                      boxShadow: active ? "0 1px 3px rgba(0,0,0,.12)" : "none",
                      transition: "all .12s",
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: 0.6,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              Score (optional)
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={scoreInput}
              onChange={handleScoreChange}
              placeholder={SCORE_FORMATS[scoreFormat].example}
              autoFocus
              style={{
                display: "block",
                width: "100%",
                padding: "14px 10px",
                borderRadius: 10,
                border: "2px solid var(--border)",
                fontFamily: "inherit",
                fontSize: 28,
                fontWeight: 800,
                textAlign: "center",
                letterSpacing: 3,
                outline: "none",
                color: "var(--text)",
                background: "var(--surface2)",
              }}
            />
            <div
              style={{
                fontSize: 11,
                color: "var(--muted2)",
                textAlign: "center",
                marginTop: 6,
                lineHeight: 1.5,
              }}
            >
              Type {scoreFormat} → dash appears · e.g.{" "}
              {SCORE_FORMATS[scoreFormat].example} or{" "}
              {SCORE_FORMATS[scoreFormat].multi}
              {scoreFormat === "15" && (
                <>
                  <br />
                  Deuce at 14-14 (win by 2) · sudden death at 20-20 → 21-20
                </>
              )}
            </div>
          </div>

          {/* ── Star rating — optional in dialog ── */}
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: 0.6,
                textAlign: "center",
                marginBottom: 10,
              }}
            >
              Rate this game (optional)
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <StarRating
                value={ratingInput}
                onChange={setRatingInput}
                size="md"
              />
            </div>
            {ratingInput && (
              <div
                style={{
                  textAlign: "center",
                  marginTop: 6,
                  fontSize: 11,
                  color: "var(--muted2)",
                }}
              >
                {ratingInput} star{ratingInput > 1 ? "s" : ""} — tap same star
                to clear
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              style={{ flex: 1 }}
              onClick={() => setWinnerOpen(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="btn success"
              style={{ flex: 2 }}
              onClick={doRecordWinner}
              disabled={busy}
            >
              {busy ? "Saving…" : "✓ Confirm"}
            </button>
          </div>
        </Dialog>
      )}

      {/* ── Undo dialog ── */}
      {undoOpen && (
        <Dialog onClose={() => !busy && setUndoOpen(false)}>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>↩</div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 16,
                color: "var(--text)",
                marginBottom: 6,
              }}
            >
              Clear Result?
            </div>
            <div
              style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}
            >
              Remove the recorded winner, score
              {currentRating ? " and rating" : ""} for Game #{match.match_index}
              .
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              style={{ flex: 1 }}
              onClick={() => setUndoOpen(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="btn danger"
              style={{ flex: 1 }}
              onClick={doUndo}
              disabled={busy}
            >
              {busy ? "Clearing…" : "Clear"}
            </button>
          </div>
        </Dialog>
      )}

      {/* ── Delete dialog ── */}
      {deleteOpen && (
        <Dialog onClose={() => !busy && setDeleteOpen(false)}>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🗑</div>
            <div
              style={{
                fontWeight: 800,
                fontSize: 16,
                color: "var(--text)",
                marginBottom: 6,
              }}
            >
              Remove Match?
            </div>
            <div
              style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}
            >
              Game #{match.match_index} · Court {match.court}
              <br />
              This permanently deletes this game.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              style={{ flex: 1 }}
              onClick={() => setDeleteOpen(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="btn danger"
              style={{ flex: 1 }}
              onClick={doDeleteMatch}
              disabled={busy}
            >
              {busy ? "Removing…" : "Remove"}
            </button>
          </div>
        </Dialog>
      )}

      {/* ── Edit players dialog ── */}
      {editOpen &&
        (() => {
          const slots = [
            { label: "Team A · P1", idx: 0, isA: true },
            { label: "Team A · P2", idx: 1, isA: true },
            { label: "Team B · P1", idx: 2, isA: false },
            { label: "Team B · P2", idx: 3, isA: false },
          ];
          const hasDupe = new Set(editPlayers.filter(Boolean)).size < 4;
          return (
            <Dialog onClose={() => !busy && setEditOpen(false)}>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>
                Edit Players
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  marginBottom: 14,
                }}
              >
                Game #{match.match_index} · Court {match.court}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                {slots.map(({ label, idx, isA }) => (
                  <div key={idx}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 9,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginBottom: 4,
                        color: isA ? "var(--primary)" : "var(--success)",
                      }}
                    >
                      {label}
                    </label>
                    <select
                      value={editPlayers[idx] || ""}
                      onChange={(e) => {
                        const next = [...editPlayers];
                        next[idx] = e.target.value;
                        setEditPlayers(next);
                      }}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        borderRadius: 7,
                        fontSize: 12,
                        fontWeight: 600,
                        outline: "none",
                        fontFamily: "inherit",
                        background: isA
                          ? "var(--primary-dim)"
                          : "var(--success-dim)",
                        border: `1px solid ${isA ? "var(--primary-border)" : "var(--success-border)"}`,
                        color: "var(--text)",
                      }}
                    >
                      {Object.entries(playersMap).map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {hasDupe && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--danger)",
                    marginBottom: 10,
                    background: "var(--danger-dim)",
                    border: "1px solid var(--danger-border)",
                    borderRadius: 6,
                    padding: "6px 10px",
                  }}
                >
                  ⚠ Each position must have a different player
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn"
                  style={{ flex: 1 }}
                  onClick={() => setEditOpen(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  className="btn primary"
                  style={{ flex: 2 }}
                  onClick={doSaveEditedPlayers}
                  disabled={busy || hasDupe}
                >
                  {busy ? "Saving…" : "Save Pairing"}
                </button>
              </div>
            </Dialog>
          );
        })()}
    </>
  );
}
