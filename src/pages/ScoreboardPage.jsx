// src/pages/ScoreboardPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import {
  fetchPlayerTotalsOverall,
  fetchPlayerTotalsForDate,
  fetchPlayerTotalsForPeriod,
} from "../api/supabase-actions";

export default function ScoreboardPage() {
  const [date, setDate] = useState("");
  const [overall, setOverall] = useState([]);
  const [byDate, setByDate] = useState([]);
  const [loadingOverall, setLoadingOverall] = useState(false);
  const [loadingDate, setLoadingDate] = useState(false);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState("overall");

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
      matches: Number(row.matches ?? row.total_matches ?? 0),
      wins: Number(row.wins ?? 0),
      points: Number(row.total_points ?? row.points_on_date ?? 0),
      win_pct: Number(row.win_pct ?? 0),
    };
  }

  const loadPeriodTotals = useCallback(async () => {
    setLoadingOverall(true);
    setError(null);
    try {
      const { data, error } = await fetchPlayerTotalsForPeriod(period);
      if (error) throw error;
      setOverall((data || []).map(normalizeRow));
    } catch (err) {
      console.error("loadPeriodTotals error", err);
      setError(err);
      setOverall([]);
    } finally {
      setLoadingOverall(false);
    }
  }, [period]);

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
    loadPeriodTotals();
    if (date) loadByDate(date);

    const onScoresChanged = () => {
      loadPeriodTotals();
      if (date) loadByDate(date);
    };
    window.addEventListener("scores-changed", onScoresChanged);
    return () => window.removeEventListener("scores-changed", onScoresChanged);
  }, [loadPeriodTotals, loadByDate, date]);

  function onDateChange(e) {
    const val = e.target.value;
    setDate(val);
    if (val) loadByDate(val);
    else setByDate([]);
  }

  function clearDate() {
    setDate("");
    setByDate([]);
    setPeriod("overall");
  }

  /* ---------- Table (desktop) ---------- */
  function ScoreTable({ rows }) {
    return (
      <div className="table-wrap" style={{ width: "100%", overflowX: "auto" }}>
        <table className="paired-table" style={{ width: "100%" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #eee" }}>
              <th style={{ padding: 8, width: 60 }}>No</th>
              <th style={{ padding: 8 }}>Player</th>
              <th style={{ padding: 8, textAlign: "center", width: 90 }}>
                Matches
              </th>
              <th style={{ padding: 8, textAlign: "center", width: 90 }}>
                Wins
              </th>
              <th style={{ padding: 8, textAlign: "center", width: 90 }}>
                Win %
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id ?? idx}>
                <td style={{ padding: 8 }}>{idx + 1}</td>
                <td style={{ padding: 8 }}>{r.name}</td>
                <td style={{ padding: 8, textAlign: "center" }}>{r.matches}</td>
                <td style={{ padding: 8, textAlign: "center" }}>{r.wins}</td>
                <td style={{ padding: 8, textAlign: "center" }}>
                  {r.win_pct.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  /* ---------- Mobile cards ---------- */
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
                <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                  Win %: {r.win_pct.toFixed(2)}%
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
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <h3 style={{ margin: 0 }}>Scoreboard</h3>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 12,
          }}
        >
          {/* Period */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: "#666" }}>Period</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="overall">Overall</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
          </div>

          {/* Date */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: "#666" }}>Date</label>
            <input type="date" value={date} onChange={onDateChange} />
          </div>

          {/* Actions */}
          <button
            className="btn"
            onClick={() => loadByDate(date)}
            disabled={!date}
          >
            Show
          </button>

          <button
            className="btn secondary"
            onClick={clearDate}
            disabled={!date && period === "overall"}
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
        <div className="card">
          <h4>
            {period === "overall"
              ? "Overall (all time)"
              : `Overall – ${period}`}
          </h4>
          {loadingOverall && <div>Loading…</div>}
          {!loadingOverall && overall.length === 0 && <div>No scores yet.</div>}
          {!loadingOverall && overall.length > 0 && (
            <>
              <ScoreTable rows={overall} />
              <ScoreCardRows rows={overall} />
            </>
          )}
        </div>

        <div className="card">
          <h4>{date ? `Scores for ${date}` : "Scores for selected date"}</h4>
          {date && loadingDate && <div>Loading…</div>}
          {date && !loadingDate && byDate.length === 0 && (
            <div>No recorded scores found.</div>
          )}
          {date && !loadingDate && byDate.length > 0 && (
            <>
              <ScoreTable rows={byDate} />
              <ScoreCardRows rows={byDate} />
            </>
          )}
          {!date && (
            <div style={{ color: "#666" }}>
              Choose a date above to see scores.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
