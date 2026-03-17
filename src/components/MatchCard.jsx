// src/components/MatchCard.jsx
import React, { useState } from "react";
import {
  recordTeamWinner,
  undoWinner,
  updateMatchPlayers,
  deleteMatchById,
} from "../api/supabase-actions";

export default function MatchCard({ match, playersMap, onChange }) {
  const [busy, setBusy] = useState(false);

  const [scoreInput, setScoreInput] = useState("");
  const [prevScoreInput, setPrevScoreInput] = useState("");

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

  const nameOf = (id) => playersMap?.[id] || id;

  // ── Score validation ────────────────────────────
  function validateMatchScore(scoreText) {
    if (!scoreText) return null;
    const sets = scoreText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (sets.length === 0) return "Invalid score format";
    for (const set of sets) {
      if (!/^\d{1,2}-\d{1,2}$/.test(set))
        return "Each set must look like 21-18";
      const [winner, loser] = set.split("-").map(Number);
      if (winner <= loser) return "Score must be written as winner-loser";
      if (winner < 21) return "Winning score must be at least 21";
      if (winner > 30) return "Maximum score allowed is 30";
      if (winner < 30 && winner - loser < 2)
        return "Set must be won by at least 2 points";
      if (winner === 30 && loser !== 29)
        return "At 29-29, next point wins (30-29)";
    }
    return null;
  }

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

  // ── Record winner ────────────────────────────────
  function openWinnerConfirm(team) {
    if (hasWinner || busy) return;
    setPendingTeam(team);
    setScoreInput("21-");
    setPrevScoreInput("21-");
    setWinnerOpen(true);
  }

  async function doRecordWinner() {
    if (!pendingTeam) return;
    let normalized =
      scoreInput && scoreInput.trim() === "21-" ? "" : scoreInput.trim();
    if (normalized.endsWith(",")) normalized = normalized.slice(0, -1);
    if (normalized) {
      const err = validateMatchScore(normalized);
      if (err) {
        alert(err);
        return;
      }
    }
    setBusy(true);
    try {
      const { error } = await recordTeamWinner(
        match.id,
        pendingTeam,
        normalized || null,
      );
      if (error) throw error;
      setWinnerOpen(false);
      setScoreInput("");
      setPrevScoreInput("");
      onChange?.();
      window.dispatchEvent(new Event("scores-changed"));
    } catch {
      alert("Failed to record winner");
    } finally {
      setBusy(false);
    }
  }

  // ── Undo ─────────────────────────────────────────
  async function doUndo() {
    setBusy(true);
    try {
      const { error } = await undoWinner(match.id);
      if (error) throw error;
      setUndoOpen(false);
      onChange?.();
      window.dispatchEvent(new Event("scores-changed"));
    } catch {
      alert("Failed to undo");
    } finally {
      setBusy(false);
    }
  }

  // ── Delete ───────────────────────────────────────
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

  // ── Edit players ─────────────────────────────────
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

  // ── Centered dialog ──────────────────────────────
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

  // ── Render ────────────────────────────────────────
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

        <div className="match-footer">
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
          <div style={{ marginBottom: 18 }}>
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
              placeholder="21-15"
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
              }}
            >
              Type 21 → dash appears · e.g. 21-15 or 21-15,22-20
            </div>
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
              Remove the recorded winner and score for Game #{match.match_index}
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
          // Warn if any two slots have the same player — but do NOT disable any options.
          // All players in playersMap are always available in every dropdown so that
          // full team reshuffles (e.g. moving a player from one team to the other) work
          // without restriction. The editor is responsible for valid selections.
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
