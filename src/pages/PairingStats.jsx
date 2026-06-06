// src/pages/PairingStats.jsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  fetchPairingStatsRecorded,
  fetchPairingStatsScheduled,
} from "../api/supabase-actions";

// ── Colour helpers (unchanged from original) ──────────────────────────────────
const wc = (p) =>
  p >= 60 ? "var(--success)" : p >= 40 ? "var(--yellow)" : "var(--danger)";
const wbg = (p) =>
  p >= 60
    ? "var(--success-dim)"
    : p >= 40
      ? "var(--yellow-dim)"
      : "var(--danger-dim)";

export default function PairingStats() {
  const [date, setDate] = useState("");
  const [mode, setMode] = useState("recorded"); // "recorded" | "scheduled"
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState({ key: "matches", dir: "desc" });

  // ── Data loader ───────────────────────────────────────────────────────────
  const load = useCallback(
    async (d = date, m = mode) => {
      setLoading(true);
      try {
        let data, error;
        if (m === "scheduled" && d) {
          // New RPC — scheduled pairings, includes hist win% for context
          ({ data, error } = await fetchPairingStatsScheduled(d));
        } else {
          // Original RPC — recorded results only
          ({ data, error } = await fetchPairingStatsRecorded(
            d || null,
            d || null,
          ));
        }
        if (error) throw error;
        setPairs(data || []);
      } catch (err) {
        console.error("PairingStats load error", err);
        setPairs([]);
      } finally {
        setLoading(false);
      }
    },
    [date, mode],
  );

  useEffect(() => {
    load();
  }, [load]);

  // When mode changes and a date is set, reload immediately
  function switchMode(m) {
    setMode(m);
    setSortBy({ key: "matches", dir: "desc" }); // reset sort — win% not valid in scheduled
    load(date, m);
  }

  // ── Normalise rows from both RPCs into a common shape ──────────────────────
  const normalized = useMemo(() => {
    if (mode === "scheduled") {
      return (pairs || []).map((r) => ({
        player_a: r.player_a,
        player_b: r.player_b,
        name_a: r.name_a || r.player_a,
        name_b: r.name_b || r.player_b,
        matches: Number(r.matches || 0),
        wins: null, // not available for scheduled
        losses: null,
        winPct: null, // not available for scheduled
        histMatches: Number(r.hist_matches || 0),
        histWins: Number(r.hist_wins || 0),
        histWinPct: r.hist_win_pct != null ? Number(r.hist_win_pct) : null,
      }));
    }
    // recorded mode — same as original
    return (pairs || []).map((r) => ({
      player_a: r.player_a,
      player_b: r.player_b,
      name_a: r.name_a || r.player_a,
      name_b: r.name_b || r.player_b,
      matches: Number(r.matches || 0),
      wins: Number(r.wins || 0),
      losses: Number(r.losses || 0),
      winPct: r.matches
        ? Math.round((Number(r.wins || 0) / Number(r.matches)) * 100)
        : 0,
      histMatches: null,
      histWins: null,
      histWinPct: null,
    }));
  }, [pairs, mode]);

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f
      ? normalized.filter(
          (r) =>
            r.name_a.toLowerCase().includes(f) ||
            r.name_b.toLowerCase().includes(f),
        )
      : normalized;
  }, [normalized, filter]);

  // ── Sort — win% disabled in scheduled mode ────────────────────────────────
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((x, y) => {
      const a = x[sortBy.key] ?? 0;
      const b = y[sortBy.key] ?? 0;
      return sortBy.dir === "asc" ? a - b : b - a;
    });
    return arr;
  }, [filtered, sortBy]);

  function toggleSort(key) {
    // Win% sort is disabled in scheduled mode
    if (mode === "scheduled" && key === "winPct") return;
    setSortBy((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );
  }
  const arr = (k) =>
    sortBy.key === k ? (sortBy.dir === "desc" ? " ↓" : " ↑") : "";

  // ── Render helpers ────────────────────────────────────────────────────────
  const isScheduled = mode === "scheduled" && !!date;

  return (
    <div className="container" style={{ paddingTop: 12 }}>
      {/* ── Filter card ──────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🤝 Pairing Stats</span>
          <span className="badge blue">
            {sorted.length} / {normalized.length}
          </span>
        </div>
        <div className="card-body">
          {/* Date + action buttons */}
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
              marginBottom: 10,
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
                    // If clearing the date, snap back to recorded mode
                    if (!e.target.value && mode === "scheduled") {
                      setMode("recorded");
                    }
                  }}
                />
              </div>
            </div>
            <button
              className="btn small"
              onClick={() => load(date, mode)}
              disabled={loading}
            >
              {loading ? "…" : "Refresh"}
            </button>
            <button
              className="btn small"
              onClick={() => {
                setDate("");
                setMode("recorded");
                load("", "recorded");
              }}
            >
              All dates
            </button>
          </div>

          {/* Mode toggle — only shown when a date is selected */}
          {date && (
            <div style={{ marginBottom: 10 }}>
              <label className="form-label">View</label>
              <div
                style={{
                  display: "flex",
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 3,
                  gap: 3,
                }}
              >
                {[
                  { key: "recorded", label: "🏆 Recorded results" },
                  { key: "scheduled", label: "📅 Scheduled pairings" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => switchMode(key)}
                    style={{
                      flex: 1,
                      padding: "7px 8px",
                      borderRadius: 6,
                      border:
                        mode === key
                          ? "1px solid var(--border)"
                          : "1px solid transparent",
                      background:
                        mode === key ? "var(--surface)" : "transparent",
                      color: mode === key ? "var(--text)" : "var(--muted)",
                      fontWeight: mode === key ? 700 : 500,
                      fontSize: 12,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all .15s",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search filter */}
          <input
            placeholder="🔍 Filter by player name…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              width: "100%",
              padding: "7px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              fontSize: 13,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>
      </div>

      {/* ── Sort buttons ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {[
          ["matches", "Matches"],
          ["wins", "Wins"],
          ["winPct", "Win%"],
        ].map(([k, l]) => {
          const disabled = isScheduled && k === "winPct";
          return (
            <button
              key={k}
              className="btn small"
              onClick={() => toggleSort(k)}
              disabled={disabled}
              style={{
                flex: 1,
                background:
                  sortBy.key === k ? "var(--accent-dim)" : "var(--surface)",
                color: disabled
                  ? "var(--muted2)"
                  : sortBy.key === k
                    ? "var(--accent)"
                    : "var(--muted)",
                borderColor:
                  sortBy.key === k ? "var(--accent-border)" : "var(--border)",
                opacity: disabled ? 0.45 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              {l}
              {arr(k)}
            </button>
          );
        })}
      </div>

      {/* ── Results ──────────────────────────────────────────────────────── */}
      <div className="card">
        {/* Scheduled mode info banner */}
        {isScheduled && !loading && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              margin: "10px 12px 0",
              padding: "8px 10px",
              borderRadius: 8,
              background: "rgba(9,105,218,0.07)",
              border: "1px solid rgba(9,105,218,0.2)",
            }}
          >
            <span style={{ fontSize: 14, flexShrink: 0 }}>ℹ️</span>
            <p
              style={{
                fontSize: 12,
                color: "var(--primary)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Showing all pairings scheduled for {date} — results not yet
              recorded. Historical win% shown for context.
            </p>
          </div>
        )}

        {loading && (
          <div style={{ padding: 16, color: "var(--muted)" }}>Loading…</div>
        )}
        {!loading && sorted.length === 0 && (
          <div style={{ padding: 16, color: "var(--muted)" }}>
            {isScheduled
              ? "No matches scheduled for this date yet."
              : "No recorded pairs found."}
          </div>
        )}

        {/* ── Desktop table ──────────────────────────────────────────────── */}
        {!loading && sorted.length > 0 && (
          <div className="table-wrap">
            <table className="paired-table">
              <thead>
                <tr>
                  <th>Player A</th>
                  <th>Player B</th>
                  <th
                    style={{ cursor: "pointer" }}
                    onClick={() => toggleSort("matches")}
                  >
                    {isScheduled ? "Scheduled" : "Matches"}
                    {arr("matches")}
                  </th>
                  {!isScheduled && (
                    <>
                      <th
                        style={{ cursor: "pointer" }}
                        onClick={() => toggleSort("wins")}
                      >
                        Wins{arr("wins")}
                      </th>
                      <th
                        style={{ cursor: "pointer" }}
                        onClick={() => toggleSort("losses")}
                      >
                        Losses{arr("losses")}
                      </th>
                    </>
                  )}
                  <th
                    style={{
                      cursor: isScheduled ? "default" : "pointer",
                      opacity: isScheduled ? 0.5 : 1,
                    }}
                    onClick={() => toggleSort("winPct")}
                  >
                    {isScheduled ? "All-time Win%" : `Win%${arr("winPct")}`}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={`${r.player_a}|${r.player_b}`}>
                    <td style={{ fontWeight: 600 }}>{r.name_a}</td>
                    <td style={{ fontWeight: 600 }}>{r.name_b}</td>
                    <td style={{ textAlign: "center" }}>{r.matches}</td>
                    {!isScheduled && (
                      <>
                        <td
                          style={{
                            textAlign: "center",
                            color: "var(--success)",
                            fontWeight: 700,
                          }}
                        >
                          {r.wins}
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            color: "var(--danger)",
                            fontWeight: 700,
                          }}
                        >
                          {r.losses}
                        </td>
                      </>
                    )}
                    <td style={{ textAlign: "center" }}>
                      {isScheduled ? (
                        r.histWinPct != null ? (
                          <span
                            style={{
                              fontWeight: 800,
                              color: wc(r.histWinPct),
                              background: wbg(r.histWinPct),
                              padding: "2px 6px",
                              borderRadius: 6,
                              fontSize: 11,
                            }}
                          >
                            {r.histWinPct}% ({r.histMatches}M)
                          </span>
                        ) : (
                          <span
                            style={{ color: "var(--muted2)", fontSize: 11 }}
                          >
                            new
                          </span>
                        )
                      ) : (
                        <span
                          style={{
                            fontWeight: 800,
                            color: wc(r.winPct),
                            background: wbg(r.winPct),
                            padding: "2px 6px",
                            borderRadius: 6,
                          }}
                        >
                          {r.winPct}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Mobile cards ───────────────────────────────────────────────── */}
        {!loading &&
          sorted.length > 0 &&
          sorted.map((r) => (
            <div key={`${r.player_a}|${r.player_b}`} className="pair-row-card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 8,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {r.name_a} & {r.name_b}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    {isScheduled
                      ? `${r.matches} game${r.matches !== 1 ? "s" : ""} scheduled`
                      : `${r.matches} matches together`}
                  </div>
                  {/* Historical pill — only in scheduled mode */}
                  {isScheduled && r.histWinPct != null && (
                    <span
                      style={{
                        display: "inline-block",
                        marginTop: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "1px 7px",
                        borderRadius: 20,
                        background: "rgba(9,105,218,0.09)",
                        color: "var(--primary)",
                        border: "1px solid rgba(9,105,218,0.2)",
                      }}
                    >
                      all-time: {r.histWinPct}% ({r.histMatches}M)
                    </span>
                  )}
                  {isScheduled && r.histWinPct == null && (
                    <span
                      style={{
                        display: "inline-block",
                        marginTop: 4,
                        fontSize: 10,
                        padding: "1px 7px",
                        borderRadius: 20,
                        background: "var(--surface2)",
                        color: "var(--muted2)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      new pair
                    </span>
                  )}
                </div>
                {/* Win% badge — recorded mode only */}
                {!isScheduled && (
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: 18,
                      color: wc(r.winPct),
                      background: wbg(r.winPct),
                      padding: "2px 8px",
                      borderRadius: 8,
                    }}
                  >
                    {r.winPct}%
                  </span>
                )}
              </div>

              {/* Stats row */}
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                {!isScheduled ? (
                  <>
                    {[
                      ["Played", r.matches, "var(--text)"],
                      ["Wins", r.wins, "var(--success)"],
                      ["Losses", r.losses, "var(--danger)"],
                    ].map(([label, val, color]) => (
                      <div key={label} style={{ textAlign: "center" }}>
                        <div style={{ fontWeight: 800, fontSize: 16, color }}>
                          {val}
                        </div>
                        <div
                          style={{
                            fontSize: 9,
                            color: "var(--muted)",
                            textTransform: "uppercase",
                            fontWeight: 600,
                          }}
                        >
                          {label}
                        </div>
                      </div>
                    ))}
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          height: 4,
                          background: "var(--surface3)",
                          borderRadius: 2,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${r.winPct}%`,
                            background: wc(r.winPct),
                            borderRadius: 2,
                          }}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ textAlign: "center" }}>
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: 16,
                          color: "var(--text)",
                        }}
                      >
                        {r.matches}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: "var(--muted)",
                          textTransform: "uppercase",
                          fontWeight: 600,
                        }}
                      >
                        Today
                      </div>
                    </div>
                    {r.histMatches > 0 && (
                      <>
                        <div style={{ textAlign: "center" }}>
                          <div
                            style={{
                              fontWeight: 800,
                              fontSize: 16,
                              color: "var(--muted)",
                            }}
                          >
                            {r.histMatches}
                          </div>
                          <div
                            style={{
                              fontSize: 9,
                              color: "var(--muted)",
                              textTransform: "uppercase",
                              fontWeight: 600,
                            }}
                          >
                            All-time
                          </div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              height: 4,
                              background: "var(--surface3)",
                              borderRadius: 2,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: `${r.histWinPct}%`,
                                background: wc(r.histWinPct),
                                borderRadius: 2,
                              }}
                            />
                          </div>
                          <div
                            style={{
                              fontSize: 9,
                              color: "var(--muted2)",
                              marginTop: 2,
                            }}
                          >
                            historical win rate
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}
