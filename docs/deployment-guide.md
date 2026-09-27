# Deployment guide

## Required services

- PostgreSQL: Supabase project or another managed PostgreSQL provider.
- Application host: Render or Railway.
- Source control: public GitHub repository.

## Container deployment

The repository includes a `Dockerfile` for any host that accepts a Docker image. It builds the shared contracts, API, and Vite frontend, then starts one Fastify service on `$PORT`.

The container startup command runs Drizzle migrations before starting the API. For a multi-instance production rollout, run that migration command once as a release task instead of allowing multiple instances to start it concurrently.

## Environment variables

Set these only in the local `.env` file and in the host's secret settings:

```text
DATABASE_URL=
JWT_SECRET=
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=
NODE_ENV=production
PORT=10000
```

`DEEPSEEK_API_KEY` is optional because BuildFlow AI has a deterministic fallback. Never use a `VITE_` prefix for it and never place it in documentation, screenshots, browser requests, or Git.

## Deployment sequence

1. Create the managed PostgreSQL database and copy its server-side connection string into the host secret configuration.
2. Add a strong `JWT_SECRET` (at least 32 characters) through host secrets.
3. Optionally add `DEEPSEEK_API_KEY` and the desired model name through host secrets.
4. Configure build to install dependencies, build web and API packages, then start Fastify.
5. Run database migrations once against the production connection.
6. Open the public application URL, register a clean test user, and run the browser journey from `qa-checklist.md`.

## Local production smoke test

From the repository root, build and run the compiled service with a production port:

```powershell
pnpm build
$env:PORT="3003"
$env:NODE_ENV="production"
node apps/api/dist/index.js
```

Confirm that `/`, a deep route such as `/projects/<uuid>`, and `/api/health` resolve from the same origin. This was verified locally on 2026-09-28.
