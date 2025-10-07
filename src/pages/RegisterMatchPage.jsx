// src/pages/RegisterMatchPage.jsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { fetchPlayers, createManualMatch } from "../api/supabase-actions";
import ConfirmModal from "../components/ConfirmModal";

/**
 * RegisterMatchPage
 *
 * Simple form to register manual/ad-hoc match:
 * - Date (YYYY-MM-DD)
 * - Court (optional, defaults to 1)
 * - Team A: player1 + player2
 * - Team B: player1 + player2
 *
 * Dropdowns will prevent selecting the same player in more than one slot.
 */
export default function RegisterMatchPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [court, setCourt] = useState("1"); // default shown as 1 to avoid NOT NULL DB constraint
  const [players, setPlayers] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState(null);
  const [okMsg, setOkMsg] = useState(null);

  // selections
  const [teamA1, setTeamA1] = useState("");
  const [teamA2, setTeamA2] = useState("");
  const [teamB1, setTeamB1] = useState("");
  const [teamB2, setTeamB2] = useState("");

  // confirm modal
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadPlayers = useCallback(async () => {
    setLoadingPlayers(true);
    setErrMsg(null);
    try {
      const { data, error } = await fetchPlayers();
      if (error) throw error;
      setPlayers(data || []);
    } catch (err) {
      console.error("fetchPlayers error", err);
      setErrMsg(err.message || "Failed to load players");
      setPlayers([]);
    } finally {
      setLoadingPlayers(false);
    }
  }, []);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  function resetForm() {
    setDate(today);
    setCourt("1");
    setTeamA1("");
    setTeamA2("");
    setTeamB1("");
    setTeamB2("");
    setErrMsg(null);
    setOkMsg(null);
  }

  function validate() {
    setErrMsg(null);
    const sel = [teamA1, teamA2, teamB1, teamB2].filter(Boolean);
    if (sel.length < 4) {
      setErrMsg("Please select 4 players (two per team).");
      return false;
    }
    const uniq = new Set(sel);
    if (uniq.size < 4) {
      setErrMsg("Players must be unique across both teams.");
      return false;
    }
    // optional: check teams have two players each (already implied)
    return true;
  }

  function onCreateClicked() {
    if (!validate()) return;
    setConfirmOpen(true);
  }

  async function doCreate() {
    setConfirmOpen(false);
    setErrMsg(null);
    setOkMsg(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const playerIds = [teamA1, teamA2, teamB1, teamB2];
      const courtVal = court === "" ? 1 : Number(court || 1);
      const { data, error } = await createManualMatch({
        matchDate: date,
        court: courtVal,
        playerIds,
      });
      if (error) throw error;
      // data = { match, scores } per helper
      setOkMsg("Match successfully created.");
      // notify other pages
      window.dispatchEvent(new Event("matches-changed"));
      window.dispatchEvent(new Event("scores-changed"));
      // reset form
      resetForm();
    } catch (err) {
      console.error("createManualMatch error", err);
      const message =
        (err && (err.message || (err.error && err.error.message))) ||
        JSON.stringify(err);
      setErrMsg("Failed to create match: " + message);
    } finally {
      setBusy(false);
    }
  }

  // build selected set for exclusion logic
  const selectedIds = useMemo(
    () => [teamA1, teamA2, teamB1, teamB2].filter(Boolean),
    [teamA1, teamA2, teamB1, teamB2]
  );

  // helper to compute options for a given select field:
  // - allow current value (so selected remains visible)
  // - exclude other selected values
  function optionsFor(currentValue) {
    const others = selectedIds.filter((id) => id && id !== currentValue);
    return players.filter(
      (p) => !others.includes(p.id) || p.id === currentValue
    );
  }

  return (
    <div className="container" style={{ padding: 12 }}>
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>Register Game</h3>
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 160 }}>
            <label
              className="form-label"
              style={{ display: "block", marginBottom: 6 }}
            >
              Date
            </label>
            <input
              className="date-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div style={{ minWidth: 100 }}>
            <label
              className="form-label"
              style={{ display: "block", marginBottom: 6 }}
            >
              Court (optional)
            </label>
            <input
              className="number-input"
              type="number"
              min="1"
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              placeholder="1"
              style={{ width: 100 }}
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h4 style={{ marginTop: 0 }}>Team A</h4>
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <select
            value={teamA1}
            onChange={(e) => setTeamA1(e.target.value)}
            style={{ padding: 8, borderRadius: 8, minWidth: 160 }}
            disabled={loadingPlayers}
          >
            <option value="">Select player A1</option>
            {optionsFor(teamA1).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={teamA2}
            onChange={(e) => setTeamA2(e.target.value)}
            style={{ padding: 8, borderRadius: 8, minWidth: 160 }}
            disabled={loadingPlayers}
          >
            <option value="">Select player A2</option>
            {optionsFor(teamA2).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ height: 18 }} />

        <h4 style={{ marginTop: 0 }}>Team B</h4>
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <select
            value={teamB1}
            onChange={(e) => setTeamB1(e.target.value)}
            style={{ padding: 8, borderRadius: 8, minWidth: 160 }}
            disabled={loadingPlayers}
          >
            <option value="">Select player B1</option>
            {optionsFor(teamB1).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={teamB2}
            onChange={(e) => setTeamB2(e.target.value)}
            style={{ padding: 8, borderRadius: 8, minWidth: 160 }}
            disabled={loadingPlayers}
          >
            <option value="">Select player B2</option>
            {optionsFor(teamB2).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            marginTop: 18,
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <button
            className="btn generate"
            onClick={onCreateClicked}
            disabled={busy || loadingPlayers}
            style={{ minWidth: 140 }}
          >
            {busy ? "Working…" : "Create Match"}
          </button>
          <button className="btn secondary" onClick={resetForm} disabled={busy}>
            Reset
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ color: "var(--muted)" }}>
            {players.length} players loaded.
          </div>
        </div>

        {errMsg && (
          <div style={{ marginTop: 12, color: "crimson", fontWeight: 600 }}>
            {errMsg}
          </div>
        )}
        {okMsg && (
          <div style={{ marginTop: 12, color: "green", fontWeight: 700 }}>
            {okMsg}
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Confirm create match"
        message={`Create match on ${date} — Team A: ${
          (players.find((p) => p.id === teamA1) || {}).name || "?"
        } & ${
          (players.find((p) => p.id === teamA2) || {}).name || "?"
        } vs Team B: ${
          (players.find((p) => p.id === teamB1) || {}).name || "?"
        } & ${(players.find((p) => p.id === teamB2) || {}).name || "?"}?`}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={doCreate}
        confirmLabel="Create"
        cancelLabel="Cancel"
        loading={busy}
      />
    </div>
  );
}
