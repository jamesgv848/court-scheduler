// src/pages/ImportSchedulePage.jsx
import React, { useState, useEffect, useRef } from "react";
import ConfirmModal from "../components/ConfirmModal";
import {
  fetchPlayers,
  deleteScheduleForDate,
  saveScheduleToDb,
  fetchPairingStatsRecorded,
  fetchPlayerTotalsOverall,
  fetchPlayerTotalsForRange,
} from "../api/supabase-actions";

// ── Tier helpers ──────────────────────────────────────────────────────────────

function classifyPair(wins, matches) {
  if (matches < 5) return "NEW";
  const pct = Math.round((wins / matches) * 100);
  if (pct >= 65) return "STRONG";
  if (pct <= 35) return "WEAK";
  return "BALANCED";
}

function classifyPlayer(pct, matches) {
  if (matches < 10) return "NEW";
  if (pct >= 65) return "STRONG";
  if (pct <= 35) return "WEAK";
  return "BALANCED";
}

// ── Build individual strength section ─────────────────────────────────────────
function buildStrengthText(overallData, recentData, selectedNames) {
  const nameSet = new Set(selectedNames.map((n) => n.toLowerCase()));

  // Normalise overall
  const overall = (overallData || [])
    .filter((r) => nameSet.has((r.name || r.player_name || "").toLowerCase()))
    .map((r) => ({
      name: r.name || r.player_name,
      matches: Number(r.matches ?? r.total_matches ?? 0),
      wins: Number(r.wins ?? 0),
      pct: Number(r.win_pct ?? 0),
    }))
    .sort((a, b) => b.pct - a.pct);

  // Normalise recent (last 3 months)
  const recentMap = {};
  (recentData || []).forEach((r) => {
    const name = r.name || r.player_name;
    if (name)
      recentMap[name.toLowerCase()] = {
        matches: Number(r.matches ?? r.total_matches ?? 0),
        wins: Number(r.wins ?? 0),
        pct: Number(r.win_pct ?? 0),
      };
  });

  const lines = [];

  // ── Overall strength ──────────────────────────────────────────────────────
  lines.push("Player strength (all-time win%):");
  lines.push(
    "   Tier thresholds: STRONG ≥ 65% · BALANCED 36–64% · WEAK ≤ 35% · NEW < 10 matches",
  );
  lines.push("");

  const byTier = { STRONG: [], BALANCED: [], WEAK: [], NEW: [] };
  overall.forEach((r) => {
    const tier = classifyPlayer(r.pct, r.matches);
    byTier[tier].push(
      `   - ${r.name}: ${r.pct.toFixed(1)}% (${r.matches}M) [${tier}]`,
    );
  });

  ["STRONG", "BALANCED", "WEAK", "NEW"].forEach((t) => {
    if (byTier[t].length > 0) {
      byTier[t].forEach((l) => lines.push(l));
    }
  });

  // ── Recent form ───────────────────────────────────────────────────────────
  lines.push("");
  lines.push("Recent form (last 3 months win%):");
  lines.push("   Use this to identify players who are improving or declining:");
  lines.push("");

  const recentRows = overall
    .map((r) => {
      const rec = recentMap[r.name.toLowerCase()];
      return { name: r.name, overall: r.pct, ...rec };
    })
    .filter((r) => r.matches > 0)
    .sort((a, b) => b.pct - a.pct);

  if (recentRows.length === 0) {
    lines.push("   No recent data available (no matches in last 3 months).");
  } else {
    recentRows.forEach((r) => {
      const trend =
        r.pct > r.overall + 5
          ? " ↑ improving"
          : r.pct < r.overall - 5
            ? " ↓ declining"
            : "";
      const tier = classifyPlayer(r.pct, r.matches);
      lines.push(
        `   - ${r.name}: ${r.pct.toFixed(1)}% (${r.matches}M) [${tier}]${trend}`,
      );
    });
  }

  lines.push("");
  lines.push(
    "   When a player's recent form differs significantly from all-time (±5%), " +
      "prefer their recent form as the more accurate indicator of current strength.",
  );

  return lines.join("\n");
}

