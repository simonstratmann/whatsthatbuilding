# 01: Split the repo into web, server and shared

**What to build:** A prefactor with no change in behaviour. The PWA moves into its own `web` package, with empty `server` and `shared` packages beside it, so the backend tickets can land without reshuffling files. Dev mode, the HTTPS dev server, the build, the tests and both Docker images (production and dev) work exactly as before. See `.scratch/backend-migration/spec.md` (Repo layout).

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] The PWA lives in `web`; `server` and `shared` exist and are wired into the build and typecheck
- [x] `npm run dev`, `dev:https`, `build`, `typecheck` and `test` work from the repo root
- [x] All existing tests pass unchanged in behaviour
- [x] The production and dev Docker images build and serve the app as before
- [x] Taking a Snapshot on the phone and in dev mode gives the same Candidates as before the move

## Comments

- Done: npm workspaces `shared`, `server`, `web`; root scripts delegate to `web`, `typecheck` runs in every package, `vitest run` at the root covers all three as projects. `.env.local` and `logs/` stay at the repo root. Both images built and served the app locally; the Snapshot check on the phone is left to do by hand.

**2026-11-04 (user):** Checked by hand: the app works on the current build. Aerial Photos show on the mini-map, and Candidates carry names such as "REWE" and Building Types such as "Gewerbegebäude".
