// src/utils/scheduler.js
// Fair, randomized scheduler for doubles matches (2v2).
// Adds option `noDoubleRest` that guarantees no player rests twice before everyone has rested once.
//
// Options:
// - players: array of player ids (uuids)
// - courts: number of courts (1 or more)
// - matchesPerCourt: how many rounds per court
// - pairingHistory: Map keyed "a|b" -> pair_count (teammates frequency)
// - opponentHistory: Map keyed "a|b" -> opp_count (opponent frequency)
// - date: string 'YYYY-MM-DD' used as part of seed (optional)
// - randomize: boolean (default true) => multiple Generate clicks produce different schedules
// - noDoubleRest: boolean (default false) => enforce the "everyone rests once before any player rests twice" constraint
//
// Example:
// generateSchedule({ players, courts:2, matchesPerCourt:5, pairingHistory, opponentHistory, date: '2025-09-20', randomize:true, noDoubleRest:true })
//
// Returns: [ { match_index, round, court, players: [p1,p2,p3,p4] }, ... ]

/* ---------- seeded RNG helpers (Mulberry32) ---------- */
function hashStringToSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- utility helpers ---------- */
function canonicalPairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
function seededShuffle(array, rng) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function teammatePenalty(a, b, pairingMap) {
  const key = canonicalPairKey(a, b);
  const cnt = pairingMap.get(key) || 0;
  return cnt * cnt; // square to emphasize repeated teammates
}
function opponentPenalty(a, b, opponentMap) {
  const key = canonicalPairKey(a, b);
  const cnt = opponentMap.get(key) || 0;
  return cnt;
}

