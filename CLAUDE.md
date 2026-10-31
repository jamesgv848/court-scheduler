# IntenseBadminton

Scheduling and scoring web app for our badminton group.
Stack: Vite + React, react-router-dom, Supabase (Postgres, RPCs, realtime), Vercel.

## Environments — read first
- Local development uses the DEV Supabase project (`badminton-dev`, ref `qiwabezemznrdkmnjegt`) through `.env.local`.
- The LIVE project (ref `dwimxkzvcsqulxycbamq`) is production. Never connect to it,
  never run SQL against it, never ask for its keys. If you see that ref in any
  env file or command, stop and tell me.
- Live credentials exist only in Vercel's Production environment variables.
- Vercel Preview builds (every branch except `main`) use the DEV database.
- Database changes: write SQL as dated files in `supabase/migrations/`, test on dev,
  and I apply them to live manually. Never run `supabase db push` or similar.

## Git workflow
- `main` is production and is protected. Never commit or push to it.
- Redesign work happens on branch `ui_revamp` (preview: https://intense-badminton-v2.vercel.app).
- Quick fixes: branch from `main` as `fix/<short-name>`, open a pull request, I merge it.
- Commit small and often, with clear messages. Never force-push.
- The repo is PUBLIC: never commit keys, dumps, data exports or anything from `.env*` files.

## Current task: UI revamp (frontend only)
- Goal: a more professional, modern layout and look, mobile-first.
- Do NOT change `src/api/supabase-actions.js`, any Supabase call, RPC or SQL, routes, or data shapes.
- Keep every existing feature working.
- First propose, then implement one phase or screen at a time, so I can review each step.
- Reuse the CSS variables in `src/index.css`; avoid hardcoded colours (including `#fff`).

## Commands
- `npm run dev` (local app at http://localhost:5173), `npm run build`, `npm run lint`

## Structure (verify against the real folders)
- `src/supabaseClient.js` creates the client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- `src/api/supabase-actions.js` holds all DB calls; pages and components call these, not supabase directly
- Pages: Schedule, Scoreboard, Pairing Stats, Players, Player Profile, Import Schedule, Auth
- After record, undo, delete or edit, components dispatch the window event `scores-changed` so the scoreboard refreshes
- Styling uses the CSS variables in `index.css` (light theme: --primary, --success, --danger, --surface, --border, --muted)

## Domain rules (behaviour, not styling — do not change)
- Tables: players, matches, scores, pairing_history, opponent_history.
- `matches.player_ids` is a uuid[] (first two = team A, last two = team B); `winner` is a uuid[].
- A "session" is a distinct `match_date` that has at least one match with a winner.
- Scoreboard ranks by wins, not win %.
- `score_text` is comma-separated sets, winner first, e.g. `21-15` or `21-15,22-20`.
  Two formats: 21-point (cap 30-29) and 15-point (deuce at 14-14, sudden death 21-20).
  The validation in `MatchCard.jsx` (`validateMatchScore`) is behaviour, not styling.
- `match_rating` is optional, 1 to 5: 1 = easy/one-sided, 5 = well-fought and intense.
- Winner recording and undo go through RPCs (`record_team_winner`, `undo_winner`).

## Security
- RLS must be enabled on every table. Policies are for the `authenticated` role.
- Every new table needs select, insert, update and delete policies.
  A missing policy makes writes silently do nothing.
- Views use `security_invoker = on`.
- Only the anon/publishable key is ever used in frontend code. Never the service_role key.

## Backlog (do not start without asking)
- Roles and clubs, player management page, soft delete for players
- Session History page, opponent / head-to-head stats on the player profile
- Scoreboard attendance denominator fix (use the selected N sessions)
- Turn RLS on for `matches` and `scores` (fix on dev first, then live manually)
