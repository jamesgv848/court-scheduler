import React from "react";
import { supabase } from "../supabaseClient";

function colorForCount(count, max) {
  if (!count) return "#fff";
  const intensity = Math.min(1, count / Math.max(1, max));
  const r = Math.floor(255 - intensity * 150);
  const g = Math.floor(255 - intensity * 100);
  const b = Math.floor(255 - intensity * 50);
  return `rgb(${r},${g},${b})`;
}

export default function PairingHeatmap() {
  const [players, setPlayers] = React.useState([]);
  const [pairMap, setPairMap] = React.useState({ data: {}, max: 1 });
  const [oppMap, setOppMap] = React.useState({ data: {}, max: 1 });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const { data: playersData } = await supabase
        .from("players")
        .select("id,name")
        .order("name");
      setPlayers(playersData || []);

      const { data: pairData } = await supabase
        .from("pairing_history")
        .select("player_a,player_b,pair_count");
      const pairMapLocal = {};
      let maxPair = 0;
      (pairData || []).forEach((r) => {
        const key =
          r.player_a < r.player_b
            ? `${r.player_a}|${r.player_b}`
            : `${r.player_b}|${r.player_a}`;
        pairMapLocal[key] = r.pair_count || 0;
        if ((r.pair_count || 0) > maxPair) maxPair = r.pair_count || 0;
      });

      const { data: oppData } = await supabase
        .from("opponent_history")
        .select("player_a,player_b,opp_count");
      const oppMapLocal = {};
      let maxOpp = 0;
      (oppData || []).forEach((r) => {
        const key =
          r.player_a < r.player_b
            ? `${r.player_a}|${r.player_b}`
            : `${r.player_b}|${r.player_a}`;
        oppMapLocal[key] = r.opp_count || 0;
        if ((r.opp_count || 0) > maxOpp) maxOpp = r.opp_count || 0;
      });

      setPairMap({ data: pairMapLocal, max: maxPair || 1 });
      setOppMap({ data: oppMapLocal, max: maxOpp || 1 });
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Pairing Heatmaps</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded shadow p-4 overflow-auto">
          <h3 className="font-semibold mb-2">Teammate heatmap (pair_count)</h3>
          <table className="table-auto border-collapse border">
            <thead>
              <tr>
                <th className="sticky top-0 bg-white p-2">Player</th>
                {players.map((p) => (
                  <th key={p.id} className="p-2 sticky top-0 bg-white text-xs">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((row) => (
                <tr key={row.id}>
                  <td className="p-2 font-medium text-sm border">{row.name}</td>
                  {players.map((col) => {
                    const key =
                      row.id < col.id
                        ? `${row.id}|${col.id}`
                        : `${col.id}|${row.id}`;
                    const val = pairMap.data[key] || 0;
                    const bg = colorForCount(val, pairMap.max || 1);
                    return (
                      <td
                        key={col.id}
                        className="p-2 text-center border"
                        style={{ background: bg }}
                      >
                        {val}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded shadow p-4 overflow-auto">
          <h3 className="font-semibold mb-2">Opponent heatmap (opp_count)</h3>
          <table className="table-auto border-collapse border">
            <thead>
              <tr>
                <th className="sticky top-0 bg-white p-2">Player</th>
                {players.map((p) => (
                  <th key={p.id} className="p-2 sticky top-0 bg-white text-xs">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((row) => (
                <tr key={row.id}>
                  <td className="p-2 font-medium text-sm border">{row.name}</td>
                  {players.map((col) => {
                    const key =
                      row.id < col.id
                        ? `${row.id}|${col.id}`
                        : `${col.id}|${row.id}`;
                    const val = oppMap.data[key] || 0;
                    const bg = colorForCount(val, oppMap.max || 1);
                    return (
                      <td
                        key={col.id}
                        className="p-2 text-center border"
                        style={{ background: bg }}
                      >
                        {val}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
