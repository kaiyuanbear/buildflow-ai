# BuildFlow AI QA checklist

## API checks

- [x] Health endpoint returns 200. (Verified locally on 2026-09-27.)
- [x] Registration succeeds with a valid new email. (Verified by temporary API QA account on 2026-09-27.)
- [x] Duplicate email and invalid password are rejected. (API QA on 2026-09-28.)
- [x] Login creates a valid authenticated session. (API QA on 2026-09-28.)
- [x] Logout removes the session. (API QA on 2026-09-28.)
- [x] Unauthenticated project access returns 401. (API QA on 2026-09-28.)
- [x] A user cannot read or mutate another user's project. (API QA verified project, workspace, and preview-state ownership on 2026-09-28.)
- [ ] Project CRUD persists after restart.
- [ ] Generation persists stage transitions and logs.
- [x] Generic artifact generation saves `index.html` and source files, creates a completed job, and can fall back to a local interactive starter when the AI response is unavailable. (Temporary API project verified and deleted on 2026-09-27.)
- [x] DeepSeek `deepseek-flash` non-thinking JSON generation returns a non-fallback browser artifact within the configured limit. (Temporary `ShelfTrack` project verified and deleted on 2026-09-28.)
- [x] Version-scoped preview state persists after a fresh workspace read. (Temporary API project verified and deleted on 2026-09-27.)
- [x] A running generation persists analysis, planning, and generation events before completion; the Builder can poll that state and read the completed validation event. (Temporary API project verified and deleted on 2026-09-28.)
- [x] A project cannot run concurrent generation jobs. (A PostgreSQL partial unique index and API 409 behavior were exercised by API QA on 2026-09-28.)
- [x] Generation stores files and a version. (Browser QA verified generated source files and v1 on 2026-09-28.)
- [x] Regeneration creates a later version, and version history returns both versions in descending order. (Temporary API QA created v1 and v2, verified on 2026-09-28.)
- [x] A historical workspace can be loaded with its version ID, and the restore API accepts a project-owned earlier version. (Temporary API QA read v1 after v2 and restored v1 on 2026-09-28.)
- [x] Version restore updates the active version after a fresh default-workspace read. (Browser QA restored v1 and refreshed the workspace on 2026-09-28.)
- [x] Project task data is isolated by project, accepts creation and completion updates, and persists after a fresh read. (Temporary API QA project verified and deleted on 2026-09-27.)

## Browser journey

- [x] Registration requires matching password and confirmation before any authentication request. (Isolated Playwright browser QA verified the visible mismatch message on 2026-09-28.)
- [x] Register and land on the dashboard. (Browser QA on 2026-09-28.)
- [x] Create a project and start a generation. (Browser QA on 2026-09-28.)
- [x] Observe persisted Agent workflow stages and completion. (Browser QA on 2026-09-28.)
- [x] Inspect generated files. (Browser QA on 2026-09-28.)
- [x] Use a preview interaction. (Browser QA added a book to the generated preview on 2026-09-28.)
- [x] Regenerate and restore an older version. (Browser QA created v2, selected v1, and restored it on 2026-09-28.)
- [x] Refresh and verify persisted state. (Browser QA reloaded after preview interaction and found the saved book on 2026-09-28.)
- [x] Log out and verify protected routes redirect. (API QA verified logout removes access to `/api/auth/me` on 2026-09-28.)

## Visual checks

- [x] Home sidebar keeps the logout control fixed at the bottom while the main page scrolls. (1440×960 isolated Playwright QA verified stable top/bottom bounds on 2026-09-28.)
- [x] Home gallery switches between six discover examples, six template examples, and saved project preview cards. (Isolated Playwright QA on 2026-09-28.)
- [ ] Login, dashboard, builder loading, builder completion, empty, and error states are inspected.
- [x] Desktop Builder columns are readable without clipping. (1440×960 Browser QA on 2026-09-28; panels now scroll independently.)
- [x] Narrow viewport has no unintended horizontal overflow. (390×844 Browser QA on 2026-09-28; single-column grid width equals viewport width.)
- [x] Interactive controls visibly change state and remain usable. (Browser QA on 2026-09-28.)
- [x] Generated iframe preview isolation is manually verified: no parent access or network request, and state-save bridge works from an actual rendered generated application. (Browser QA observed opaque `null` origin, blocked parent access/network, and persisted a preview interaction on 2026-09-28.)

## Delivery checks

- [x] Compiled Fastify service serves `/`, deep SPA routes, and `/api/health` from one local production origin. (Port 3003 smoke test verified on 2026-09-28.)
- [ ] Public deployment is reachable.
- [ ] GitHub repository is public.
- [ ] README documents setup, testing, deployment, demo flow, and scope decisions.
- [x] `.env` is ignored and `.env.example` has no secrets. (Git and built-client scan verified on 2026-09-28.)
- [ ] Public deployment is smoke-tested with a new account.
