// src/pages/ScoreboardPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import {
  fetchPlayerTotals,
  fetchPlayerTotalsByDate,
} from "../api/supabase-actions";

export default function ScoreboardPage() {
  const [overallRows, setOverallRows] = useState([]);
  const [dateRows, setDateRows] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [loadingOverall, setLoadingOverall] = useState(false);
  const [loadingDate, setLoadingDate] = useState(false);
  const [error, setError] = useState(null);

  const loadOverall = useCallback(async () => {
    setLoadingOverall(true);
    try {
      const { data, error } = await fetchPlayerTotals(true);
      if (error) throw error;
      // normalize
      setOverallRows(
        (data || []).map((r) => ({
          id: r.id || r.player_id || r.id,
          name: r.name,
          total_points: Number(r.total_points ?? r.total_points) || 0,
        }))
      );
    } catch (err) {
      console.error("loadOverall error", err);
      setError(err);
    } finally {
      setLoadingOverall(false);
    }
  }, []);

  const loadDate = useCallback(async (dateStr) => {
    if (!dateStr) {
      setDateRows([]);
      return;
    }
    setLoadingDate(true);
    try {
      const { data, error } = await fetchPlayerTotalsByDate(dateStr);
      if (error) throw error;
      setDateRows(
        (data || []).map((r) => ({
          id: r.id,
          name: r.name,
          total_points: Number(r.total_points || 0),
        }))
      );
    } catch (err) {
      console.error("loadDate error", err);
      setError(err);
    } finally {
      setLoadingDate(false);
    }
  }, []);

  useEffect(() => {
    loadOverall();
  }, [loadOverall]);

  useEffect(() => {
    if (selectedDate) loadDate(selectedDate);
    else setDateRows([]);
  }, [selectedDate, loadDate]);

  return (
    <div className="container" style={{ padding: 12 }}>
      <h3>Scoreboard</h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 360px",
          gap: 16,
          alignItems: "start",
        }}
      >
        {/* Overall */}
        <div className="card" style={{ padding: 12 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div style={{ fontWeight: 700 }}>Overall Totals</div>
            <div>
              <button
                className="btn"
                onClick={loadOverall}
                disabled={loadingOverall}
              >
                {loadingOverall ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          {loadingOverall && <div style={{ color: "#666" }}>Loading…</div>}
          {!loadingOverall && overallRows.length === 0 && (
            <div style={{ color: "#666" }}>No scores yet</div>
          )}

          <div>
            {overallRows.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  borderBottom: "1px solid #f3f3f3",
                }}
              >
                <div>{r.name}</div>
                <div style={{ fontWeight: 700 }}>{r.total_points}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Date-specific */}
        <div className="card" style={{ padding: 12 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div style={{ fontWeight: 700 }}>Game Date</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
              <button
                className="btn"
                onClick={() => loadDate(selectedDate)}
                disabled={loadingDate || !selectedDate}
              >
                {loadingDate ? "Loading..." : "Load"}
              </button>
              <button
                className="btn"
                onClick={() => {
                  setSelectedDate("");
                  setDateRows([]);
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {selectedDate === "" && (
            <div style={{ color: "#666" }}>
              Pick a date to see session totals
            </div>
          )}
          {selectedDate && loadingDate && (
            <div style={{ color: "#666" }}>Loading date totals…</div>
          )}

          {selectedDate && !loadingDate && dateRows.length === 0 && (
            <div style={{ color: "#666" }}>
              No points recorded for this date
            </div>
          )}

          {selectedDate && !loadingDate && dateRows.length > 0 && (
            <div>
              {dateRows.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: "1px solid #f3f3f3",
                  }}
                >
                  <div>{r.name}</div>
                  <div style={{ fontWeight: 700 }}>{r.total_points}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{ color: "red", marginTop: 12 }}>
          Error: {error.message || JSON.stringify(error)}
        </div>
      )}
    </div>
  );
}
