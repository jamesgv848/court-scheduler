// src/pages/SchedulePage.jsx
import React, { useEffect, useState } from "react";
import { generateSchedule } from "../utils/scheduler";
import {
  fetchPlayers,
  fetchPairingHistoryMap,
  fetchOpponentHistoryMap,
  saveScheduleToDb,
  fetchMatchesForDate,
} from "../api/supabase-actions";
import MatchCard from "../components/MatchCard";

export default function SchedulePage() {
  const [players, setPlayers] = useState([]);
  const [available, setAvailable] = useState([]);
  const [courts, setCourts] = useState(1);
  const [matchesPerCourt, setMatchesPerCourt] = useState(5);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState([]);
  const [savedMatches, setSavedMatches] = useState([]);
  const [pairingMap, setPairingMap] = useState(new Map());
  const [opponentMap, setOpponentMap] = useState(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPlayers();
    loadHistory();
    loadSavedMatches();
  }, []);

  async function loadPlayers() {
    const { data, error } = await fetchPlayers();
    if (error) {
      console.error(error);
      return;
    }
    setPlayers(data);
  }

  async function loadHistory() {
    try {
      const pm = await fetchPairingHistoryMap();
      const om = await fetchOpponentHistoryMap();
      setPairingMap(pm);
      setOpponentMap(om);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadSavedMatches() {
    const { data, error } = await fetchMatchesForDate(date);
    if (error) {
      console.error(error);
      return;
    }
    setSavedMatches(data || []);
  }

  useEffect(() => {
    loadSavedMatches();
  }, [date]);

  function toggleAvailable(id) {
    setAvailable((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function onGeneratePreview() {
    if (available.length < 4) {
      alert("Select at least 4 players");
      return;
    }
    const schedule = generateSchedule({
      players: available,
      courts: Number(courts),
      matchesPerCourt: Number(matchesPerCourt),
      pairingHistory: pairingMap,
      opponentHistory: opponentMap,
    });
    setPreview(schedule);
  }

  async function onSaveSchedule() {
    if (preview.length === 0) {
      alert("Nothing to save");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await saveScheduleToDb(preview, date);
      if (error) throw error;
      alert("Schedule saved.");
      setPreview([]);
      await loadSavedMatches();
    } catch (e) {
      console.error(e);
      alert("Failed to save schedule: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <header className="header">
        <div className="brand">
          <div className="logo">CS</div>
          <div className="title">Schedule — {date}</div>
        </div>

        <div className="controls">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <input
            type="number"
            min={1}
            value={courts}
            onChange={(e) => setCourts(e.target.value)}
            style={{ width: 80 }}
          />
          <input
            type="number"
            min={1}
            value={matchesPerCourt}
            onChange={(e) => setMatchesPerCourt(e.target.value)}
            style={{ width: 80 }}
          />
          <button className="btn" onClick={onGeneratePreview}>
            Generate
          </button>
          <button
            className="btn secondary"
            onClick={onSaveSchedule}
            disabled={loading}
          >
            Save Schedule
          </button>
        </div>
      </header>

      <div className="grid">
        <div>
          <div className="card">
            <h3>Players (select available)</h3>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 10,
              }}
            >
              {players.map((p) => (
                <label
                  key={p.id}
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <input
                    type="checkbox"
                    checked={available.includes(p.id)}
                    onChange={() => toggleAvailable(p.id)}
                  />
                  <span>{p.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <h3>Preview ({preview.length} matches)</h3>
            <div className="schedule-list">
              {preview.map((m) => (
                <div key={m.id} className="match-card">
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <div className="match-index">#{m.match_index}</div>
                    <div>
                      <div className="team">
                        {m.players.slice(0, 2).join(" & ")}
                      </div>
                      <div style={{ color: "#666" }} className="team">
                        {m.players.slice(2, 4).join(" & ")}
                      </div>
                    </div>
                  </div>
                  <div className="hstack">
                    <div className="court-pill">Court {m.court}</div>
                    <div className="badge">Round {m.round}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <h3>Saved Matches for {date}</h3>
            <div className="schedule-list">
              {savedMatches.length === 0 && <div>No saved matches</div>}
              {savedMatches.map((s) => (
                <MatchCard key={s.id} match={s} onChange={loadSavedMatches} />
              ))}
            </div>
          </div>
        </div>

        <aside>
          <div className="card">
            <h4>Pairing Heatmap</h4>
            <p style={{ color: "#666" }}>
              Shows how often players teamed together (higher = more frequent).
            </p>
            <div style={{ marginTop: 10 }}>
              <PairingHeatmap
                players={players}
                pairingMap={pairingMap}
                opponentMap={opponentMap}
              />
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <h4>Help</h4>
            <p style={{ color: "#555", fontSize: 13 }}>
              Select available players for the date, set courts and matches per
              court, Generate to preview, then Save Schedule to persist. Any
              user can record winners.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function PairingHeatmap({
  players = [],
  pairingMap = new Map(),
  opponentMap = new Map(),
}) {
  if (!players || players.length === 0) return <div>No players</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th></th>
            {players.map((p) => (
              <th key={p.id} style={{ textAlign: "center", padding: 6 }}>
                {p.name.split(" ")[0]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((row) => (
            <tr key={row.id}>
              <td style={{ padding: 6, fontWeight: 700 }}>
                {row.name.split(" ")[0]}
              </td>
              {players.map((col) => {
                if (row.id === col.id)
                  return (
                    <td
                      key={col.id}
                      style={{ padding: 6, textAlign: "center" }}
                    >
                      —
                    </td>
                  );
                const key =
                  row.id < col.id
                    ? `${row.id}|${col.id}`
                    : `${col.id}|${row.id}`;
                const count = pairingMap.get(key) || 0;
                const intensity = Math.min(1, count / 5);
                const bg =
                  count === 0
                    ? "transparent"
                    : `rgba(11,113,208,${0.12 + intensity * 0.6})`;
                return (
                  <td
                    key={col.id}
                    style={{
                      padding: 6,
                      textAlign: "center",
                      background: bg,
                      fontSize: 13,
                    }}
                  >
                    {count}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
