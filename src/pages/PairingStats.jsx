// src/pages/PairingStats.jsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { fetchPairingStatsRecorded } from "../api/supabase-actions";

/**
 * PairingStats page
 * - shows pairs that have recorded results (winner IS NOT NULL)
 * - optional date filter (single date). Leave empty to show all recorded pairs.
 */
export default function PairingStats() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(""); // empty => no date filter
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState({ key: "matches", dir: "desc" });

  const load = useCallback(
    async (d = date) => {
      setLoading(true);
      setError(null);
      try {
        // RPC takes (p_start, p_end) - pass same date for single-day filter, or nulls
        const start = d ? d : null;
        const end = d ? d : null;
        const { data, error } = await fetchPairingStatsRecorded(start, end);
        if (error) throw error;
        setPairs(data || []);
      } catch (err) {
        console.error("fetchPairingStatsRecorded error", err);
        setError(err);
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
    // RPC returns name_a, name_b, player_a, player_b, matches, wins, losses
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
      const a = x[sortBy.key];
      const b = y[sortBy.key];
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
    <div className="container" style={{ padding: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <h3 style={{ margin: 0 }}>Pairing Stats (recorded results)</h3>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Filter by date"
            title="Show pairs for this match date (optional)"
          />
          <button className="btn" onClick={() => load(date)} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            className="btn"
            onClick={() => {
              setDate("");
              load("");
            }}
          >
            All dates
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 12 }}>
        <input
          placeholder="Filter by player name"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1, padding: 8 }}
        />
        <div
          style={{
            minWidth: 180,
            textAlign: "right",
            color: "#666",
            fontSize: 13,
          }}
        >
          <div>Pairs: {normalized.length}</div>
          <div style={{ marginTop: 4 }}>Showing: {sorted.length}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12, padding: 8 }}>
        {loading && <div style={{ color: "#666", padding: 8 }}>Loading...</div>}
        {error && (
          <div style={{ color: "red", padding: 8 }}>
            Error: {error.message || JSON.stringify(error)}
          </div>
        )}
        {!loading && sorted.length === 0 && !error && (
          <div style={{ color: "#666", padding: 12 }}>
            No recorded pairs found for selected date/filter.
          </div>
        )}

        {!loading && sorted.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{ textAlign: "left", borderBottom: "1px solid #eee" }}
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
                  <tr
                    key={`${r.player_a}|${r.player_b}`}
                    style={{ borderBottom: "1px solid #fafafa" }}
                  >
                    <td style={{ padding: 8, minWidth: 160 }}>{r.name_a}</td>
                    <td style={{ padding: 8, minWidth: 160 }}>{r.name_b}</td>
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
        )}
      </div>

      <div style={{ marginTop: 12, color: "#666", fontSize: 13 }}>
        Note: this view shows only pairs from matches with recorded winners. Use
        the date filter to focus on a session.
      </div>
    </div>
  );
}
