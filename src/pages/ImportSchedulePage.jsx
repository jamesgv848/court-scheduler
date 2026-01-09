import React, { useState, useEffect } from "react";
import ConfirmModal from "../components/ConfirmModal";
import {
  fetchPlayers,
  deleteScheduleForDate,
  saveScheduleToDb,
} from "../api/supabase-actions";

export default function ImportSchedulePage() {
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState(today);
  const [jsonText, setJsonText] = useState("");
  const [clearFirst, setClearFirst] = useState(true);
  const [players, setPlayers] = useState([]);
  const [message, setMessage] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    fetchPlayers().then(({ data }) => setPlayers(data || []));
  }, []);

  function buildPlayerNameMap() {
    const map = {};
    players.forEach((p) => {
      map[p.name.toLowerCase()] = p.id;
    });
    return map;
  }

  function onImportClick() {
    setMessage(null);
    setConfirmOpen(true);
  }

  async function doImport() {
    setConfirmOpen(false);

    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed.matches)) {
        throw new Error("JSON must contain a 'matches' array");
      }

      const nameMap = buildPlayerNameMap();

      const schedule = parsed.matches.map((m, idx) => {
        if (!m.round || !m.court || !m.teamA || !m.teamB) {
          throw new Error(`Invalid match structure at index ${idx}`);
        }

        if (m.teamA.length !== 2 || m.teamB.length !== 2) {
          throw new Error(
            `Each team must have exactly 2 players (match ${idx + 1})`
          );
        }

        const allNames = [...m.teamA, ...m.teamB];

        const playersIds = allNames.map((n) => nameMap[n.toLowerCase()]);

        const unknownNames = allNames.filter((n, i) => !playersIds[i]);

        if (unknownNames.length > 0) {
          throw new Error(
            `Unknown player(s) in match ${idx + 1}: ${unknownNames.join(", ")}`
          );
        }

        return {
          court: m.court,
          round: m.round,
          players: playersIds,
        };
      });

      if (clearFirst) {
        await deleteScheduleForDate(date);
      }

      await saveScheduleToDb(schedule, date);

      setMessage(
        clearFirst
          ? `Schedule for ${date} was cleared and ${schedule.length} matches were imported.`
          : `${schedule.length} matches were appended to the schedule for ${date}.`
      );

      setJsonText("");
    } catch (err) {
      setMessage(`Import failed: ${err.message}`);
    }
  }

  return (
    <div className="container" style={{ padding: 12, maxWidth: 900 }}>
      <h3>Import Schedule</h3>

      <div className="card">
        <label className="form-label">Date</label>
        <input
          className="date-input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <label style={{ display: "block", marginTop: 12 }}>
          <input
            type="checkbox"
            checked={clearFirst}
            onChange={(e) => setClearFirst(e.target.checked)}
          />{" "}
          Clear existing schedule for this date
        </label>

        <label className="form-label" style={{ marginTop: 12 }}>
          Schedule JSON
        </label>
        <textarea
          rows={14}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          placeholder='{"matches":[{"round":1,"court":1,"teamA":["Player1","Player2"],"teamB":["Player3","Player4"]},{"round":1,"court":2,"teamA":["Player5","Player6"],"teamB":["Player7","Player8"]}]}'
          style={{
            width: "100%",
            fontFamily: "monospace",
            whiteSpace: "pre-wrap",
          }}
        />

        <div style={{ marginTop: 12 }}>
          <button className="btn generate" onClick={onImportClick}>
            Import Schedule
          </button>
        </div>

        {message && (
          <div style={{ marginTop: 12, fontWeight: 600 }}>{message}</div>
        )}
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Confirm Import"
        message={
          clearFirst
            ? `This will CLEAR the schedule for ${date} and import new matches. Continue?`
            : `This will APPEND matches to the existing schedule for ${date}. Continue?`
        }
        confirmLabel="Import"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={doImport}
      />
    </div>
  );
}
