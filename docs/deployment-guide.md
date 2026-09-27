# Deployment guide

## Required services

- PostgreSQL: Supabase project or another managed PostgreSQL provider.
- Application host: Render or Railway.
- Source control: public GitHub repository.

## Environment variables

Set these only in the local `.env` file and in the host's secret settings:

```text
DATABASE_URL=
JWT_SECRET=
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=
NODE_ENV=production
```

`DEEPSEEK_API_KEY` is optional because BuildFlow AI has a deterministic fallback. Never use a `VITE_` prefix for it and never place it in documentation, screenshots, browser requests, or Git.

## Deployment sequence

1. Create the managed PostgreSQL database and copy its server-side connection string into the host secret configuration.
2. Add a strong `JWT_SECRET` through host secrets.
3. Optionally add `DEEPSEEK_API_KEY` and the desired model name through host secrets.
4. Configure build to install dependencies, build web and API packages, then start Fastify.
5. Run database migrations once against the production connection.
6. Open the public application URL, register a clean test user, and run the browser journey from `qa-checklist.md`.
