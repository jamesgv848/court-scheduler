// src/pages/SchedulePage.jsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { generateSchedule } from "../utils/scheduler.simple";
import {
  fetchPlayers,
  fetchPairingHistoryMap,
  fetchOpponentHistoryMap,
  fetchPlayerTotalsOverall,
  saveScheduleToDb,
  fetchMatchesForDate,
  deleteScheduleForDate,
} from "../api/supabase-actions";
import MatchCard from "../components/MatchCard";
import ConfirmModal from "../components/ConfirmModal";

const STORAGE_KEY = "cs_selected_date";

// Groups matches by their native `round` field.
// Falls back to deriving round from match_index if field absent.
function groupByRounds(matches, numCourts = 2) {
  const sorted = [...matches].sort((a, b) => a.match_index - b.match_index);
  const rounds = {};
  sorted.forEach((m) => {
    const r = m.round ?? Math.ceil(m.match_index / numCourts);
    if (!rounds[r]) rounds[r] = [];
    rounds[r].push(m);
  });
  return rounds;
}

export default function SchedulePage() {
  const [players, setPlayers] = useState([]);
  const [available, setAvailable] = useState([]);
  const [courtsInput, setCourtsInput] = useState("1");
  const [matchesPerCourtInput, setMatchesPerCourtInput] = useState("5");
  const [date, setDate] = useState(() => {
    return (
      window.localStorage.getItem(STORAGE_KEY) ||
      new Date().toISOString().slice(0, 10)
    );
  });
  const [preview, setPreview] = useState([]);
  const [savedMatches, setSavedMatches] = useState([]);
  const [pairingMap, setPairingMap] = useState(new Map());
  const [opponentMap, setOpponentMap] = useState(new Map());
  const [ratingsMap, setRatingsMap] = useState(new Map());
  const [loadingSave, setLoadingSave] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [modalState, setModalState] = useState({
    open: false,
    type: null,
    payload: null,
    loading: false,
  });

  const playersMap = Object.fromEntries(
    (players || []).map((p) => [p.id, p.name]),
  );
  const parsePositiveInt = (v, fallback = 1) => {
    const n = parseInt(String(v ?? "").trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  // ── Data loaders ────────────────────────────────
  const loadPlayers = useCallback(async () => {
    try {
      const { data, error } = await fetchPlayers();
      if (error) throw error;
      setPlayers(data || []);
    } catch (err) {
      console.error("loadPlayers", err);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setPairingMap(await fetchPairingHistoryMap());
      setOpponentMap(await fetchOpponentHistoryMap());
    } catch (err) {
      console.error("loadHistory", err);
    }
  }, []);

  const loadRatings = useCallback(async () => {
    try {
      const { data, error } = await fetchPlayerTotalsOverall();
      if (error) throw error;
      const map = new Map();
      (data || []).forEach((r) =>
        map.set(r.id, Math.max(50, Number(r.win_pct ?? 0))),
      );
      setRatingsMap(map);
    } catch (err) {
      console.error("loadRatings", err);
    }
  }, []);

  const loadSavedMatches = useCallback(async () => {
    try {
      setLoadingMatches(true);
      const { data, error } = await fetchMatchesForDate(date);
      if (error) throw error;
      setSavedMatches(data || []);
    } catch (err) {
      console.error("loadSavedMatches", err);
    } finally {
      setLoadingMatches(false);
    }
  }, [date]);

  useEffect(() => {
    loadPlayers();
    loadHistory();
    loadRatings();
    loadSavedMatches();
  }, [loadPlayers, loadHistory, loadSavedMatches, loadRatings]);
  useEffect(() => {
    if (date) window.localStorage.setItem(STORAGE_KEY, date);
  }, [date]);

  // Realtime subscription
  useEffect(() => {
    if (!date) return;
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
        () => loadSavedMatches(),
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {}
    };
  }, [date, loadSavedMatches]);

  function toggleAvailable(id) {
    setAvailable((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  // ── Actions ──────────────────────────────────────
  async function _doGenerate() {
    const courts = parsePositiveInt(courtsInput, 1);
    const matchesPerCourt = parsePositiveInt(matchesPerCourtInput, 5);
    if (!available || available.length < 4) {
      alert("Select at least 4 players");
      return;
    }
    try {
      const schedule = generateSchedule({
        players: available,
        courts,
        matchesPerCourt,
        pairingHistory: pairingMap,
        opponentHistory: opponentMap,
        ratings: ratingsMap,
        date,
      });
      setPreview(schedule);
    } catch (err) {
      console.error("generate error", err);
      alert("Failed to generate: " + err.message);
    }
  }

  async function _doSave() {
    if (!preview || preview.length === 0) {
      alert("No schedule to save");
      return;
    }
    setLoadingSave(true);
    try {
      const { error } = await saveScheduleToDb(preview, date);
      if (error) throw error;
      await loadSavedMatches();
      setPreview([]);
      setAvailable([]);
      await loadHistory();
      alert("Schedule saved.");
    } catch (err) {
      alert("Failed to save: " + err.message);
    } finally {
      setLoadingSave(false);
    }
  }

  async function _doClear() {
    if (!date) {
      alert("Select a date first");
      return;
    }
    setClearing(true);
    try {
      const { data, error } = await deleteScheduleForDate(date);
      if (error) throw error;
      await loadSavedMatches();
      setPreview([]);
      setAvailable([]);
      await loadHistory();
      alert(`Cleared ${data?.length ?? 0} matches for ${date}.`);
    } catch (err) {
      alert("Failed to clear: " + err.message);
    } finally {
      setClearing(false);
    }
  }

  function handleGenerateConfirm() {
    if (!available || available.length < 4) {
      alert("Select at least 4 players");
      return;
    }
    setModalState({
      open: true,
      type: "generate",
      payload: null,
      loading: false,
    });
  }
  function handleSaveConfirm() {
    if (!preview || preview.length === 0) {
      alert("Generate first.");
      return;
    }
    setModalState({ open: true, type: "save", payload: null, loading: false });
  }
  function handleClearConfirm() {
    if (!date) {
      alert("Select a date first");
      return;
    }
    setModalState({ open: true, type: "clear", payload: null, loading: false });
  }
  async function handleModalConfirm() {
    setModalState((s) => ({ ...s, loading: true }));
    try {
      if (modalState.type === "generate") await _doGenerate();
      else if (modalState.type === "save") await _doSave();
      else if (modalState.type === "clear") await _doClear();
    } finally {
      setModalState({ open: false, type: null, payload: null, loading: false });
    }
  }

  // ── Round-derived values ─────────────────────────
  const numCourts = useMemo(() => {
    const courts = new Set(savedMatches.map((m) => m.court));
    return courts.size || 1;
  }, [savedMatches]);
  const sortedMatches = useMemo(
    () => [...savedMatches].sort((a, b) => a.match_index - b.match_index),
    [savedMatches],
  );
  const roundMap = useMemo(
    () => groupByRounds(sortedMatches, numCourts),
    [sortedMatches, numCourts],
  );
  const roundEntries = useMemo(
    () => Object.entries(roundMap).sort((a, b) => Number(a[0]) - Number(b[0])),
    [roundMap],
  );

  const totalGames = savedMatches.length;
  const doneGames = savedMatches.filter((m) => m.winner?.length > 0).length;
  const pendingGames = totalGames - doneGames;
  const totalRounds = roundEntries.length;
  const doneRounds = roundEntries.filter(([, ms]) =>
    ms.every((m) => m.winner?.length > 0),
  ).length;
  const currentRound = roundEntries.find(([, ms]) =>
    ms.some((m) => !m.winner?.length),
  )?.[0];
  const progressPct =
    totalGames > 0 ? Math.round((doneGames / totalGames) * 100) : 0;

  const fmtDate = (d) => {
    if (!d) return "—";
    return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="container">
      {/* ── Controls card ── */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-header">
          <span className="card-title">📅 Schedule</span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {fmtDate(date)}
          </span>
        </div>
        <div className="card-body">
          {/* Date + counts row */}
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 12,
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
                  onChange={(e) => setDate(e.target.value)}
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
                onChange={(e) => setCourtsInput(e.target.value)}
                style={{ width: 56 }}
              />
            </div>
            <div>
              <label className="form-label">Rounds</label>
              <input
                className="number-input"
                type="text"
                inputMode="numeric"
                value={matchesPerCourtInput}
                onChange={(e) => setMatchesPerCourtInput(e.target.value)}
                style={{ width: 56 }}
              />
            </div>
          </div>

          {/* Progress bar */}
          {totalGames > 0 && (
            <div className="round-progress-wrap">
              <div className="round-progress-stats">
                <div className="round-progress-badges">
                  <span className="badge green">{doneGames} done</span>
                  <span className="badge">{pendingGames} pending</span>
                  <span className="badge round">
                    R{doneRounds}/{totalRounds}
                  </span>
                </div>
                <span className="round-progress-pct">{progressPct}%</span>
              </div>
              <div className="round-progress-bar">
                <div
                  className="round-progress-fill"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Player chips */}
          <div style={{ marginBottom: 10 }}>
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
                onClick={() => setAvailable(players.map((p) => p.id))}
              >
                All
              </button>
              <button className="btn small" onClick={() => setAvailable([])}>
                None
              </button>
              {available.length > 0 && (
                <span className="badge blue">{available.length} selected</span>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {players.map((p) => {
                const on = available.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleAvailable(p.id)}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 20,
                      border: "1px solid",
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                      background: on ? "var(--primary-dim)" : "var(--surface)",
                      color: on ? "var(--primary)" : "var(--muted)",
                      borderColor: on
                        ? "var(--primary-border)"
                        : "var(--border)",
                    }}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <button className="btn generate" onClick={handleGenerateConfirm}>
              ⚡ Generate
            </button>
            {preview.length > 0 && (
              <button
                className="btn primary"
                onClick={handleSaveConfirm}
                disabled={loadingSave}
              >
                {loadingSave ? "Saving…" : "💾 Save"}
              </button>
            )}
            {savedMatches.length > 0 && (
              <button
                className="btn danger"
                onClick={handleClearConfirm}
                disabled={clearing}
              >
                {clearing ? "Clearing…" : "🗑 Clear"}
              </button>
            )}
            <button
              className="btn"
              onClick={loadSavedMatches}
              disabled={loadingMatches}
            >
              {loadingMatches ? "…" : "↺"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Preview ── */}
      {preview.length > 0 &&
        (() => {
          const previewRounds = groupByRounds(preview, numCourts);
          const previewEntries = Object.entries(previewRounds).sort(
            (a, b) => Number(a[0]) - Number(b[0]),
          );
          return (
            <>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--primary)",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  marginBottom: 8,
                }}
              >
                Preview — {preview.length} games · {previewEntries.length}{" "}
                rounds
              </div>
              {previewEntries.map(([r, ms]) => (
                <PreviewRoundBlock
                  key={r}
                  roundNum={r}
                  roundMatches={ms}
                  playersMap={playersMap}
                />
              ))}
            </>
          );
        })()}

      {/* ── Saved matches — round blocks ── */}
      {roundEntries.length > 0 && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: 0.8,
              }}
            >
              {fmtDate(date)}
            </span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              {totalGames} games · {totalRounds} rounds
            </span>
          </div>
          {roundEntries.map(([roundNum, roundMatches]) => (
            <RoundBlock
              key={roundNum}
              roundNum={roundNum}
              roundMatches={roundMatches}
              currentRound={currentRound}
              playersMap={playersMap}
              onChange={loadSavedMatches}
            />
          ))}
        </>
      )}

      {!preview.length && !savedMatches.length && !loadingMatches && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">🏸</div>
            <div style={{ fontSize: 13 }}>
              Select players and generate, or import from GPT.
            </div>
          </div>
        </div>
      )}
      {loadingMatches && (
        <div
          style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}
        >
          Loading…
        </div>
      )}

      <div style={{ height: 16 }} />

      <ConfirmModal
        open={modalState.open}
        title={
          modalState.type === "clear"
            ? "Clear schedule?"
            : modalState.type === "save"
              ? "Save schedule?"
              : modalState.type === "generate"
                ? "Generate schedule?"
                : "Confirm"
        }
        message={
          modalState.type === "clear"
            ? `Remove all matches and scores for ${date}. Cannot be undone.`
            : modalState.type === "save"
              ? `Save the generated schedule for ${date}?`
              : `Generate a preview for ${date}? (Does not save until you press Save)`
        }
        onCancel={() =>
          setModalState({
            open: false,
            type: null,
            payload: null,
            loading: false,
          })
        }
        onConfirm={handleModalConfirm}
        confirmLabel={
          modalState.type === "clear"
            ? "Clear"
            : modalState.type === "save"
              ? "Save"
              : "Generate"
        }
        cancelLabel="Cancel"
        loading={modalState.loading}
      />
    </div>
  );
}

