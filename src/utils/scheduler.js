// src/utils/scheduler.js
export function canonicalPairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function generateAllTeams(players) {
  const teams = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      teams.push({
        id: `${players[i]}|${players[j]}`,
        players: [players[i], players[j]],
      });
    }
  }
  return teams;
}

export function generateAllTeamMatches(teams) {
  const matches = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const t1 = teams[i];
      const t2 = teams[j];
      const set = new Set([...t1.players, ...t2.players]);
      if (set.size === 4) {
        matches.push({
          teamA: t1.id,
          teamB: t2.id,
          players: [...t1.players, ...t2.players],
          key: `${t1.id}__${t2.id}`,
        });
      }
    }
  }
  return matches;
}

export function weightMatch(
  match,
  pairingHistory = new Map(),
  opponentHistory = new Map()
) {
  const [a1, a2] = match.teamA.split("|");
  const [b1, b2] = match.teamB.split("|");
  const teammatePairs = [
    [a1, a2],
    [b1, b2],
  ];
  let penalty = 0;
  for (const [x, y] of teammatePairs) {
    const k = canonicalPairKey(x, y);
    penalty += (pairingHistory.get(k) || 0) * 100;
  }
  const cross = [
    [a1, b1],
    [a1, b2],
    [a2, b1],
    [a2, b2],
  ];
  for (const [x, y] of cross) {
    const k = canonicalPairKey(x, y);
    penalty += (opponentHistory.get(k) || 0) * 10;
  }
  penalty += match.teamA.localeCompare(match.teamB) > 0 ? 0.1 : 0;
  return penalty;
}

export function generateSchedule({
  players,
  courts = 1,
  matchesPerCourt = 5,
  pairingHistory = new Map(),
  opponentHistory = new Map(),
}) {
  if (!Array.isArray(players) || players.length < 4) return [];

  const totalMatches = courts * matchesPerCourt;
  const teams = generateAllTeams(players);
  let allMatches = generateAllTeamMatches(teams);

  allMatches = allMatches.map((m) => ({
    ...m,
    weight: weightMatch(m, pairingHistory, opponentHistory),
    _scheduled: false,
  }));

  allMatches.sort((a, b) => a.weight - b.weight);

  const scheduled = [];
  let matchIndex = 1;
  let round = 1;
  let offset = 0;
  const candidates = allMatches;

  while (scheduled.length < totalMatches) {
    const usedThisRound = new Set();
    const chosenThisRound = [];

    for (
      let i = 0;
      i < candidates.length && chosenThisRound.length < courts;
      i++
    ) {
      const idx = (offset + i) % candidates.length;
      const cand = candidates[idx];
      if (cand._scheduled) continue;
      if (cand.players.some((p) => usedThisRound.has(p))) continue;
      const dup = scheduled.find((s) =>
        cand.players.every((p) => s.players.includes(p))
      );
      if (dup) continue;

      cand._scheduled = true;
      chosenThisRound.push(cand);
      cand.players.forEach((p) => usedThisRound.add(p));
    }

    if (chosenThisRound.length === 0) {
      const next = candidates.find((m) => !m._scheduled);
      if (!next) break;
      next._scheduled = true;
      chosenThisRound.push(next);
    }

    for (let i = 0; i < chosenThisRound.length; i++) {
      const m = chosenThisRound[i];
      scheduled.push({
        id: `m_${matchIndex}`,
        players: [...m.players],
        teamA: m.teamA,
        teamB: m.teamB,
        court: i + 1,
        match_index: matchIndex,
        round,
      });
      matchIndex++;
      if (scheduled.length >= totalMatches) break;
    }

    round++;
    offset++;

    if (offset > candidates.length * 4) {
      const remaining = candidates.filter((m) => !m._scheduled);
      for (const m of remaining) {
        if (scheduled.length >= totalMatches) break;
        m._scheduled = true;
        scheduled.push({
          id: `m_${matchIndex}`,
          players: [...m.players],
          teamA: m.teamA,
          teamB: m.teamB,
          court: (scheduled.length % courts) + 1,
          match_index: matchIndex,
          round,
        });
        matchIndex++;
      }
      break;
    }
  }

  return scheduled.slice(0, totalMatches);
}
