// src/pages/PairingStats.jsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { fetchPairingStatsRecorded } from "../api/supabase-actions";

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
        const start = d ? d : null;
        const end = d ? d : null;
        const { data, error } = await fetchPairingStatsRecorded(start, end);
        if (error) throw error;
        setPairs(data || []);
      } catch (err) {
        console.error("fetchPairingStatsRecorded error", err);
        setPairs([]);
      } finally {
        setLoading(false);
      }
    },
    [date]
  );

  useEffect(() => {
    load();
  }, [load]);

  const normalized = useMemo(() => {
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
    }));
  }, [pairs]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return normalized;
    return normalized.filter(
      (r) =>
        r.name_a.toLowerCase().includes(f) || r.name_b.toLowerCase().includes(f)
    );
  }, [normalized, filter]);

  const sorted = useMemo(() => {
    const arr = filtered.slice();
    arr.sort((x, y) => {
      const a = x[sortBy.key] ?? 0;
      const b = y[sortBy.key] ?? 0;
      if (a < b) return sortBy.dir === "asc" ? -1 : 1;
      if (a > b) return sortBy.dir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortBy]);

  function toggleSort(key) {
    setSortBy((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  }

  return (
    <div className="container">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "center",
        }}
      >
        <h3 style={{ margin: 0 }}>Pairing Stats (recorded results)</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="date"
            className="date-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button
            className="btn small"
            onClick={() => load(date)}
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
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
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <input
          placeholder="Filter by player"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="text-input"
          style={{ flex: 1 }}
        />
        <div
          style={{
            minWidth: 140,
            textAlign: "right",
            color: "#666",
            fontSize: 13,
          }}
        >
          <div>Pairs: {normalized.length}</div>
          <div style={{ marginTop: 4 }}>Showing: {sorted.length}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        {loading && <div style={{ color: "#666", padding: 8 }}>Loading...</div>}
        {!loading && sorted.length === 0 && (
          <div style={{ color: "#666", padding: 12 }}>
            No recorded pairs found.
          </div>
        )}

        {!loading && sorted.length > 0 && (
          <>
            {/* Desktop table (hidden on small screens via CSS) */}
            <div className="table-wrap">
              <table className="paired-table">
                <thead>
                  <tr
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    <th style={{ padding: 8 }}>Player A</th>
                    <th style={{ padding: 8 }}>Player B</th>
                    <th
                      style={{ padding: 8, cursor: "pointer" }}
                      onClick={() => toggleSort("matches")}
                    >
                      Matches ▾
                    </th>
                    <th
                      style={{ padding: 8, cursor: "pointer" }}
                      onClick={() => toggleSort("wins")}
                    >
                      Wins ▾
                    </th>
                    <th
                      style={{ padding: 8, cursor: "pointer" }}
                      onClick={() => toggleSort("losses")}
                    >
                      Losses ▾
                    </th>
                    <th
                      style={{ padding: 8, cursor: "pointer" }}
                      onClick={() => toggleSort("winPct")}
                    >
                      Win% ▾
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={`${r.player_a}|${r.player_b}`}>
                      <td style={{ padding: 8 }}>{r.name_a}</td>
                      <td style={{ padding: 8 }}>{r.name_b}</td>
                      <td style={{ padding: 8, textAlign: "center" }}>
                        {r.matches}
                      </td>
                      <td style={{ padding: 8, textAlign: "center" }}>
                        {r.wins}
                      </td>
                      <td style={{ padding: 8, textAlign: "center" }}>
                        {r.losses}
                      </td>
                      <td style={{ padding: 8, textAlign: "center" }}>
                        {r.winPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile stacked cards (visible only on small screens via CSS) */}
            <div style={{ marginTop: 8 }}>
              {sorted.map((r) => (
                <div
                  key={`${r.player_a}|${r.player_b}`}
                  className="pair-row-card"
                >
                  <div className="pair-row-grid">
                    <div
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          background: "#eef2ff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 800,
                          color: "var(--primary)",
                        }}
                      >
                        {r.name_a
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <div style={{ fontWeight: 700 }}>{r.name_a}</div>
                        <div style={{ fontSize: 12, color: "#666" }}>
                          Partner A
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 800 }}>{r.matches}</div>
                      <div style={{ fontSize: 12, color: "#666" }}>Matches</div>
                    </div>
                  </div>

                  <div className="pair-row-grid" style={{ marginTop: 6 }}>
                    <div
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          background: "#fff3",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 800,
                          color: "#f59e0b",
                        }}
                      >
                        {r.name_b
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <div style={{ fontWeight: 700 }}>{r.name_b}</div>
                        <div style={{ fontSize: 12, color: "#666" }}>
                          Partner B
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, color: "#10b981" }}>
                        {r.wins}
                      </div>
                      <div style={{ fontSize: 12, color: "#666" }}>Wins</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <div style={{ fontSize: 13, color: "#666" }}>
                      Losses:{" "}
                      <strong style={{ marginLeft: 6 }}>{r.losses}</strong>
                    </div>
                    <div
                      style={{
                        marginLeft: "auto",
                        fontSize: 13,
                        color: "#666",
                      }}
                    >
                      Win%:{" "}
                      <strong style={{ marginLeft: 6 }}>{r.winPct}%</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 10, color: "#666", fontSize: 13 }}>
        Note: rows shown are pairs with recorded match results. Use the date
        filter to focus on a session.
      </div>
    </div>
  );
}
