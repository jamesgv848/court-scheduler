// src/api/supabase-actions.js
import { supabase } from "../supabaseClient";

export async function saveScheduleToDb(schedule, matchDate) {
  // Do NOT include the frontend id like "m_1" — let DB generate uuid
  const rows = schedule.map((s) => ({
    // id: omit this field so DB uses default gen_random_uuid()
    match_date:
      matchDate instanceof Date
        ? matchDate.toISOString().slice(0, 10)
        : matchDate,
    court: s.court,
    match_index: s.match_index,
    player_ids: s.players, // array of uuids
    winner: null,
    created_at: new Date().toISOString(),
  }));

  const { data, error } = await supabase
    .from("matches")
    .insert(rows)
    .select("*");
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

// fetch overall totals (existing view player_totals assumed)
export async function fetchPlayerTotals(overall = true) {
  if (overall) {
    const { data, error } = await supabase
      .from("player_totals")
      .select("*")
      .order("total_points", { ascending: false });
    return { data, error };
  } else {
    // fetch all players ordered by name if overall==false without date: still return zeroes
    const { data, error } = await supabase
      .from("players")
      .select("id, name")
      .order("name", { ascending: true });
    return { data, error };
  }
}

// fetch totals for a single date using RPC
export async function fetchPlayerTotalsByDate(dateStr) {
  // dateStr should be 'YYYY-MM-DD' or null
  const { data, error } = await supabase.rpc("player_totals_by_date", {
    p_date: dateStr,
  });
  return { data, error };
}

export function subscribeToScores(onChange) {
  return supabase
    .channel("public:scores")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "scores" },
      onChange
    )
    .subscribe();
}

// NEW: totals for a specific date (points recorded_at on that date)
// returns rows: { player_id, name, points_on_date }
export async function fetchPlayerTotalsForDate(dateStr) {
  // dateStr is 'YYYY-MM-DD'
  const { data, error } = await supabase.rpc("player_totals_for_date", {
    p_date: dateStr,
  });
  // If you prefer a SQL SELECT instead of RPC, use supabase.from('scores').select(...) with aggregate,
  // but using an RPC keeps SQL tidy (RPC DDL below if needed).
  return { data, error };
}

export async function deleteScheduleForDate(dateStr) {
  // 1) fetch match ids for date
  const { data: matches, error: fetchErr } = await supabase
    .from("matches")
    .select("id")
    .eq("match_date", dateStr);

  if (fetchErr) return { data: null, error: fetchErr };

  const ids = (matches || []).map((r) => r.id);
  if (ids.length === 0) return { data: [], error: null };

  // 2) delete scores for those match ids (if any)
  const { error: delScoresErr } = await supabase
    .from("scores")
    .delete()
    .in("match_id", ids);

  if (delScoresErr) return { data: null, error: delScoresErr };

  // 3) delete matches for that date (by ids)
  const { data: deletedMatches, error: delMatchesErr } = await supabase
    .from("matches")
    .delete()
    .in("id", ids)
    .select("*"); // optional: return deleted rows

  return { data: deletedMatches, error: delMatchesErr };
}

// fetch pairing statistics (player UUID pairs with totals/wins/losses)
export async function fetchPairingStats() {
  const { data, error } = await supabase.rpc("pairing_stats");
  return { data, error };
}

export async function fetchPairingStatsSimple() {
  const { data, error } = await supabase.rpc("pairing_stats_simple");
  return { data, error };
}

// fetch pairs that have recorded results; optional startDate/endDate are 'YYYY-MM-DD' strings or null
export async function fetchPairingStatsRecorded(
  startDate = null,
  endDate = null
) {
  // note: parameter names must match RPC args (p_start, p_end)
  const { data, error } = await supabase.rpc("pairing_stats_recorded", {
    p_start: startDate,
    p_end: endDate,
  });
  return { data, error };
}
