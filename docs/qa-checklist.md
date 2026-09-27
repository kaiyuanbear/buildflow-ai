# BuildFlow AI QA checklist

## API checks

- [ ] Health endpoint returns 200.
- [ ] Registration succeeds with a valid new email.
- [ ] Duplicate email and invalid password are rejected.
- [ ] Login creates a valid authenticated session.
- [ ] Logout removes the session.
- [ ] Unauthenticated project access returns 401.
- [ ] A user cannot read or mutate another user's project.
- [ ] Project CRUD persists after restart.
- [ ] Generation persists stage transitions and logs.
- [ ] A project cannot run concurrent generation jobs.
- [ ] Generation stores files and a version.
- [ ] Regeneration creates a later version.
- [ ] Version restore updates the active version.

## Browser journey

- [ ] Register and land on the dashboard.
- [ ] Create a project and start a generation.
- [ ] Observe all workflow stages.
- [ ] Inspect generated files.
- [ ] Use a preview interaction.
- [ ] Regenerate and restore an older version.
- [ ] Refresh and verify persisted state.
- [ ] Log out and verify protected routes redirect.

## Visual checks

- [ ] Login, dashboard, builder loading, builder completion, empty, and error states are inspected.
- [ ] Desktop Builder columns are readable without clipping.
- [ ] Narrow viewport has no unintended horizontal overflow.
- [ ] Interactive controls visibly change state and remain usable.

## Delivery checks

- [ ] Public deployment is reachable.
- [ ] GitHub repository is public.
- [ ] README documents setup, testing, deployment, demo flow, and scope decisions.
- [ ] `.env` is ignored and `.env.example` has no secrets.
- [ ] Public deployment is smoke-tested with a new account.
