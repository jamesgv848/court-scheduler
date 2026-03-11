// src/pages/PlayerProfilePage.jsx
//
// Route:  /players/:playerId
// Access: via "Profile →" button on PlayersPage, or direct URL
//
// Data strategy — all direct Supabase queries, no new RPCs needed:
//   1. Player row            → supabase.from("players")
//   2. Overall stats         → supabase.rpc("player_totals_overall")  (already exists)
//   3. Per-session sparkline → matches + scores joined, grouped by match_date
//   4. Partner stats         → pairing_stats_recorded RPC (already exists), filtered client-side
//   5. Recent matches        → matches + scores, last 10 the player appeared in
//
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import {
  fetchPlayerTotalsOverall,
  fetchPairingStatsRecorded,
} from "../api/supabase-actions";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateShort(d) {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function fmtMonthShort(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { month: "short" });
}

function winColor(pct) {
  if (pct >= 65) return "#1a7f37";
  if (pct >= 45) return "#c44d00";
  return "#57606a";
}

// Avatar circle (reused in several places)
function Avatar({ name, size = 40, fontSize = 16, style = {} }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "rgba(196,77,0,0.1)",
        border: "1.5px solid rgba(196,77,0,0.25)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize,
        color: "#c44d00",
        flexShrink: 0,
        ...style,
      }}
    >
      {(name || "?")[0].toUpperCase()}
    </div>
  );
}

