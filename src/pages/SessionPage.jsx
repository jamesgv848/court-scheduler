import React from "react";
import { supabase } from "../supabaseClient";
import ConfirmModal from "../components/ConfirmModal";

export default function SessionPage() {
  const [matches, setMatches] = React.useState([]);
  const [playerMap, setPlayerMap] = React.useState({});
  const [loading, setLoading] = React.useState(false);

  const [confirm, setConfirm] = React.useState({
    open: false,
    type: "",
    matchId: null,
    payload: null,
    name: "",
  });

  React.useEffect(() => {
    fetchPlayers();
    fetchMatches();
    const unsub = subscribe();
    return () => {
      if (unsub) unsub();
    };
  }, []);

  async function fetchPlayers() {
    const { data, error } = await supabase.from("players").select("id,name");
    if (error) return console.error(error);
    const map = {};
    (data || []).forEach((p) => (map[p.id] = p.name));
    setPlayerMap(map);
  }

  async function fetchMatches() {
    const { data, error } = await supabase
      .from("matches")
      .select("*")
      .order("match_date", { ascending: true })
      .order("match_index", { ascending: true });
    if (error) return console.error(error);
    setMatches(data || []);
  }

  function subscribe() {
    const ch = supabase
      .channel("public:matches")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => {
          fetchMatches();
          fetchPlayers();
        }
      )
      .subscribe();
    return () => ch.unsubscribe();
  }

  function askSingleWinner(matchId, playerId) {
    setConfirm({
      open: true,
      type: "single",
      matchId,
      payload: playerId,
      name: playerMap[playerId] || playerId,
    });
  }

  async function doRecordSingle() {
    setLoading(true);
    const matchId = confirm.matchId;
    const winnerId = confirm.payload;
    const { error } = await supabase.rpc("record_match_result", {
      p_match_id: matchId,
      p_winner_id: winnerId,
    });
    setLoading(false);
    if (error) return alert("Failed: " + error.message);
    setConfirm({
      open: false,
      type: "",
      matchId: null,
      payload: null,
      name: "",
    });
    fetchMatches();
  }

  function askTeamWinner(matchId, winnerIds, teamLabel) {
    setConfirm({
      open: true,
      type: "team",
      matchId,
      payload: winnerIds,
      name: teamLabel,
    });
  }

  async function doRecordTeam() {
    setLoading(true);
    const matchId = confirm.matchId;
    const winnerIds = confirm.payload;
    const { error } = await supabase.rpc("record_team_winner", {
      p_match_id: matchId,
      p_winner_ids: winnerIds,
    });
    setLoading(false);
    if (error) return alert("Failed: " + error.message);
    setConfirm({
      open: false,
      type: "",
      matchId: null,
      payload: null,
      name: "",
    });
    fetchMatches();
  }

  function askUndo(matchId) {
    setConfirm({ open: true, type: "undo", matchId, payload: null, name: "" });
  }

  async function doUndo() {
    setLoading(true);
    const matchId = confirm.matchId;
    const { error } = await supabase.rpc("undo_match_result", {
      p_match_id: matchId,
    });
    setLoading(false);
    if (error) return alert("Failed to undo: " + error.message);
    setConfirm({
      open: false,
      type: "",
      matchId: null,
      payload: null,
      name: "",
    });
    fetchMatches();
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Session — Matches</h2>
      {matches.length === 0 ? (
        <div className="p-6 bg-white rounded shadow text-center text-gray-500">
          No matches scheduled.
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map((m) => {
            const pids = m.player_ids || [];
            const teamA = pids.slice(0, 2);
            const teamB = pids.slice(2, 4);
            return (
              <div
                key={m.id}
                className="bg-white rounded shadow p-4 flex flex-col md:flex-row md:items-center md:justify-between"
              >
                <div className="md:flex-1">
                  <div className="text-sm text-gray-500">
                    Date: {m.match_date} • Court: {m.court} • Match #
                    {m.match_index}
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-gray-400">Team A</div>
                      <div className="mt-1 flex gap-2 flex-wrap">
                        {teamA.length ? (
                          teamA.map((pid) => (
                            <span
                              key={pid}
                              className="px-3 py-1 rounded bg-gray-100 border"
                            >
                              {playerMap[pid] ?? pid}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400">Team B</div>
                      <div className="mt-1 flex gap-2 flex-wrap">
                        {teamB.length ? (
                          teamB.map((pid) => (
                            <span
                              key={pid}
                              className="px-3 py-1 rounded bg-gray-100 border"
                            >
                              {playerMap[pid] ?? pid}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 md:mt-0 md:flex md:items-center md:gap-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => askTeamWinner(m.id, teamA, "Team A")}
                      disabled={!teamA.length || teamA.length < 2}
                      className="px-3 py-1 bg-primary text-white rounded"
                    >
                      Team A wins
                    </button>
                    <button
                      onClick={() => askTeamWinner(m.id, teamB, "Team B")}
                      disabled={!teamB.length || teamB.length < 2}
                      className="px-3 py-1 bg-primary text-white rounded"
                    >
                      Team B wins
                    </button>

                    {pids.map((pid) => (
                      <button
                        key={pid}
                        onClick={() => askSingleWinner(m.id, pid)}
                        className="px-3 py-1 border rounded bg-white text-sm"
                      >
                        {playerMap[pid] ?? pid}
                      </button>
                    ))}
                  </div>

                  <div className="ml-4 text-sm text-primary font-medium">
                    {m.winner
                      ? `Recorded: ${playerMap[m.winner] ?? m.winner}`
                      : "Not decided"}
                  </div>

                  {m.winner && (
                    <button
                      onClick={() => askUndo(m.id)}
                      className="ml-3 px-3 py-1 border rounded text-sm text-red-600"
                    >
                      Undo result
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={confirm.open}
        title={
          confirm.type === "single"
            ? "Record winner?"
            : confirm.type === "team"
            ? "Record team winner?"
            : "Undo result?"
        }
        message={
          confirm.type === "single"
            ? `Are you sure you want to set ${confirm.name} as the winner?`
            : confirm.type === "team"
            ? `Are you sure you want to record ${confirm.name} as the winning team? Each player on the team will receive 1 point.`
            : "Are you sure you want to undo the recorded result for this match? This will remove the point(s)."
        }
        confirmLabel={confirm.type === "undo" ? "Undo" : "Yes"}
        cancelLabel="Cancel"
        loading={loading}
        onCancel={() =>
          setConfirm({
            open: false,
            type: "",
            matchId: null,
            payload: null,
            name: "",
          })
        }
        onConfirm={
          confirm.type === "single"
            ? doRecordSingle
            : confirm.type === "team"
            ? doRecordTeam
            : doUndo
        }
      />
    </div>
  );
}
