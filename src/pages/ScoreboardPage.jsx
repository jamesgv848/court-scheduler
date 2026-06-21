// src/pages/ScoreboardPage.jsx
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchPlayerTotalsForDate,
  fetchPlayerTotalsForRange,
  fetchSessionDates,
  fetchPlayerSessionCounts,
  exportFullMatchAnalysis,
} from "../api/supabase-actions";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// Format date as "12 Jan 2026"
function fmtDateShort(d) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Current year and last year for preset labels
const THIS_YEAR = new Date().getFullYear();
const LAST_YEAR = THIS_YEAR - 1;

// Build p_start / p_end from a filter descriptor
function dateRangeFromFilter(filter) {
  switch (filter.type) {
    case "all":
      return { p_start: null, p_end: null };
    case "year":
      return {
        p_start: `${filter.year}-01-01`,
        p_end: `${filter.year}-12-31`,
      };
    case "sessions":
      // resolved async — caller passes already-resolved start/end
      return { p_start: filter.start, p_end: filter.end };
    case "range":
      return { p_start: filter.start || null, p_end: filter.end || null };
    default:
      return { p_start: null, p_end: null };
  }
}

// Human-readable label for the leaderboard card header
function filterLabel(filter) {
  switch (filter.type) {
    case "all":
      return "Overall (all time)";
    case "year":
      return `Overall — ${filter.year}`;
    case "sessions":
      return `Last ${filter.n} sessions`;
    case "range":
      if (filter.start && filter.end) return `${filter.start} → ${filter.end}`;
      if (filter.start) return `From ${filter.start}`;
      if (filter.end) return `Until ${filter.end}`;
      return "Custom range";
    default:
      return "Overall";
  }
}