// ── Round block (saved matches) ────────────────────────────────────────────
function RoundBlock({
  roundNum,
  roundMatches,
  currentRound,
  playersMap,
  onChange,
}) {
  const allDone = roundMatches.every((m) => m.winner?.length > 0);
  const isCurrent = String(roundNum) === String(currentRound);
  const partDone = roundMatches.filter((m) => m.winner?.length > 0).length;

  return (
    <div
      className={`round-block${isCurrent ? " round-current" : ""}${allDone ? " round-done" : ""}`}
    >
      {/* Header */}
      <div className="round-header">
        <div className="round-header-left">
          <div className="round-number-circle">{roundNum}</div>
          <div>
            <div className="round-title-row">
              <span className="round-title">Round {roundNum}</span>
              {isCurrent && (
                <span className="round-badge-now">● NOW PLAYING</span>
              )}
              {allDone && !isCurrent && (
                <span className="round-badge-done">✓ DONE</span>
              )}
            </div>
            <div className="round-subtitle">
              {roundMatches.length} game{roundMatches.length !== 1 ? "s" : ""} ·{" "}
              {partDone}/{roundMatches.length} recorded
            </div>
          </div>
        </div>
        <span className="round-icon">
          {allDone ? "✅" : isCurrent ? "🏸" : "⏳"}
        </span>
      </div>

      {/* Games row — side by side */}
      <div className="round-games-row">
        {[...roundMatches]
          .sort((a, b) => a.court - b.court)
          .map((m) => (
            <div key={m.id} className="round-game-slot">
              <MatchCard
                match={m}
                playersMap={playersMap}
                onChange={onChange}
              />
            </div>
          ))}
      </div>

      {/* Resting strip — placeholder until DB field added */}
      <div className="round-resting-strip">
        <span className="round-resting-label">☕ Resting</span>
        <span className="round-resting-value">— coming soon</span>
      </div>
    </div>
  );
}

