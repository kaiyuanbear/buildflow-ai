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