// Comparison period label for the rank movement tooltip
function comparisonLabel(filter) {
  switch (filter.type) {
    case "sessions":
      return `prior ${filter.n} sessions`;
    case "year":
      return `${filter.year - 1}`;
    case "range": {
      if (!filter.start || !filter.end) return "prior period";
      const ms = new Date(filter.end) - new Date(filter.start);
      const days = Math.round(ms / 86400000);
      const compEnd = new Date(new Date(filter.start) - 86400000)
        .toISOString()
        .slice(0, 10);
      const compStart = new Date(new Date(filter.start) - ms - 86400000)
        .toISOString()
        .slice(0, 10);
      return `${compStart} → ${compEnd}`;
    }
    default:
      return null;
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ScoreboardPage() {
  const navigate = useNavigate();

  // ── Filter state ───────────────────────────────────────────────────────────
  // filter descriptor drives the top leaderboard
  // { type: "all" | "year" | "sessions" | "range", ...extras }
  const [filter, setFilter] = useState({ type: "all" });

  // For the dropdown selection before applying
  const [periodSel, setPeriodSel] = useState("all"); // dropdown value
  const [customMode, setCustomMode] = useState("sessions"); // "sessions" | "range"
  const [customN, setCustomN] = useState("10");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // ── Data state ─────────────────────────────────────────────────────────────
  const [overall, setOverall] = useState([]);
  const [comparison, setComparison] = useState([]); // prior period for rank movement
  const [sessionCounts, setSessionCounts] = useState({}); // player_id → sessions attended
  const [totalSessions, setTotalSessions] = useState(0); // total sessions in period
  const [resolvedRange, setResolvedRange] = useState(null); // { start, end } for sessions filter
  const [byDate, setByDate] = useState([]);
  const [date, setDate] = useState("");
  const [loadingTop, setLoadingTop] = useState(false);
  const [loadingDate, setLoadingDate] = useState(false);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState("wins");
  const [sortDir, setSortDir] = useState("desc");
  const [sortKey2, setSortKey2] = useState("wins");
  const [sortDir2, setSortDir2] = useState("desc");

  // Cache session dates to avoid repeat RPC calls
  const sessionDatesCache = useRef({});

  // Show attendance fraction only for bounded session/range filters
  const showAttendance = filter.type === "sessions" || filter.type === "range";

  // ── Resolve "last N sessions" → actual date range ──────────────────────────
  async function resolveSessionRange(n) {
    if (sessionDatesCache.current[n]) return sessionDatesCache.current[n];
    const { data, error } = await fetchSessionDates(n);
    if (error) throw error;
    const dates = (data || []).map((r) => r.match_date).sort();
    const range = {
      start: dates[0] || null,
      end: dates[dates.length - 1] || null,
    };
    sessionDatesCache.current[n] = range;
    return range;
  }

  // ── Resolve comparison period date range ───────────────────────────────────
  async function resolveComparisonRange(f) {
    switch (f.type) {
      case "sessions": {
        // fetch 2×N sessions, comparison = sessions N+1 … 2N
        const { data } = await fetchSessionDates(f.n * 2);
        const dates = (data || []).map((r) => r.match_date).sort();
        const compDates = dates.slice(0, dates.length - f.n); // older half
        if (compDates.length === 0) return null;
        return {
          p_start: compDates[0],
          p_end: compDates[compDates.length - 1],
        };
      }
      case "year":
        return { p_start: `${f.year - 1}-01-01`, p_end: `${f.year - 1}-12-31` };
      case "range": {
        if (!f.start || !f.end) return null;
        const ms = new Date(f.end) - new Date(f.start);
        const compEnd = new Date(new Date(f.start) - 86400000)
          .toISOString()
          .slice(0, 10);
        const compStart = new Date(new Date(f.start) - ms - 86400000)
          .toISOString()
          .slice(0, 10);
        return { p_start: compStart, p_end: compEnd };
      }
      default:
        return null;
    }
  }

  // ── Load top leaderboard ───────────────────────────────────────────────────
  const loadTop = useCallback(
    async (f = filter) => {
      setLoadingTop(true);
      setError(null);
      try {
        // Resolve date range
        let p_start, p_end;
        if (f.type === "sessions") {
          const range = await resolveSessionRange(f.n);
          p_start = range.start;
          p_end = range.end;
          // store resolved dates back into filter for comparison
          f = { ...f, start: p_start, end: p_end };
          setResolvedRange({ start: p_start, end: p_end });
        } else {
          ({ p_start, p_end } = dateRangeFromFilter(f));
          setResolvedRange(null); // not needed for other filter types
        }

        // Main fetch
        const { data, error } = await fetchPlayerTotalsForRange(p_start, p_end);
        if (error) throw error;
        setOverall((data || []).map(normalizeRow));

        // Session attendance counts — only for sessions/range filter types
        if (f.type === "sessions" || f.type === "range") {
          const { data: scData } = await fetchPlayerSessionCounts(
            p_start,
            p_end,
          );
          const countMap = {};
          let maxSessions = 0;
          for (const row of scData || []) {
            countMap[row.player_id] = Number(row.session_count);
            if (Number(row.session_count) > maxSessions)
              maxSessions = Number(row.session_count);
          }
          setSessionCounts(countMap);
          setTotalSessions(maxSessions); // max attended = total possible for this period
        } else {
          setSessionCounts({});
          setTotalSessions(0);
        }

        // Comparison fetch (for rank movement) — all types except "all"
        if (f.type !== "all") {
          const compRange = await resolveComparisonRange(f);
          if (compRange) {
            const { data: cdata } = await fetchPlayerTotalsForRange(
              compRange.p_start,
              compRange.p_end,
            );
            setComparison((cdata || []).map(normalizeRow));
          } else {
            setComparison([]);
          }
        } else {
          setComparison([]);
        }
      } catch (err) {
        setError(err);
        setOverall([]);
        setComparison([]);
      } finally {
        setLoadingTop(false);
      }
    },
    [filter],
  ); // eslint-disable-line

  // ── Load by date (bottom table, unchanged) ─────────────────────────────────
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
        setError(err);
        setByDate([]);
      } finally {
        setLoadingDate(false);
      }
    },
    [date],
  );

  useEffect(() => {
    loadTop();
    if (date) loadByDate(date);
    const onChanged = () => {
      loadTop();
      if (date) loadByDate(date);
    };
    window.addEventListener("scores-changed", onChanged);
    return () => window.removeEventListener("scores-changed", onChanged);
  }, [loadTop, loadByDate]); // eslint-disable-line

  // ── Apply filter from dropdown / custom inputs ────────────────────────────
  function applyFilter() {
    let f;
    if (periodSel === "all") {
      f = { type: "all" };
    } else if (periodSel === "thisyear") {
      f = { type: "year", year: THIS_YEAR };
    } else if (periodSel === "lastyear") {
      f = { type: "year", year: LAST_YEAR };
    } else if (periodSel === "custom") {
      if (customMode === "sessions") {
        const n = Math.max(1, parseInt(customN, 10) || 10);
        f = { type: "sessions", n };
      } else {
        f = { type: "range", start: customFrom || null, end: customTo || null };
      }
    } else if (periodSel.startsWith("last")) {
      const n = parseInt(periodSel.replace("last", ""), 10);
      f = { type: "sessions", n };
    } else {
      f = { type: "all" };
    }
    setFilter(f);
    loadTop(f);
  }

  // ── Rank movement (Option B) ───────────────────────────────────────────────
  // Build a map of player id → rank in comparison period
  const compRankMap = useMemo(() => {
    const sorted = [...comparison].sort(
      (a, b) => b.wins - a.wins || b.win_pct - a.win_pct,
    );
    const map = {};
    sorted.forEach((r, i) => {
      map[r.id] = i + 1;
    });
    return map;
  }, [comparison]);

  function rankMovement(row, currentRank) {
    if (comparison.length === 0) return null;
    const prev = compRankMap[row.id];
    if (prev == null)
      return {
        symbol: "new",
        color: "var(--primary)",
        title: "New this period",
      };
    const diff = prev - currentRank; // positive = moved up
    if (diff === 0)
      return {
        symbol: "—",
        color: "var(--muted2)",
        title: `Same rank as ${comparisonLabel(filter)}`,
      };
    if (diff > 0)
      return {
        symbol: `↑${diff}`,
        color: "var(--success)",
        title: `Up ${diff} from ${comparisonLabel(filter)}`,
      };
    return {
      symbol: `↓${Math.abs(diff)}`,
      color: "var(--danger)",
      title: `Down ${Math.abs(diff)} from ${comparisonLabel(filter)}`,
    };
  }

  // ── Sorted rows ────────────────────────────────────────────────────────────
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
      // Resolve date range from active filter — same logic as loadTop
      let p_start = null;
      let p_end = null;
      if (filter.type === "sessions" && filter.start && filter.end) {
        p_start = filter.start;
        p_end = filter.end;
      } else if (filter.type === "sessions") {
        // Not yet resolved — resolve now
        const range = await resolveSessionRange(filter.n);
        p_start = range.start;
        p_end = range.end;
      } else {
        const range = dateRangeFromFilter(filter);
        p_start = range.p_start;
        p_end = range.p_end;
      }

      const { data, error } = await exportFullMatchAnalysis(p_start, p_end);
      if (error) throw error;

      // Build a descriptive filename reflecting the active period
      const suffix =
        filter.type === "all"
          ? "all-time"
          : filterLabel(filter)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/(^-|-$)/g, "");

      const blob = new Blob(
        ["### GPT ANALYSIS DATA\n" + JSON.stringify(data)],
        { type: "text/plain" },
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `badminton-analysis-${suffix}-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      alert("Export failed.");
    }
  }

  const top = sorted1[0];

  function isUUID(id) {
    return id && /^[0-9a-f-]{36}$/i.test(id);
  }

  // ── Sort bar ──────────────────────────────────────────────────────────────
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
              onClick={() => {
                if (sk === key) setSd((d) => (d === "desc" ? "asc" : "desc"));
                else {
                  setSk(key);
                  setSd("desc");
                }
              }}
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

  // ── Desktop table row — includes rank movement column ─────────────────────
  function SBRow({ row, i }) {
    const pct = Math.min(100, Math.max(0, row.win_pct));
    const canLink = isUUID(row.id);
    const mv = rankMovement(row, i + 1);
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
        {/* Rank movement */}
        {comparison.length > 0 && (
          <td style={{ padding: "8px 4px", textAlign: "center", minWidth: 32 }}>
            {mv && (
              <span
                title={mv.title}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: mv.color,
                  whiteSpace: "nowrap",
                }}
              >
                {mv.symbol}
              </span>
            )}
          </td>
        )}
        {/* Attendance column — sessions/range filter only */}
        {showAttendance && (
          <td style={{ padding: "8px 4px", textAlign: "center", minWidth: 36 }}>
            {sessionCounts[row.id] != null ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  color:
                    sessionCounts[row.id] === totalSessions
                      ? "var(--success)"
                      : sessionCounts[row.id] >= totalSessions * 0.7
                        ? "var(--muted)"
                        : "var(--danger)",
                }}
                title={`Attended ${sessionCounts[row.id]} of ${totalSessions} sessions`}
              >
                {sessionCounts[row.id]}/{totalSessions}
              </span>
            ) : (
              <span style={{ fontSize: 10, color: "var(--muted2)" }}>—</span>
            )}
          </td>
        )}
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
  function SBCard({ row, i }) {
    const canLink = isUUID(row.id);
    const goProfile = () => {
      if (canLink) navigate(`/players/${row.id}?from=scoreboard`);
    };
    const mv = rankMovement(row, i + 1);
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
        {/* Rank + movement */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: 28,
            flexShrink: 0,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 15, color: rankColor(i) }}>
            {i + 1}
          </div>
          {mv && (
            <div
              title={mv.title}
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: mv.color,
                lineHeight: 1,
              }}
            >
              {mv.symbol}
            </div>
          )}
        </div>
        {/* Avatar */}
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
          <div
            style={{
              display: "flex",
              gap: 6,
              marginTop: 3,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              {row.matches}M
            </span>
            <span
              style={{ fontSize: 11, color: "var(--success)", fontWeight: 700 }}
            >
              {row.wins}W
            </span>
            {showAttendance && sessionCounts[row.id] != null && (
              <span
                title={`Attended ${sessionCounts[row.id]} of ${totalSessions} sessions`}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 5px",
                  borderRadius: 10,
                  background:
                    sessionCounts[row.id] === totalSessions
                      ? "var(--success-dim)"
                      : sessionCounts[row.id] >= totalSessions * 0.7
                        ? "var(--surface2)"
                        : "var(--danger-dim)",
                  color:
                    sessionCounts[row.id] === totalSessions
                      ? "var(--success)"
                      : sessionCounts[row.id] >= totalSessions * 0.7
                        ? "var(--muted)"
                        : "var(--danger)",
                  border: "1px solid",
                  borderColor:
                    sessionCounts[row.id] === totalSessions
                      ? "var(--success-border)"
                      : sessionCounts[row.id] >= totalSessions * 0.7
                        ? "var(--border)"
                        : "var(--danger-border)",
                }}
              >
                {sessionCounts[row.id]}/{totalSessions}
              </span>
            )}
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
              {comparison.length > 0 && (
                <th style={{ width: 32 }} title="Rank movement vs prior period">
                  ±
                </th>
              )}
              {showAttendance && (
                <th
                  style={{ width: 40, textAlign: "center" }}
                  title="Sessions attended / total sessions in period"
                >
                  Att.
                </th>
              )}
              <th>Player</th>
              <th
                style={{ textAlign: "right", cursor: "pointer" }}
                onClick={() => {
                  if (sk === "matches")
                    setSd((d) => (d === "desc" ? "asc" : "desc"));
                  else {
                    setSk("matches");
                    setSd("desc");
                  }
                }}
              >
                M{sk === "matches" ? (sd === "desc" ? " ↓" : " ↑") : ""}
              </th>
              <th
                style={{ textAlign: "right", cursor: "pointer" }}
                onClick={() => {
                  if (sk === "wins")
                    setSd((d) => (d === "desc" ? "asc" : "desc"));
                  else {
                    setSk("wins");
                    setSd("desc");
                  }
                }}
              >
                W{sk === "wins" ? (sd === "desc" ? " ↓" : " ↑") : ""}
              </th>
              <th
                style={{ cursor: "pointer" }}
                onClick={() => {
                  if (sk === "win_pct")
                    setSd((d) => (d === "desc" ? "asc" : "desc"));
                  else {
                    setSk("win_pct");
                    setSd("desc");
                  }
                }}
              >
                Win%{sk === "win_pct" ? (sd === "desc" ? " ↓" : " ↑") : ""}
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

  // ── Render ────────────────────────────────────────────────────────────────
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

      {/* ── Filter card ────────────────────────────────────────────────────── */}
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
            {/* Period dropdown */}
            <div>
              <label className="form-label">Period</label>
              <select
                value={periodSel}
                onChange={(e) => setPeriodSel(e.target.value)}
              >
                <option value="all">All time</option>
                <option value="last5">Last 5 sessions</option>
                <option value="last10">Last 10 sessions</option>
                <option value="last20">Last 20 sessions</option>
                <option value="thisyear">This year ({THIS_YEAR})</option>
                <option value="lastyear">Last year ({LAST_YEAR})</option>
                <option value="custom">Custom…</option>
              </select>
            </div>

            {/* Apply button */}
            <button
              className="btn small"
              onClick={applyFilter}
              disabled={loadingTop}
            >
              {loadingTop ? "Loading…" : "Apply"}
            </button>

            <div style={{ flex: 1 }} />

            {(() => {
              const isFiltered = filter.type !== "all";
              const label = isFiltered
                ? `📤 Export — ${filterLabel(filter)}`
                : "📤 Export (GPT)";
              return (
                <button
                  className="btn small"
                  onClick={exportScores}
                  style={
                    isFiltered
                      ? {
                          background: "rgba(9,105,218,0.08)",
                          color: "var(--primary)",
                          borderColor: "rgba(9,105,218,0.3)",
                        }
                      : {}
                  }
                >
                  {label}
                </button>
              );
            })()}
          </div>

          {/* Custom filter panel — only shown when Custom is selected */}
          {periodSel === "custom" && (
            <div
              style={{
                marginTop: 4,
                padding: "10px 12px",
                borderRadius: 8,
                background: "var(--surface2)",
                border: "1px solid var(--border)",
              }}
            >
              {/* Mode toggle */}
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {[
                  ["sessions", "By sessions"],
                  ["range", "By date range"],
                ].map(([m, l]) => (
                  <button
                    key={m}
                    onClick={() => setCustomMode(m)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 20,
                      border: "1px solid",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      background:
                        customMode === m
                          ? "var(--primary-dim)"
                          : "var(--surface)",
                      color:
                        customMode === m ? "var(--primary)" : "var(--muted)",
                      borderColor:
                        customMode === m
                          ? "var(--primary-border)"
                          : "var(--border)",
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>

              {/* Sessions input */}
              {customMode === "sessions" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <label className="form-label" style={{ margin: 0 }}>
                    Last
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={customN}
                    onChange={(e) => setCustomN(e.target.value)}
                    style={{
                      width: 56,
                      padding: "6px 8px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      fontSize: 13,
                      fontFamily: "inherit",
                      textAlign: "center",
                    }}
                  />
                  <label className="form-label" style={{ margin: 0 }}>
                    sessions
                  </label>
                </div>
              )}

              {/* Date range inputs */}
              {customMode === "range" && (
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "flex-end",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 130 }}>
                    <label className="form-label">From</label>
                    <div className="date-input-wrap">
                      <span className="date-input-icon">📅</span>
                      <input
                        className="date-input"
                        type="date"
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                      />
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 130 }}>
                    <label className="form-label">To</label>
                    <div className="date-input-wrap">
                      <span className="date-input-icon">📅</span>
                      <input
                        className="date-input"
                        type="date"
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Comparison notice — shown when rank movement is active */}
          <div
            style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}
          >
            {comparison.length > 0 && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span style={{ color: "var(--success)", fontWeight: 700 }}>
                  ↑↓
                </span>
                Rank movement vs {comparisonLabel(filter)}
              </div>
            )}
            {showAttendance && totalSessions > 0 && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span style={{ color: "var(--primary)", fontWeight: 700 }}>
                  Att.
                </span>
                Sessions attended out of {totalSessions}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ color: "var(--danger)", marginBottom: 10, fontSize: 13 }}>
          Error: {error.message}
        </div>
      )}

      {/* ── Top leaderboard ────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              minWidth: 0,
            }}
          >
            <span className="card-title">{filterLabel(filter)}</span>
            {/* Date range subtitle — only shown for sessions filter once resolved */}
            {filter.type === "sessions" &&
              resolvedRange?.start &&
              resolvedRange?.end && (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    fontWeight: 500,
                  }}
                >
                  {fmtDateShort(resolvedRange.start)} →{" "}
                  {fmtDateShort(resolvedRange.end)}
                </span>
              )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <SortBar
              sk={sortKey}
              setSk={setSortKey}
              sd={sortDir}
              setSd={setSortDir}
            />
            <span className="badge blue">{overall.length} players</span>
          </div>
        </div>
        {loadingTop && (
          <div style={{ padding: 12, color: "var(--muted)" }}>Loading…</div>
        )}
        {!loadingTop && sorted1.length === 0 && (
          <div style={{ padding: 12, color: "var(--muted)" }}>
            No scores yet.
          </div>
        )}
        {!loadingTop && sorted1.length > 0 && (
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

      {/* ── Session spotlight (by date) — unchanged ────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            {date ? `Scores — ${date}` : "Session spotlight"}
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
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
              flexWrap: "wrap",
            }}
          >
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
