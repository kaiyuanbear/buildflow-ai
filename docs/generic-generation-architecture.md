# Generic LLM generation architecture

## Product contract

BuildFlow AI does not choose a prebuilt resume, todo, ecommerce, or dashboard template. Given a small product prompt, the server asks the LLM to return a validated browser-only application artifact.

The persisted artifact contains:

- an application name, short summary, features, and persisted structured execution events;
- a manifest-driven 7–12 file application: root `index.html` and `README.md`, `styles/*.css`, and `src/*.js` files;
- one explicit manifest order for CSS and JavaScript assets, with `index.html` as the preview entry;
- a generic JSON preview state scoped to one project version.

Older four-file artifacts (`index.html`, `styles.css`, `app.js`, optional `README.md`) remain supported for historical versions and explicit fallback output.

## Safe preview boundary

The browser combines generated CSS and JavaScript into `iframe.srcDoc` strictly in manifest order and renders the iframe with `sandbox="allow-scripts"`. A restrictive Content Security Policy blocks network access, external scripts, forms, popups, and parent-page access. The validator also rejects CSS `url()`, static/dynamic `import`, browser storage, external URLs and cookie access. Generated JavaScript can use only browser-local interactions and the injected `__BUILDFLOW_SAVE_STATE__` bridge.

This supports demonstrable small front-end applications. It deliberately excludes generated server code, third-party integrations, package installation, and child-application deployment.

## Revised steps 1–9

1. Foundation and generic contracts.
2. Authentication, project persistence, versions, files, and generic preview state.
3. Atoms-inspired home and Builder navigation.
4. DeepSeek generation into a validated generic artifact; local starter fallback.
5. Visible Agent workflow: enter the Builder immediately, poll persisted job stages, expose loading/failure states, and retry safely.
6. Regenerate, version list, restore, and final preview-state/version integration.
7. API, browser, visual, and security QA.
8. Single-origin deployment and production smoke test.
9. README, QA evidence, demo script, and final delivery review.

## Legacy note

`project_tasks` was introduced in an earlier todo-only prototype. It is no longer used by the generic generation path. It is retained temporarily to avoid an unapproved destructive migration.
