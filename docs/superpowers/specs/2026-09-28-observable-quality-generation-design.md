# Observable, quality-focused generation design

## Intent and success criteria

BuildFlow AI should feel closer to an AI app builder such as Atoms while remaining an interview-sized, reliable demonstration. A user should be able to see a detailed, persisted record of what BuildFlow actually did and receive a richer browser-only application from a small product request.

Success means that a successful generation shows 8-12 truthful execution events, saves an immutable version with a safe preview, and commonly produces a themed single-page application with several meaningful interactions. The system must not expose a model's hidden reasoning or pretend to execute tools it does not have.

## Scope and non-goals

In scope:

- Persist and render structured, user-visible generation events.
- Split AI work into a small application blueprint and a browser-artifact build.
- Increase the code-generation budget within explicit time, cost, size, and safety limits.
- Validate generated output before saving files and create a clear local fallback when it is unusable.
- Add focused API, browser, and visual QA evidence.

Out of scope:

- Displaying DeepSeek `reasoning_content`, system prompts, API secrets, or raw internal model traces.
- Claiming that BuildFlow read, edited, linted, or ran an arbitrary child project.
- Generated server code, packages, external network access, third-party assets, deployment of child apps, or arbitrary code execution.
- Replicating the full multi-agent IDE/runtime behind Atoms.

## Options considered

### A. Increase the existing single-call token budget

This is the smallest code change: increase the current 6,000-token cap and timeout, then improve the existing prompt. It can improve output density, but cannot reliably separate product design from code writing or give a rich, truthful activity stream.

### B. Blueprint plus artifact build (selected)

Use one constrained call to produce a small structured blueprint, then a second constrained call to generate the four browser files. Server-generated events record each real operation. This provides better code context and a meaningful activity log without introducing an unbounded agent runtime.

### C. Tool-using code agent in a child workspace

This would be visually closest to a full app-builder IDE but needs isolated file systems, command execution, browser automation, quotas, and recovery from arbitrary code failures. It is intentionally outside this assignment's safe-demo boundary.

## Architecture

```text
prompt
  -> create persisted job and truthful initial events
  -> blueprint request (DeepSeek, JSON only)
  -> validate blueprint
  -> artifact request (DeepSeek, JSON only)
  -> validate files and preview safety
  -> persist generated files + immutable version
  -> initialize sandboxed iframe preview
```

The API remains the sole holder of the DeepSeek key. The client continues polling the existing project workspace endpoint; it never receives model credentials or hidden model output.

### Blueprint contract

The blueprint is an internal, Zod-validated JSON object with the application name, tagline, page regions, local data entities, visual direction, interactions, and acceptance checks. It is not executable and is not a fixed catalog of application categories. It may be summarized in the activity stream but does not need to be stored as a separate user-editable artifact in this milestone.

### Artifact contract

The builder returns the existing browser-only artifact shape: `appSpec`, `index.html`, `styles.css`, `app.js`, and `README.md`. It must have no imports, external assets, network calls, form submissions, popups, parent access, or server code. It uses only the existing preview-state bridge.

The generated preview still runs only in the opaque-origin `sandbox="allow-scripts"` iframe with the existing restrictive CSP.

## Visible execution events

Replace the current four-message-only presentation with events having:

- `phase`: analysis, planning, generation, validation, or persistence;
- `kind`: status, model_request, model_response, validation, file_write, version_save, or preview_ready;
- `message`: a concise user-facing description;
- optional `target`: a known file name or version label;
- `status`: pending, active, succeeded, failed, or skipped;
- `createdAt`.

Events are written only when the API performs the represented operation. A successful run normally includes request acceptance, constraints applied, blueprint requested/validated, artifact requested/received, per-file persistence, artifact validation, version persistence, and preview readiness. The UI may group these into the familiar timeline, show target chips such as `写入文件 · app.js`, and reveal a short detail panel.

The event model must remain backward-compatible with existing jobs that contain only `stage`, `message`, and `createdAt`. Their events render with safe defaults.

## Generation limits and reliability controls

The selected initial limits are deliberately bounded:

- Blueprint call: non-thinking JSON, maximum 2,000 output tokens.
- Artifact call: non-thinking JSON, maximum 12,000 output tokens.
- API timeout per model call: 90 seconds; the two-call/repair path has a 250-second overall deadline.
- At most one optional repair call, maximum 12,000 output tokens, only after a deterministic validation error. A complete four-file replacement cannot reliably fit in a smaller output budget.
- Retain one active generation per project and retain the existing local fallback.

Thinking mode stays explicitly disabled for this flow. It is not necessary to generate the public event summary, increases latency/cost, and would create hidden reasoning content that BuildFlow must not expose. DeepSeek JSON mode remains enabled and all results are schema-validated.

The implementation must add a global per-generation budget guard so a repair cannot run after the request's overall deadline. It must return a user-readable failure/fallback message on timeout, malformed JSON, a length-truncated response, or invalid files.

## Validation and safe persistence

Before files are persisted, deterministic checks validate the blueprint/artifact schemas, required file paths, duplicate paths, maximum file count and byte size, entry path, and forbidden browser capabilities. The server logs only coarse reason codes, never prompts, API keys, raw model reasoning, or complete raw errors that could reveal secrets.

After validation, the API creates the immutable version required by the file foreign key, persists every accepted file against that version, then marks the job completed. A failed or fallback run records the true outcome and does not claim an AI artifact was created.

## User experience

While work is running, the Builder shows already-persisted events and polls as it does today. It does not manufacture time-delayed fake activity. The viewer keeps its current loading state until a validated version exists. On success, file selection, version history, restoration, and preview-state persistence continue unchanged.

The richer generated-app target is a responsive single-page micro-application: a distinct visual system, three or more page regions, and three or more local interactions such as filtering, search, editing, selection, statistics, or browser-local state. It is not a guarantee of a full production product and it remains constrained by the browser-only artifact contract.

## Migration and compatibility

Add a database migration to evolve stored job logs to the structured event representation, or store the new shape in the existing JSONB field with a tolerant reader. The selected implementation should prefer the tolerant JSONB reader to avoid rewriting historical jobs. Shared API contracts and the frontend workspace response will be extended together.

## Verification

API tests must cover event ordering, blueprint/artifact validation, invalid model output, timeout/fallback behavior, active-job protection, ownership, and backward-compatible log parsing.

Browser tests must verify that events appear during a run, completed file-write/version events are visible, a generated preview is interactive, regeneration creates a later version, and a fallback is honestly labelled.

Visual QA must cover desktop and narrow Builder layouts with a long event timeline. A three-prompt benchmark (dashboard-like tool, form-centric utility, and presentation/landing page) must show the richer-app acceptance threshold without a fixed prompt-to-template mapping.
