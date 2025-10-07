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
  // Call the existing RPC 'player_totals_by_date' (p_date argument)
  const { data, error } = await supabase.rpc("player_totals_for_date", {
    p_date: dateStr,
  });
  return { data, error };
}

export async function fetchPlayerTotalsOverall() {
  const { data, error } = await supabase.rpc("player_totals_overall");
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

// Simple client-side createManualMatch (non-transactional, simple flow)
// params:
//  - matchDate: 'YYYY-MM-DD' (string) or Date
//  - court: integer or null/empty -> defaults to 1 (to satisfy NOT NULL)
//  - playerIds: array of 4 player uuids (order: A1, A2, B1, B2)
// returns: { data, error } where data is { match, scores }
export async function createManualMatch({
  matchDate,
  court = null,
  playerIds = [],
} = {}) {
  // normalize date string
  const dateStr =
    matchDate instanceof Date
      ? matchDate.toISOString().slice(0, 10)
      : matchDate;

  // Basic validation
  if (!dateStr) {
    return { data: null, error: new Error("matchDate is required") };
  }
  if (!Array.isArray(playerIds) || playerIds.length < 4) {
    return {
      data: null,
      error: new Error("playerIds must be an array of 4 ids"),
    };
  }

  try {
    // 1) compute next match_index for that date (use MAX(match_index) + 1)
    // If no rows exist for that date, single() may return an error from PostgREST; handle gracefully.
    let nextIndex = 1;
    try {
      const resp = await supabase
        .from("matches")
        .select("match_index")
        .eq("match_date", dateStr)
        .order("match_index", { ascending: false })
        .limit(1)
        .maybeSingle(); // maybeSingle avoids throwing when no rows
      if (resp.error) {
        // log but don't necessarily fail; we'll default nextIndex = 1
        console.warn(
          "createManualMatch: error reading max match_index:",
          resp.error
        );
      } else if (resp.data && typeof resp.data.match_index === "number") {
        nextIndex = resp.data.match_index + 1;
      }
    } catch (err) {
      // fallback: leave nextIndex = 1
      console.warn("createManualMatch: reading max index failed, using 1", err);
    }

    // 2) choose court default if not provided (your DB had court NOT NULL)
    const courtVal = court === null || court === "" ? 1 : Number(court);

    // 3) insert into matches
    const matchRow = {
      match_date: dateStr,
      court: courtVal,
      match_index: nextIndex,
      player_ids: playerIds,
      winner: null,
      created_at: new Date().toISOString(),
    };

    const { data: insertedMatches, error: insertMatchErr } = await supabase
      .from("matches")
      .insert(matchRow)
      .select("*");

    if (insertMatchErr) {
      console.error(
        "createManualMatch: failed to insert match:",
        insertMatchErr
      );
      return { data: null, error: insertMatchErr };
    }

    const insertedMatch = Array.isArray(insertedMatches)
      ? insertedMatches[0]
      : insertedMatches;

    if (!insertedMatch || !insertedMatch.id) {
      return { data: null, error: new Error("Failed to insert match row") };
    }

    // 4) insert initial scores rows for each player (points=0, is_win=false)
    const scoresRows = playerIds.map((pid) => ({
      match_id: insertedMatch.id,
      player_id: pid,
      points: 0,
      is_win: false,
      recorded_at: new Date().toISOString(),
    }));

    const { data: insertedScores, error: insertScoresErr } = await supabase
      .from("scores")
      .insert(scoresRows)
      .select("*");

    if (insertScoresErr) {
      console.error(
        "createManualMatch: failed to insert scores:",
        insertScoresErr
      );
      // Try best-effort cleanup of the match row to avoid dangling match with no scores.
      try {
        await supabase.from("matches").delete().eq("id", insertedMatch.id);
      } catch (cleanupErr) {
        console.warn(
          "createManualMatch: failed cleanup after scores error:",
          cleanupErr
        );
      }
      return { data: null, error: insertScoresErr };
    }

    // success: return the inserted match row and scores
    return {
      data: { match: insertedMatch, scores: insertedScores },
      error: null,
    };
  } catch (err) {
    console.error("createManualMatch: unexpected error", err);
    return { data: null, error: err };
  }
}
