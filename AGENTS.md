# BuildFlow AI

## Product goal

Build a runnable AI app-builder demo:

`prompt -> visible agent workflow -> generated files -> interactive preview -> saved versions`

## Stack

- Web: React, Vite, TypeScript, Tailwind CSS
- API: Fastify, TypeScript, Zod
- Data: PostgreSQL, Drizzle ORM
- Auth: bcryptjs and HttpOnly JWT cookie
- Tests: Vitest and Playwright

## Scope rules

- Implement only the documented BuildFlow AI flow.
- Use constrained `AppSpec` templates for generation and preview.
- Do not execute arbitrary user-generated code.
- Persist projects, jobs, versions and generated files.
- Prefer a reliable end-to-end demo over additional features.

## Security

- Never expose, commit, or log secrets.
- Keep `.env` ignored and `.env.example` value-free.
- DeepSeek requests must originate only from the API server.
- Enforce project ownership on every protected API route.

## Workflow

- Read `docs/product-spec.md` and `docs/implementation-plan.md` before coding.
- Finish one milestone and run its checks before moving forward.
- Record QA evidence in `docs/qa-checklist.md`.
- Record any intentional architecture or scope change in `docs/decision-log.md`.
