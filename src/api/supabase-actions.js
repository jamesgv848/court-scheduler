// src/api/supabase-actions.js
import { supabase } from "../supabaseClient";

export async function saveScheduleToDb(schedule, matchDate) {
  const rows = schedule.map((s) => ({
    id: s.id,
    match_date:
      matchDate instanceof Date
        ? matchDate.toISOString().slice(0, 10)
        : matchDate,
    court: s.court,
    match_index: s.match_index,
    player_ids: s.players,
    winner: null,
    created_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase.from("matches").insert(rows);
  return { data, error };
}

export async function fetchMatchesForDate(dateStr) {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("match_date", dateStr)
    .order("match_index", { ascending: true });
  return { data, error };
}

export async function recordTeamWinner(matchId, winnerPlayerIds) {
  const { data, error } = await supabase.rpc("record_team_winner", {
    p_match_id: matchId,
    p_winner_ids: winnerPlayerIds,
  });
  return { data, error };
}

export async function recordSingleWinner(matchId, winnerPlayerId) {
  const { data, error } = await supabase.rpc("record_match_result", {
    p_match_id: matchId,
    p_winner_id: winnerPlayerId,
  });
  return { data, error };
}

export async function undoWinner(matchId) {
  const { data, error } = await supabase.rpc("undo_match_result", {
    p_match_id: matchId,
  });
  return { data, error };
}

export async function fetchPairingHistoryMap() {
  const { data, error } = await supabase.from("pairing_history").select("*");
  if (error) throw error;
  const map = new Map();
  data.forEach((r) => map.set(`${r.player_a}|${r.player_b}`, r.pair_count));
  return map;
}

export async function fetchOpponentHistoryMap() {
  const { data, error } = await supabase.from("opponent_history").select("*");
  if (error) throw error;
  const map = new Map();
  data.forEach((r) => map.set(`${r.player_a}|${r.player_b}`, r.opp_count));
  return map;
}

export async function fetchPlayers() {
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .order("name", { ascending: true });
  return { data, error };
}

export async function fetchPlayerTotals() {
  const { data, error } = await supabase
    .from("player_totals")
    .select("*")
    .order("total_points", { ascending: false });
  return { data, error };
}
