// src/pages/FixedPairsSchedulePage.jsx
import React, { useEffect, useState, useCallback } from "react";
import ConfirmModal from "../components/ConfirmModal";
import { fetchPlayers, saveScheduleToDb } from "../api/supabase-actions";
import { generatePairSchedule } from "../utils/pairScheduler";

export default function FixedPairsSchedulePage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [courts, setCourts] = useState("1");
  const [matchesPerCourt, setMatchesPerCourt] = useState("5");
  const [seedDeterministic, setSeedDeterministic] = useState(true);
  const [players, setPlayers] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [pairForm, setPairForm] = useState({ a: "", b: "" });
  const [preview, setPreview] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState({
    open: false,
    type: null,
    payload: null,
  });
  const [message, setMessage] = useState(null);
  const [isError, setIsError] = useState(false);

  const loadPlayers = useCallback(async () => {
    setLoadingPlayers(true);
    try {
      const { data, error } = await fetchPlayers();
      if (error) throw error;
      setPlayers(data || []);
    } catch (err) {
      console.error(err);
      setPlayers([]);
    } finally {
      setLoadingPlayers(false);
    }
  }, []);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  const playersMap = Object.fromEntries((players || []).map((p) => [p.id, p]));
  const nameOf = (id) => playersMap[id]?.name || id;

  function resetPairForm() {
    setPairForm({ a: "", b: "" });
  }

  function addPair() {
    const { a, b } = pairForm;
    if (!a || !b) {
      setMsg("Select both players.", true);
      return;
    }
    if (a === b) {
      setMsg("A pair must have two different players.", true);
      return;
    }
    if (
      pairs.some(
        (p) =>
          (p.players[0] === a && p.players[1] === b) ||
          (p.players[0] === b && p.players[1] === a),
      )
    ) {
      setMsg("This pair already exists.", true);
      return;
    }
    const label = String.fromCharCode(65 + (pairs.length % 26));
    setPairs((prev) => [
      ...prev,
      {
        id: `pair_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        players: [a, b],
        label,
        name: `${nameOf(a)} & ${nameOf(b)}`,
      },
    ]);
    resetPairForm();
    setMessage(null);
    setIsError(false);
  }

  function removePair(id) {
    setPairs((prev) => prev.filter((p) => p.id !== id));
  }

  function setMsg(text, err = false) {
    setMessage(text);
    setIsError(err);
  }

  function validateInputs() {
    const c = parseInt(courts || "0", 10),
      m = parseInt(matchesPerCourt || "0", 10);
    if (!c || c < 1) return "Courts must be at least 1.";
    if (!m || m < 1) return "Matches per court must be at least 1.";
    if (pairs.length < 2) return "Add at least two pairs.";
    return null;
  }

  function onGenerate() {
    setMessage(null);
    setIsError(false);
    const err = validateInputs();
    if (err) {
      setMsg(err, true);
      return;
    }
    const rawPairs = pairs.map((p) => ({
      id: p.id,
      players: p.players,
      label: p.label,
    }));
    const matches = generatePairSchedule({
      pairs: rawPairs,
      courts: Math.max(1, parseInt(courts, 10)),
      matchesPerCourt: Math.max(1, parseInt(matchesPerCourt, 10)),
      dateSeed: date,
      seedDeterministic,
    });
    setPreview(matches);
    setMsg(
      matches.length === 0
        ? "No matches generated."
        : `Generated ${matches.length} matches.`,
      matches.length === 0,
    );
    if (matches.length > 0)
      setTimeout(() => {
        document
          .querySelector(".preview-panel")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
  }

  function onSaveClicked() {
    if (!preview?.length) {
      setMsg("Generate first.", true);
      return;
    }
    setConfirm({
      open: true,
      type: "save",
      payload: { count: preview.length },
    });
  }

  async function doSave() {
    setConfirm({ open: false, type: null, payload: null });
    setSaving(true);
    try {
      const schedule = preview.map((m) => ({
        court: m.court,
        match_index: m.match_index,
        players: m.players,
      }));
      const { error } = await saveScheduleToDb(schedule, date);
      if (error) throw error;
      setMsg(`Saved ${schedule.length} matches for ${date}.`);
      setPreview([]);
    } catch (err) {
      setMsg("Save failed: " + (err.message || err), true);
    } finally {
      setSaving(false);
    }
  }

  function onClearPairsClicked() {
    if (!pairs.length) {
      setMsg("No pairs to clear.", true);
      return;
    }
    setConfirm({ open: true, type: "clear_pairs", payload: null });
  }
  function doClearPairs() {
    setConfirm({ open: false, type: null, payload: null });
    setPairs([]);
    setPreview([]);
    setMsg("Cleared pairs and preview.");
  }

  const LABEL_COLORS = [
    "var(--primary)",
    "var(--success)",
    "var(--accent)",
    "var(--yellow)",
    "#6e40c9",
  ];

  return (
    <div className="container" style={{ paddingTop: 12 }}>
      {/* Controls */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🔗 Fixed Pairs Schedule</span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{date}</span>
        </div>
        <div className="card-body">
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "flex-end",
              marginBottom: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 140 }}>
              <label className="form-label">Date</label>
              <input
                className="date-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <div>
              <label className="form-label">Courts</label>
              <input
                className="number-input"
                type="text"
                inputMode="numeric"
                value={courts}
                onChange={(e) => setCourts(e.target.value.replace(/\D/g, ""))}
                style={{ width: 56 }}
              />
            </div>
            <div>
              <label className="form-label">Rounds</label>
              <input
                className="number-input"
                type="text"
                inputMode="numeric"
                value={matchesPerCourt}
                onChange={(e) =>
                  setMatchesPerCourt(e.target.value.replace(/\D/g, ""))
                }
                style={{ width: 56 }}
              />
            </div>
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={seedDeterministic}
              onChange={(e) => setSeedDeterministic(Boolean(e.target.checked))}
            />
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              Deterministic seed
            </span>
          </label>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <button className="btn generate" onClick={onGenerate}>
              ⚡ Generate
            </button>
            <button
              className="btn primary"
              onClick={onSaveClicked}
              disabled={saving || !preview.length}
            >
              {saving ? "Saving…" : "💾 Save"}
            </button>
            <button
              className="btn danger"
              onClick={onClearPairsClicked}
              disabled={!pairs.length}
            >
              🗑 Clear Pairs
            </button>
          </div>
        </div>
      </div>

      {/* Add pair */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Add Pair</span>
          <span className="badge blue">{pairs.length} pairs</span>
        </div>
        <div className="card-body">
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 10,
            }}
          >
            <select
              value={pairForm.a}
              onChange={(e) =>
                setPairForm((s) => ({ ...s, a: e.target.value }))
              }
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontSize: 13,
                background: "var(--surface)",
                fontFamily: "inherit",
                outline: "none",
              }}
            >
              <option value="">Player A</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={pairForm.b}
              onChange={(e) =>
                setPairForm((s) => ({ ...s, b: e.target.value }))
              }
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontSize: 13,
                background: "var(--surface)",
                fontFamily: "inherit",
                outline: "none",
              }}
            >
              <option value="">Player B</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button className="btn primary" onClick={addPair}>
              + Add
            </button>
          </div>
          {loadingPlayers && (
            <div style={{ color: "var(--muted)", fontSize: 12 }}>
              Loading players…
            </div>
          )}

          {message && (
            <div
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                background: isError
                  ? "var(--danger-dim)"
                  : "var(--success-dim)",
                border: `1px solid ${isError ? "var(--danger-border)" : "var(--success-border)"}`,
                color: isError ? "var(--danger)" : "var(--success)",
              }}
            >
              {message}
            </div>
          )}
        </div>

        {/* Pair list */}
        {pairs.map((p, i) => (
          <div
            key={p.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 14,
                background: "var(--primary-dim)",
                color: "var(--primary)",
                border: "1px solid var(--primary-border)",
              }}
            >
              {p.label}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                {nameOf(p.players[0])} · {nameOf(p.players[1])}
              </div>
            </div>
            <button
              className="btn small"
              style={{
                color: "var(--danger)",
                borderColor: "var(--danger-border)",
                background: "var(--danger-dim)",
              }}
              onClick={() => removePair(p.id)}
            >
              Remove
            </button>
          </div>
        ))}
        {pairs.length === 0 && (
          <div
            style={{
              padding: "12px 12px",
              color: "var(--muted)",
              fontSize: 13,
            }}
          >
            No pairs added yet.
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="card preview-panel">
        <div className="card-header">
          <span className="card-title">Preview ({preview.length} matches)</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn small" onClick={onGenerate}>
              Regenerate
            </button>
            <button
              className="btn small"
              onClick={() => setPreview([])}
              disabled={!preview.length}
            >
              Clear
            </button>
          </div>
        </div>

        {preview.length === 0 && (
          <div
            style={{
              padding: "16px 12px",
              color: "var(--muted)",
              fontSize: 13,
            }}
          >
            No preview generated yet. Add pairs and click Generate.
          </div>
        )}

        {preview.map((m) => {
          const a0 = nameOf(m.players?.[0]);
          const a1 = nameOf(m.players?.[1]);
          const b0 = nameOf(m.players?.[2]);
          const b1 = nameOf(m.players?.[3]);
          return (
            <div
              key={m.match_index}
              style={{
                padding: "10px 12px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  flexShrink: 0,
                  background: "var(--primary)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 13,
                }}
              >
                #{m.match_index}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 12,
                    color: "var(--primary)",
                  }}
                >
                  {a0} & {a1}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--muted)",
                    margin: "1px 0",
                  }}
                >
                  vs
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 12,
                    color: "var(--success)",
                  }}
                >
                  {b0} & {b1}
                </div>
              </div>
              <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                <span className="badge yellow">Court {m.court}</span>
                <span className="badge blue">R{m.round}</span>
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmModal
        open={confirm.open}
        title={confirm.type === "save" ? "Save schedule?" : "Clear pairs?"}
        message={
          confirm.type === "save"
            ? `Save ${confirm.payload?.count ?? preview.length} matches for ${date}?`
            : "Clear all pairs and preview? Cannot be undone."
        }
        onCancel={() => setConfirm({ open: false, type: null, payload: null })}
        onConfirm={() => {
          if (confirm.type === "save") doSave();
          else doClearPairs();
        }}
        confirmLabel={
          confirm.type === "save" ? (saving ? "Saving…" : "Save") : "Clear"
        }
        cancelLabel="Cancel"
        loading={saving}
      />

      <div style={{ height: 16 }} />
    </div>
  );
}
