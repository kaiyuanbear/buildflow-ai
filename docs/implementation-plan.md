# BuildFlow AI implementation plan

> Superseded details: the current implementation follows the generic artifact design in [`generic-generation-architecture.md`](./generic-generation-architecture.md). The original template-specific milestones below remain historical context until the final documentation cleanup.

## Architecture

The monorepo has independent frontend and API packages. During development Vite proxies `/api` to Fastify. In production, Fastify serves the built frontend and API from one origin, simplifying cookie authentication and deployment.

```text
apps/web (React) -- /api --> apps/api (Fastify) --> PostgreSQL
                                  |
                                  +--> DeepSeek API (server-only, optional)
```

## Milestones

### M1: workspace and contracts

- Create pnpm workspace, TypeScript configuration, lint/format scripts, and shared contracts.
- Define AppSpec, generated-file, job-state, and API response schemas with Zod.
- Verify `pnpm install`, lint, typecheck, and health endpoint startup.

### M2: database and authentication

- Create Drizzle schema and migrations for users, projects, generation jobs, versions, and files.
- Add Supabase/PostgreSQL environment configuration.
- Implement password hashing, JWT cookie login, logout, current-user endpoint, and auth guard.
- Verify registrations, invalid credentials, unauthenticated access, and cross-user ownership denial.

### M3: projects and dashboard

- Implement authenticated project CRUD routes.
- Build an Atoms-inspired home screen with sidebar navigation, recent projects, prompt composer, and new-project flow.
- Verify refresh persistence and empty/error states.

### M4: generation pipeline

- Implement one active job per project and persisted stage/log transitions.
- Add deterministic AppSpec parser/template fallback.
- Add optional DeepSeek AppSpec normalization behind `DEEPSEEK_API_KEY`.
- Generate files from the validated AppSpec and save an immutable version.
- Verify success, invalid prompt, simulated AI failure, and fallback behavior.

### M5: Builder workspace and versions

- Render a three-panel Builder workspace: agent timeline/composer, source files/version history, and AppSpec-driven preview.
- Make preview templates interactive.
- Add regeneration, version list, and restore.
- Verify each template, file viewer, generation progress, regenerate, restore, and refresh.

### M6: QA and delivery

- Add API tests and Playwright end-to-end coverage.
- Run visual QA at desktop and narrow viewports.
- Deploy the single-origin service, configure secrets, run migrations, and smoke-test the public URL.
- Complete README, deployment guide, QA evidence, and interview handoff.

## API outline

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
GET    /api/projects
POST   /api/projects
GET    /api/projects/:projectId
DELETE /api/projects/:projectId
POST   /api/projects/:projectId/generate
GET    /api/projects/:projectId/jobs/latest
GET    /api/projects/:projectId/versions
POST   /api/projects/:projectId/versions/:versionId/restore
```

## Data model

- `users`: id, email, password hash, timestamps.
- `projects`: id, owner id, name, prompt, current version id, timestamps.
- `generation_jobs`: id, project id, status, stage, logs, failure reason, timestamps.
- `project_versions`: id, project id, sequence, app spec JSON, summary, timestamps.
- `generated_files`: id, version id, path, language, contents.

## Operational rules

- `.env` is local/deployment-only and ignored by Git.
- `.env.example` contains names only: `DATABASE_URL`, `JWT_SECRET`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`.
- The frontend never receives an AI key.
- Deployment uses PostgreSQL and one Fastify service; the generated frontend build is served by Fastify.
