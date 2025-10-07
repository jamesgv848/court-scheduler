// src/utils/pairScheduler.js
// Generate matches treating each pair as an atomic team (pair = [playerA, playerB])
// Output: array of match objects compatible with saveScheduleToDb mapper:
// { match_index, round, court, players: [pA1, pA2, pB1, pB2] }

function hashStringToSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < (str || "").length; i++) {
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

// deterministic shuffle
function seededShuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * generatePairSchedule
 * @param {Object} opts
 *  - pairs: [{ id: 'p1', players: [uuidA, uuidB], label?, name? }, ...]  (treat each element as a team)
 *  - courts: number
 *  - matchesPerCourt: number
 *  - dateSeed: string (YYYY-MM-DD) used for deterministic RNG when seedDeterministic=true
 *  - seedDeterministic: boolean
 * @returns array of matches: [{ match_index, round, court, players: [pA1,pA2,pB1,pB2] }, ...]
 */
export function generatePairSchedule({
  pairs,
  courts = 1,
  matchesPerCourt = 5,
  dateSeed = new Date().toISOString().slice(0, 10),
  seedDeterministic = true,
}) {
  if (!Array.isArray(pairs) || pairs.length < 2) return [];

  const totalMatches = courts * matchesPerCourt;
  const teams = pairs.slice(); // each element is a team/pair
  const teamCount = teams.length;

  // seed RNG
  const seedSource = seedDeterministic
    ? String(dateSeed || "")
    : String(Date.now());
  const seed = hashStringToSeed(seedSource);
  const rng = mulberry32(seed);

  // we will form an ordering of teams and rotate them to create pairings.
  let order = seededShuffle(teams, rng);

  // If there is odd number of teams, we will add a dummy bye team (null) so rotation works.
  const hasBye = order.length % 2 === 1;
  if (hasBye) order.push({ id: "__BYE__" });

  const roundsNeeded = Math.ceil((totalMatches * 2) / order.length); // crude upper bound of rotation rounds
  const matches = [];
  let matchIndex = 1;

  // Use circle method for round-robin over teams array
  // But we need at most totalMatches; and each round produces order.length / 2 matches
  const N = order.length;

  // build initial array of indices
  let rot = order.slice();

  for (
    let round = 0;
    round < roundsNeeded && matches.length < totalMatches;
    round++
  ) {
    // pair teams by index: (0, N-1), (1, N-2), ...
    const roundPairs = [];
    for (let i = 0; i < N / 2; i++) {
      const a = rot[i];
      const b = rot[N - 1 - i];
      if (!a || !b) continue;
      if (a.id === "__BYE__" || b.id === "__BYE__") continue;
      roundPairs.push([a, b]);
    }

    // shuffle the roundPairs a bit deterministically to diversify court assignments
    const shuffledRoundPairs = seededShuffle(roundPairs, rng);

    // assign to courts: up to 'courts' matches per physical time-slot within this round
    // We'll produce one "round number" per rotation pass and assign matches across courts
    // If there are more pairs than courts, subsequent matches are considered later rounds (we'll still count them and continue)
    for (
      let slot = 0;
      slot < shuffledRoundPairs.length && matches.length < totalMatches;
      slot++
    ) {
      const pair = shuffledRoundPairs[slot];
      const court = (matches.length % courts) + 1;
      const roundNumber = Math.floor(matches.length / courts) + 1;
      const [teamA, teamB] = pair;
      // flatten players arrays into 4 element array (teamA.players concat teamB.players)
      const playerIds = [
        ...(teamA.players || []),
        ...(teamB.players || []),
      ].slice(0, 4); // ensure max 4
      // if teamA or teamB somehow have <2 players, we still save whatever exists (caller should validate)
      matches.push({
        match_index: matchIndex++,
        round: roundNumber,
        court,
        players: playerIds,
      });
      if (matches.length >= totalMatches) break;
    }

    // rotate (keep first element fixed, rotate rest to the right)
    if (N > 2) {
      const first = rot[0];
      const rest = rot.slice(1);
      rest.unshift(rest.pop());
      rot = [first, ...rest];
    }
  }

  // If we still didn't reach requested matches (very few teams), we can reuse pairings by repeating order until filled
  if (matches.length < totalMatches) {
    let i = 0;
    while (matches.length < totalMatches) {
      const tA = order[i % order.length];
      const tB = order[(i + 1) % order.length];
      if (
        tA &&
        tB &&
        tA.id !== "__BYE__" &&
        tB.id !== "__BYE__" &&
        tA.id !== tB.id
      ) {
        matches.push({
          match_index: matchIndex++,
          round: Math.floor(matches.length / courts) + 1,
          court: (matches.length % courts) + 1,
          players: [...(tA.players || []), ...(tB.players || [])].slice(0, 4),
        });
      }
      i++;
      if (i > 1000) break; // safety
    }
  }

  return matches.slice(0, totalMatches);
}

export default { generatePairSchedule };
