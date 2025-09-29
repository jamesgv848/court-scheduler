// src/pages/ScoreboardPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import {
  fetchPlayerTotalsOverall,
  fetchPlayerTotalsForDate,
} from "../api/supabase-actions";

export default function ScoreboardPage() {
  const [date, setDate] = useState("");
  const [overall, setOverall] = useState([]);
  const [byDate, setByDate] = useState([]);
  const [loadingOverall, setLoadingOverall] = useState(false);
  const [loadingDate, setLoadingDate] = useState(false);
  const [error, setError] = useState(null);

  // Normalizer
  function normalizeRow(row) {
    return {
      id:
        row.id ??
        row.player_id ??
        row.player ??
        row.name ??
        JSON.stringify(row),
      name: row.name ?? row.player_name ?? row.player ?? "Unknown",
      matches: Number(row.matches ?? row.total_matches ?? row.match_count ?? 0),
      wins: Number(row.wins ?? row.total_wins ?? 0),
      points: Number(row.total_points ?? row.points_on_date ?? row.points ?? 0),
    };
  }

  const loadOverall = useCallback(async () => {
    setLoadingOverall(true);
    setError(null);
    try {
      const { data, error } = await fetchPlayerTotalsOverall();
      if (error) throw error;
      setOverall((data || []).map(normalizeRow));
    } catch (err) {
      console.error("loadOverall error", err);
      setError(err);
      setOverall([]);
    } finally {
      setLoadingOverall(false);
    }
  }, []);

  const loadByDate = useCallback(
    async (d = date) => {
      if (!d) {
        setByDate([]);
        return;
      }
      setLoadingDate(true);
      setError(null);
      try {
        const { data, error } = await fetchPlayerTotalsForDate(d);
        if (error) throw error;
        setByDate((data || []).map(normalizeRow));
      } catch (err) {
        console.error("loadByDate error", err);
        setError(err);
        setByDate([]);
      } finally {
        setLoadingDate(false);
      }
    },
    [date]
  );

  useEffect(() => {
    loadOverall();
    if (date) loadByDate(date);

    const onScoresChanged = () => {
      loadOverall();
      if (date) loadByDate(date);
    };
    window.addEventListener("scores-changed", onScoresChanged);
    return () => window.removeEventListener("scores-changed", onScoresChanged);
  }, [loadOverall, loadByDate, date]);

  function onDateChange(e) {
    const val = e.target.value;
    setDate(val);
    if (val) loadByDate(val);
    else setByDate([]);
  }
  function clearDate() {
    setDate("");
    setByDate([]);
  }

  function ScoreTable({ rows }) {
    return (
      <table
        className="paired-table"
        style={{ width: "100%", borderCollapse: "collapse" }}
      >
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
            <th style={{ padding: 8 }}>No</th>
            <th style={{ padding: 8 }}>Player</th>
            <th style={{ padding: 8, textAlign: "center" }}>Matches</th>
            <th style={{ padding: 8, textAlign: "center" }}>Wins</th>
            <th style={{ padding: 8, textAlign: "center" }}>Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.id ?? idx} style={{ borderBottom: "1px solid #fafafa" }}>
              <td style={{ padding: 8 }}>{idx + 1}</td>
              <td style={{ padding: 8 }}>{r.name}</td>
              <td style={{ padding: 8, textAlign: "center" }}>{r.matches}</td>
              <td style={{ padding: 8, textAlign: "center" }}>{r.wins}</td>
              <td style={{ padding: 8, textAlign: "center", fontWeight: 700 }}>
                {r.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="container" style={{ padding: 12 }}>
      {/* Date filter */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <h3 style={{ margin: 0 }}>Scoreboard</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 13, color: "#666" }}>Date</label>
          <input
            className="date-input"
            type="date"
            value={date}
            onChange={onDateChange}
            aria-label="Filter scores by date"
          />
          <button
            className="btn"
            onClick={() => loadByDate(date)}
            disabled={!date || loadingDate}
          >
            {loadingDate ? "Loading…" : "Show"}
          </button>
          <button
            className="btn secondary"
            onClick={clearDate}
            disabled={!date}
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 12, color: "red" }}>
          Error: {error.message || JSON.stringify(error)}
        </div>
      )}

      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
        {/* Overall scoreboard */}
        <div className="card">
          <h4 style={{ margin: "0 0 8px" }}>Overall (all time)</h4>
          {loadingOverall && <div>Loading overall scores…</div>}
          {!loadingOverall && overall.length === 0 && <div>No scores yet.</div>}
          {!loadingOverall && overall.length > 0 && (
            <ScoreTable rows={overall} />
          )}
        </div>

        {/* Per-date scoreboard */}
        <div className="card">
          <h4 style={{ margin: "0 0 8px" }}>
            {date ? `Scores for ${date}` : "Scores for selected date"}
          </h4>
          {date && loadingDate && <div>Loading date scores…</div>}
          {date && !loadingDate && byDate.length === 0 && (
            <div>No recorded scores found for {date}.</div>
          )}
          {date && !loadingDate && byDate.length > 0 && (
            <ScoreTable rows={byDate} />
          )}
        </div>
      </div>
    </div>
  );
}
