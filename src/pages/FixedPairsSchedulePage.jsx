// src/pages/FixedPairsSchedulePage.jsx
import React, { useEffect, useState, useCallback } from "react";
import ConfirmModal from "../components/ConfirmModal";
import { fetchPlayers, saveScheduleToDb } from "../api/supabase-actions";
import { generatePairSchedule } from "../utils/pairScheduler";
/**
 * FixedPairsSchedulePage
 * - Add fixed pairs (pairs remain intact)
 * - Generate preview schedule (pairs vs pairs)
 * - Save preview to DB (read-only schedule page will show it)
 *
 * Mobile-first layout; uses ConfirmModal for confirmations.
 */
export default function FixedPairsSchedulePage({ navigateBack }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [courts, setCourts] = useState("1"); // keep as string so input is easy
  const [matchesPerCourt, setMatchesPerCourt] = useState("5");
  const [seedDeterministic, setSeedDeterministic] = useState(true);
  const [players, setPlayers] = useState([]);
  const [pairs, setPairs] = useState([]); // { id, players:[uuid,uuid], name }
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

  // load players
  const loadPlayers = useCallback(async () => {
    setLoadingPlayers(true);
    try {
      const { data, error } = await fetchPlayers();
      if (error) throw error;
      setPlayers(data || []);
    } catch (err) {
      console.error("loadPlayers error", err);
      setPlayers([]);
    } finally {
      setLoadingPlayers(false);
    }
  }, []);
  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  // helpers to map id -> player
  const playersMap = Object.fromEntries((players || []).map((p) => [p.id, p]));
  function resetPairForm() {
    setPairForm({ a: "", b: "" });
  }
  function addPair() {
    const a = pairForm.a;
    const b = pairForm.b;
    if (!a || !b) {
      setMessage("Please select both players to add a pair.");
      return;
    }
    if (a === b) {
      setMessage("A pair must contain two different players.");
      return;
    }
    // prevent duplicate pair regardless of order
    const keyExisting = (p) =>
      (p.players[0] === a && p.players[1] === b) ||
      (p.players[0] === b && p.players[1] === a);
    if (pairs.some(keyExisting)) {
      setMessage("This pair is already added.");
      return;
    }
    const label = String.fromCharCode(65 + (pairs.length % 26)); // A, B, C...
    const newPair = {
      id: `pair_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      players: [a, b],
      label,
      name: `${playersMap[a]?.name || a} & ${playersMap[b]?.name || b}`,
    };
    setPairs((p) => [...p, newPair]);
    resetPairForm();
    setMessage(null);
  }
  function removePair(id) {
    setPairs((p) => p.filter((x) => x.id !== id));
  }
  function validateInputs() {
    const c = parseInt(courts || "0", 10);
    const m = parseInt(matchesPerCourt || "0", 10);
    if (!c || c < 1) return "Courts must be at least 1.";
    if (!m || m < 1) return "Matches per court must be at least 1.";
    if (pairs.length < 2)
      return "Add at least two pairs to generate a schedule.";
    return null;
  }
  function onGenerate() {
    setMessage(null);
    const err = validateInputs();
    if (err) {
      setMessage(err);
      return;
    }
    const c = Math.max(1, parseInt(courts, 10));
    const m = Math.max(1, parseInt(matchesPerCourt, 10));
    // call scheduler
    const rawPairs = pairs.map((p) => ({
      id: p.id,
      players: p.players,
      label: p.label,
    }));
    const matches = generatePairSchedule({
      pairs: rawPairs,
      courts: c,
      matchesPerCourt: m,
      dateSeed: date,
      seedDeterministic,
    });
    // matches already have players array of 4 ids
    setPreview(matches);
    if ((matches || []).length === 0)
      setMessage("No matches generated with current settings.");
    else setMessage(`Generated ${matches.length} matches.`);
    // scroll into view optionally
    setTimeout(() => {
      const el = document.querySelector(".preview-panel");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }
  function onSaveClicked() {
    if (!preview || preview.length === 0) {
      setMessage("No preview to save. Generate first.");
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
      // the saveScheduleToDb helper expects schedule elements where s.players is array of 4 uuids
      // We already have that in preview. Just pass preview as-is (but ensure fields match).
      // However earlier saveScheduleToDb expects schedule.map(s => s.court, s.match_index, s.players)
      // so pass preview directly.
      const schedule = preview.map((m) => ({
        court: m.court,
        match_index: m.match_index,
        players: m.players,
      }));
      const { data, error } = await saveScheduleToDb(schedule, date);
      if (error) throw error;
      setMessage(
        `Saved ${data?.length ?? schedule.length} matches for ${date}.`
      );
      // clear preview after save
      setPreview([]);
      // optionally reload pairs? no
    } catch (err) {
      console.error("Save error", err);
      setMessage("Failed to save: " + (err.message || JSON.stringify(err)));
    } finally {
      setSaving(false);
    }
  }
  function onClearPairsClicked() {
    if (pairs.length === 0) {
      setMessage("No pairs to clear.");
      return;
    }
    setConfirm({ open: true, type: "clear_pairs", payload: null });
  }
  function doClearPairs() {
    setConfirm({ open: false, type: null, payload: null });
    setPairs([]);
    setPreview([]);
    setMessage("Cleared pairs and preview.");
  }

  return (
    <div className="container" style={{ padding: 12 }}>
      {/* component-scoped CSS kept here per request */}
      <style>{`
        /* match card */
        .match-card {
          border-radius: 8px;
          background: #fff;
          box-shadow: 0 1px 0 rgba(0,0,0,0.04);
        }

        /* row containing entire match */
        .match-row {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
        }

        /* central area with teams and vs */
        .teams-area {
          display: flex;
          gap: 10px;
          align-items: center;
          flex: 1;
          min-width: 0; /* allow flex children to shrink */
        }

        /* each team block should be allowed to shrink and clamp overflow */
        .team {
          min-width: 0;
          flex: 1;
          overflow: hidden;
        }

        .names {
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: block;
        }

        .vs {
          color: #9ca3af;
          font-weight: 700;
          white-space: nowrap;
          flex: 0 0 auto;
        }

        .meta {
          display: flex;
          gap: 8px;
          align-items: center;
          white-space: nowrap;
          flex: 0 0 auto;
        }

        .court-pill {
          padding: 6px 10px;
          border-radius: 18px;
          background: rgba(59,130,246,0.12);
          font-weight: 700;
          min-width: 56px;
          text-align: center;
        }

        .badge {
          font-size: 12px;
          color: #374151;
        }

        /* responsive */
        @media (max-width: 480px) {
          .teams-area {
            flex-direction: column;
            align-items: flex-start;
            gap: 6px;
          }
          .meta {
            margin-top: 8px;
          }
          .court-pill { min-width: 48px; padding: 6px 8px; }
        }
      `}</style>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <h3 style={{ margin: 0 }}>Fixed-pairs schedule — {date}</h3>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <label className="form-label">Date</label>
          <input
            className="date-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <label className="form-label">Courts</label>
          <input
            className="number-input"
            type="text"
            inputMode="numeric"
            value={courts}
            onChange={(e) => setCourts(e.target.value.replace(/[^\d]/g, ""))}
            style={{ minWidth: 58 }}
            aria-label="Courts"
          />
          <label className="form-label">Matches/Court</label>
          <input
            className="number-input"
            type="text"
            inputMode="numeric"
            value={matchesPerCourt}
            onChange={(e) =>
              setMatchesPerCourt(e.target.value.replace(/[^\d]/g, ""))
            }
            style={{ minWidth: 72 }}
            aria-label="Matches per court"
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={seedDeterministic}
              onChange={(e) => setSeedDeterministic(Boolean(e.target.checked))}
            />
            deterministic
          </label>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn generate" onClick={onGenerate}>
              Generate
            </button>
            <button
              className="btn secondary"
              onClick={onSaveClicked}
              disabled={saving || !preview.length}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              className="btn danger"
              onClick={onClearPairsClicked}
              disabled={pairs.length === 0}
            >
              Clear pairs
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h4 style={{ marginTop: 0, marginBottom: 8 }}>Add pair</h4>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <select
            value={pairForm.a}
            onChange={(e) => setPairForm((s) => ({ ...s, a: e.target.value }))}
            style={{ padding: 8, borderRadius: 8 }}
            aria-label="Player A"
          >
            <option value="">Select player A</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={pairForm.b}
            onChange={(e) => setPairForm((s) => ({ ...s, b: e.target.value }))}
            style={{ padding: 8, borderRadius: 8 }}
            aria-label="Player B"
          >
            <option value="">Select player B</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="btn" onClick={addPair}>
            + Add pair
          </button>
          <div style={{ marginLeft: "auto", color: "#666" }}>
            {loadingPlayers
              ? "Loading players..."
              : `${players.length} players`}
          </div>
        </div>
        {message && (
          <div style={{ marginTop: 8, color: "#b91c1c" }}>{message}</div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h4 style={{ marginTop: 0 }}>Pair List ({pairs.length})</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pairs.length === 0 && (
            <div style={{ color: "#666" }}>No pairs added yet.</div>
          )}
          {pairs.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "rgba(11,113,208,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                  }}
                >
                  {p.label}
                </div>
                <div>
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {playersMap[p.players[0]]?.name || p.players[0]} ·{" "}
                    {playersMap[p.players[1]]?.name || p.players[1]}
                  </div>
                </div>
              </div>
              <div>
                <button
                  className="btn small secondary"
                  onClick={() => removePair(p.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview panel */}
      <div className="card preview-panel" style={{ marginBottom: 14 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h4 style={{ margin: 0 }}>Preview ({preview.length} matches)</h4>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={onGenerate}>
              Regenerate
            </button>
            <button
              className="btn secondary"
              onClick={() => setPreview([])}
              disabled={preview.length === 0}
            >
              Clear Preview
            </button>
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          {preview.length === 0 && (
            <div style={{ color: "#666" }}>No preview generated yet.</div>
          )}

          {preview.map((m) => {
            const a0 =
              playersMap[m.players?.[0]]?.name || m.players?.[0] || "—";
            const a1 =
              playersMap[m.players?.[1]]?.name || m.players?.[1] || "—";
            const b0 =
              playersMap[m.players?.[2]]?.name || m.players?.[2] || "—";
            const b1 =
              playersMap[m.players?.[3]]?.name || m.players?.[3] || "—";

            return (
              <div
                key={m.match_index}
                className="match-card"
                style={{ padding: 10, marginTop: 8 }}
              >
                <div className="match-row">
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 8,
                      background: "var(--primary)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      flex: "0 0 auto",
                    }}
                  >
                    #{m.match_index}
                  </div>

                  <div className="teams-area" style={{ minWidth: 0 }}>
                    <div className="team" style={{ minWidth: 0 }}>
                      <div className="names">
                        {a0} &nbsp; / &nbsp; {a1}
                      </div>
                      <div style={{ fontSize: 12, color: "#666" }}>Team A</div>
                    </div>

                    <div className="vs">vs</div>

                    <div className="team" style={{ minWidth: 0 }}>
                      <div className="names">
                        {b0} &nbsp; / &nbsp; {b1}
                      </div>
                      <div style={{ fontSize: 12, color: "#666" }}>Team B</div>
                    </div>
                  </div>

                  <div className="meta">
                    <div className="court-pill">Court {m.court}</div>
                    <div className="badge">Round {m.round}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ConfirmModal
        open={confirm.open}
        title={
          confirm.type === "save"
            ? "Save schedule?"
            : confirm.type === "clear_pairs"
            ? "Clear pairs?"
            : ""
        }
        message={
          confirm.type === "save"
            ? `Save ${
                confirm.payload?.count ?? preview.length
              } matches for ${date}?`
            : "Clear all pairs and preview? This cannot be undone."
        }
        onCancel={() => setConfirm({ open: false, type: null, payload: null })}
        onConfirm={() => {
          if (confirm.type === "save") doSave();
          if (confirm.type === "clear_pairs") doClearPairs();
        }}
        confirmLabel={
          confirm.type === "save" ? (saving ? "Saving..." : "Save") : "Clear"
        }
        cancelLabel="Cancel"
        loading={saving}
      />
    </div>
  );
}
