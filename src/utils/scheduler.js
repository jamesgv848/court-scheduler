// src/utils/scheduler.js
// Fair, randomized scheduler for doubles matches (2v2).

// ---------- TEMPORARY SCHEDULER POLICY CONSTANTS ----------
const RATING_FLOOR = 50;
const STRONG_PLAYER_THRESHOLD = 70;
const BLOCK_STRONG_PAIRING = true;

const MAX_PAIR_HISTORY_PENALTY = 3;
const MAX_CONSECUTIVE_PLAYS = 3;

const NO_DOUBLE_REST_PENALTY = 40;
const CONSECUTIVE_PLAY_PENALTY = 50;

/* ---------- seeded RNG helpers ---------- */
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
  const cnt = pairingMap.get(canonicalPairKey(a, b)) || 0;
  const capped = Math.min(cnt, MAX_PAIR_HISTORY_PENALTY);
  return capped * capped * 10;
}
function opponentPenalty(a, b, opponentMap) {
  return (opponentMap.get(canonicalPairKey(a, b)) || 0) * 5;
}
function getRating(ratings, p) {
  return ratings.get(p) ?? RATING_FLOOR;
}
function isStrong(ratings, p) {
  return getRating(ratings, p) > STRONG_PLAYER_THRESHOLD;
}

/* ---------- main generator ---------- */
export function generateSchedule({
  players,
  courts = 1,
  matchesPerCourt = 5,
  pairingHistory = new Map(),
  opponentHistory = new Map(),
  ratings = new Map(),
  date = new Date().toISOString().slice(0, 10),
  randomize = true,
  noDoubleRest = true,
} = {}) {
  if (!Array.isArray(players) || players.length < 4) return [];

  const seed = hashStringToSeed(`${date}-${randomize ? Math.random() : ""}`);
  const rng = mulberry32(seed);

  const baseOrder = seededShuffle(players, rng);

  const playCount = {};
  const restCount = {};
  const consecutivePlayCount = {};
  baseOrder.forEach((p) => {
    playCount[p] = 0;
    restCount[p] = 0;
    consecutivePlayCount[p] = 0;
  });

  const pairUsage = new Map();
  const matchupUsage = new Map();

  const matches = [];
  const totalMatches = courts * matchesPerCourt;
  const roundsNeeded = Math.ceil(totalMatches / courts);
  let matchIndex = 1;

  for (let round = 0; round < roundsNeeded; round++) {
    const assignedInRound = new Set();

    for (let court = 1; court <= courts; court++) {
      if (matches.length >= totalMatches) break;

      const pool = baseOrder.filter((p) => !assignedInRound.has(p));
      if (pool.length < 4) break;

      const pickWithScore = (cands, scoreFn) => {
        let bestScore = Infinity;
        let best = [];
        for (const c of cands) {
          const s = scoreFn(c);
          if (s < bestScore) {
            bestScore = s;
            best = [c];
          } else if (s === bestScore) best.push(c);
        }
        return best[Math.floor(rng() * best.length)];
      };

      const first = pickWithScore(pool, (p) =>
        consecutivePlayCount[p] >= MAX_CONSECUTIVE_PLAYS
          ? CONSECUTIVE_PLAY_PENALTY
          : 0
      );

      const second = pickWithScore(
        pool.filter((p) => p !== first),
        (p) => {
          let score = teammatePenalty(first, p, pairingHistory);
          score += (pairUsage.get(canonicalPairKey(first, p)) || 0) * 40;
          score += playCount[p] * 2;

          if (
            BLOCK_STRONG_PAIRING &&
            isStrong(ratings, first) &&
            isStrong(ratings, p)
          ) {
            score += 1000; // hard discourage
          }
          return score;
        }
      );

      const remaining = pool.filter((p) => ![first, second].includes(p));

      const third = pickWithScore(
        remaining,
        (p) =>
          opponentPenalty(first, p, opponentHistory) +
          opponentPenalty(second, p, opponentHistory)
      );

      const fourth = pickWithScore(
        remaining.filter((p) => p !== third),
        (p) => teammatePenalty(third, p, pairingHistory)
      );

      const arrangements = [
        [first, second, third, fourth],
        [first, third, second, fourth],
        [first, fourth, second, third],
      ];

      function arrangementPenalty([a, b, c, d]) {
        let penalty = 0;

        if (BLOCK_STRONG_PAIRING) {
          if (
            (isStrong(ratings, a) && isStrong(ratings, b)) ||
            (isStrong(ratings, c) && isStrong(ratings, d))
          ) {
            penalty += 3000;
          }
        }

        penalty += teammatePenalty(a, b, pairingHistory);
        penalty += teammatePenalty(c, d, pairingHistory);

        penalty += opponentPenalty(a, c, opponentHistory);
        penalty += opponentPenalty(a, d, opponentHistory);
        penalty += opponentPenalty(b, c, opponentHistory);
        penalty += opponentPenalty(b, d, opponentHistory);

        if (noDoubleRest) {
          const minRest = Math.min(
            restCount[a],
            restCount[b],
            restCount[c],
            restCount[d]
          );
          [a, b, c, d].forEach((p) => {
            if (restCount[p] > minRest) penalty += NO_DOUBLE_REST_PENALTY;
          });
        }

        [a, b, c, d].forEach((p) => {
          if (consecutivePlayCount[p] >= MAX_CONSECUTIVE_PLAYS) {
            penalty += CONSECUTIVE_PLAY_PENALTY;
          }
        });

        return penalty;
      }

      let best = arrangements[0];
      let bestScore = Infinity;
      for (const arr of arrangements) {
        const s = arrangementPenalty(arr);
        if (s < bestScore) {
          bestScore = s;
          best = arr;
        }
      }

      matches.push({
        match_index: matchIndex++,
        round: round + 1,
        court,
        players: best,
      });

      best.forEach((p) => {
        assignedInRound.add(p);
        playCount[p]++;
        consecutivePlayCount[p]++;
      });

      const [a, b, c, d] = best;
      pairUsage.set(
        canonicalPairKey(a, b),
        (pairUsage.get(canonicalPairKey(a, b)) || 0) + 1
      );
      pairUsage.set(
        canonicalPairKey(c, d),
        (pairUsage.get(canonicalPairKey(c, d)) || 0) + 1
      );
    }

    // Rest handling (soft, starvation-safe)
    for (const p of baseOrder) {
      if (!assignedInRound.has(p)) {
        restCount[p]++;
        consecutivePlayCount[p] = 0;
      }
    }
  }

  return matches;
}
