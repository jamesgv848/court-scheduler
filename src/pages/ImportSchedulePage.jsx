// src/pages/ImportSchedulePage.jsx
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
  const [isError, setIsError] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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
    setIsError(false);
    setConfirmOpen(true);
  }

  async function doImport() {
    setConfirmOpen(false);
    setBusy(true);
    setMessage(null);
    setIsError(false);
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed.matches))
        throw new Error("JSON must contain a 'matches' array");
      const nameMap = buildPlayerNameMap();
      const schedule = parsed.matches.map((m, idx) => {
        if (!m.round || !m.court || !m.teamA || !m.teamB)
          throw new Error(`Invalid match structure at index ${idx}`);
        if (m.teamA.length !== 2 || m.teamB.length !== 2)
          throw new Error(
            `Each team must have exactly 2 players (match ${idx + 1})`,
          );
        const allNames = [...m.teamA, ...m.teamB];
        const playerIds = allNames.map((n) => nameMap[n.toLowerCase()]);
        const unknown = allNames.filter((n, i) => !playerIds[i]);
        if (unknown.length > 0)
          throw new Error(
            `Unknown player(s) in match ${idx + 1}: ${unknown.join(", ")}`,
          );
        let restingIds = null;
        if (Array.isArray(m.resting) && m.resting.length > 0) {
          restingIds = m.resting.map((n) => nameMap[n.toLowerCase()]);
          const unknownRest = m.resting.filter((n, i) => !restingIds[i]);
          if (unknownRest.length > 0)
            throw new Error(
              `Unknown resting player(s) in match ${idx + 1}: ${unknownRest.join(", ")}`,
            );
        }
        return {
          court: m.court,
          round: m.round,
          players: playerIds,
          resting: restingIds,
        };
      });
      if (clearFirst) await deleteScheduleForDate(date);
      await saveScheduleToDb(schedule, date);
      setMessage(
        clearFirst
          ? `✅ Cleared and imported ${schedule.length} matches for ${date}.`
          : `✅ Appended ${schedule.length} matches to ${date}.`,
      );
      setJsonText("");
    } catch (err) {
      setMessage(`❌ ${err.message}`);
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  const placeholder = `{
  "matches": [
    {
      "round": 1, "court": 1,
      "teamA": ["P1","P2"], "teamB": ["P3","P4"],
      "resting": ["P9","P10"]
    },
    {
      "round": 1, "court": 2,
      "teamA": ["P5","P6"], "teamB": ["P7","P8"]
    }
  ]
}`;

  // Player names joined for use in the prompt
  const playerNames =
    players.length > 0
      ? players.map((p) => p.name).join(", ")
      : "Ajit, Bikram, Chetan, Hanumant, Krishna, Nagu, Preetam, Sai, Sampreet, Vijay";

  const promptText = `Generate a badminton doubles schedule with the following constraints:

Players: ${playerNames}
Courts: 2
Rounds: 11

Rules:
1. Minimise repeat partner and opponent pairings across all rounds — maximise variety.

2. No player should play more than 4 consecutive rounds without a rest. This only applies when the player count is odd and someone must rest each round.

3. Players move freely between courts — do NOT anchor players to a fixed court.

4. Court continuity — to allow a court to start the next game immediately when it finishes early:
   - At least 2 of the 4 players from court X in round N should also appear on court X in round N+1.
   - No player should remain on the same court for more than 2 consecutive rounds — after that they must switch to the other court.

5. For odd player counts, one player rests each round. Distribute rest slots as evenly as possible across all players. List resting players once per round on the court 1 entry only. Omit the resting field entirely if no one is resting.

6. Every player must appear in exactly one game per round, or be listed as resting.

Output JSON only — no explanation, no markdown, no code fences.
Strict format:
{"matches":[{"round":1,"court":1,"teamA":["P1","P2"],"teamB":["P3","P4"],"resting":["P9"]},{"round":1,"court":2,"teamA":["P5","P6"],"teamB":["P7","P8"]}]}`;

  return (
    <div className="container" style={{ paddingTop: 12 }}>
      <div className="card">
        <div className="card-header">
          <span className="card-title">📥 Import Schedule</span>
        </div>
        <div className="card-body">
          {/* Date */}
          <div style={{ marginBottom: 14 }}>
            <label className="form-label">Date</label>
            <div className="date-input-wrap">
              <span className="date-input-icon">📅</span>
              <input
                className="date-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {/* Clear toggle */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              marginBottom: 14,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={clearFirst}
              onChange={(e) => setClearFirst(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <span style={{ fontSize: 13, color: "var(--text)" }}>
              Clear existing schedule for this date before importing
            </span>
          </label>

          {/* JSON input */}
          <label className="form-label">Schedule JSON (from ChatGPT)</label>
          <textarea
            rows={14}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder={placeholder}
            style={{
              width: "100%",
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 11,
              lineHeight: 1.55,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface2)",
              color: "var(--text)",
              resize: "vertical",
              outline: "none",
              whiteSpace: "pre",
            }}
          />

          {/* ChatGPT prompt hint */}
          <details style={{ marginTop: 10 }}>
            <summary
              style={{
                fontSize: 12,
                color: "var(--primary)",
                cursor: "pointer",
                fontWeight: 600,
                userSelect: "none",
              }}
            >
              💡 How to generate this with ChatGPT
            </summary>

            <div style={{ marginTop: 8 }}>
              {/* Instruction */}
              <p
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  marginBottom: 6,
                  lineHeight: 1.5,
                }}
              >
                Copy the prompt below and paste it into ChatGPT. Then paste the
                JSON output into the text area above.
                <br />
                Player names are auto-filled from your current roster.
              </p>

              {/* Prompt box */}
              <div style={{ position: "relative" }}>
                <pre
                  style={{
                    margin: 0,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                    fontSize: 11.5,
                    color: "var(--text)",
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    lineHeight: 1.65,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    userSelect: "all",
                    overflowX: "auto",
                  }}
                >
                  {promptText}
                </pre>
                {/* Copy button */}
                <CopyButton text={promptText} />
              </div>

              <p
                style={{
                  fontSize: 11,
                  color: "var(--muted2)",
                  marginTop: 6,
                  marginBottom: 0,
                }}
              >
                Tip: If ChatGPT wraps the output in ```json ``` fences, ask it
                to re-output without any code blocks.
              </p>
            </div>
          </details>

          {/* Actions */}
          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button
              className="btn generate"
              onClick={onImportClick}
              disabled={busy || !jsonText.trim()}
            >
              {busy ? "Importing…" : "⚡ Import Schedule"}
            </button>
            <button
              className="btn"
              onClick={() => {
                setJsonText("");
                setMessage(null);
              }}
            >
              Clear
            </button>
          </div>

          {/* Feedback message */}
          {message && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 12px",
                borderRadius: 8,
                background: isError
                  ? "var(--danger-dim)"
                  : "var(--success-dim)",
                border: `1px solid ${isError ? "var(--danger-border)" : "var(--success-border)"}`,
                color: isError ? "var(--danger)" : "var(--success)",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {message}
            </div>
          )}

          {/* Known players */}
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--muted2)",
                textTransform: "uppercase",
                letterSpacing: 0.6,
                marginBottom: 6,
              }}
            >
              Known players ({players.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {players.map((p) => (
                <span
                  key={p.id}
                  style={{
                    padding: "3px 9px",
                    borderRadius: 20,
                    background: "var(--primary-dim)",
                    color: "var(--primary)",
                    border: "1px solid var(--primary-border)",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        </div>
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

      <div style={{ height: 16 }} />
    </div>
  );
}

// ── Small copy-to-clipboard button ───────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available — user can select-all manually
    }
  }
  return (
    <button
      onClick={handleCopy}
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        padding: "3px 9px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: copied ? "var(--success-dim)" : "var(--surface)",
        color: copied ? "var(--success)" : "var(--muted)",
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all .15s",
      }}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}
