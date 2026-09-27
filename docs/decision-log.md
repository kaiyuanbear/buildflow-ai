# Decision log

## 2026-09-27: constrained application generation

BuildFlow AI will generate a validated AppSpec and deterministic source-file templates instead of executing arbitrary user-generated code. This keeps the interview demo reliable, secure, and achievable within the stated time budget while preserving a real agent-driven build flow.

## 2026-09-27: single-origin production deployment

The React frontend and Fastify API remain separate packages but are deployed as one service. This avoids cross-origin cookie complexity and makes authentication and deployment easier to demonstrate.
