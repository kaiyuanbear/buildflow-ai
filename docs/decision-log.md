# Decision log

## 2026-09-27: constrained application generation

BuildFlow AI will generate a validated AppSpec and deterministic source-file templates instead of executing arbitrary user-generated code. This keeps the interview demo reliable, secure, and achievable within the stated time budget while preserving a real agent-driven build flow.

## 2026-09-27: single-origin production deployment

The React frontend and Fastify API remain separate packages but are deployed as one service. This avoids cross-origin cookie complexity and makes authentication and deployment easier to demonstrate.

## 2026-09-27: Atoms-inspired product flow

BuildFlow AI will mirror the core Atoms information architecture, not its full feature set: an authenticated home screen centers on a product-request composer; submitting it creates a project and opens a three-panel Builder workspace with visible agent logs, generated files/version history, and an interactive preview.

## 2026-09-27: generic LLM artifacts instead of application templates

BuildFlow AI will not map prompts to a fixed catalog of application types. The server asks the LLM for a validated browser-only file artifact and renders it in a sandboxed iframe. The platform persists generic version-scoped preview state rather than data models such as tasks or resumes. This preserves the core prompt-to-application behavior while keeping server execution and secret exposure out of scope.

## 2026-09-28: database-enforced active-generation limit

The API keeps its friendly active-job precheck, but PostgreSQL now also enforces a partial unique index for `queued` and `running` generation jobs per project. This closes the race in which two simultaneous requests could both pass an application-only check.

## 2026-09-28: fail closed for JWT configuration

The API no longer starts with a known default JWT secret. `JWT_SECRET` must be present and at least 32 characters, so an incomplete deployment cannot silently issue predictable authentication tokens.

## 2026-09-28: home gallery is presentation-only

The Atoms-inspired home gallery has `发现`, `我的项目`, and `模板` views. Discover and template cards are local, non-interactive visual examples; they do not select or constrain the LLM generation path. My-project cards are derived from the authenticated user's persisted projects and open the existing Builder workspace.

## 2026-09-28: truthful events and two-stage generation

BuildFlow AI records structured server-side execution events rather than exposing model reasoning or simulating unavailable tools. DeepSeek first returns a validated application blueprint, then returns a validated browser-only artifact. Thinking mode remains disabled; all model output is JSON-validated, sandboxed, and subject to bounded output/time limits with a local fallback.

## 2026-09-28: safe structural artifact normalization

Before strict validation, BuildFlow AI only normalizes harmless response-shape differences that do not change executable content: common canonical file aliases, canonical language labels, and a missing non-executable README. The resulting artifact must still contain exactly the four allow-listed files and pass the existing size and browser-capability checks. This improves model compatibility without weakening the sandbox contract.

## 2026-09-28: manifest-driven quality artifacts

New model-generated applications use a 7-12 file browser-only artifact with an explicit manifest: CSS files live under `styles/`, JavaScript files live under `src/`, and `index.html` remains markup-only. The preview assembles those files deterministically inside its sandbox. The API permits one bounded repair, then checks minimum semantic regions, local interactions, initial data, visible state feedback, and a narrow-screen media query before it persists a version. Legacy four-file artifacts remain readable for older projects.

## 2026-09-28: fail closed on module imports

The generated-artifact validator explicitly rejects both dynamic imports and static imports with quoted module specifiers. The preview has no module loader and the product boundary forbids dependency/module resolution, so accepting `import './state.js'` would create a misleading or unsafe execution path. Multi-file scripts instead share the sandboxed iframe global scope in manifest order.
