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

  // Normalizer: bring remote row into consistent shape
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
      // points intentionally preserved in row shape if present (we just don't display it)
      points: Number(row.total_points ?? row.points_on_date ?? row.points ?? 0),
    };
  }

  // load overall scoreboard
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

  // load scoreboard for a specific date
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

  // initial load and refresh on "scores-changed"
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

  /* ---------- Table component (desktop & wide screens) ---------- */
  function ScoreTable({ rows }) {
    return (
      <div className="table-wrap" style={{ width: "100%", overflowX: "auto" }}>
        <table
          className="paired-table"
          style={{ width: "100%", borderCollapse: "collapse" }}
        >
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: 8, width: 60 }}>No</th>
              <th style={{ padding: 8 }}>Player</th>
              <th style={{ padding: 8, textAlign: "center", width: 90 }}>
                Matches
              </th>
              <th style={{ padding: 8, textAlign: "center", width: 90 }}>
                Wins
              </th>
              {/* Points column intentionally hidden */}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr
                key={r.id ?? idx}
                style={{ borderBottom: "1px solid #fafafa" }}
              >
                <td style={{ padding: 8 }}>{idx + 1}</td>
                <td style={{ padding: 8 }}>{r.name}</td>
                <td style={{ padding: 8, textAlign: "center" }}>{r.matches}</td>
                <td style={{ padding: 8, textAlign: "center" }}>{r.wins}</td>
                {/* Points cell removed */}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  /* ---------- Mobile stacked cards component (small screens) ---------- */
  function ScoreCardRows({ rows }) {
    return (
      <div>
        {rows.map((r, idx) => (
          <div key={r.id ?? idx} className="pair-row-card">
            <div className="pair-row-grid" style={{ alignItems: "center" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "rgba(11,113,208,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                  }}
                >
                  {idx + 1}
                </div>
                <div style={{ fontWeight: 700 }}>{r.name}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: "#666" }}>
                  {r.matches} matches
                </div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                  Wins: {r.wins}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
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
            <>
              {/* Desktop table (visible on wide screens) */}
              <ScoreTable rows={overall} />
              {/* Mobile stacked cards (visible on small screens via CSS) */}
              <ScoreCardRows rows={overall} />
            </>
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
            <>
              <ScoreTable rows={byDate} />
              <ScoreCardRows rows={byDate} />
            </>
          )}
          {!date && (
            <div style={{ color: "#666" }}>
              No date selected. Choose a date above to see that day's scores.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