/* ---------- main generator ---------- */
export function generateSchedule({
  players,
  courts = 1,
  matchesPerCourt = 5,
  pairingHistory = new Map(),
  opponentHistory = new Map(),
  date = new Date().toISOString().slice(0, 10),
  randomize = true,
  noDoubleRest = false,
} = {}) {
  if (!Array.isArray(players))
    throw new Error("players must be an array of ids");
  const P = players.length;
  if (P < 2) return [];
  if (P < 4) return []; // not enough players for doubles

  // RNG setup
  const entropy = randomize
    ? `${Date.now()}-${Math.floor(Math.random() * 1e9)}`
    : "";
  const seedStr = `${date}::${entropy}`;
  const seed = hashStringToSeed(seedStr);
  const rng = mulberry32(seed);

  // Start ordering
  let baseOrder = seededShuffle(players, rng);

  const totalMatches = Math.max(
    0,
    Math.floor(courts) * Math.floor(matchesPerCourt)
  );
  if (totalMatches <= 0) return [];

  // track usage
  const playCount = {};
  baseOrder.forEach((p) => (playCount[p] = 0));

  const restCount = {};
  baseOrder.forEach((p) => (restCount[p] = 0));

  // Track pair usage *within this generated schedule* to discourage immediate repeats
  const pairUsage = new Map(); // key: canonicalPairKey(a,b) -> count in generated matches
  // Track matchup usage (teamAKey|teamBKey) within this generated schedule
  const matchupUsage = new Map(); // key: `${teamAKey}|${teamBKey}` canonical -> count

  function allHaveRestedOnce() {
    return baseOrder.every((p) => restCount[p] >= 1);
  }
  function resetRestCycle() {
    baseOrder.forEach((p) => (restCount[p] = 0));
  }

  const matches = [];
  let matchIndex = 1;
  const roundsNeeded = Math.ceil(totalMatches / courts);

  for (let round = 0; round < roundsNeeded; round++) {
    const buildPool = () =>
      baseOrder.slice().sort((a, b) => {
        if (noDoubleRest && restCount[a] !== restCount[b])
          return restCount[a] - restCount[b];
        if (playCount[a] !== playCount[b]) return playCount[a] - playCount[b];
        return rng() < 0.5 ? -1 : 1;
      });

    const assignedInRound = new Set();

    for (let court = 1; court <= courts; court++) {
      if (matches.length >= totalMatches) break;

      const poolSorted = buildPool().filter((p) => !assignedInRound.has(p));

      if (poolSorted.length < 4) {
        // fallback: take top unique from baseOrder
        const fallback = [];
        for (const p of baseOrder) {
          if (!fallback.includes(p)) fallback.push(p);
          if (fallback.length >= 4) break;
        }
        if (fallback.length < 4) break;
        const finalGroup = fallback.slice(0, 4);
        finalGroup.forEach((p) => {
          assignedInRound.add(p);
          playCount[p] = (playCount[p] || 0) + 1;
        });
        // record and update pair/match usage
        matches.push({
          match_index: matchIndex++,
          round: round + 1,
          court,
          players: finalGroup,
        });
        // increment pair usage
        const [a, b, c, d] = finalGroup;
        pairUsage.set(
          canonicalPairKey(a, b),
          (pairUsage.get(canonicalPairKey(a, b)) || 0) + 1
        );
        pairUsage.set(
          canonicalPairKey(c, d),
          (pairUsage.get(canonicalPairKey(c, d)) || 0) + 1
        );
        // matchup usage
        const teamAKey = canonicalPairKey(a, b);
        const teamBKey = canonicalPairKey(c, d);
        const matchKey =
          teamAKey < teamBKey
            ? `${teamAKey}|${teamBKey}`
            : `${teamBKey}|${teamAKey}`;
        matchupUsage.set(matchKey, (matchupUsage.get(matchKey) || 0) + 1);
        continue;
      }

      // ---- Selection strategy with new pair/match usage penalties ----

      // pick first among top-k
      const FIRST_POOL = Math.min(3, poolSorted.length);
      const first = poolSorted[Math.floor(rng() * FIRST_POOL)];

      // pick second (teammate) with scoring that includes:
      // - historical pairing (pairingHistory)
      // - current pairUsage (strong penalty)
      // - playCount, restCount
      const afterFirst = poolSorted.filter((p) => p !== first);
      let bestSeconds = [];
      let bestSecondScore = Infinity;
      for (const cand of afterFirst) {
        const basePenalty = teammatePenalty(first, cand, pairingHistory) * 10;
        const localPairPenalty =
          (pairUsage.get(canonicalPairKey(first, cand)) || 0) * 80; // strong local penalty
        const score =
          basePenalty +
          localPairPenalty +
          (playCount[cand] || 0) * 2 +
          (noDoubleRest ? (restCount[cand] || 0) * 5 : 0) +
          rng() * 1.5;
        if (score < bestSecondScore) {
          bestSecondScore = score;
          bestSeconds = [cand];
        } else if (score === bestSecondScore) {
          bestSeconds.push(cand);
        }
      }
      const second = bestSeconds[Math.floor(rng() * bestSeconds.length)];

      // pick third: candidate from pool excluding first/second
      const afterSecond = afterFirst.filter((p) => p !== second);
      let bestThirds = [];
      let bestThirdScore = Infinity;
      const teamAKey = canonicalPairKey(first, second);
      for (const cand of afterSecond) {
        // opponentHistory penalizes repeated opponents historically
        const baseOppPenalty =
          (opponentPenalty(first, cand, opponentHistory) +
            opponentPenalty(second, cand, opponentHistory)) *
          10;
        // also penalize if this candidate would create repeated team-vs-team matchup with existing teams in matches
        // We'll approximate matchup penalty by checking how often cand has been on the other side vs teamAKey in this generated schedule:
        let matchupPenaltyLocal = 0;
        // iterate existing matchups to compute how often teamAKey faced the player cand's pair (approx)
        // We will check pairUsage of pairs involving cand and matchups toward teamAKey via matchupUsage (approx)
        // Simpler: penalize if cand has teamed previously with any player who already faced teamAKey in this schedule
        matchupPenaltyLocal +=
          (pairUsage.get(canonicalPairKey(cand, first)) || 0) * 8;
        matchupPenaltyLocal +=
          (pairUsage.get(canonicalPairKey(cand, second)) || 0) * 8;

        const score =
          baseOppPenalty +
          matchupPenaltyLocal +
          (playCount[cand] || 0) * 2 +
          (noDoubleRest ? (restCount[cand] || 0) * 5 : 0) +
          rng() * 1.5;
        if (score < bestThirdScore) {
          bestThirdScore = score;
          bestThirds = [cand];
        } else if (score === bestThirdScore) {
          bestThirds.push(cand);
        }
      }
      const third = bestThirds[Math.floor(rng() * bestThirds.length)];

      // pick fourth (teammate for third) - include pairUsage penalty for that teammate
      const afterThird = afterSecond.filter((p) => p !== third);
      let bestFourths = [];
      let bestFourthScore = Infinity;
      for (const cand of afterThird) {
        const basePenalty = teammatePenalty(third, cand, pairingHistory) * 10;
        const localPairPenalty =
          (pairUsage.get(canonicalPairKey(third, cand)) || 0) * 80;
        // also penalize if this candidate would create repeated matchup with teamAKey
        const teamBKeyCandidate = canonicalPairKey(third, cand);
        const matchKeyCandidate =
          teamAKey < teamBKeyCandidate
            ? `${teamAKey}|${teamBKeyCandidate}`
            : `${teamBKeyCandidate}|${teamAKey}`;
        const matchupLocalPenalty =
          (matchupUsage.get(matchKeyCandidate) || 0) * 120; // prefer new matchups strongly
        const score =
          basePenalty +
          localPairPenalty +
          matchupLocalPenalty +
          (opponentPenalty(first, cand, opponentHistory) +
            opponentPenalty(second, cand, opponentHistory)) *
            8 +
          (playCount[cand] || 0) * 2 +
          (noDoubleRest ? (restCount[cand] || 0) * 5 : 0) +
          rng() * 1.5;
        if (score < bestFourthScore) {
          bestFourthScore = score;
          bestFourths = [cand];
        } else if (score === bestFourthScore) {
          bestFourths.push(cand);
        }
      }
      const fourth = bestFourths[Math.floor(rng() * bestFourths.length)];

      // assemble group and ensure distinctness; fallback fill if necessary
      let group = [first, second, third, fourth];
      let uniq = [...new Set(group)].slice(0, 4);
      if (uniq.length < 4) {
        for (const p of poolSorted) {
          if (!uniq.includes(p)) uniq.push(p);
          if (uniq.length >= 4) break;
        }
      }
      if (uniq.length < 4) {
        for (const p of baseOrder) {
          if (!uniq.includes(p)) uniq.push(p);
          if (uniq.length >= 4) break;
        }
      }
      if (uniq.length < 4) break;

      // try a couple arrangements to reduce penalty
      function arrangementPenalty(arr) {
        const [a, b, c, d] = arr;
        let p = 0;
        p += teammatePenalty(a, b, pairingHistory) * 10;
        p += teammatePenalty(c, d, pairingHistory) * 10;
        p += opponentPenalty(a, c, opponentHistory);
        p += opponentPenalty(a, d, opponentHistory);
        p += opponentPenalty(b, c, opponentHistory);
        p += opponentPenalty(b, d, opponentHistory);
        p +=
          (playCount[a] || 0) +
          (playCount[b] || 0) +
          (playCount[c] || 0) +
          (playCount[d] || 0);
        if (noDoubleRest) {
          p +=
            ((restCount[a] || 0) +
              (restCount[b] || 0) +
              (restCount[c] || 0) +
              (restCount[d] || 0)) *
            2;
        }
        // local pair usage penalties - prefer pairs that haven't been used
        p += (pairUsage.get(canonicalPairKey(a, b)) || 0) * 80;
        p += (pairUsage.get(canonicalPairKey(c, d)) || 0) * 80;
        // local matchup penalty if teamA vs teamB already used
        const teamAKeyLocal = canonicalPairKey(a, b);
        const teamBKeyLocal = canonicalPairKey(c, d);
        const matchKeyLocal =
          teamAKeyLocal < teamBKeyLocal
            ? `${teamAKeyLocal}|${teamBKeyLocal}`
            : `${teamBKeyLocal}|${teamAKeyLocal}`;
        p += (matchupUsage.get(matchKeyLocal) || 0) * 120;
        return p;
      }

      const orig = uniq.slice(0, 4);
      const try1 = [orig[0], orig[2], orig[1], orig[3]];
      const try2 = [orig[0], orig[3], orig[2], orig[1]];
      const candArrangements = [orig, try1, try2];
      let bestArr = null;
      let bestScore = Infinity;
      const tied = [];
      for (const arr of candArrangements) {
        const sc = arrangementPenalty(arr);
        if (sc < bestScore) {
          bestScore = sc;
          tied.length = 0;
          tied.push(arr);
        } else if (sc === bestScore) tied.push(arr);
      }
      bestArr = tied[Math.floor(rng() * tied.length)];
      const finalGroup = bestArr.slice(0, 4);

      // choose court balancing counts
      /**const courtCounts = new Array(courts).fill(0);
      for (const m of matches) courtCounts[m.court - 1]++;
      const minCount = Math.min(...courtCounts);
      const candidateCourts = [];
      for (let ci = 0; ci < courts; ci++) {
        if (courtCounts[ci] === minCount) candidateCourts.push(ci + 1);
      }
      const chosenCourt =
        candidateCourts[Math.floor(rng() * candidateCourts.length)];**/

      // --- NEW deterministic court assignment ---
      const chosenCourt = court; // use the loop index (1..courts) so each round assigns courts in ascending order

      // record match
      matches.push({
        match_index: matchIndex++,
        round: round + 1,
        court: chosenCourt,
        players: finalGroup,
      });

      // mark assigned and update playCount
      finalGroup.forEach((p) => {
        assignedInRound.add(p);
        playCount[p] = (playCount[p] || 0) + 1;
      });

      // update pairUsage and matchupUsage (important new step)
      const [a, b, c, d] = finalGroup;
      const team1 = canonicalPairKey(a, b);
      const team2 = canonicalPairKey(c, d);

      pairUsage.set(team1, (pairUsage.get(team1) || 0) + 1);
      pairUsage.set(team2, (pairUsage.get(team2) || 0) + 1);

      const mk = team1 < team2 ? `${team1}|${team2}` : `${team2}|${team1}`;
      matchupUsage.set(mk, (matchupUsage.get(mk) || 0) + 1);

      // mutate baseOrder to push just-played players toward tail so resting players surface
      const justPlayedSet = new Set(finalGroup);
      const newOrder = [];
      const tail = [];
      for (const p of baseOrder) {
        if (justPlayedSet.has(p)) tail.push(p);
        else newOrder.push(p);
      }
      baseOrder = newOrder.concat(tail);

      // occasional random swaps
      for (let s = 0; s < Math.min(3, baseOrder.length); s++) {
        const i = Math.floor(rng() * baseOrder.length);
        const j = Math.floor(rng() * baseOrder.length);
        const tmp = baseOrder[i];
        baseOrder[i] = baseOrder[j];
        baseOrder[j] = tmp;
      }
    } // end courts loop

    // After the round: update rest counts for noDoubleRest
    if (noDoubleRest) {
      for (const p of baseOrder) {
        if (!assignedInRound.has(p)) restCount[p] = (restCount[p] || 0) + 1;
      }
      if (allHaveRestedOnce()) {
        resetRestCycle();
      }
    }

    if (matches.length >= totalMatches) break;
  } // end rounds loop

  return matches.slice(0, totalMatches);
}
