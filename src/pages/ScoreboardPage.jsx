// src/pages/ScoreboardPage.jsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchPlayerTotalsOverall,
  fetchPlayerTotalsForDate,
  fetchPlayerTotalsForPeriod,
  exportFullMatchAnalysis,
} from "../api/supabase-actions";

function normalizeRow(row) {
  return {
    id: row.id ?? row.player_id ?? row.name ?? JSON.stringify(row),
    name: row.name ?? row.player_name ?? "Unknown",
    matches: Number(row.matches ?? row.total_matches ?? 0),
    wins: Number(row.wins ?? 0),
    win_pct: Number(row.win_pct ?? 0),
  };
}

const rankColor = (i) =>
  i === 0
    ? "#b87000"
    : i === 1
      ? "#636e7b"
      : i === 2
        ? "#953800"
        : "var(--muted2)";

// Dotted underline on names — unobtrusive, clearly tappable
const nameLinkStyle = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: "inherit",
  textAlign: "left",
  textDecoration: "underline",
  textDecorationColor: "rgba(0,0,0,0.2)",
  textDecorationStyle: "dotted",
  textUnderlineOffset: 3,
};

export default function ScoreboardPage() {
  const navigate = useNavigate();

  const [date, setDate] = useState("");
  const [overall, setOverall] = useState([]);
  const [byDate, setByDate] = useState([]);
  const [loadingOverall, setLO] = useState(false);
  const [loadingDate, setLD] = useState(false);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState("overall");
  const [sortKey, setSortKey] = useState("wins");
  const [sortDir, setSortDir] = useState("desc");
  const [sortKey2, setSortKey2] = useState("wins");
  const [sortDir2, setSortDir2] = useState("desc");

  function toggleSort(key, cur, setCur, dir, setDir) {
    if (cur === key) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setCur(key);
      setDir("desc");
    }
  }
  const arr = (k, c, d) => (c === k ? (d === "desc" ? " ↓" : " ↑") : "");

  const loadPeriodTotals = useCallback(async () => {
    setLO(true);
    setError(null);
    try {
      const { data, error } = await fetchPlayerTotalsForPeriod(period);
      if (error) throw error;
      setOverall((data || []).map(normalizeRow));
    } catch (err) {
      setError(err);
      setOverall([]);
    } finally {
      setLO(false);
    }
  }, [period]);

  const loadByDate = useCallback(
    async (d = date) => {
      if (!d) {
        setByDate([]);
        return;
      }
      setLD(true);
      setError(null);
      try {
        const { data, error } = await fetchPlayerTotalsForDate(d);
        if (error) throw error;
        setByDate((data || []).map(normalizeRow));
      } catch (err) {
        setError(err);
        setByDate([]);
      } finally {
        setLD(false);
      }
    },
    [date],
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

  const sorted1 = useMemo(
    () =>
      [...overall].sort((a, b) =>
        sortDir === "desc" ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey],
      ),
    [overall, sortKey, sortDir],
  );
  const sorted2 = useMemo(
    () =>
      [...byDate].sort((a, b) =>
        sortDir2 === "desc"
          ? b[sortKey2] - a[sortKey2]
          : a[sortKey2] - b[sortKey2],
      ),
    [byDate, sortKey2, sortDir2],
  );

  async function exportScores() {
    try {
      const { data, error } = await exportFullMatchAnalysis();
      if (error) throw error;
      const blob = new Blob(
        ["### GPT ANALYSIS DATA\n" + JSON.stringify(data)],
        { type: "text/plain" },
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `gpt-match-analysis-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      alert("Export failed.");
    }
  }

  const top = sorted1[0];

  // ── Helpers ──────────────────────────────────────────────────────────────
  // A row.id is a valid UUID (linkable) when it looks like a UUID —
  // i.e. not a name string (which would contain spaces or be short).
  function isUUID(id) {
    return id && /^[0-9a-f-]{36}$/i.test(id);
  }

  // ── Sort bar — shown inside card header, works on both mobile and desktop ──
  // sk = current sort key, setSk = setter, sd = current dir, setSd = dir setter
  function SortBar({ sk, setSk, sd, setSd }) {
    const btns = [
      { key: "matches", label: "M", title: "Sort by matches played" },
      { key: "wins", label: "W", title: "Sort by wins" },
      { key: "win_pct", label: "Win%", title: "Sort by win percentage" },
    ];
    return (
      <div style={{ display: "flex", gap: 4 }}>
        {btns.map(({ key, label, title }) => {
          const active = sk === key;
          const arrow = active ? (sd === "desc" ? " ↓" : " ↑") : "";
          return (
            <button
              key={key}
              title={title}
              onClick={() => toggleSort(key, sk, setSk, sd, setSd)}
              style={{
                padding: "3px 7px",
                borderRadius: 6,
                border: "1px solid",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                background: active ? "var(--accent-dim)" : "var(--surface)",
                color: active ? "var(--accent)" : "var(--muted)",
                borderColor: active ? "var(--accent-border)" : "var(--border)",
                whiteSpace: "nowrap",
              }}
            >
              {label}
              {arrow}
            </button>
          );
        })}
      </div>
    );
  }

  // ── Desktop table row ─────────────────────────────────────────────────────
  function SBRow({ row, i }) {
    const pct = Math.min(100, Math.max(0, row.win_pct));
    const canLink = isUUID(row.id);
    return (
      <tr
        style={{
          background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)",
        }}
      >
        <td
          style={{
            padding: "8px 8px",
            fontWeight: 800,
            fontSize: 14,
            color: rankColor(i),
          }}
        >
          {i + 1}
        </td>
        <td style={{ padding: "8px 8px", fontWeight: 700, fontSize: 13 }}>
          {canLink ? (
            <button
              style={{
                ...nameLinkStyle,
                fontWeight: 700,
                fontSize: 13,
                color: "var(--text)",
              }}
              onClick={() => navigate(`/players/${row.id}?from=scoreboard`)}
              title={`View ${row.name}'s profile`}
            >
              {row.name}
            </button>
          ) : (
            row.name
          )}
        </td>
        <td
          style={{
            padding: "8px 8px",
            textAlign: "right",
            color: "var(--muted)",
            fontSize: 12,
          }}
        >
          {row.matches}
        </td>
        <td
          style={{
            padding: "8px 8px",
            textAlign: "right",
            fontWeight: 700,
            color: "var(--success)",
            fontSize: 12,
          }}
        >
          {row.wins}
        </td>
        <td style={{ padding: "8px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div className="win-bar">
              <div className="win-fill" style={{ width: `${pct}%` }} />
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--success)",
                minWidth: 40,
                textAlign: "right",
              }}
            >
              {row.win_pct.toFixed(1)}%
            </span>
          </div>
        </td>
      </tr>
    );
  }

  // ── Mobile card row ───────────────────────────────────────────────────────
  // Avatar circle + name both navigate to profile on tap
  function SBCard({ row, i }) {
    const canLink = isUUID(row.id);
    const goProfile = () => {
      if (canLink) navigate(`/players/${row.id}?from=scoreboard`);
    };

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* Rank */}
        <div
          style={{
            width: 28,
            fontWeight: 800,
            fontSize: 15,
            color: rankColor(i),
            flexShrink: 0,
          }}
        >
          {i + 1}
        </div>

        {/* Avatar — tappable */}
        <div
          onClick={goProfile}
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            flexShrink: 0,
            background: "var(--accent-dim)",
            border: "1px solid var(--accent-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: 13,
            color: "var(--accent)",
            cursor: canLink ? "pointer" : "default",
          }}
          title={canLink ? `View ${row.name}'s profile` : undefined}
        >
          {row.name[0]}
        </div>

        {/* Name + stats */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {canLink ? (
            <button
              style={{
                ...nameLinkStyle,
                fontWeight: 700,
                fontSize: 13,
                color: "var(--text)",
              }}
              onClick={goProfile}
            >
              {row.name}
            </button>
          ) : (
            <div style={{ fontWeight: 700, fontSize: 13 }}>{row.name}</div>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              {row.matches}M
            </span>
            <span
              style={{ fontSize: 11, color: "var(--success)", fontWeight: 700 }}
            >
              {row.wins}W
            </span>
          </div>
        </div>

        {/* Win % + bar */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div
            style={{ fontWeight: 800, fontSize: 15, color: "var(--success)" }}
          >
            {row.win_pct.toFixed(1)}%
          </div>
          <div
            style={{
              width: 60,
              height: 3,
              background: "var(--surface3)",
              borderRadius: 2,
              marginTop: 4,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, row.win_pct)}%`,
                background: "var(--success)",
                borderRadius: 2,
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  function ScoreTable({ rows, sk, setSk, sd, setSd }) {
    return (
      <div className="table-wrap">
        <table className="paired-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>Player</th>
              <th
                style={{ textAlign: "right", cursor: "pointer" }}
                onClick={() => toggleSort("matches", sk, setSk, sd, setSd)}
              >
                M{arr("matches", sk, sd)}
              </th>
              <th
                style={{ textAlign: "right", cursor: "pointer" }}
                onClick={() => toggleSort("wins", sk, setSk, sd, setSd)}
              >
                W{arr("wins", sk, sd)}
              </th>
              <th
                style={{ cursor: "pointer" }}
                onClick={() => toggleSort("win_pct", sk, setSk, sd, setSd)}
              >
                Win%{arr("win_pct", sk, sd)}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <SBRow key={r.id} row={r} i={i} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: 12 }}>
      {/* Stats strip */}
      {top && (
        <div className="stats-strip">
          <div className="stat-cell">
            <div className="stat-val">{overall.length}</div>
            <div className="stat-lbl">Players</div>
          </div>
          <div className="stat-cell">
            <div
              className="stat-val"
              style={{ fontSize: 13, color: "var(--success)" }}
            >
              {top.name}
            </div>
            <div className="stat-lbl">Leader</div>
          </div>
          <div className="stat-cell">
            <div className="stat-val">{top.win_pct.toFixed(0)}%</div>
            <div className="stat-lbl">Best %</div>
          </div>
          <div className="stat-cell">
            <div className="stat-val" style={{ color: "var(--success)" }}>
              {top.wins}
            </div>
            <div className="stat-lbl">Top Wins</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="card-body">
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "flex-end",
              marginBottom: 10,
            }}
          >
            <div>
              <label className="form-label">Period</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="overall">Overall</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label className="form-label">Date</label>
              <div className="date-input-wrap">
                <span className="date-input-icon">📅</span>
                <input
                  className="date-input"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    if (e.target.value) loadByDate(e.target.value);
                  }}
                />
              </div>
            </div>
          </div>
          <div
            style={{ display: "flex", gap: 8, justifyContent: "space-between" }}
          >
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="btn small"
                onClick={() => loadByDate(date)}
                disabled={!date}
              >
                Show
              </button>
              <button
                className="btn small"
                onClick={() => {
                  setDate("");
                  setByDate([]);
                }}
              >
                Clear
              </button>
            </div>
            <button className="btn small" onClick={exportScores}>
              📤 Export (GPT)
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ color: "var(--danger)", marginBottom: 10, fontSize: 13 }}>
          Error: {error.message}
        </div>
      )}

      {/* Overall table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            {period === "overall"
              ? "Overall (all time)"
              : `Overall — ${period}`}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SortBar
              sk={sortKey}
              setSk={setSortKey}
              sd={sortDir}
              setSd={setSortDir}
            />
            <span className="badge blue">{overall.length} players</span>
          </div>
        </div>
        {loadingOverall && (
          <div style={{ padding: 12, color: "var(--muted)" }}>Loading…</div>
        )}
        {!loadingOverall && sorted1.length === 0 && (
          <div style={{ padding: 12, color: "var(--muted)" }}>
            No scores yet.
          </div>
        )}
        {!loadingOverall && sorted1.length > 0 && (
          <>
            <ScoreTable
              rows={sorted1}
              sk={sortKey}
              setSk={setSortKey}
              sd={sortDir}
              setSd={setSortDir}
            />
            <div className="mobile-score-list">
              {sorted1.map((r, i) => (
                <SBCard key={r.id} row={r} i={i} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* By-date table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            {date ? `Scores — ${date}` : "Scores for selected date"}
          </span>
          {date && sorted2.length > 0 && (
            <SortBar
              sk={sortKey2}
              setSk={setSortKey2}
              sd={sortDir2}
              setSd={setSortDir2}
            />
          )}
        </div>
        {!date && (
          <div style={{ padding: 12, color: "var(--muted)", fontSize: 13 }}>
            Choose a date above.
          </div>
        )}
        {date && loadingDate && (
          <div style={{ padding: 12, color: "var(--muted)" }}>Loading…</div>
        )}
        {date && !loadingDate && sorted2.length === 0 && (
          <div style={{ padding: 12, color: "var(--muted)" }}>
            No scores for this date.
          </div>
        )}
        {date && !loadingDate && sorted2.length > 0 && (
          <>
            <ScoreTable
              rows={sorted2}
              sk={sortKey2}
              setSk={setSortKey2}
              sd={sortDir2}
              setSd={setSortDir2}
            />
            <div className="mobile-score-list">
              {sorted2.map((r, i) => (
                <SBCard key={r.id} row={r} i={i} />
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ height: 16 }} />
    </div>
  );
}
