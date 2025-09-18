// src/utils/scheduler.js
// Fair, seeded scheduler for doubles matches (2v2).
// - players: array of player ids (uuids)
// - courts: number of courts (1 or more)
// - matchesPerCourt: how many rounds per court
// - pairingHistory: Map keyed "a|b" -> pair_count (teammates frequency)
// - opponentHistory: Map keyed "a|b" -> opp_count (opponent frequency)
// - date: string 'YYYY-MM-DD' used as seed so output is deterministic per date

// Example call:
// generateSchedule({ players, courts:2, matchesPerCourt:5, pairingHistory, opponentHistory, date: '2025-09-20' })

/* ---------- seeded RNG (Mulberry32) ---------- */
function hashStringToSeed(str) {
  // simple 32-bit hash (FNV-1a-like)
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

// Deterministic shuffle using seeded RNG
function seededShuffle(array, rng) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// compute teammate penalty for two players (higher => worse)
function teammatePenalty(a, b, pairingMap) {
  const key = canonicalPairKey(a, b);
  const cnt = pairingMap.get(key) || 0;
  // weight teammates more; square to emphasize repeat offenders
  return cnt * cnt;
}

// compute opponent penalty for two players being on opposing teams
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
}) {
  if (!Array.isArray(players))
    throw new Error("players must be an array of ids");

  // seed RNG from date -> deterministic per date
  const seed = hashStringToSeed(date);
  const rng = mulberry32(seed);

  // base shuffled list (so we don't always start alphabetical)
  const baseOrder = seededShuffle(players, rng);

  // determine number of matches to generate
  // Each match consumes 4 players (2 vs 2). If courts * matchesPerCourt * 4 > players*? we will rotate players across rounds.
  const totalMatches = courts * matchesPerCourt;

  // We'll produce matches round by round. For each match we pick 4 players using a fairness-aware greedy selection.
  // We will also rotate resting players when playersCount % (4*courts) != 0.

  const P = baseOrder.length;
  if (P < 4) return []; // not enough players

  // For fairness in resting players, compute a deterministic starting rest index (so different dates start rest at different players)
  const restStartIndex = Math.floor(rng() * P);

  // Working pool will be a dynamic list we rotate each match so players get fair rest.
  // We will not permanently remove players; instead for each round we will create a snapshot of available players by rotating baseOrder.
  let matches = [];
  let matchIndex = 1;

  // We'll create a rotated sequence for rounds that shifts by (4 * courts) each round,
  // but start offset is restStartIndex to vary resters across dates.
  const shiftPerRound = (4 * courts) % P;

  for (let round = 0; round < matchesPerCourt; round++) {
    // Build a rotated list for this round
    const offset = (restStartIndex + round * shiftPerRound) % P;
    // produce rotatedPlayers starting at offset
    const rotated = [];
    for (let i = 0; i < P; i++) {
      rotated.push(baseOrder[(offset + i) % P]);
    }

    // For court-by-court selection within this round, pick groups of 4 from rotated,
    // but use greedy selection to minimize pairing/opponent penalties.
    // We'll keep track of which players are already assigned in this round to avoid duplicates.
    const assigned = new Set();

    for (let court = 1; court <= courts; court++) {
      // If fewer than 4 unassigned players remain, we'll refill by skipping already assigned as necessary (players can repeat across courts in same round only if unavoidable).
      const available = rotated.filter((p) => !assigned.has(p));

      if (available.length < 4) {
        // If not enough fresh players remain, fall back to full rotated list minus already assigned (allow reuse only if needed)
        // But to avoid odd behavior, take the top 4 from rotated that are not yet in assigned OR if necessary include already assigned to fill 4.
        const group = [];
        let i = 0;
        while (group.length < 4 && i < rotated.length) {
          const candidate = rotated[i];
          if (!group.includes(candidate)) group.push(candidate);
          i++;
        }
        if (group.length < 4) break; // cannot form more matches this round
        matches.push({
          match_index: matchIndex++,
          round: round + 1,
          court,
          players: group.slice(0, 4),
        });
        // mark these assigned to prefer they not be reused within the round unless unavoidable
        group.slice(0, 4).forEach((p) => assigned.add(p));
        continue;
      }

      // Greedy selection:
      // 1) pick first player deterministically (use RNG to choose among a small prefix to add randomness)
      // select a small candidate pool to consider for first slot
      const firstPoolSize = Math.min(4, available.length);
      const firstPool = available.slice(0, firstPoolSize);
      const firstIndex = Math.floor(rng() * firstPool.length);
      const first = firstPool[firstIndex];

      // 2) pick second (teammate for first) to minimize teammatePenalty(first, second)
      const remainAfterFirst = available.filter((p) => p !== first);
      // compute penalty for each candidate as teammatePenalty
      let bestSecondCandidates = [];
      let bestSecondScore = Infinity;
      for (const cand of remainAfterFirst) {
        const score = teammatePenalty(first, cand, pairingHistory);
        if (score < bestSecondScore) {
          bestSecondScore = score;
          bestSecondCandidates = [cand];
        } else if (score === bestSecondScore) {
          bestSecondCandidates.push(cand);
        }
      }
      // tie-break with RNG among bestSecondCandidates
      const second =
        bestSecondCandidates[Math.floor(rng() * bestSecondCandidates.length)];

      // 3) pick third (opponent for first/second) - prefer low opponentHistory against first and second
      const remainAfterSecond = remainAfterFirst.filter((p) => p !== second);
      let bestThirdCandidates = [];
      let bestThirdScore = Infinity;
      for (const cand of remainAfterSecond) {
        // penalty if cand has been opponent to first or second
        const score =
          opponentPenalty(first, cand, opponentHistory) +
          opponentPenalty(second, cand, opponentHistory);
        if (score < bestThirdScore) {
          bestThirdScore = score;
          bestThirdCandidates = [cand];
        } else if (score === bestThirdScore) {
          bestThirdCandidates.push(cand);
        }
      }
      const third =
        bestThirdCandidates[Math.floor(rng() * bestThirdCandidates.length)];

      // 4) pick fourth (teammate for third) - minimize teammate penalty with third and cross opponent penalties
      const remainAfterThird = remainAfterSecond.filter((p) => p !== third);
      let bestFourthCandidates = [];
      let bestFourthScore = Infinity;
      for (const cand of remainAfterThird) {
        // combine teammate penalty with additional opponent penalty against first/second
        const tpen = teammatePenalty(third, cand, pairingHistory);
        const oppScore =
          opponentPenalty(first, cand, opponentHistory) +
          opponentPenalty(second, cand, opponentHistory);
        const score = tpen + oppScore;
        if (score < bestFourthScore) {
          bestFourthScore = score;
          bestFourthCandidates = [cand];
        } else if (score === bestFourthScore) {
          bestFourthCandidates.push(cand);
        }
      }
      const fourth =
        bestFourthCandidates[Math.floor(rng() * bestFourthCandidates.length)];

      const group = [first, second, third, fourth];

      // small final check: to reduce exact repeats of teammate pairs that might exist in the group,
      // we can attempt a simple local swap if it reduces teammate penalty sum (optional).
      // Compute current teammate penalty sum:
      let currPenalty =
        teammatePenalty(first, second, pairingHistory) +
        teammatePenalty(third, fourth, pairingHistory) +
        opponentPenalty(first, third, opponentHistory) +
        opponentPenalty(first, fourth, opponentHistory) +
        opponentPenalty(second, third, opponentHistory) +
        opponentPenalty(second, fourth, opponentHistory);

      // Try swapping second <-> third (changes teams to first+third vs second+fourth)
      const altPenalty1 =
        teammatePenalty(first, third, pairingHistory) +
        teammatePenalty(second, fourth, pairingHistory) +
        opponentPenalty(first, second, opponentHistory) +
        opponentPenalty(first, fourth, opponentHistory) +
        opponentPenalty(third, second, opponentHistory) +
        opponentPenalty(third, fourth, opponentHistory);

      // Try swapping second <-> fourth (first+fourth vs second+third)
      const altPenalty2 =
        teammatePenalty(first, fourth, pairingHistory) +
        teammatePenalty(second, third, pairingHistory) +
        opponentPenalty(first, second, opponentHistory) +
        opponentPenalty(first, third, opponentHistory) +
        opponentPenalty(fourth, second, opponentHistory) +
        opponentPenalty(fourth, third, opponentHistory);

      // choose the arrangement with minimum penalty (ties keep original, or use rng)
      let bestArrangement = group;
      let bestArrangementPenalty = currPenalty;
      if (altPenalty1 < bestArrangementPenalty) {
        bestArrangement = [first, third, second, fourth];
        bestArrangementPenalty = altPenalty1;
      } else if (altPenalty2 < bestArrangementPenalty) {
        bestArrangement = [first, fourth, third, second];
        bestArrangementPenalty = altPenalty2;
      } else if (
        altPenalty1 === bestArrangementPenalty ||
        altPenalty2 === bestArrangementPenalty
      ) {
        // if tie, pick randomly among equal-penalty arrangements
        const tiedOptions = [];
        tiedOptions.push(group);
        if (altPenalty1 === bestArrangementPenalty)
          tiedOptions.push([first, third, second, fourth]);
        if (altPenalty2 === bestArrangementPenalty)
          tiedOptions.push([first, fourth, third, second]);
        bestArrangement = tiedOptions[Math.floor(rng() * tiedOptions.length)];
      }

      const finalGroup = bestArrangement.slice(0, 4);

      // Mark assigned
      finalGroup.forEach((p) => assigned.add(p));

      matches.push({
        match_index: matchIndex++,
        round: round + 1,
        court,
        players: finalGroup,
      });
    } // end courts loop
  } // end rounds loop

  // If we could not generate the full requested number of matches (maybe because players < 4*courts)
  // we just return what we generated.
  return matches.slice(0, totalMatches);
}
