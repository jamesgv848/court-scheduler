// src/pages/SchedulePage.jsx
import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { generateSchedule } from "../utils/scheduler";
import {
  fetchPlayers,
  fetchPairingHistoryMap,
  fetchOpponentHistoryMap,
  saveScheduleToDb,
  fetchMatchesForDate,
  deleteScheduleForDate,
} from "../api/supabase-actions";
import MatchCard from "../components/MatchCard";

export default function SchedulePage() {
  const [players, setPlayers] = useState([]);
  const [available, setAvailable] = useState([]); // selected available player ids
  const [courts, setCourts] = useState(1);
  const [matchesPerCourt, setMatchesPerCourt] = useState(5);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState([]);
  const [savedMatches, setSavedMatches] = useState([]);
  const [pairingMap, setPairingMap] = useState(new Map());
  const [opponentMap, setOpponentMap] = useState(new Map());
  const [loadingSave, setLoadingSave] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [clearing, setClearing] = useState(false);

  // playersMap: id => name for easy lookups in UI
  const playersMap = Object.fromEntries(
    (players || []).map((p) => [p.id, p.name])
  );

  // load players
  const loadPlayers = useCallback(async () => {
    try {
      const { data, error } = await fetchPlayers();
      if (error) throw error;
      setPlayers(data || []);
    } catch (err) {
      console.error("loadPlayers error", err);
    }
  }, []);

  // load pairing/opponent history maps
  const loadHistory = useCallback(async () => {
    try {
      const pm = await fetchPairingHistoryMap();
      const om = await fetchOpponentHistoryMap();
      setPairingMap(pm);
      setOpponentMap(om);
    } catch (err) {
      console.error("loadHistory error", err);
    }
  }, []);

  // load saved matches for the selected date
  const loadSavedMatches = useCallback(async () => {
    try {
      setLoadingMatches(true);
      const { data, error } = await fetchMatchesForDate(date);
      if (error) throw error;
      // ensure player_ids are present as arrays
      setSavedMatches(data || []);
    } catch (err) {
      console.error("loadSavedMatches error", err);
    } finally {
      setLoadingMatches(false);
    }
  }, [date]);

  // initial loads
  useEffect(() => {
    loadPlayers();
    loadHistory();
    loadSavedMatches();
  }, [loadPlayers, loadHistory, loadSavedMatches]);

  // Realtime subscription for matches changes on the selected date
  useEffect(() => {
    if (!date) return;
    // create a channel that listens to changes on matches for this date
    const channel = supabase
      .channel(`public:matches:date=${date}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `match_date=eq.${date}`,
        },
        (payload) => {
          // Payload arrives on insert/update/delete - reload saved matches
          // You can inspect payload.operation or payload.type if you want
          // console.debug('Realtime payload', payload);
          loadSavedMatches();
        }
      )
      .subscribe();

    return () => {
      // cleanup subscription on unmount or when date changes
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        // ignore removal errors
        // console.warn('removeChannel failed', e);
      }
    };
  }, [date, loadSavedMatches]);

  // toggle available player selection
  function toggleAvailable(id) {
    setAvailable((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // generate preview schedule using scheduler util and history maps
  function onGeneratePreview() {
    if (!available || available.length < 4) {
      alert("Select at least 4 available players");
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

  // save preview to DB (do NOT include frontend ids like "m_1")
  async function onSaveSchedule() {
    if (!preview || preview.length === 0) {
      alert("No schedule to save");
      return;
    }
    setLoadingSave(true);
    try {
      const { data, error } = await saveScheduleToDb(preview, date);
      if (error) throw error;
      // data contains the newly inserted rows (with DB-generated UUID ids)
      // refresh saved matches (and clear preview)
      await loadSavedMatches();
      setPreview([]);
      // reload history so future generates account for new pairings (optional)
      await loadHistory();
      alert("Schedule saved.");
    } catch (err) {
      console.error("onSaveSchedule error", err);
      alert("Failed to save schedule: " + (err.message || err));
    } finally {
      setLoadingSave(false);
    }
  }

  async function onClearSchedule() {
    if (!date) {
      alert("Please select a date first");
      return;
    }
    if (
      !window.confirm(
        `Clear ALL schedule + scores for ${date}? This cannot be undone.`
      )
    )
      return;

    setClearing(true);
    try {
      const { data, error } = await deleteScheduleForDate(date);
      if (error) throw error;
      // refresh local state / UI
      await loadSavedMatches();
      setPreview([]); // remove preview (since schedule removed)
      await loadHistory(); // refresh pairing/opponent history
      window.dispatchEvent(new Event("scores-changed"));
      alert(
        `Cleared schedule for ${date}. Removed ${data?.length ?? 0} matches.`
      );
    } catch (err) {
      console.error("onClearSchedule error", err);
      alert("Failed to clear schedule: " + (err.message || err));
    } finally {
      setClearing(false);
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
            disabled={loadingSave}
          >
            {loadingSave ? "Saving..." : "Save Schedule"}
          </button>

          <button
            className="btn danger"
            onClick={onClearSchedule}
            disabled={clearing}
            style={{ marginLeft: 8 }}
          >
            {clearing ? "Clearing..." : "Clear Schedule"}
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
              {preview.length === 0 && (
                <div style={{ color: "#666" }}>No preview generated yet</div>
              )}
              {preview.map((m) => {
                const n0 = playersMap[m.players[0]] || m.players[0];
                const n1 = playersMap[m.players[1]] || m.players[1];
                const n2 = playersMap[m.players[2]] || m.players[2];
                const n3 = playersMap[m.players[3]] || m.players[3];
                return (
                  <div key={m.match_index} className="match-card">
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 12 }}
                    >
                      <div className="match-index">#{m.match_index}</div>
                      <div>
                        <div className="team">
                          {n0} & {n1}
                        </div>
                        <div style={{ color: "#666" }} className="team">
                          {n2} & {n3}
                        </div>
                      </div>
                    </div>
                    <div className="hstack">
                      <div className="court-pill">Court {m.court}</div>
                      <div className="badge">Round {m.round}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <h3>Saved Matches for {date}</h3>
            <div className="schedule-list">
              {loadingMatches && (
                <div style={{ color: "#666" }}>Loading matches...</div>
              )}
              {!loadingMatches && savedMatches.length === 0 && (
                <div>No saved matches</div>
              )}
              {savedMatches.map((s) => (
                <MatchCard
                  key={s.id}
                  match={s}
                  onChange={loadSavedMatches}
                  playersMap={playersMap}
                />
              ))}
            </div>
          </div>
        </div>

        <aside>
          {/* Pairing heatmap temporarily hidden */}

          <div className="card" style={{ marginTop: 12 }}>
            <h4>Help</h4>
            <p style={{ color: "#555", fontSize: 13 }}>
              Select available players for the date, set courts and matches per
              court, Generate to preview, then Save Schedule to persist. Any
              user can record winners — the list will update in real time.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Inline PairingHeatmap component (keeps file self-contained) */
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
