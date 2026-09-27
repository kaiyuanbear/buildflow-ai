# BuildFlow AI product specification

## Purpose

BuildFlow AI is a compact AI application builder. An authenticated user describes a small web application, watches a visible agent workflow, then receives an interactive preview, generated source files, and a persistent version history.

The product is a focused Atoms Demo for an engineering interview. It optimizes for a reliable, testable end-to-end path in six to eight hours of implementation time.

## Users and primary journey

1. A visitor creates an account or signs in.
2. The user creates a project and writes a product request.
3. The user starts generation from the Builder workspace.
4. BuildFlow AI records and displays four stages: analysis, planning, generation, and validation.
5. The system saves an `AppSpec`, generated files, and a project version.
6. The user interacts with the preview, inspects generated files, regenerates, or restores a prior version.

## In scope

- Email/password registration and login.
- Private project dashboard and project CRUD.
- Controlled generation for task manager, SaaS landing page, and dashboard templates.
- A visible, persisted generation job with logs and failure state.
- AppSpec-driven interactive preview and generated source files.
- Regeneration and version history/restore.
- PostgreSQL persistence, public deployment, README and automated verification.

## Out of scope

- Arbitrary code execution, package installation, or sandboxing.
- Deploying generated child applications.
- Multi-user collaboration, payments, GitHub synchronization, plugin support, SEO, and ads.
- Unbounded multi-agent orchestration or arbitrary application types.

## Product constraints

- The core flow must function without an AI key through a deterministic template fallback.
- When configured, DeepSeek is called only by the server to normalize a prompt into a validated AppSpec.
- Each account can access only its own projects, jobs, versions, and files.
- A project may have only one active generation job.
- Generated data must survive page refresh and server restart.

## Acceptance criteria

- A new user can register, log in, create a project, generate an app, inspect the preview/files, regenerate, restore a version, refresh, and continue using the saved project.
- The Builder never presents a static-only workflow: every displayed stage maps to persisted server state.
- Error, loading, empty, and unauthorized states are visible and understandable.
- No real secret is present in source control, client bundles, logs, screenshots, or documentation.
