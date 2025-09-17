// src/pages/ScoreboardPage.jsx
import React, { useEffect, useState } from "react";
import { fetchPlayerTotals } from "../api/supabase-actions";

export default function ScoreboardPage() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data, error } = await fetchPlayerTotals();
    if (error) {
      console.error(error);
      return;
    }
    setRows(data || []);
  }

  return (
    <div className="container">
      <div className="card">
        <h3>Scoreboard</h3>
        <div className="score-list">
          {rows.map((r) => (
            <div className="score-row" key={r.player_id}>
              <div>{r.name}</div>
              <div style={{ fontWeight: 700 }}>{r.total_points}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