// ── Build pairing stats section ───────────────────────────────────────────────
function buildPairingStatsText(pairingData, selectedNames) {
  const nameSet = new Set(selectedNames.map((n) => n.toLowerCase()));

  const relevant = (pairingData || [])
    .filter(
      (r) =>
        r.matches >= 5 &&
        nameSet.has((r.name_a || "").toLowerCase()) &&
        nameSet.has((r.name_b || "").toLowerCase()),
    )
    .map((r) => ({
      nameA: r.name_a,
      nameB: r.name_b,
      matches: Number(r.matches),
      wins: Number(r.wins),
      pct: Math.round((Number(r.wins) / Number(r.matches)) * 100),
      tier: classifyPair(Number(r.wins), Number(r.matches)),
    }));

  const strong = relevant
    .filter((r) => r.tier === "STRONG")
    .sort((a, b) => b.pct - a.pct);
  const weak = relevant
    .filter((r) => r.tier === "WEAK")
    .sort((a, b) => a.pct - b.pct);
  const balanced = relevant
    .filter((r) => r.tier === "BALANCED")
    .sort((a, b) => b.pct - a.pct);

  const fmt = (r) =>
    `   - ${r.nameA} & ${r.nameB}: ${r.pct}% (${r.matches} matches)`;

  const lines = [];
  lines.push("Pairing history for today's players:");
  lines.push("");

  lines.push(
    strong.length > 0
      ? "   STRONG pairs (win% ≥ 65%):"
      : "   STRONG pairs (win% ≥ 65%): none yet",
  );
  strong.forEach((r) => lines.push(fmt(r)));
  lines.push("");

  lines.push(
    weak.length > 0
      ? "   WEAK pairs (win% ≤ 35%):"
      : "   WEAK pairs (win% ≤ 35%): none yet",
  );
  weak.forEach((r) => lines.push(fmt(r)));
  lines.push("");

  lines.push(
    balanced.length > 0
      ? "   BALANCED pairs (36–64%):"
      : "   BALANCED pairs (36–64%): none yet",
  );
  balanced.forEach((r) => lines.push(fmt(r)));

  const newCount = (pairingData || []).filter(
    (r) =>
      Number(r.matches) < 5 &&
      nameSet.has((r.name_a || "").toLowerCase()) &&
      nameSet.has((r.name_b || "").toLowerCase()),
  ).length;
  if (newCount > 0) {
    lines.push("");
    lines.push(
      `   NEW pairs (< 5 matches): ${newCount} pair(s) — treat as BALANCED`,
    );
  }

  return lines.join("\n");
}