// ── Preview round block (read-only) ───────────────────────────────────────
function PreviewRoundBlock({ roundNum, roundMatches, playersMap }) {
  const pname = (id) => playersMap[id] || id;
  return (
    <div className="round-block" style={{ marginBottom: 8 }}>
      <div className="round-header">
        <div className="round-header-left">
          <div className="round-number-circle">{roundNum}</div>
          <span className="round-title">Round {roundNum}</span>
        </div>
        <span className="badge">preview</span>
      </div>
      <div style={{ display: "flex", gap: 8, padding: "10px 10px 10px" }}>
        {[...roundMatches]
          .sort((a, b) => a.court - b.court)
          .map((m) => (
            <div
              key={m.match_index}
              style={{
                flex: 1,
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "9px 10px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--muted2)",
                  }}
                >
                  Game #{m.match_index}
                </span>
                <span className="badge yellow">Court {m.court}</span>
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--text)",
                  marginBottom: 2,
                }}
              >
                {pname(m.players?.[0])} & {pname(m.players?.[1])}
              </div>
              <div
                style={{ fontSize: 10, color: "var(--muted)", marginBottom: 2 }}
              >
                vs
              </div>
              <div
                style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}
              >
                {pname(m.players?.[2])} & {pname(m.players?.[3])}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
