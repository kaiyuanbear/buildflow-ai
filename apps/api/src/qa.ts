import { and, eq } from "drizzle-orm";
import { config } from "dotenv";
import { buildApp } from "./app.js";
import { getDatabase } from "./db/client.js";
import { generationJobs } from "./db/schema.js";

config({ path: "../../.env" });
process.env.NODE_ENV = "test";

type Session = { cookie?: string };
type ApiResult<T> = { statusCode: number; body: T };

const app = buildApp();

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function call<T>(session: Session, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: unknown): Promise<ApiResult<T>> {
  const response = await app.inject({
    method,
    url,
    headers: { ...(session.cookie ? { cookie: session.cookie } : {}), ...(payload === undefined ? {} : { "content-type": "application/json" }) },
    payload: payload === undefined ? undefined : JSON.stringify(payload)
  });
  const setCookie = response.headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (cookie) session.cookie = cookie.split(";")[0];
  return { statusCode: response.statusCode, body: response.body ? JSON.parse(response.body) as T : undefined as T };
}

async function main() {
  const owner: Session = {};
  const guest: Session = {};
  const email = `qa-${crypto.randomUUID().slice(0, 12)}@example.com`;
  const password = "BuildFlowQaPass123!";
  let projectId: string | undefined;

  try {
    console.log("QA: auth checks");
    expect((await call<{ code: string }>({}, "GET", "/api/projects")).statusCode === 401, "Unauthenticated project reads must return 401.");

    expect((await call(owner, "POST", "/api/auth/register", { email, password })).statusCode === 201, "Registration must succeed.");
    expect((await call({}, "POST", "/api/auth/register", { email, password })).statusCode === 409, "Duplicate registration must return 409.");
    expect((await call({}, "POST", "/api/auth/login", { email, password: "incorrect-password" })).statusCode === 401, "Invalid credentials must return 401.");
    expect((await call(owner, "POST", "/api/auth/logout", {})).statusCode === 204, "Logout must succeed.");
    expect((await call<{ code: string }>(owner, "GET", "/api/auth/me")).statusCode === 401, "Logged-out sessions must not reach /me.");
    expect((await call(owner, "POST", "/api/auth/login", { email, password })).statusCode === 200, "Login must create a new session.");

    console.log("QA: ownership checks");
    const created = await call<{ project: { id: string } }>(owner, "POST", "/api/projects", { name: "QA project", prompt: "Create a small reading tracker with a list and progress controls." });
    expect(created.statusCode === 201, "Project creation must succeed.");
    projectId = created.body.project.id;

    expect((await call(guest, "POST", "/api/auth/register", { email: `qa-guest-${crypto.randomUUID().slice(0, 12)}@example.com`, password })).statusCode === 201, "Guest registration must succeed.");
    expect((await call<{ code: string }>(guest, "GET", `/api/projects/${projectId}`)).statusCode === 404, "A second user must not read the owner project.");
    expect((await call<{ code: string }>(guest, "GET", `/api/projects/${projectId}/workspace`)).statusCode === 404, "A second user must not read the owner workspace.");

    console.log("QA: concurrency checks");
    const db = getDatabase();
    expect(db, "QA requires DATABASE_URL.");
    const activeJob = () => ({ projectId: projectId!, status: "running" as const, stage: "analysis" as const, logs: [] });
    const concurrent = await Promise.allSettled([db.insert(generationJobs).values(activeJob()).returning(), db.insert(generationJobs).values(activeJob()).returning()]);
    expect(concurrent.filter((result) => result.status === "fulfilled").length === 1, "Database must permit only one active job per project.");
    await db.delete(generationJobs).where(and(eq(generationJobs.projectId, projectId), eq(generationJobs.status, "running")));
    await db.insert(generationJobs).values(activeJob());
    expect((await call<{ code: string }>(owner, "POST", `/api/projects/${projectId}/generate`, {})).statusCode === 409, "A project with an active job must reject generation.");
    await db.delete(generationJobs).where(and(eq(generationJobs.projectId, projectId), eq(generationJobs.status, "running")));

    console.log("QA: generation and preview-state checks");
    const first = await call<{ job: { logs: Array<{ phase?: string; kind?: string; target?: string }> }; version: { id: string; sequence: string }; files: Array<{ path: string }> }>(owner, "POST", `/api/projects/${projectId}/generate`, {});
    expect(first.statusCode === 201 && first.body.version.sequence === "1" && first.body.files.some((file) => file.path === "index.html"), "First generation must save version 1 and files.");
    expect(first.body.job.logs.length >= 8 && first.body.job.logs.some((log) => log.kind === "file_write" && log.target === "app.js") && first.body.job.logs.some((log) => log.kind === "preview_ready"), "Generation must persist truthful file-write and preview-ready events.");
    expect((await call<{ code: string }>(guest, "PUT", `/api/projects/${projectId}/versions/${first.body.version.id}/preview-state`, { saved: true })).statusCode === 404, "A second user must not write preview state.");
    expect((await call(owner, "PUT", `/api/projects/${projectId}/versions/${first.body.version.id}/preview-state`, { saved: true, count: 1 })).statusCode === 200, "Preview state must save.");
    const firstWorkspace = await call<{ version: { id: string }; previewState: { saved?: boolean; count?: number } }>(owner, "GET", `/api/projects/${projectId}/workspace`);
    expect(firstWorkspace.statusCode === 200 && firstWorkspace.body.version.id === first.body.version.id && firstWorkspace.body.previewState.saved === true && firstWorkspace.body.previewState.count === 1, "Preview state must persist on a fresh workspace read.");

    console.log("QA: version-history and restore checks");
    const second = await call<{ version: { id: string; sequence: string } }>(owner, "POST", `/api/projects/${projectId}/generate`, { instruction: "Make the layout denser and add a weekly progress summary." });
    expect(second.statusCode === 201 && second.body.version.sequence === "2", "Optimization must create version 2.");
    const history = await call<{ versions: Array<{ id: string; sequence: string }> }>(owner, "GET", `/api/projects/${projectId}/versions`);
    expect(history.statusCode === 200 && history.body.versions.length === 2 && history.body.versions[0]?.id === second.body.version.id, "Version history must include both versions in descending order.");
    const historical = await call<{ version: { id: string; sequence: string } }>(owner, "GET", `/api/projects/${projectId}/workspace?versionId=${first.body.version.id}`);
    expect(historical.statusCode === 200 && historical.body.version.id === first.body.version.id, "Historical workspace reads must return the requested version.");
    expect((await call(owner, "POST", `/api/projects/${projectId}/versions/${first.body.version.id}/restore`, {})).statusCode === 200, "Restore must succeed.");
    const restored = await call<{ project: { currentVersionId: string }; version: { id: string } }>(owner, "GET", `/api/projects/${projectId}/workspace`);
    expect(restored.statusCode === 200 && restored.body.project.currentVersionId === first.body.version.id && restored.body.version.id === first.body.version.id, "Restore must update the default current version.");

    expect((await call(owner, "DELETE", `/api/projects/${projectId}`)).statusCode === 204, "Temporary QA project must delete successfully.");
    projectId = undefined;
    console.log("QA: cleanup complete");
    console.log("API QA passed: auth, ownership, concurrency, generation, preview state, versions, and restore.");
  } finally {
    if (projectId) await call(owner, "DELETE", `/api/projects/${projectId}`).catch(() => undefined);
    await app.close();
  }
}

main().then(() => process.exit(0)).catch((reason) => {
  console.error(reason instanceof Error ? reason.message : "API QA failed.");
  process.exit(1);
});