// Simple inline sparkline bars
function Sparkline({ sessions }) {
  if (!sessions || sessions.length === 0) return null;
  const maxPct = Math.max(...sessions.map((s) => s.win_pct), 1);
  // Show at most last 10 sessions, oldest on the left
  const visible = sessions.slice(-10);

  return (
    <div style={{ padding: "12px 12px 8px" }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#8c959f",
          textTransform: "uppercase",
          letterSpacing: ".6px",
          marginBottom: 8,
        }}
      >
        Win % — last {visible.length} sessions
      </div>
      <div
        style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 48 }}
      >
        {visible.map((s, i) => {
          const pct = s.win_pct;
          const h = Math.max((pct / maxPct) * 100, 8);
          const color = i === visible.length - 1 ? "#1a7f37" : "#c44d00";
          return (
            <div
              key={s.match_date}
              title={`${fmtDateShort(s.match_date)}: ${pct.toFixed(0)}%`}
              style={{
                flex: 1,
                height: `${h}%`,
                background: `linear-gradient(180deg, ${color}, ${color}66)`,
                borderRadius: "3px 3px 0 0",
                minHeight: 4,
                cursor: "default",
                boxShadow:
                  i === visible.length - 1 ? `0 0 6px ${color}66` : "none",
              }}
            />
          );
        })}
      </div>
      {/* Date labels — first and last only */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 4,
          padding: "0 1px",
        }}
      >
        <span style={{ fontSize: 9, color: "#8c959f" }}>
          {fmtMonthShort(visible[0]?.match_date)}
        </span>
        <span style={{ fontSize: 9, color: "#8c959f" }}>
          {fmtDateShort(visible[visible.length - 1]?.match_date)}
        </span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PlayerProfilePage() {
  const { playerId } = useParams();
  const navigate = useNavigate();

  const [player, setPlayer] = useState(null);
  const [overall, setOverall] = useState(null); // { matches, wins, win_pct }
  const [rank, setRank] = useState(null); // position in overall leaderboard
  const [sessions, setSessions] = useState([]); // per-session sparkline data
  const [partners, setPartners] = useState([]); // pairing rows where this player appears
  const [recentMatches, setRecentMatches] = useState([]); // last N match rows with result
  const [playersMap, setPlayersMap] = useState({}); // id → name
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── 1. Load all data on mount ───────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        loadPlayer(),
        loadOverall(),
        loadSessionSparkline(),
        loadPartnerStats(),
        loadRecentMatches(),
        loadPlayersMap(),
      ]);
    } catch (err) {
      console.error("PlayerProfile load error", err);
      setError(err.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [playerId]); // eslint-disable-line

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── 2. Individual loaders ───────────────────────────────────────────────────

  async function loadPlayer() {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .eq("id", playerId)
      .single();
    if (error) throw error;
    setPlayer(data);
  }

  async function loadOverall() {
    // Reuse existing RPC — returns all players, we filter for this one
    const { data, error } = await fetchPlayerTotalsOverall();
    if (error) throw error;
    const rows = (data || []).map((r) => ({
      id: r.id ?? r.player_id,
      name: r.name ?? r.player_name,
      matches: Number(r.matches ?? r.total_matches ?? 0),
      wins: Number(r.wins ?? 0),
      win_pct: Number(r.win_pct ?? 0),
    }));
    // Sort by wins desc (matches scoreboard RPC order — same as what the RPC returns)
    const sorted = [...rows].sort(
      (a, b) => b.wins - a.wins || b.win_pct - a.win_pct,
    );
    const idx = sorted.findIndex((r) => r.id === playerId);
    const mine = rows.find((r) => r.id === playerId);
    setOverall(mine || null);
    setRank(idx >= 0 ? idx + 1 : null);
  }

  async function loadSessionSparkline() {
    // Fetch every match_date where this player played, and their win count that date
    // matches contains player_ids (array) and winner (array)
    const { data: matchRows, error } = await supabase
      .from("matches")
      .select("match_date, player_ids, winner")
      .contains("player_ids", [playerId]) // matches where player was in the game
      .order("match_date", { ascending: true });

    if (error) throw error;

    // Group by match_date
    const byDate = {};
    for (const m of matchRows || []) {
      const d = m.match_date;
      if (!byDate[d]) byDate[d] = { played: 0, won: 0 };
      byDate[d].played += 1;
      if (Array.isArray(m.winner) && m.winner.includes(playerId)) {
        byDate[d].won += 1;
      }
    }

    const result = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([match_date, { played, won }]) => ({
        match_date,
        matches: played,
        wins: won,
        win_pct: played > 0 ? Math.round((won / played) * 100) : 0,
      }));

    setSessions(result);
  }

  async function loadPartnerStats() {
    // pairing_stats_recorded returns rows with player_a, player_b, name_a, name_b, matches, wins
    // We want all rows where either player_a or player_b == playerId
    const { data, error } = await fetchPairingStatsRecorded(null, null);
    if (error) throw error;

    const mine = (data || [])
      .filter((r) => r.player_a === playerId || r.player_b === playerId)
      .map((r) => {
        const isA = r.player_a === playerId;
        const partnerId = isA ? r.player_b : r.player_a;
        const partnerName = isA ? r.name_b || "?" : r.name_a || "?";
        const matches = Number(r.matches || 0);
        const wins = Number(r.wins || 0);
        return {
          partnerId,
          partnerName,
          matches,
          wins,
          win_pct: matches > 0 ? Math.round((wins / matches) * 100) : 0,
        };
      })
      .filter((r) => r.matches >= 2) // at least 2 games together to be meaningful
      .sort((a, b) => b.matches - a.matches);

    setPartners(mine);
  }

  async function loadRecentMatches() {
    // Only completed games (winner recorded). Not selecting round/match_index
    // as those columns may not exist yet.
    const { data, error } = await supabase
      .from("matches")
      .select("id, match_date, court, player_ids, winner, score_text")
      .contains("player_ids", [playerId])
      .not("winner", "is", null)
      .order("match_date", { ascending: false })
      .limit(30);

    if (error) throw error;

    // Also filter out rows where winner was saved as [] instead of NULL,
    // then sort by date desc -> court asc, take top 15.
    const sorted = (data || [])
      .filter((m) => Array.isArray(m.winner) && m.winner.length > 0)
      .sort((a, b) => {
        const dateDiff = b.match_date.localeCompare(a.match_date);
        if (dateDiff !== 0) return dateDiff;
        return (a.court ?? 0) - (b.court ?? 0);
      })
      .slice(0, 15);

    setRecentMatches(sorted);
  }

  async function loadPlayersMap() {
    const { data, error } = await supabase
      .from("players")
      .select("id, name")
      .order("name", { ascending: true });
    if (error) throw error;
    const map = {};
    for (const p of data || []) map[p.id] = p.name;
    setPlayersMap(map);
  }

  // ── 3. Derived stats ────────────────────────────────────────────────────────

  // Win streak — consecutive individual game wins (most recent first).
  // recentMatches is already filtered to completed games only, sorted date desc.
  // Walk from the most recent game backwards; stop at the first loss.
  const currentStreak = (() => {
    let streak = 0;
    for (const m of recentMatches) {
      const won = Array.isArray(m.winner) && m.winner.includes(playerId);
      if (won) streak++;
      else break;
    }
    return streak;
  })();

  // Best and worst partner (min 2 games)
  const bestPartner =
    partners.length > 0
      ? [...partners].sort((a, b) => b.win_pct - a.win_pct)[0]
      : null;
  const worstPartner =
    partners.length > 1
      ? [...partners].sort((a, b) => a.win_pct - b.win_pct)[0]
      : null;

  // ── 4. Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="container">
        <div
          className="card"
          style={{ padding: 24, textAlign: "center", color: "#8c959f" }}
        >
          Loading profile…
        </div>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="container">
        <div className="card" style={{ padding: 24 }}>
          <p style={{ color: "#cf222e" }}>{error || "Player not found."}</p>
          <button
            className="btn secondary"
            onClick={() => navigate("/players")}
            style={{ marginTop: 12 }}
          >
            ← Back to Players
          </button>
        </div>
      </div>
    );
  }

  const pct = overall?.win_pct ?? 0;
  const totalGames = overall?.matches ?? 0;
  const totalWins = overall?.wins ?? 0;
  const totalLoss = totalGames - totalWins;
  const rankLabel = rank
    ? rank === 1
      ? "🥇 #1 Overall"
      : rank === 2
        ? "🥈 #2 Overall"
        : rank === 3
          ? "🥉 #3 Overall"
          : `#${rank} Overall`
    : null;

  return (
    <div className="container" style={{ maxWidth: 520 }}>
      {/* ── Back button ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: 10 }}>
        <button
          className="btn small secondary"
          onClick={() => navigate("/players")}
          style={{ fontSize: 12 }}
        >
          ← Players
        </button>
      </div>

      {/* ── Hero card ───────────────────────────────────────────────── */}
      <div
        style={{
          background: "linear-gradient(135deg, #e05a1c 0%, #c44000 100%)",
          borderRadius: 12,
          padding: "20px 16px 16px",
          marginBottom: 10,
          boxShadow: "0 4px 16px rgba(196,77,0,0.28)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* decorative circles */}
        <div
          style={{
            position: "absolute",
            top: -24,
            right: -24,
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.07)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -36,
            right: 40,
            width: 90,
            height: 90,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.05)",
            pointerEvents: "none",
          }}
        />

        {/* top row: avatar + name */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            marginBottom: 16,
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: 62,
              height: 62,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.2)",
              border: "2px solid rgba(255,255,255,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              fontWeight: 800,
              color: "#fff",
              flexShrink: 0,
            }}
          >
            {player.name[0].toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: "#fff",
                letterSpacing: "-.5px",
                lineHeight: 1.1,
              }}
            >
              {player.name}
            </div>
            {player.last_played && (
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.7)",
                  marginTop: 3,
                }}
              >
                Last played: {fmtDate(player.last_played)}
              </div>
            )}
            {rankLabel && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 8,
                  background: "rgba(255,255,255,0.2)",
                  border: "1px solid rgba(255,255,255,0.3)",
                  borderRadius: 20,
                  padding: "3px 10px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#fff",
                }}
              >
                {rankLabel}
              </div>
            )}
          </div>
        </div>

        {/* stats strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 1,
            background: "rgba(255,255,255,0.15)",
            borderRadius: 10,
            overflow: "hidden",
            position: "relative",
            zIndex: 1,
          }}
        >
          {[
            { val: totalGames, lbl: "Games" },
            { val: totalWins, lbl: "Wins" },
            { val: `${pct.toFixed(0)}%`, lbl: "Win %" },
            {
              val: currentStreak > 0 ? `🔥${currentStreak}` : sessions.length,
              lbl: currentStreak > 0 ? "Win Streak" : "Sessions",
            },
          ].map(({ val, lbl }) => (
            <div
              key={lbl}
              style={{
                background: "rgba(0,0,0,0.15)",
                padding: "8px 4px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "#fff",
                  lineHeight: 1,
                }}
              >
                {val}
              </div>
              <div
                style={{
                  fontSize: 8,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.7)",
                  letterSpacing: ".5px",
                  textTransform: "uppercase",
                  marginTop: 2,
                }}
              >
                {lbl}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Win % Sparkline ─────────────────────────────────────────── */}
      {sessions.length > 0 && (
        <div className="card" style={{ marginBottom: 10, overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              borderBottom: "1px solid var(--border, #dde1e7)",
              background: "var(--surface2, #f6f8fa)",
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text, #1c2128)",
              }}
            >
              Win % Per Session
            </span>
            {sessions.length >= 2 &&
              (() => {
                const last = sessions[sessions.length - 1].win_pct;
                const prev = sessions[sessions.length - 2].win_pct;
                const diff = last - prev;
                const color = diff >= 0 ? "#1a7f37" : "#cf222e";
                const arrow = diff >= 0 ? "↑" : "↓";
                return (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color,
                      background:
                        diff >= 0
                          ? "rgba(26,127,55,0.09)"
                          : "rgba(207,34,46,0.08)",
                      border: `1px solid ${diff >= 0 ? "rgba(26,127,55,0.3)" : "rgba(207,34,46,0.25)"}`,
                      borderRadius: 20,
                      padding: "2px 8px",
                    }}
                  >
                    {arrow} {Math.abs(diff).toFixed(0)}% vs last session
                  </span>
                );
              })()}
          </div>
          <Sparkline sessions={sessions} />
        </div>
      )}

      {/* ── W/L breakdown ────────────────────────────────────────────── */}
      {overall && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid var(--border, #dde1e7)",
              background: "var(--surface2, #f6f8fa)",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--text, #1c2128)",
            }}
          >
            Overall Record
          </div>
          <div
            style={{
              padding: "12px 12px",
              display: "flex",
              gap: 12,
              alignItems: "center",
            }}
          >
            {/* Ring visual (pure CSS) */}
            <svg
              width="72"
              height="72"
              viewBox="0 0 72 72"
              style={{ flexShrink: 0 }}
            >
              <circle
                cx="36"
                cy="36"
                r="28"
                fill="none"
                stroke="#eef0f3"
                strokeWidth="10"
              />
              <circle
                cx="36"
                cy="36"
                r="28"
                fill="none"
                stroke={winColor(pct)}
                strokeWidth="10"
                strokeDasharray={`${(pct / 100) * 175.9} 175.9`}
                strokeLinecap="round"
                transform="rotate(-90 36 36)"
              />
              <text
                x="36"
                y="40"
                textAnchor="middle"
                fontSize="14"
                fontWeight="800"
                fill={winColor(pct)}
              >
                {pct.toFixed(0)}%
              </text>
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#8c959f", marginBottom: 6 }}>
                {totalGames} total games played
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                <div>
                  <div
                    style={{ fontSize: 20, fontWeight: 800, color: "#1a7f37" }}
                  >
                    {totalWins}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: "#8c959f",
                      textTransform: "uppercase",
                      letterSpacing: ".5px",
                    }}
                  >
                    Wins
                  </div>
                </div>
                <div>
                  <div
                    style={{ fontSize: 20, fontWeight: 800, color: "#cf222e" }}
                  >
                    {totalLoss}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: "#8c959f",
                      textTransform: "uppercase",
                      letterSpacing: ".5px",
                    }}
                  >
                    Losses
                  </div>
                </div>
                <div>
                  <div
                    style={{ fontSize: 20, fontWeight: 800, color: "#c44d00" }}
                  >
                    {sessions.length}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: "#8c959f",
                      textTransform: "uppercase",
                      letterSpacing: ".5px",
                    }}
                  >
                    Sessions
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Partner stats ────────────────────────────────────────────── */}
      {partners.length > 0 && (
        <div className="card" style={{ marginBottom: 10, overflow: "hidden" }}>
          <div
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid var(--border, #dde1e7)",
              background: "var(--surface2, #f6f8fa)",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Partner Performance
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              padding: 12,
            }}
          >
            {/* Best partner */}
            {bestPartner && (
              <div
                style={{
                  background: "rgba(26,127,55,0.06)",
                  border: "1px solid rgba(26,127,55,0.3)",
                  borderRadius: 10,
                  padding: "10px 8px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: "#1a7f37",
                    textTransform: "uppercase",
                    letterSpacing: ".6px",
                    marginBottom: 8,
                  }}
                >
                  Best Partner
                </div>
                <Avatar
                  name={bestPartner.partnerName}
                  size={36}
                  fontSize={14}
                  style={{
                    margin: "0 auto 6px",
                    background: "rgba(26,127,55,0.1)",
                    borderColor: "rgba(26,127,55,0.3)",
                    color: "#1a7f37",
                  }}
                />
                <div
                  style={{ fontSize: 12, fontWeight: 700, color: "#1c2128" }}
                >
                  {bestPartner.partnerName}
                </div>
                <div style={{ fontSize: 10, color: "#8c959f", marginTop: 2 }}>
                  {bestPartner.matches} games together
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 800,
                    color: "#1a7f37",
                    marginTop: 4,
                  }}
                >
                  {bestPartner.win_pct}% wins
                </div>
              </div>
            )}
            {/* Worst partner */}
            {worstPartner &&
              worstPartner.partnerId !== bestPartner?.partnerId && (
                <div
                  style={{
                    background: "rgba(207,34,46,0.05)",
                    border: "1px solid rgba(207,34,46,0.25)",
                    borderRadius: 10,
                    padding: "10px 8px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: "#cf222e",
                      textTransform: "uppercase",
                      letterSpacing: ".6px",
                      marginBottom: 8,
                    }}
                  >
                    Toughest Combo
                  </div>
                  <Avatar
                    name={worstPartner.partnerName}
                    size={36}
                    fontSize={14}
                    style={{
                      margin: "0 auto 6px",
                      background: "rgba(207,34,46,0.08)",
                      borderColor: "rgba(207,34,46,0.3)",
                      color: "#cf222e",
                    }}
                  />
                  <div
                    style={{ fontSize: 12, fontWeight: 700, color: "#1c2128" }}
                  >
                    {worstPartner.partnerName}
                  </div>
                  <div style={{ fontSize: 10, color: "#8c959f", marginTop: 2 }}>
                    {worstPartner.matches} games together
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: "#cf222e",
                      marginTop: 4,
                    }}
                  >
                    {worstPartner.win_pct}% wins
                  </div>
                </div>
              )}
          </div>

          {/* Full partner table */}
          {partners.length > 2 && (
            <div style={{ borderTop: "1px solid var(--border, #dde1e7)" }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#8c959f",
                  textTransform: "uppercase",
                  letterSpacing: ".6px",
                  padding: "8px 12px 4px",
                }}
              >
                All Partners
              </div>
              {partners.map((pt) => (
                <div
                  key={pt.partnerId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 12px",
                    borderBottom: "1px solid var(--border, #dde1e7)",
                  }}
                >
                  <Avatar
                    name={pt.partnerName}
                    size={28}
                    fontSize={11}
                    style={{ flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#1c2128",
                      }}
                    >
                      {pt.partnerName}
                    </div>
                    <div style={{ fontSize: 10, color: "#8c959f" }}>
                      {pt.matches}M · {pt.wins}W
                    </div>
                  </div>
                  {/* win bar */}
                  <div
                    style={{
                      width: 60,
                      height: 5,
                      background: "#eef0f3",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${pt.win_pct}%`,
                        height: "100%",
                        background: winColor(pt.win_pct),
                        borderRadius: 3,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: winColor(pt.win_pct),
                      minWidth: 38,
                      textAlign: "right",
                    }}
                  >
                    {pt.win_pct}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Recent matches ───────────────────────────────────────────── */}
      {recentMatches.length > 0 && (
        <div className="card" style={{ marginBottom: 10, overflow: "hidden" }}>
          <div
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid var(--border, #dde1e7)",
              background: "var(--surface2, #f6f8fa)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--text, #1c2128)",
              }}
            >
              Recent Matches
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#8c959f",
                background: "#f6f8fa",
                border: "1px solid #dde1e7",
                borderRadius: 20,
                padding: "2px 8px",
              }}
            >
              Last {recentMatches.length}
            </span>
          </div>

          {recentMatches.map((m, idx) => {
            const isWinner =
              Array.isArray(m.winner) && m.winner.includes(playerId);
            const hasResult = Array.isArray(m.winner) && m.winner.length > 0;

            // Split player_ids into my team and opponents using winner array
            // If not yet resolved, just show all players
            const allIds = m.player_ids || [];
            const teamSize = 2; // always doubles
            const myTeamIds = hasResult
              ? isWinner
                ? m.winner
                : allIds.filter((id) => !m.winner.includes(id))
              : allIds.slice(0, teamSize);
            const oppIds = hasResult
              ? isWinner
                ? allIds.filter((id) => !m.winner.includes(id))
                : m.winner
              : allIds.slice(teamSize);

            const myTeamNames = myTeamIds
              .map((id) => playersMap[id] || id.slice(0, 6))
              .join(" & ");
            const oppTeamNames = oppIds
              .map((id) => playersMap[id] || id.slice(0, 6))
              .join(" & ");
            const partnerNames = myTeamIds
              .filter((id) => id !== playerId)
              .map((id) => playersMap[id] || "?")
              .join(", ");

            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderBottom:
                    idx < recentMatches.length - 1
                      ? "1px solid var(--border, #dde1e7)"
                      : "none",
                }}
              >
                {/* W / L / ? pill */}
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 800,
                    flexShrink: 0,
                    background: !hasResult
                      ? "#f6f8fa"
                      : isWinner
                        ? "rgba(26,127,55,0.09)"
                        : "rgba(207,34,46,0.08)",
                    color: !hasResult
                      ? "#8c959f"
                      : isWinner
                        ? "#1a7f37"
                        : "#cf222e",
                    border: `1px solid ${!hasResult ? "#dde1e7" : isWinner ? "rgba(26,127,55,0.3)" : "rgba(207,34,46,0.25)"}`,
                  }}
                >
                  {!hasResult ? "?" : isWinner ? "W" : "L"}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{ fontSize: 12, fontWeight: 700, color: "#1c2128" }}
                  >
                    {partnerNames ? `w/ ${partnerNames}` : myTeamNames}
                  </div>
                  <div style={{ fontSize: 10, color: "#8c959f", marginTop: 1 }}>
                    vs {oppTeamNames || "—"}
                  </div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {m.score_text && (
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: "#c44d00",
                      }}
                    >
                      {m.score_text}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: "#8c959f", marginTop: 1 }}>
                    {fmtDateShort(m.match_date)} · C{m.court}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* empty state */}
      {!loading && totalGames === 0 && (
        <div
          className="card"
          style={{ padding: 20, textAlign: "center", color: "#8c959f" }}
        >
          No match data recorded for {player.name} yet.
        </div>
      )}
    </div>
  );
}
