// src/pages/PlayersPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function PlayersPage() {
  const [players, setPlayers] = useState([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleteId, setDeleteId] = useState(null); // inline confirm state
  const navigate = useNavigate();

  useEffect(() => {
    loadPlayers();
  }, []);

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .order("name", { ascending: true });
    if (error) {
      console.error(error);
      return;
    }
    setPlayers(data || []);
  }

  async function addPlayer(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("players")
        .insert([{ name: newName.trim() }]);
      if (error) throw error;
      setNewName("");
      await loadPlayers();
    } catch (err) {
      console.error(err);
      alert("Failed to add player: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deletePlayer(id) {
    const { error } = await supabase.from("players").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    setDeleteId(null);
    await loadPlayers();
  }

  function formatDate(d) {
    if (!d) return null;
    return new Date(d).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="container">
      <div className="card">
        {/* ── Header ──────────────────────────────────── */}
        <div className="card-header">
          <span className="card-title">👥 Players</span>
          <span className="badge blue">{players.length} players</span>
        </div>

        {/* ── Add player ──────────────────────────────── */}
        <div className="card-body">
          <form onSubmit={addPlayer} style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={newName}
              placeholder="Enter player name…"
              onChange={(e) => setNewName(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="btn primary"
              type="submit"
              disabled={loading || !newName.trim()}
            >
              {loading ? "Adding…" : "+ Add"}
            </button>
          </form>
        </div>

        {/* ── Player list ─────────────────────────────── */}
        <div style={{ borderTop: "1px solid var(--border)" }}>
          {players.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">👥</div>
              <div style={{ fontSize: 13 }}>No players yet. Add one above.</div>
            </div>
          )}

          {players.map((p) => (
            <div
              key={p.id}
              className="score-row"
              style={{
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 12px",
              }}
            >
              {/* Left: name + last played */}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    color: "var(--text)",
                  }}
                >
                  {p.name}
                </div>
                {p.last_played ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      marginTop: 1,
                    }}
                  >
                    Last played: {formatDate(p.last_played)}
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--muted2)",
                      marginTop: 1,
                    }}
                  >
                    No games yet
                  </div>
                )}
              </div>

              {/* Right: icon buttons OR inline delete confirm */}
              {deleteId === p.id ? (
                /* Inline confirm — same pattern as original PlayersPage */
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--danger)",
                      marginRight: 2,
                    }}
                  >
                    Remove?
                  </span>
                  <button
                    className="btn small danger"
                    onClick={() => deletePlayer(p.id)}
                  >
                    Yes
                  </button>
                  <button
                    className="btn small"
                    onClick={() => setDeleteId(null)}
                  >
                    No
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {/* Profile icon button */}
                  <button
                    className="footer-icon-btn"
                    title={`View ${p.name}'s profile`}
                    onClick={() => navigate(`/players/${p.id}`)}
                    style={{ fontSize: 16 }}
                  >
                    👤
                  </button>
                  {/* Delete icon button */}
                  <button
                    className="footer-icon-btn danger"
                    title={`Remove ${p.name}`}
                    onClick={() => setDeleteId(p.id)}
                    style={{ fontSize: 16 }}
                  >
                    🗑
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Footer note ─────────────────────────────── */}
        <div
          style={{
            margin: "0 12px 12px",
            padding: "8px 10px",
            borderRadius: 8,
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            fontSize: 11,
            color: "var(--muted)",
            lineHeight: 1.5,
          }}
        >
          ⚠️ Removing a player does not delete their historical match data.
        </div>
      </div>
    </div>
  );
}
