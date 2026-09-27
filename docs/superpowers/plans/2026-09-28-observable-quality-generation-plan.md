# Observable, quality-focused generation implementation plan

## Milestone 1 — Contracts and truthful event persistence

1. Extend shared generation-job contracts with a tolerant structured event shape and safe defaults for legacy `{ stage, message, createdAt }` entries.
2. Add API helpers that append/update events in the existing JSONB log field without destructive data migration.
3. Add API tests for parsing legacy events and for ordered persisted events.

**Checks:** contracts build, API unit tests, existing project workspace route remains compatible.

## Milestone 2 — Blueprint and artifact generation pipeline

1. Add a Zod-validated internal blueprint contract: information architecture, data entities, visual direction, interactions, and acceptance checks.
2. Replace the single DeepSeek prompt with non-thinking JSON blueprint and artifact calls. Use explicit per-call and global deadlines: 2K blueprint, 12K artifact, 90 seconds per call.
3. Strengthen deterministic artifact validation: exact allowed paths, duplicate/file-size limits, expected entry path, and forbidden browser/network capabilities.
4. Retain local fallback; optionally make one bounded repair request after a deterministic artifact-validation failure.
5. Emit only actual request, response, validation, file-persistence, version-save, and preview-ready events.

**Checks:** success generation, malformed JSON, length response, invalid artifact, timeout/fallback, active-job protection, and ownership tests.

## Milestone 3 — Builder timeline experience

1. Update the workspace response typing and Builder event renderer.
2. Render event status, phase, optional target chips, and active/failed state accessibly in the scrollable left panel.
3. Preserve legacy-job rendering and existing files, versions, restore, polling, and preview behavior.

**Checks:** component/browser tests for in-progress and completed event sequences; desktop and narrow visual QA.

## Milestone 4 — Benchmark and delivery evidence

1. Exercise three non-template prompts: dashboard-like tool, form utility, and presentation/landing page.
2. Verify each non-fallback artifact has three page regions and three interactions, with preview-state persistence.
3. Record actual results, limitations, and public-deployment regression check in QA and decision logs.
4. Run the full build/test suite; commit and push the completed change for Render auto-deploy.

**Checks:** production build, API tests, Playwright journey, secret scan, public smoke test after Render deploy.

