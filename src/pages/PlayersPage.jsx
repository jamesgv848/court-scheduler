// src/pages/PlayersPage.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

function initials(name) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const AVATAR_COLORS = [
  ["#c44d00", "rgba(196,77,0,.12)"],
  ["#0969da", "rgba(9,105,218,.12)"],
  ["#1a7f37", "rgba(26,127,55,.12)"],
  ["#7d4e00", "rgba(125,78,0,.12)"],
  ["#6e40c9", "rgba(110,64,201,.12)"],
];

export default function PlayersPage() {
  const [players, setPlayers] = useState([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleteId, setDeleteId] = useState(null); // confirm delete

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

  return (
    <div className="container" style={{ paddingTop: 12 }}>
      {/* Add player */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header">
          <span className="card-title">👥 Players</span>
          <span className="badge blue">{players.length} players</span>
        </div>
        <div className="card-body">
          <form onSubmit={addPlayer} style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={newName}
              placeholder="Enter player name…"
              onChange={(e) => setNewName(e.target.value)}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontSize: 13,
                background: "var(--surface)",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <button
              type="submit"
              className="btn primary"
              disabled={loading || !newName.trim()}
            >
              {loading ? "Adding…" : "+ Add"}
            </button>
          </form>
        </div>
      </div>

      {/* Player list */}
      <div className="card" style={{ overflow: "hidden" }}>
        {players.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <div style={{ fontSize: 13 }}>No players yet. Add one above.</div>
          </div>
        )}
        {players.map((p, i) => {
          const [fg, bg] = AVATAR_COLORS[i % AVATAR_COLORS.length];
          return (
            <div key={p.id} className="player-item">
              <div
                className="player-avatar"
                style={{
                  color: fg,
                  background: bg,
                  borderColor: "transparent",
                }}
              >
                {initials(p.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</div>
                {p.last_played && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      marginTop: 1,
                    }}
                  >
                    Last played:{" "}
                    {new Date(p.last_played).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                )}
              </div>
              {deleteId === p.id ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn small danger"
                    onClick={() => deletePlayer(p.id)}
                  >
                    Confirm
                  </button>
                  <button
                    className="btn small"
                    onClick={() => setDeleteId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="btn small"
                  style={{
                    color: "var(--danger)",
                    borderColor: "var(--danger-border)",
                    background: "var(--danger-dim)",
                  }}
                  onClick={() => setDeleteId(p.id)}
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 12,
          padding: "10px 12px",
          borderRadius: 8,
          background: "var(--surface2)",
          border: "1px solid var(--border)",
          fontSize: 12,
          color: "var(--muted)",
          lineHeight: 1.6,
        }}
      >
        ⚠️ Removing a player does not delete their historical match data — it
        only removes them from the roster.
      </div>

      <div style={{ height: 16 }} />
    </div>
  );
}