// ── Full prompt builder ───────────────────────────────────────────────────────
function buildPrompt(
  selectedNames,
  courts,
  rounds,
  pairingStatsText,
  strengthText,
) {
  const playerList = selectedNames.join(", ");
  const playerCount = selectedNames.length;
  const hasStrength = !!strengthText;

  return `Generate a badminton doubles schedule with the following constraints:

Players: ${playerList}
Courts: ${courts}
Rounds: ${rounds}
Player count: ${playerCount}

Generate a schedule that maximizes variety in partners and opponents.
Ensure every player gets approximately the same number of matches and rest slots. Also the rest slots are distributed fairly equal consecutive rounds.
(e.g. if 10 rounds and 5 players, each should play about 8 matches and rest about 2 times).
Avoid repeating the same pairs too often.
${
  hasStrength
    ? `
━━━ PLAYER STRENGTH ━━━

Use the individual strength and recent form data below to balance teams.
Prefer pairing a STRONG player with a WEAK/BALANCED player on the same team so each court
has two evenly matched teams. Avoid placing two STRONG players against two WEAK players.

${strengthText}

`
    : ""
}
━━━ PAIRING HISTORY ━━━

${pairingStatsText}

━━━ OUTPUT ━━━

Output the JSON schedule only.
- Single line, no line breaks inside the JSON.
- teamA and teamB always have exactly 2 players each.
- "resting" only on court 1 entry, only when someone rests, omit otherwise.

Follow the JSON schedule with a 'Scheduling Statistics Summary' section.
This section must include:
1) Total games played per person
2) Total rest slots per person
3) A 'Pairing Frequency' list showing how many times each unique duo played together
4) An 'Opponent Frequency' list showing how many times each player faced every other player.
Ensure this summary is in plain text or Markdown tables, placed strictly after the JSON block so the JSON remains easily extractable.

{"matches":[{"round":1,"court":1,"teamA":["P1","P2"],"teamB":["P3","P4"],"resting":["P9"]},{"round":1,"court":2,"teamA":["P5","P6"],"teamB":["P7","P8"]}]}`;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ImportSchedulePage() {
  const today = new Date().toISOString().slice(0, 10);

  // Import state
  const [date, setDate] = useState(today);
  const [jsonText, setJsonText] = useState("");
  const [clearFirst, setClearFirst] = useState(true);
  const [message, setMessage] = useState(null);
  const [isError, setIsError] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Players
  const [players, setPlayers] = useState([]);

  // Prompt generator state
  const [selected, setSelected] = useState([]);
  const [courtsInput, setCourtsInput] = useState("2");
  const [roundsInput, setRoundsInput] = useState("11");
  const [promptText, setPromptText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [promptReady, setPromptReady] = useState(false);
  const [promptCollapsed, setPromptCollapsed] = useState(false);
  // Standard = pairing stats only | Extended = pairing + individual strength
  const [statsDepth, setStatsDepth] = useState("extended");

  // Caches — keyed by date
  const pairingCache = useRef({ date: null, data: null });
  const strengthCache = useRef({ date: null, overall: null, recent: null });

  useEffect(() => {
    fetchPlayers().then(({ data }) => setPlayers(data || []));
  }, []);

  function togglePlayer(id) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    setPromptReady(false);
  }

  function buildPlayerNameMap() {
    const map = {};
    players.forEach((p) => {
      map[p.name.toLowerCase()] = p.id;
    });
    return map;
  }

  // ── Generate prompt ────────────────────────────────────────────────────────
  async function handleGeneratePrompt() {
    if (selected.length < 4) {
      alert("Select at least 4 players to generate a prompt.");
      return;
    }
    setGenerating(true);
    setPromptReady(false);
    setPromptCollapsed(false);
    try {
      const selectedNames = players
        .filter((p) => selected.includes(p.id))
        .map((p) => p.name);

      const courts = Math.max(1, parseInt(courtsInput, 10) || 2);
      const rounds = Math.max(1, parseInt(roundsInput, 10) || 11);

      // ── Pairing stats (cached per date) ───────────────────────────────────
      let pairingData;
      if (
        pairingCache.current.date === date &&
        pairingCache.current.data !== null
      ) {
        pairingData = pairingCache.current.data;
      } else {
        const { data, error } = await fetchPairingStatsRecorded(null, null);
        if (error) throw error;
        pairingCache.current = { date, data };
        pairingData = data;
      }

      // ── Individual strength (extended mode, cached per date) ───────────────
      let strengthText = null;
      if (statsDepth === "extended") {
        let overallData, recentData;
        if (
          strengthCache.current.date === date &&
          strengthCache.current.overall !== null
        ) {
          overallData = strengthCache.current.overall;
          recentData = strengthCache.current.recent;
        } else {
          // 3 months ago date
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
          const p_start = threeMonthsAgo.toISOString().slice(0, 10);

          // Fetch overall and recent in parallel
          const [ovRes, recRes] = await Promise.all([
            fetchPlayerTotalsOverall(),
            fetchPlayerTotalsForRange(p_start, null),
          ]);
          if (ovRes.error) throw ovRes.error;
          if (recRes.error) throw recRes.error;

          overallData = ovRes.data;
          recentData = recRes.data;
          strengthCache.current = {
            date,
            overall: overallData,
            recent: recentData,
          };
        }
        strengthText = buildStrengthText(
          overallData,
          recentData,
          selectedNames,
        );
      }

      const statsText = buildPairingStatsText(pairingData, selectedNames);
      const prompt = buildPrompt(
        selectedNames,
        courts,
        rounds,
        statsText,
        strengthText,
      );

      setPromptText(prompt);
      setPromptReady(true);
    } catch (err) {
      console.error("Generate prompt error", err);
      alert("Failed to fetch stats: " + err.message);
    } finally {
      setGenerating(false);
    }
  }

  // ── Clear prompt ───────────────────────────────────────────────────────────
  function handleClearPrompt() {
    setPromptText("");
    setPromptReady(false);
    setPromptCollapsed(false);
  }

  // ── Import ─────────────────────────────────────────────────────────────────
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

  return (
    <div className="container" style={{ paddingTop: 12 }}>
      {/* ── SECTION 1: Prompt Generator ───────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 10 }}>
        <div className="card-header">
          <span className="card-title">💡 Generate AI Prompt</span>
          <span className="badge blue">{selected.length} selected</span>
        </div>
        <div className="card-body">
          {/* Date + Courts + Rounds */}
          <div
            style={{
              display: "flex",
              gap: 10,
              marginBottom: 14,
              flexWrap: "wrap",
              alignItems: "flex-end",
            }}
          >
            <div style={{ flex: 1, minWidth: 130 }}>
              <label className="form-label">Date</label>
              <div className="date-input-wrap">
                <span className="date-input-icon">📅</span>
                <input
                  className="date-input"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setPromptReady(false);
                  }}
                />
              </div>
            </div>
            <div>
              <label className="form-label">Courts</label>
              <input
                className="number-input"
                type="text"
                inputMode="numeric"
                value={courtsInput}
                onChange={(e) => {
                  setCourtsInput(e.target.value);
                  setPromptReady(false);
                }}
                style={{ width: 56 }}
              />
            </div>
            <div>
              <label className="form-label">Rounds</label>
              <input
                className="number-input"
                type="text"
                inputMode="numeric"
                value={roundsInput}
                onChange={(e) => {
                  setRoundsInput(e.target.value);
                  setPromptReady(false);
                }}
                style={{ width: 56 }}
              />
            </div>
          </div>

          {/* Player selection chips */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 7,
              }}
            >
              <label className="form-label" style={{ margin: 0 }}>
                Players
              </label>
              <button
                className="btn small"
                onClick={() => {
                  setSelected(players.map((p) => p.id));
                  setPromptReady(false);
                }}
              >
                All
              </button>
              <button
                className="btn small"
                onClick={() => {
                  setSelected([]);
                  setPromptReady(false);
                }}
              >
                None
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {players.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlayer(p.id)}
                    style={{
                      padding: "5px 11px",
                      borderRadius: 20,
                      border: "1px solid",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      background: on ? "var(--primary-dim)" : "var(--surface)",
                      color: on ? "var(--primary)" : "var(--muted)",
                      borderColor: on
                        ? "var(--primary-border)"
                        : "var(--border)",
                      transition: "all .15s",
                    }}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Stats depth toggle ─────────────────────────────────────────── */}
          <div style={{ marginBottom: 14 }}>
            <label className="form-label" style={{ marginBottom: 6 }}>
              Stats included in prompt
            </label>
            <div
              style={{
                display: "flex",
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 3,
                gap: 3,
              }}
            >
              {[
                {
                  key: "standard",
                  label: "Standard",
                  sub: "Pairing history only",
                },
                {
                  key: "extended",
                  label: "Extended",
                  sub: "Pairing + individual strength + recent form",
                },
              ].map(({ key, label, sub }) => (
                <button
                  key={key}
                  onClick={() => {
                    setStatsDepth(key);
                    setPromptReady(false);
                  }}
                  style={{
                    flex: 1,
                    padding: "7px 10px",
                    borderRadius: 6,
                    border:
                      statsDepth === key
                        ? "1px solid var(--border)"
                        : "1px solid transparent",
                    background:
                      statsDepth === key ? "var(--surface)" : "transparent",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                    transition: "all .15s",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color:
                        statsDepth === key ? "var(--text)" : "var(--muted)",
                      marginBottom: 1,
                    }}
                  >
                    {label}
                    {key === "extended" && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "1px 5px",
                          borderRadius: 10,
                          background: "var(--accent-dim)",
                          color: "var(--accent)",
                          border: "1px solid var(--accent-border)",
                          verticalAlign: "middle",
                        }}
                      >
                        recommended
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color:
                        statsDepth === key ? "var(--muted)" : "var(--muted2)",
                    }}
                  >
                    {sub}
                  </div>
                </button>
              ))}
            </div>
            {statsDepth === "extended" && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: "var(--muted)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span style={{ color: "var(--accent)", fontWeight: 700 }}>
                  ℹ
                </span>
                Includes overall win% + last 3 months form with
                STRONG/BALANCED/WEAK tier per player
              </div>
            )}
          </div>

          {/* Generate button */}
          <button
            className="btn generate"
            onClick={handleGeneratePrompt}
            disabled={generating || selected.length < 4}
          >
            {generating
              ? statsDepth === "extended"
                ? "⏳ Fetching stats…"
                : "⏳ Generating…"
              : "⚡ Generate Prompt"}
          </button>

          {/* Prompt output */}
          {promptReady && promptText && (
            <div style={{ marginTop: 14 }}>
              {/* Header row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text)",
                  }}
                >
                  Generated prompt
                  {promptCollapsed && (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 400,
                        color: "var(--muted)",
                        marginLeft: 8,
                      }}
                    >
                      (collapsed)
                    </span>
                  )}
                </span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>
                    {!promptCollapsed && "Select all · copy · paste into AI"}
                  </span>
                  <button
                    onClick={() => setPromptCollapsed((c) => !c)}
                    style={{
                      padding: "3px 9px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--muted)",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                    title={
                      promptCollapsed ? "Expand prompt" : "Collapse prompt"
                    }
                  >
                    {promptCollapsed ? "▼ Expand" : "▲ Collapse"}
                  </button>
                  <button
                    onClick={handleClearPrompt}
                    style={{
                      padding: "3px 9px",
                      borderRadius: 6,
                      border: "1px solid var(--danger-border)",
                      background: "var(--danger-dim)",
                      color: "var(--danger)",
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                    title="Clear prompt"
                  >
                    ✕ Clear
                  </button>
                </div>
              </div>

              {/* Prompt pre block */}
              {!promptCollapsed && (
                <div style={{ position: "relative" }}>
                  <pre
                    style={{
                      margin: 0,
                      padding: "10px 12px",
                      paddingRight: 72,
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
                      maxHeight: 420,
                      overflowY: "auto",
                    }}
                  >
                    {promptText}
                  </pre>
                  <CopyButton text={promptText} />
                </div>
              )}

              {!promptCollapsed && (
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--muted2)",
                    marginTop: 6,
                    marginBottom: 0,
                  }}
                >
                  Tip: If the AI wraps the output in ```json``` fences, ask it
                  to re-output without any code blocks.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION 2: Import ─────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📥 Import Schedule</span>
        </div>
        <div className="card-body">
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
          <label className="form-label">Schedule JSON (from AI)</label>
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

          {/* Feedback */}
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

// ── Copy to clipboard button ──────────────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback: user can tap-to-select-all */
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
