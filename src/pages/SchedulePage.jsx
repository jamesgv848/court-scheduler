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
import ConfirmModal from "../components/ConfirmModal";

const STORAGE_KEY = "cs_selected_date";

export default function SchedulePage() {
  const [players, setPlayers] = useState([]);
  const [available, setAvailable] = useState([]);
  // Use text inputs for counts so user can type freely; we'll parse when used
  const [courtsInput, setCourtsInput] = useState("1");
  const [matchesPerCourtInput, setMatchesPerCourtInput] = useState("5");

  const [date, setDate] = useState(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored || new Date().toISOString().slice(0, 10);
  });

  const [preview, setPreview] = useState([]);
  const [savedMatches, setSavedMatches] = useState([]);
  const [pairingMap, setPairingMap] = useState(new Map());
  const [opponentMap, setOpponentMap] = useState(new Map());
  const [loadingSave, setLoadingSave] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [clearing, setClearing] = useState(false);

  // modal state for confirmations (type: "generate" | "save" | "clear")
  const [modalState, setModalState] = useState({
    open: false,
    type: null,
    payload: null,
    loading: false,
  });

  // playersMap for quick name lookup
  const playersMap = Object.fromEntries(
    (players || []).map((p) => [p.id, p.name])
  );

  // Helpers to parse counts (allow empty while typing)
  const parsePositiveInt = (v, fallback = 1) => {
    if (v === null || v === undefined) return fallback;
    const n = parseInt(String(v).trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  // Load players
  const loadPlayers = useCallback(async () => {
    try {
      const { data, error } = await fetchPlayers();
      if (error) throw error;
      setPlayers(data || []);
    } catch (err) {
      console.error("loadPlayers error", err);
    }
  }, []);

  // Load pairing/opponent history maps
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

  // Load saved matches for date
  const loadSavedMatches = useCallback(async () => {
    try {
      setLoadingMatches(true);
      const { data, error } = await fetchMatchesForDate(date);
      if (error) throw error;
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

  // persist date to localStorage
  useEffect(() => {
    if (date) window.localStorage.setItem(STORAGE_KEY, date);
  }, [date]);

  // Realtime subscription for matches changes on the selected date
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
        () => {
          loadSavedMatches();
        }
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch (e) {
        // ignore removal errors
      }
    };
  }, [date, loadSavedMatches]);

  // toggle available selection
  function toggleAvailable(id) {
    setAvailable((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  //
  // Actions triggered after user confirms in modal
  //
  async function _doGenerate() {
    // parse inputs
    const courts = parsePositiveInt(courtsInput, 1);
    const matchesPerCourt = parsePositiveInt(matchesPerCourtInput, 5);

    if (!available || available.length < 4) {
      alert("Select at least 4 available players");
      return;
    }

    try {
      // generate preview (seeded randomness internal to scheduler)
      const schedule = generateSchedule({
        players: available,
        courts,
        matchesPerCourt,
        pairingHistory: pairingMap,
        opponentHistory: opponentMap,
        date,
      });
      setPreview(schedule);
      // scroll preview into view
      setTimeout(() => {
        const el = document.querySelector(".schedule-list");
        el?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      }, 80);
    } catch (err) {
      console.error("generate error", err);
      alert("Failed to generate schedule: " + (err.message || err));
    }
  }

  async function _doSave() {
    if (!preview || preview.length === 0) {
      alert("No schedule to save");
      return;
    }
    setLoadingSave(true);
    try {
      const { data, error } = await saveScheduleToDb(preview, date);
      if (error) throw error;
      await loadSavedMatches();
      setPreview([]);
      await loadHistory();
      alert("Schedule saved.");
    } catch (err) {
      console.error("onSaveSchedule error", err);
      alert("Failed to save schedule: " + (err.message || err));
    } finally {
      setLoadingSave(false);
    }
  }

  async function _doClear() {
    if (!date) {
      alert("Please select a date first");
      return;
    }
    setClearing(true);
    try {
      const { data, error } = await deleteScheduleForDate(date);
      if (error) throw error;
      await loadSavedMatches();
      setPreview([]);
      await loadHistory();
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

  // Handlers that open confirm modal
  function handleGenerateConfirm() {
    // quick validation before opening modal
    if (!available || available.length < 4) {
      alert("Select at least 4 available players");
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
      alert("No preview available to save. Generate first.");
      return;
    }
    setModalState({ open: true, type: "save", payload: null, loading: false });
  }
  function handleClearConfirm() {
    if (!date) {
      alert("Please select a date first");
      return;
    }
    setModalState({ open: true, type: "clear", payload: null, loading: false });
  }

  // confirm modal confirm callback
  async function handleModalConfirm() {
    if (!modalState.type) return;
    setModalState((s) => ({ ...s, loading: true }));
    try {
      if (modalState.type === "generate") {
        await _doGenerate();
      } else if (modalState.type === "save") {
        await _doSave();
      } else if (modalState.type === "clear") {
        await _doClear();
      }
    } finally {
      setModalState({ open: false, type: null, payload: null, loading: false });
    }
  }

  return (
    <div className="container">
      <header className="header">
        <div className="brand">
          <div className="logo">IB</div>
          <div className="title">Schedule — {date}</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 13, color: "#666" }}>Date:</div>
          <input
            className="date-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Select match date"
          />
        </div>
      </header>

      <div className="grid">
        <div>
          {/* Players + controls card (Generate/Save/Clear moved here) */}
          <div className="card">
            <h3>Select Details</h3>

            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                marginBottom: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label className="form-label">Courts</label>
                <input
                  className="number-input"
                  type="text"
                  inputMode="numeric"
                  value={courtsInput}
                  onChange={(e) => setCourtsInput(e.target.value)}
                  placeholder="1"
                  style={{ minWidth: 70 }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label className="form-label">Matches/Court</label>
                <input
                  className="number-input"
                  type="text"
                  inputMode="numeric"
                  value={matchesPerCourtInput}
                  onChange={(e) => setMatchesPerCourtInput(e.target.value)}
                  placeholder="5"
                  style={{ minWidth: 70 }}
                />
              </div>

              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="btn generate"
                  onClick={handleGenerateConfirm}
                >
                  Generate
                </button>

                <button
                  className="btn secondary"
                  onClick={handleSaveConfirm}
                  disabled={loadingSave || preview.length === 0}
                >
                  {loadingSave ? "Saving..." : "Save"}
                </button>

                <button
                  className="btn danger"
                  onClick={handleClearConfirm}
                  disabled={clearing}
                >
                  {clearing ? "Clearing..." : "Clear"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {players.map((p) => (
                <label
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 140,
                  }}
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

          {/* Preview */}
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

          {/* Saved Matches */}
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
          <div className="card">
            <h4>Help</h4>
            <p style={{ color: "#555", fontSize: 13 }}>
              Select available players for the date, set courts and matches per
              court, Generate to preview, then Save to persist. Any user can
              record winners — the list will update in real time.
            </p>
          </div>
        </aside>
      </div>

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
            ? `This will remove all matches and recorded scores for ${date}. This cannot be undone.`
            : modalState.type === "save"
            ? `Save the generated schedule for ${date}? This will persist matches and allow anyone to record winners.`
            : modalState.type === "generate"
            ? `Generate a preview schedule now? This will overwrite the preview shown (does not save data until you press Save).`
            : ""
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
