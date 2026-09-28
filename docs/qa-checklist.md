# BuildFlow AI QA checklist

## API checks

- [x] Health endpoint returns 200. (Verified locally on 2026-09-27.)
- [x] Registration succeeds with a valid new email. (Verified by temporary API QA account on 2026-09-27.)
- [x] Duplicate email and invalid password are rejected. (API QA on 2026-09-28.)
- [x] Login creates a valid authenticated session. (API QA on 2026-09-28.)
- [x] Logout removes the session. (API QA on 2026-09-28.)
- [x] Unauthenticated project access returns 401. (API QA on 2026-09-28.)
- [x] A user cannot read or mutate another user's project. (API QA verified project, workspace, and preview-state ownership on 2026-09-28.)
- [x] Project CRUD persists through independent API reads and cleanup. (API QA on 2026-09-28.)
- [x] Generation persists stage transitions and logs. (API QA verifies persisted structured events and saved versions on 2026-09-28.)
- [x] Generic artifact generation saves `index.html` and source files, creates a completed job, and can fall back to a local interactive starter when the AI response is unavailable. (Temporary API project verified and deleted on 2026-09-27.)
- [x] DeepSeek `deepseek-flash` non-thinking JSON generation returns a non-fallback browser artifact within the configured limit. (Temporary `ShelfTrack` project verified and deleted on 2026-09-28.)
- [x] Version-scoped preview state persists after a fresh workspace read. (Temporary API project verified and deleted on 2026-09-27.)
- [x] A running generation persists analysis, planning, and generation events before completion; the Builder can poll that state and read the completed validation event. (Temporary API project verified and deleted on 2026-09-28.)
- [x] Generation records truthful structured execution events for blueprint request/response, artifact validation, per-file writes, version save, and preview readiness. Legacy four-step logs remain readable through optional event fields. (API QA verified on 2026-09-28.)
- [x] DeepSeek two-stage non-thinking generation produced a non-fallback `纸间书斋` reading dashboard with search, statistic/category filters, editing, progress updates, and status changes. It saved the four permitted files and 13 persisted events; the temporary project was deleted on 2026-09-28.
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
- [ ] Final manual visual pass for the longer structured-event timeline and expanded multi-file tree is pending after the user restarts the local development API on its standard port. The API and production-build checks pass on 2026-09-28.

## Delivery checks

- [x] Compiled Fastify service serves `/`, deep SPA routes, and `/api/health` from one local production origin. (Port 3003 smoke test verified on 2026-09-28.)
- [x] Public deployment was reachable at the configured Render URL before the milestone-1–5 commits. It must be re-smoke-tested after the user pushes the final commits and Render redeploys.
- [x] GitHub repository was created and connected to Render by the user. Repository visibility remains a user-controlled delivery setting.
- [x] README documents setup, testing, deployment, demo flow, and scope decisions. (Updated on 2026-09-28.)
- [x] `.env` is ignored and `.env.example` has no secrets. (Git and built-client scan verified on 2026-09-28.)
- [ ] Public deployment is smoke-tested with a new account.

## Latest regression evidence

- [x] TodoList prompt regression request reached the local API after safe artifact normalization; temporary project cleanup ran on 2026-09-28. API and Web TypeScript checks pass. (The local API QA script could not be launched afterward because the Windows host reported `ENOMEM` while another development process was active; manual browser verification remains required.)
- [x] Multi-file artifact contract accepts a complete 7-file manifest artifact, rejects missing manifest references and non-whitelisted paths, and continues to accept the legacy three-file artifact shape. Verified directly against the rebuilt contracts package on 2026-09-28.
- [x] Milestone 1 type checks pass across contracts, API, and Web on 2026-09-28. The broader `tsx` API QA remains blocked by the host-level `uv_os_get_passwd ENOMEM` error; it is unrelated to contract parsing and will be retried in milestone 5.
- [x] Milestone 2 preview assembly accepts manifest-ordered multi-file CSS/JS assets while preserving the legacy `styles.css` and `app.js` path. API safety validation rejects JavaScript imports, network access, external script/style tags, and CSS `url()` references. Production build and direct compiled-module assertions passed on 2026-09-28.
- [x] Milestone 3 DeepSeek generation produced a non-fallback seven-file Chinese todo application (`index.html`, `README.md`, two stylesheets, three JavaScript modules) with a persisted manifest. Its persisted workflow confirms structural/security validation and deterministic region, interaction, initial-data, state-feedback, and responsive-layout quality checks on 2026-09-28.
- [x] Milestone 3 normalization supplies only missing non-executable display metadata (`features` and preview entry) before strict validation; direct contract assertions still reject imports and unsafe browser capabilities. `pnpm typecheck` and production `pnpm build` passed on 2026-09-28.
- [x] Milestone 4 Builder presents generated files as an expandable path tree with root files plus `styles/` and `src/` groups, preserves file selection/source viewing, and adds Chinese labels for legacy timeline messages and targets. TypeScript checks and production build passed on 2026-09-28. (The in-app browser permits the existing Vite origin but blocked the isolated production test origin, so the final manual visual check remains part of milestone 5.)
- [x] Milestone 5 API QA passed in the host environment on 2026-09-28 after adding coverage for quoted ES-module imports. The validator now rejects `import './state.js'` as external executable content; QA passed authentication, ownership, concurrent job, generation, preview-state, history, restore, legacy compatibility, manifest, and deterministic quality checks.
- [x] Milestone 5 `pnpm typecheck` and `pnpm build` passed on 2026-09-28.
- [x] Milestone 5 DeepSeek benchmark used three generic prompts against the current source API and removed all temporary projects/accounts. The travel-itinerary editor completed as a non-fallback 7-file artifact in 33.1 seconds. The time-budget board (63.3 seconds) and café showcase (72.5 seconds) correctly fell back to the four-file local starter after the model repair did not pass the strict artifact contract. A follow-up captured one representative fallback reason: missing required `appSpec.features`. This is recorded as a model-output compatibility limitation, not as a successful high-quality artifact.
- [x] Travel-site regression: a model response that omitted only manifest ordering is now normalized from its already allow-listed multi-file paths, and a non-empty preview bridge default counts as initial demo data. The same Chinese travel-site prompt completed as a non-fallback seven-file artifact in 98.9 seconds with all deterministic quality checks passed on 2026-09-29; temporary account and project were deleted.
