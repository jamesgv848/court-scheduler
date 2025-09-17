// src/pages/ScoreboardPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";
import {
  fetchPlayerTotals,
  fetchPlayerTotalsForDate,
} from "../api/supabase-actions";

export default function ScoreboardPage() {
  const todayISO = new Date().toISOString().slice(0, 10);
  const [rowsAll, setRowsAll] = useState([]);
  const [rowsDate, setRowsDate] = useState([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [loadingDate, setLoadingDate] = useState(false);
  const [date, setDate] = useState(todayISO);

  const loadAll = useCallback(async () => {
    setLoadingAll(true);
    try {
      const { data, error } = await fetchPlayerTotals();
      if (error) {
        console.error("fetchPlayerTotals error", error);
        return;
      }
      const normalized = (data || []).map((r) => ({
        player_id: r.id,
        name: r.name,
        total_points: Number(r.total_points ?? 0),
      }));
      setRowsAll(normalized);
    } catch (err) {
      console.error("loadAll error", err);
    } finally {
      setLoadingAll(false);
    }
  }, []);

  const loadDate = useCallback(
    async (d = date) => {
      if (!d) return;
      setLoadingDate(true);
      try {
        const { data, error } = await fetchPlayerTotalsForDate(d);
        if (error) {
          console.error("fetchPlayerTotalsForDate error", error);
          setRowsDate([]);
          return;
        }
        // RPC returns player_id,name,points_on_date
        const normalized = (data || []).map((r) => ({
          player_id: r.player_id || r.id,
          name: r.name,
          points_on_date: Number(r.points_on_date ?? 0),
        }));
        setRowsDate(normalized);
      } catch (err) {
        console.error("loadDate error", err);
      } finally {
        setLoadingDate(false);
      }
    },
    [date]
  );

  useEffect(() => {
    loadAll();
    loadDate(date);

    // realtime subscription & window event fallback
    const channel = supabase
      .channel("public:scoreboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scores" },
        (payload) => {
          console.debug("scores realtime event", payload);
          loadAll();
          loadDate(date);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        (payload) => {
          console.debug("matches realtime event", payload);
          loadAll();
          loadDate(date);
        }
      )
      .subscribe();

    const handler = () => {
      console.debug("scores-changed event received (window)");
      loadAll();
      loadDate(date);
    };
    window.addEventListener("scores-changed", handler);

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        /* ignore */
      }
      window.removeEventListener("scores-changed", handler);
    };
  }, [loadAll, loadDate, date]);

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
        <h3>Scoreboard</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 13, color: "#444" }}>Date:</label>
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              loadDate(e.target.value);
            }}
          />
          <button
            className="btn"
            onClick={() => {
              loadAll();
              loadDate(date);
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <h4>All-time Totals</h4>
          {loadingAll && <div style={{ color: "#666" }}>Loading...</div>}
          <div style={{ marginTop: 8 }}>
            {rowsAll.length === 0 && !loadingAll && (
              <div style={{ color: "#666" }}>No scores yet</div>
            )}
            {rowsAll.map((r) => (
              <div
                key={r.player_id}
                className="score-row"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 4px",
                }}
              >
                <div>{r.name}</div>
                <div style={{ fontWeight: 700 }}>{r.total_points}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h4>Totals for {date}</h4>
          {loadingDate && <div style={{ color: "#666" }}>Loading...</div>}
          <div style={{ marginTop: 8 }}>
            {rowsDate.length === 0 && !loadingDate && (
              <div style={{ color: "#666" }}>No scores for this date</div>
            )}
            {rowsDate.map((r) => (
              <div
                key={r.player_id}
                className="score-row"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 4px",
                }}
              >
                <div>{r.name}</div>
                <div style={{ fontWeight: 700 }}>{r.points_on_date}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
