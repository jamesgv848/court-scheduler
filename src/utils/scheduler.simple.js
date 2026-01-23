// Simple, fair, randomized doubles scheduler (2v2)
// - No historical lookups
// - Maximizes variety within the day
// - Fair rest rotation when odd players

const MAX_CONSECUTIVE_PLAYS = 2;

/* ---------- seeded RNG (still looks random, but stable per click) ---------- */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- helpers ---------- */
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/* ---------- main generator ---------- */
export function generateSchedule({
  players,
  courts = 1,
  matchesPerCourt = 5,
} = {}) {
  if (!Array.isArray(players) || players.length < 4) return [];

  const rng = mulberry32(Date.now());

  const totalMatches = courts * matchesPerCourt;
  const rounds = Math.ceil(totalMatches / courts);

  const playCount = {};
  const restCount = {};
  const consecutive = {};

  players.forEach((p) => {
    playCount[p] = 0;
    restCount[p] = 0;
    consecutive[p] = 0;
  });

  const teammateUsage = new Map();
  const opponentUsage = new Map();

  let matchIndex = 1;
  const matches = [];

  for (let round = 1; round <= rounds; round++) {
    const available = shuffle(players, rng);
    const assigned = new Set();

    for (let court = 1; court <= courts; court++) {
      if (matches.length >= totalMatches) break;

      const pool = available.filter((p) => !assigned.has(p));
      if (pool.length < 4) break;

      // Sort by: lowest play count, lowest consecutive count
      pool.sort(
        (a, b) =>
          playCount[a] - playCount[b] ||
          consecutive[a] - consecutive[b] ||
          rng() - 0.5,
      );

      const selected = pool.slice(0, 4);

      // Try all team splits and pick the least-used combo
      const options = [
        [selected[0], selected[1], selected[2], selected[3]],
        [selected[0], selected[2], selected[1], selected[3]],
        [selected[0], selected[3], selected[1], selected[2]],
      ];

      let best = options[0];
      let bestScore = Infinity;

      for (const [a, b, c, d] of options) {
        let score = 0;

        score += (teammateUsage.get(pairKey(a, b)) || 0) * 5;
        score += (teammateUsage.get(pairKey(c, d)) || 0) * 5;

        score += opponentUsage.get(pairKey(a, c)) || 0;
        score += opponentUsage.get(pairKey(a, d)) || 0;
        score += opponentUsage.get(pairKey(b, c)) || 0;
        score += opponentUsage.get(pairKey(b, d)) || 0;

        if (score < bestScore) {
          bestScore = score;
          best = [a, b, c, d];
        }
      }

      matches.push({
        match_index: matchIndex++,
        round,
        court,
        players: best,
      });

      best.forEach((p) => {
        assigned.add(p);
        playCount[p]++;
        consecutive[p]++;
      });

      const [a, b, c, d] = best;

      teammateUsage.set(
        pairKey(a, b),
        (teammateUsage.get(pairKey(a, b)) || 0) + 1,
      );
      teammateUsage.set(
        pairKey(c, d),
        (teammateUsage.get(pairKey(c, d)) || 0) + 1,
      );

      [
        [a, c],
        [a, d],
        [b, c],
        [b, d],
      ].forEach(([x, y]) =>
        opponentUsage.set(
          pairKey(x, y),
          (opponentUsage.get(pairKey(x, y)) || 0) + 1,
        ),
      );
    }

    // Rest handling (fair rotation)
    players.forEach((p) => {
      if (!assigned.has(p)) {
        restCount[p]++;
        consecutive[p] = 0;
      }
      if (consecutive[p] > MAX_CONSECUTIVE_PLAYS) {
        consecutive[p] = MAX_CONSECUTIVE_PLAYS;
      }
    });
  }

  return matches;
}
