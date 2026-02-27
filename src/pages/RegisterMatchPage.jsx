// src/pages/RegisterMatchPage.jsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { fetchPlayers, createManualMatch } from "../api/supabase-actions";
import ConfirmModal from "../components/ConfirmModal";

export default function RegisterMatchPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [court, setCourt] = useState("1");
  const [players, setPlayers] = useState([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState(null);
  const [okMsg, setOkMsg] = useState(null);
  const [teamA1, setTeamA1] = useState("");
  const [teamA2, setTeamA2] = useState("");
  const [teamB1, setTeamB1] = useState("");
  const [teamB2, setTeamB2] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadPlayers = useCallback(async () => {
    setLoadingPlayers(true);
    try {
      const { data, error } = await fetchPlayers();
      if (error) throw error;
      setPlayers(data || []);
    } catch (err) {
      setErrMsg(err.message || "Failed to load players");
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
    if (new Set(sel).size < 4) {
      setErrMsg("Players must be unique across both teams.");
      return false;
    }
    return true;
  }

  function onCreateClicked() {
    if (validate()) setConfirmOpen(true);
  }

  async function doCreate() {
    setConfirmOpen(false);
    setErrMsg(null);
    setOkMsg(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const { error } = await createManualMatch({
        matchDate: date,
        court: court === "" ? 1 : Number(court || 1),
        playerIds: [teamA1, teamA2, teamB1, teamB2],
      });
      if (error) throw error;
      setOkMsg("Match created successfully.");
      window.dispatchEvent(new Event("matches-changed"));
      window.dispatchEvent(new Event("scores-changed"));
      resetForm();
    } catch (err) {
      setErrMsg("Failed: " + (err.message || JSON.stringify(err)));
    } finally {
      setBusy(false);
    }
  }

  const selectedIds = useMemo(
    () => [teamA1, teamA2, teamB1, teamB2].filter(Boolean),
    [teamA1, teamA2, teamB1, teamB2],
  );

  function optionsFor(currentValue) {
    const others = selectedIds.filter((id) => id && id !== currentValue);
    return players.filter((p) => !others.includes(p.id));
  }

  const nameOf = (id) => players.find((p) => p.id === id)?.name || "?";

  function PlayerSelect({ value, setValue, placeholder }) {
    return (
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={loadingPlayers}
        style={{
          flex: 1,
          padding: "9px 10px",
          borderRadius: 9,
          border: "1px solid var(--border)",
          fontSize: 13,
          background: value ? "var(--surface)" : "var(--surface2)",
          fontWeight: value ? 700 : 400,
          color: value ? "var(--text)" : "var(--muted)",
          outline: "none",
          fontFamily: "inherit",
        }}
      >
        <option value="">{placeholder}</option>
        {optionsFor(value).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    );
  }

  function TeamCard({ label, color, bgColor, p1, setP1, p2, setP2 }) {
    return (
      <div
        style={{
          flex: 1,
          borderRadius: 10,
          border: `1px solid ${bgColor}`,
          background: `color-mix(in srgb, ${bgColor} 30%, white)`,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "7px 11px",
            background: bgColor,
            borderBottom: `1px solid ${bgColor}`,
          }}
        >
          <span style={{ fontWeight: 800, fontSize: 12, color }}>{label}</span>
        </div>
        <div
          style={{
            padding: "10px 11px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <PlayerSelect value={p1} setValue={setP1} placeholder="Player 1" />
          <PlayerSelect value={p2} setValue={setP2} placeholder="Player 2" />
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: 12 }}>
      <div className="card">
        <div className="card-header">
          <span className="card-title">➕ Register Game</span>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            {players.length} players loaded
          </span>
        </div>
        <div className="card-body">
          {/* Date + Court */}
          <div
            style={{
              display: "flex",
              gap: 10,
              marginBottom: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 140 }}>
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
              <label className="form-label">Court</label>
              <input
                className="number-input"
                type="number"
                min="1"
                value={court}
                onChange={(e) => setCourt(e.target.value)}
                placeholder="1"
                style={{ width: 70 }}
              />
            </div>
          </div>

          {/* Teams side by side */}
          <div
            style={{
              display: "flex",
              gap: 10,
              marginBottom: 14,
              flexWrap: "wrap",
            }}
          >
            <TeamCard
              label="TEAM A"
              color="var(--primary)"
              bgColor="var(--primary-dim)"
              p1={teamA1}
              setP1={setTeamA1}
              p2={teamA2}
              setP2={setTeamA2}
            />
            <TeamCard
              label="TEAM B"
              color="var(--success)"
              bgColor="var(--success-dim)"
              p1={teamB1}
              setP1={setTeamB1}
              p2={teamB2}
              setP2={setTeamB2}
            />
          </div>

          {/* Match preview */}
          {teamA1 && teamA2 && teamB1 && teamB2 && (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                marginBottom: 14,
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                fontSize: 12,
                color: "var(--muted)",
              }}
            >
              <strong style={{ color: "var(--text)" }}>
                {nameOf(teamA1)} & {nameOf(teamA2)}
              </strong>{" "}
              <span>vs</span>{" "}
              <strong style={{ color: "var(--text)" }}>
                {nameOf(teamB1)} & {nameOf(teamB2)}
              </strong>{" "}
              — Court {court} · {date}
            </div>
          )}

          {/* Error / success */}
          {errMsg && (
            <div
              style={{
                marginBottom: 12,
                padding: "9px 12px",
                borderRadius: 8,
                background: "var(--danger-dim)",
                border: "1px solid var(--danger-border)",
                color: "var(--danger)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {errMsg}
            </div>
          )}
          {okMsg && (
            <div
              style={{
                marginBottom: 12,
                padding: "9px 12px",
                borderRadius: 8,
                background: "var(--success-dim)",
                border: "1px solid var(--success-border)",
                color: "var(--success)",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {okMsg}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn generate"
              onClick={onCreateClicked}
              disabled={busy || loadingPlayers}
              style={{ minWidth: 130 }}
            >
              {busy ? "Creating…" : "🏸 Create Match"}
            </button>
            <button className="btn" onClick={resetForm} disabled={busy}>
              Reset
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Create match?"
        message={`Team A: ${nameOf(teamA1)} & ${nameOf(teamA2)} vs Team B: ${nameOf(teamB1)} & ${nameOf(teamB2)} — Court ${court} on ${date}`}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={doCreate}
        confirmLabel="Create"
        cancelLabel="Cancel"
        loading={busy}
      />

      <div style={{ height: 16 }} />
    </div>
  );
}
