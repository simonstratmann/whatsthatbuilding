# 01: Split the repo into web, server and shared

**What to build:** A prefactor with no change in behaviour. The PWA moves into its own `web` package, with empty `server` and `shared` packages beside it, so the backend tickets can land without reshuffling files. Dev mode, the HTTPS dev server, the build, the tests and both Docker images (production and dev) work exactly as before. See `.scratch/backend-migration/spec.md` (Repo layout).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The PWA lives in `web`; `server` and `shared` exist and are wired into the build and typecheck
- [ ] `npm run dev`, `dev:https`, `build`, `typecheck` and `test` work from the repo root
- [ ] All existing tests pass unchanged in behaviour
- [ ] The production and dev Docker images build and serve the app as before
- [ ] Taking a Snapshot on the phone and in dev mode gives the same Candidates as before the move
