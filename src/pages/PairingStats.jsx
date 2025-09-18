// src/pages/PairingStats.jsx
import React, { useEffect, useState, useMemo } from "react";
import { fetchPlayers, fetchPairingStats } from "../api/supabase-actions";

/**
 * PairingStats page
 * - shows team-pair stats: total matches together, wins together, losses together, win%
 */
export default function PairingStats() {
  const [players, setPlayers] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState({ key: "total_matches", dir: "desc" }); // default sort
  const [filter, setFilter] = useState("");

  useEffect(() => {
    (async () => {
      const { data: pData, error: pErr } = await fetchPlayers();
      if (pErr) {
        console.error("fetchPlayers error", pErr);
      } else {
        setPlayers(pData || []);
      }
    })();
  }, []);

  useEffect(() => {
    loadPairs();
  }, []);

  async function loadPairs() {
    setLoading(true);
    try {
      const { data, error } = await fetchPairingStats();
      if (error) throw error;
      setPairs(data || []);
    } catch (err) {
      console.error("fetchPairingStats error", err);
      setPairs([]);
    } finally {
      setLoading(false);
    }
  }

  // players map for quick lookup
  const playersMap = useMemo(
    () => Object.fromEntries((players || []).map((p) => [p.id, p.name])),
    [players]
  );

  // normalize pairs with name lookup and computed win rate
  const normalized = useMemo(() => {
    return (pairs || [])
      .map((r) => {
        const total = Number(r.total_matches || 0);
        const wins = Number(r.wins || 0);
        const losses = Number(r.losses || 0);
        const winPct = total > 0 ? Math.round((wins / total) * 100) : 0;
        return {
          player_a: r.player_a,
          player_b: r.player_b,
          name_a: playersMap[r.player_a] || r.player_a,
          name_b: playersMap[r.player_b] || r.player_b,
          pair_count: Number(r.pair_count || 0),
          total_matches: total,
          wins,
          losses,
          winPct,
        };
      })
      .filter((row) => {
        // simple filter by name
        if (!filter) return true;
        const f = filter.toLowerCase();
        return (
          row.name_a.toLowerCase().includes(f) ||
          row.name_b.toLowerCase().includes(f)
        );
      });
  }, [pairs, playersMap, filter]);

  // sort
  const sorted = useMemo(() => {
    const s = normalized.slice();
    s.sort((x, y) => {
      const a = x[sortBy.key];
      const b = y[sortBy.key];
      if (a < b) return sortBy.dir === "asc" ? -1 : 1;
      if (a > b) return sortBy.dir === "asc" ? 1 : -1;
      return 0;
    });
    return s;
  }, [normalized, sortBy]);

  function toggleSort(key) {
    if (sortBy.key === key) {
      setSortBy({ key, dir: sortBy.dir === "asc" ? "desc" : "asc" });
    } else {
      setSortBy({ key, dir: "desc" });
    }
  }

  // color intensity helper (based on total matches)
  function intensityStyle(total) {
    const max = Math.max(1, ...sorted.map((s) => s.total_matches)); // avoid divide by zero
    const ratio = Math.min(1, total / max);
    const alpha = 0.08 + ratio * 0.6;
    return {
      background: total > 0 ? `rgba(11,113,208,${alpha})` : "transparent",
    };
  }

  return (
    <div className="container">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h3>Pairing & Team Stats</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            placeholder="filter by player name"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button className="btn" onClick={loadPairs}>
            Refresh
          </button>
        </div>
      </div>

      <div className="card">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 1fr",
            gap: 8,
            padding: 8,
            fontWeight: 700,
            alignItems: "center",
          }}
        >
          <div
            onClick={() => toggleSort("name_a")}
            style={{ cursor: "pointer" }}
          >
            Player A
          </div>
          <div
            onClick={() => toggleSort("name_b")}
            style={{ cursor: "pointer" }}
          >
            Player B
          </div>
          <div
            onClick={() => toggleSort("total_matches")}
            style={{ cursor: "pointer" }}
          >
            Matches
          </div>
          <div onClick={() => toggleSort("wins")} style={{ cursor: "pointer" }}>
            Wins
          </div>
          <div
            onClick={() => toggleSort("losses")}
            style={{ cursor: "pointer" }}
          >
            Losses
          </div>
          <div
            onClick={() => toggleSort("winPct")}
            style={{ cursor: "pointer" }}
          >
            Win%
          </div>
        </div>

        <div>
          {loading && (
            <div style={{ color: "#666", padding: 12 }}>Loading...</div>
          )}
          {!loading && sorted.length === 0 && (
            <div style={{ color: "#666", padding: 12 }}>No pairs yet</div>
          )}
          {!loading &&
            sorted.map((row) => (
              <div
                key={`${row.player_a}|${row.player_b}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 2fr 1fr 1fr 1fr 1fr",
                  gap: 8,
                  padding: "8px",
                  alignItems: "center",
                  ...intensityStyle(row.total_matches),
                }}
              >
                <div>{row.name_a}</div>
                <div>{row.name_b}</div>
                <div style={{ textAlign: "center" }}>{row.total_matches}</div>
                <div style={{ textAlign: "center" }}>{row.wins}</div>
                <div style={{ textAlign: "center" }}>{row.losses}</div>
                <div style={{ textAlign: "center" }}>{row.winPct}%</div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
