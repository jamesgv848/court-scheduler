// src/pages/PairingStats.jsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { fetchPairingStatsRecorded } from "../api/supabase-actions";

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
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState({ key: "matches", dir: "desc" });

  const load = useCallback(
    async (d = date) => {
      setLoading(true);
      try {
        const { data, error } = await fetchPairingStatsRecorded(
          d || null,
          d || null,
        );
        if (error) throw error;
        setPairs(data || []);
      } catch (err) {
        console.error(err);
        setPairs([]);
      } finally {
        setLoading(false);
      }
    },
    [date],
  );

  useEffect(() => {
    load();
  }, [load]);

  const normalized = useMemo(
    () =>
      (pairs || []).map((r) => ({
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
      })),
    [pairs],
  );

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

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((x, y) => {
      const a = x[sortBy.key] ?? 0,
        b = y[sortBy.key] ?? 0;
      return sortBy.dir === "asc" ? a - b : b - a;
    });
    return arr;
  }, [filtered, sortBy]);

  function toggleSort(key) {
    setSortBy((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );
  }
  const arr = (k) =>
    sortBy.key === k ? (sortBy.dir === "desc" ? " ↓" : " ↑") : "";

  return (
    <div className="container" style={{ paddingTop: 12 }}>
      {/* Filters */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🤝 Pairing Stats</span>
          <span className="badge blue">
            {sorted.length} / {normalized.length}
          </span>
        </div>
        <div className="card-body">
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
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <button
              className="btn small"
              onClick={() => load(date)}
              disabled={loading}
            >
              {loading ? "…" : "Refresh"}
            </button>
            <button
              className="btn small"
              onClick={() => {
                setDate("");
                load("");
              }}
            >
              All dates
            </button>
          </div>
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

      {/* Sort buttons */}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {[
          ["matches", "Matches"],
          ["wins", "Wins"],
          ["winPct", "Win%"],
        ].map(([k, l]) => (
          <button
            key={k}
            className="btn small"
            onClick={() => toggleSort(k)}
            style={{
              flex: 1,
              background:
                sortBy.key === k ? "var(--accent-dim)" : "var(--surface)",
              color: sortBy.key === k ? "var(--accent)" : "var(--muted)",
              borderColor:
                sortBy.key === k ? "var(--accent-border)" : "var(--border)",
            }}
          >
            {l}
            {arr(k)}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="card">
        {loading && (
          <div style={{ padding: 16, color: "var(--muted)" }}>Loading…</div>
        )}
        {!loading && sorted.length === 0 && (
          <div style={{ padding: 16, color: "var(--muted)" }}>
            No recorded pairs found.
          </div>
        )}

        {/* Desktop table */}
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
                    Matches{arr("matches")}
                  </th>
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
                  <th
                    style={{ cursor: "pointer" }}
                    onClick={() => toggleSort("winPct")}
                  >
                    Win%{arr("winPct")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={`${r.player_a}|${r.player_b}`}>
                    <td style={{ fontWeight: 600 }}>{r.name_a}</td>
                    <td style={{ fontWeight: 600 }}>{r.name_b}</td>
                    <td style={{ textAlign: "center" }}>{r.matches}</td>
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
                    <td style={{ textAlign: "center" }}>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile cards */}
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
                    {r.matches} matches together
                  </div>
                </div>
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
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
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
              </div>
            </div>
          ))}
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}
