// src/utils/assignments.js
export function generateAssignments(
  players,
  courts,
  numMatches,
  matchDate,
  pairCounts = {},
  oppCounts = {},
  attempts = 400
) {
  const playersPerMatch = 4;
  if (!Array.isArray(players) || players.length === 0)
    return { assignments: [], rest: [], chosenScore: Infinity };

  const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  function lastPlayedKey(p) {
    if (!p.last_played) return new Date(0).getTime();
    return new Date(p.last_played).getTime();
  }

  const baseSorted = [...players].sort(
    (a, b) => lastPlayedKey(a) - lastPlayedKey(b)
  );
  const required = playersPerMatch * courts * numMatches;
  const actualSlots = Math.min(baseSorted.length, required);
  const restBase = baseSorted.slice(actualSlots);

  let best = { assignments: [], rest: restBase, score: Infinity };
  const rng = () => Math.random();

  function scoreForAssignments(assignments) {
    let s = 0;
    for (const a of assignments) {
      const ids = (a.players || []).map((p) => p.id).filter(Boolean);
      // teammate pairs weighted higher
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const k = pairKey(ids[i], ids[j]);
          s += (pairCounts[k] || 0) * 2;
        }
      }
      // opponents
      if (ids.length === 4) {
        const teamA = [ids[0], ids[1]];
        const teamB = [ids[2], ids[3]];
        for (const aId of teamA) {
          for (const bId of teamB) {
            const k2 = pairKey(aId, bId);
            s += (oppCounts[k2] || 0) * 1;
          }
        }
      }
    }
    return s;
  }

  for (let attempt = 0; attempt < attempts; attempt++) {
    const shuffled = [...baseSorted];
    for (let i = 0; i < shuffled.length; i++) {
      if (rng() < 0.12) {
        const j = Math.floor(rng() * shuffled.length);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
    }

    const taken = shuffled.slice(0, actualSlots);
    const rest = shuffled.slice(actualSlots);

    const assignments = [];
    let idx = 0;
    for (let m = 0; m < numMatches; m++) {
      for (let c = 1; c <= courts; c++) {
        const group = taken.slice(idx, idx + playersPerMatch);
        if (group.length < playersPerMatch) break;
        assignments.push({
          match_index: m + 1,
          court: c,
          players: group,
          player_ids: group.map((p) => p.id),
          match_date: matchDate,
        });
        idx += playersPerMatch;
      }
    }

    const sc = scoreForAssignments(assignments);
    const lastPlayedAvg =
      assignments.length === 0
        ? 0
        : assignments.reduce(
            (acc, a) =>
              acc +
              a.players.reduce((acc2, p) => acc2 + lastPlayedKey(p), 0) /
                a.players.length,
            0
          ) / assignments.length;
    const tieScore = sc + lastPlayedAvg * 1e-12;

    if (tieScore < best.score) {
      best = { assignments, rest, score: tieScore };
      if (sc === 0) break;
    }
  }

  return {
    assignments: best.assignments,
    rest: best.rest,
    chosenScore: best.score,
  };
}
