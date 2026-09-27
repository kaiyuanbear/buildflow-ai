# BuildFlow AI product specification

## Purpose

BuildFlow AI is a compact AI application builder. An authenticated user describes a small browser application, watches a visible Agent execution summary, then receives generated source files, an interactive preview, and a persistent version history.

The product is a focused Atoms Demo for an engineering interview. It optimizes for a reliable, testable end-to-end path in six to eight hours of implementation time.

## Users and primary journey

1. A visitor creates an account or signs in.
2. The user lands on an Atoms-style home screen with sidebar navigation and a central product-request composer.
3. Submitting the composer creates a project and opens its Builder workspace.
4. BuildFlow AI records and displays four concise stages: analysis, planning, generation, and validation.
5. The server saves a generic application artifact, generated files, a preview state, and a project version.
6. The user interacts with the isolated preview, inspects generated files, regenerates, or restores a prior version.

## In scope

- Email/password registration and login.
- Private project dashboard and project CRUD.
- LLM-generated browser-only applications from arbitrary small product prompts; no fixed application-type catalog.
- A visible, persisted generation job with logs and failure state.
- Generic generated-file preview and version-scoped interactive state.
- Regeneration and version history/restore.
- PostgreSQL persistence, public deployment, README and automated verification.
- An Atoms-inspired information architecture: home prompt composer, recent projects, and a three-panel Builder workspace.

## Out of scope

- Arbitrary server-side code execution, package installation, or generated child-app deployment.
- Deploying generated child applications.
- Multi-user collaboration, payments, GitHub synchronization, plugin support, SEO, and ads.
- Unbounded multi-agent orchestration or arbitrary application types.

## Product constraints

- The core flow falls back to a clearly labelled local starter artifact if an AI response is unavailable.
- When configured, DeepSeek is called only by the server to generate a validated browser-only file artifact.
- Each account can access only its own projects, jobs, versions, and files.
- A project may have only one active generation job.
- Generated artifact data and preview state must survive page refresh and server restart.
- The preview runs in a sandboxed opaque-origin iframe with a restrictive CSP and cannot access BuildFlow authentication, server secrets, or network APIs.

## Acceptance criteria

- A new user can register, log in, create a project, generate different applications from different prompts, inspect the preview/files, regenerate, restore a version, refresh, and continue using the saved project.
- The Builder never presents a static-only workflow: every displayed stage maps to persisted server state.
- Error, loading, empty, and unauthorized states are visible and understandable.
- No real secret is present in source control, client bundles, logs, screenshots, or documentation; raw hidden model reasoning is not displayed.
