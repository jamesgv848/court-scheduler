// src/pages/PlayersPage.jsx
import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function PlayersPage() {
  const [players, setPlayers] = useState([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPlayers();
  }, []);

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .order("created_at", { ascending: true });
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
    if (!window.confirm("Delete this player?")) return;
    const { error } = await supabase.from("players").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    await loadPlayers();
  }

  return (
    <div className="container">
      <div className="card">
        <h3>Players Master List</h3>
        <form
          onSubmit={addPlayer}
          style={{ display: "flex", gap: 8, marginTop: 10 }}
        >
          <input
            type="text"
            value={newName}
            placeholder="Player name"
            onChange={(e) => setNewName(e.target.value)}
          />
          <button className="btn" type="submit" disabled={loading}>
            Add
          </button>
        </form>

        <div style={{ marginTop: 16 }}>
          {players.map((p) => (
            <div
              key={p.id}
              className="score-row"
              style={{ justifyContent: "space-between" }}
            >
              <div>
                <strong>{p.name}</strong>
                {p.last_played && (
                  <span style={{ marginLeft: 8, fontSize: 12, color: "#666" }}>
                    Last played: {new Date(p.last_played).toLocaleDateString()}
                  </span>
                )}
              </div>
              <button
                className="btn small secondary"
                onClick={() => deletePlayer(p.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
