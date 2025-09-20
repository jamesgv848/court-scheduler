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

  // If less than 4 players, we treat as insufficient for doubles (no matches)
  if (P < 4) return [];

  // Build a seed string. If randomize=true, include ephemeral entropy
  const entropy = randomize
    ? `${Date.now()}-${Math.floor(Math.random() * 1e9)}`
    : "";
  const seedStr = `${date}::${entropy}`;
  const seed = hashStringToSeed(seedStr);
  const rng = mulberry32(seed);

  // Start with a seeded shuffle so ordering is randomized each generate (or deterministic when randomize=false)
  let baseOrder = seededShuffle(players, rng);

  // Total matches requested
  const totalMatches = Math.max(
    0,
    Math.floor(courts) * Math.floor(matchesPerCourt)
  );
  if (totalMatches <= 0) return [];

  // track how many times each player has been assigned so far (play count)
  const playCount = {};
  baseOrder.forEach((p) => (playCount[p] = 0));

  // track rest counts for the "no double rest" cycle if enabled.
  // restCount increments when a player does NOT play in a given round (i.e., across all courts in that round).
  const restCount = {};
  baseOrder.forEach((p) => (restCount[p] = 0));
  // helper to check if all players have rested at least once in current cycle
  function allHaveRestedOnce() {
    return baseOrder.every((p) => restCount[p] >= 1);
  }
  // when cycle completes, reset restCount to zero for all
  function resetRestCycle() {
    baseOrder.forEach((p) => (restCount[p] = 0));
  }

  const matches = [];
  let matchIndex = 1;

  // We'll generate matches round-by-round. For double-rest constraint, we update restCount at end of each round.
  const roundsNeeded = Math.ceil(totalMatches / courts);

  for (let round = 0; round < roundsNeeded; round++) {
    // For each round we will allocate up to `courts` matches.
    // Build pool sorted by:
    // 1) restCount ascending (so players who have rested less are chosen to play),
    // 2) playCount ascending (so players who played less are chosen),
    // 3) seeded random tie-breaker.
    const buildPool = () =>
      baseOrder.slice().sort((a, b) => {
        if (noDoubleRest && restCount[a] !== restCount[b])
          return restCount[a] - restCount[b];
        if (playCount[a] !== playCount[b]) return playCount[a] - playCount[b];
        return rng() < 0.5 ? -1 : 1;
      });

    // assignedInRound tracks players who got assigned in this round (so don't assign them twice in same round)
    const assignedInRound = new Set();

    // For each court in this round, pick a match
    for (let court = 1; court <= courts; court++) {
      // Stop if we've already reached totalMatches
      if (matches.length >= totalMatches) break;

      // Build current pool of available players (exclude already assigned this round)
      const poolSorted = buildPool().filter((p) => !assignedInRound.has(p));

      // If not enough distinct players remain for this court, try to allow reuse only if unavoidable
      if (poolSorted.length < 4) {
        // Try to assemble remaining players by taking from full baseOrder respecting uniqueness as much as possible
        const fallback = [];
        for (const p of baseOrder) {
          if (!fallback.includes(p)) fallback.push(p);
          if (fallback.length >= 4) break;
        }
        if (fallback.length < 4) {
          // cannot form more matches this round
          break;
        }
        // assign fallback
        const finalGroup = fallback.slice(0, 4);
        finalGroup.forEach((p) => {
          assignedInRound.add(p);
          playCount[p] = (playCount[p] || 0) + 1;
        });
        // record match
        matches.push({
          match_index: matchIndex++,
          round: round + 1,
          court,
          players: finalGroup,
        });
        continue;
      }

      // Normal greedy selection using the sorted pool
      // 1) pick first from top-K (introduce randomness among top few)
      const FIRST_POOL = Math.min(3, poolSorted.length);
      const first = poolSorted[Math.floor(rng() * FIRST_POOL)];

      // 2) pick second (teammate) minimizing teammatePenalty and preferring lower playCount/restCount
      const afterFirst = poolSorted.filter((p) => p !== first);
      let bestSeconds = [];
      let bestSecondScore = Infinity;
      for (const cand of afterFirst) {
        // weight factors: teammate penalty (from pairingHistory), playCount, restCount
        const score =
          teammatePenalty(first, cand, pairingHistory) * 10 +
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

      // 3) pick third minimizing opponent penalty vs team (first+second)
      const afterSecond = afterFirst.filter((p) => p !== second);
      let bestThirds = [];
      let bestThirdScore = Infinity;
      for (const cand of afterSecond) {
        const score =
          (opponentPenalty(first, cand, opponentHistory) +
            opponentPenalty(second, cand, opponentHistory)) *
            10 +
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

      // 4) pick fourth (teammate for third) minimizing teammate penalty + opponent penalties
      const afterThird = afterSecond.filter((p) => p !== third);
      let bestFourths = [];
      let bestFourthScore = Infinity;
      for (const cand of afterThird) {
        const score =
          teammatePenalty(third, cand, pairingHistory) * 10 +
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
        // fill with top items from poolSorted not already in uniq
        for (const p of poolSorted) {
          if (!uniq.includes(p)) uniq.push(p);
          if (uniq.length >= 4) break;
        }
      }
      if (uniq.length < 4) {
        // as a last resort, take from baseOrder
        for (const p of baseOrder) {
          if (!uniq.includes(p)) uniq.push(p);
          if (uniq.length >= 4) break;
        }
      }
      if (uniq.length < 4) break; // cannot form a valid match

      // local swap attempts to reduce penalties (same logic as before)
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
          // penalize selecting high-rest players if that would violate cycle constraints (we'll prefer low-rest players)
          p +=
            ((restCount[a] || 0) +
              (restCount[b] || 0) +
              (restCount[c] || 0) +
              (restCount[d] || 0)) *
            2;
        }
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

      // assign this match to a court balancing counts
      const courtCounts = new Array(courts).fill(0);
      for (const m of matches) courtCounts[m.court - 1]++;
      const minCount = Math.min(...courtCounts);
      const candidateCourts = [];
      for (let ci = 0; ci < courts; ci++) {
        if (courtCounts[ci] === minCount) candidateCourts.push(ci + 1);
      }
      const chosenCourt =
        candidateCourts[Math.floor(rng() * candidateCourts.length)];

      // record match
      matches.push({
        match_index: matchIndex++,
        round: round + 1,
        court: chosenCourt,
        players: finalGroup,
      });

      // mark assigned for this round and update playCount
      finalGroup.forEach((p) => {
        assignedInRound.add(p);
        playCount[p] = (playCount[p] || 0) + 1;
      });

      // small mutation of baseOrder to push just-played players toward tail so resting players surface
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
    } // end for each court in round

    // After all courts in this round are processed, update rest counts if noDoubleRest is enabled
    if (noDoubleRest) {
      // players who did NOT play this round (i.e., not in assignedInRound) get restCount++
      for (const p of baseOrder) {
        if (!assignedInRound.has(p)) restCount[p] = (restCount[p] || 0) + 1;
      }
      // If everyone has rested at least once, reset cycle (so rest counts start fresh and nobody will rest twice before next everyone-rest)
      if (allHaveRestedOnce()) {
        resetRestCycle();
      }
    }
    // continue to next round
    if (matches.length >= totalMatches) break;
  } // end rounds loop

  return matches.slice(0, totalMatches);
}
