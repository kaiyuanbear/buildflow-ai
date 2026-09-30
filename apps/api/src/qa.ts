import { and, eq } from "drizzle-orm";
import { generatedApplicationSchema, storedAppSpecSchema } from "@buildflow/contracts";
import { config } from "dotenv";
import { buildApp } from "./app.js";
import { getDatabase } from "./db/client.js";
import { generationJobs } from "./db/schema.js";
import { buildIncrementalCapabilitySummary, createGenerationFallback, getQualityGaps, validateGeneratedApplication, validateIncrementalContinuity } from "./routes/generation.js";

config({ path: "../../.env" });
process.env.NODE_ENV = "test";

type Session = { cookie?: string };
type ApiResult<T> = { statusCode: number; body: T };

const app = buildApp();

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectThrows(action: () => unknown, message: string) {
  try { action(); } catch { return; }
  throw new Error(message);
}

function runArtifactContractChecks() {
  const appSpec = { appName: "Contract QA", tagline: "Validate the multi-file artifact contract.", features: ["Manifest", "Compatibility"], preview: { entryPath: "index.html" } };
  const multiFile = {
    appSpec,
    manifest: { styles: ["styles/tokens.css", "styles/layout.css"], scripts: ["src/state.js", "src/ui.js", "src/app.js"] },
    files: [
      { path: "index.html", language: "html", contents: "<html lang=\"zh-CN\"><main>合约校验</main></html>" },
      { path: "README.md", language: "md", contents: "# Contract QA" },
      { path: "styles/tokens.css", language: "css", contents: ":root{color:#111}" },
      { path: "styles/layout.css", language: "css", contents: "main{display:grid}" },
      { path: "src/state.js", language: "js", contents: "const state={};" },
      { path: "src/ui.js", language: "js", contents: "function render(){}" },
      { path: "src/app.js", language: "js", contents: "render();" }
    ]
  };
  expect(generatedApplicationSchema.safeParse(multiFile).success, "A complete multi-file manifest artifact must parse.");
  const scopedMetadata = storedAppSpecSchema.parse({ ...appSpec, generationRequest: { prompt: "Create a compact tracker.", instruction: "Replace the navigation model.", changeScope: { productPurpose: false, interactions: true, fileStructure: false } } }) as { generationRequest?: { changeScope?: { interactions?: boolean } } };
  expect(scopedMetadata.generationRequest?.changeScope?.interactions === true, "Stored version metadata must retain the explicit incremental change scope.");
  const inferredManifest = validateGeneratedApplication({ ...multiFile, manifest: {} });
  expect(inferredManifest.manifest?.styles.length === 2 && inferredManifest.manifest.scripts.length === 3, "A complete multi-file artifact with an omitted manifest order must safely infer its local manifest.");
  expect(!generatedApplicationSchema.safeParse({ ...multiFile, manifest: { ...multiFile.manifest, styles: ["styles/tokens.css", "styles/missing.css"] } }).success, "A manifest must reference every generated stylesheet exactly once.");
  expect(!generatedApplicationSchema.safeParse({ ...multiFile, files: [...multiFile.files, { path: "assets/logo.svg", language: "md", contents: "not allowed" }] }).success, "Multi-file artifacts must reject paths outside the whitelist.");
  expect(generatedApplicationSchema.safeParse({ appSpec, files: [{ path: "index.html", language: "html", contents: "<main />" }, { path: "styles.css", language: "css", contents: "" }, { path: "app.js", language: "js", contents: "" }] }).success, "Legacy artifacts without a manifest must remain compatible.");
  expect(validateGeneratedApplication(multiFile).manifest?.scripts.at(-1) === "src/app.js", "The API validator must accept the complete manifest artifact.");
  expect(validateGeneratedApplication({ ...multiFile, appSpec: { appName: appSpec.appName, tagline: appSpec.tagline } }).appSpec.features.length >= 2, "The API validator must normalize absent display metadata without weakening artifact validation.");
  expectThrows(() => validateGeneratedApplication({ ...multiFile, files: multiFile.files.map((file) => file.path === "src/app.js" ? { ...file, contents: "import './state.js';" } : file) }), "The API validator must reject JavaScript imports.");
  const qualityReady = {
    ...multiFile,
    files: multiFile.files.map((file) => file.path === "index.html" ? { ...file, contents: "<html lang=\"zh-CN\"><header>页头</header><nav>导航</nav><main>主内容</main><section>概览</section><aside>详情</aside><footer>页脚</footer></html>" } : file.path === "styles/layout.css" ? { ...file, contents: "main{display:grid}@media (max-width:640px){main{display:block}}" } : file.path === "src/app.js" ? { ...file, contents: "const seed=[{title:'演示'}];const panel=document.createElement('div');panel.addEventListener('click',()=>{});panel.addEventListener('change',()=>{});panel.addEventListener('input',()=>{});panel.addEventListener('keydown',()=>{});panel.textContent=seed[0].title;" } : file)
  };
  const blueprint = { complexityTarget: { minimumRegions: 5, minimumInteractions: 4, minimumDataEntities: 1, requiresResponsiveLayout: true } } as Parameters<typeof getQualityGaps>[1];
  expect(getQualityGaps(validateGeneratedApplication(qualityReady), blueprint).length === 0, "A complete quality-ready artifact must pass deterministic quality checks.");
  const missingNavigationTarget = validateGeneratedApplication({ ...qualityReady, files: qualityReady.files.map((file) => file.path === "index.html" ? { ...file, contents: '<html lang="zh-CN"><header>页头 <a href="#missing-panel">查看详情</a></header><nav>导航</nav><main>主内容</main><section>概览</section><aside>详情</aside><footer>页脚</footer></html>' } : file) });
  expect(getQualityGaps(missingNavigationTarget, blueprint).some((gap) => gap.includes("内部导航缺少目标内容")), "An internal navigation target must resolve to concrete generated content.");
  const bridgedDemoState = { ...qualityReady, files: qualityReady.files.map((file) => file.path === "src/app.js" ? { ...file, contents: "const savedState=window.__BUILDFLOW_INITIAL_STATE__;const state={trips:Array.isArray(savedState?.trips)?savedState.trips:[{name:'西湖'}]};const panel=document.createElement('div');panel.addEventListener('click',()=>{});panel.addEventListener('change',()=>{});panel.addEventListener('input',()=>{});panel.addEventListener('keydown',()=>{});panel.textContent=state.trips[0].name;" } : file) };
  expect(getQualityGaps(validateGeneratedApplication(bridgedDemoState), blueprint).length === 0, "A non-empty preview bridge default must count as meaningful initial demo data.");
  expect(validateGeneratedApplication({ ...qualityReady, files: qualityReady.files.map((file) => file.path === "src/app.js" ? { ...file, contents: "const state=window.__BUILDFLOW_INITIAL_STATE__||{films:[{title:'默认影片'}]};state.films.filter(Boolean);" } : file) }).files.length === qualityReady.files.length, "A standard default-state expression must remain compatible with an empty preview bridge.");
  expectThrows(() => validateGeneratedApplication({ ...qualityReady, files: qualityReady.files.map((file) => file.path === "index.html" ? { ...file, contents: "<html lang=\"en\"><main>Movie home</main></html>" } : file) }), "An artifact must provide a Chinese default interface.");
  const chineseScriptCopy = validateGeneratedApplication({ ...qualityReady, files: qualityReady.files.map((file) => file.path === "index.html" ? { ...file, contents: "<html lang=\"zh-CN\"><header></header><nav></nav><main></main><section></section><aside></aside><footer></footer></html>" } : file.path === "src/app.js" ? { ...file, contents: "const title='简体中文界面';const panel=document.createElement('div');panel.addEventListener('click',()=>{});panel.addEventListener('change',()=>{});panel.addEventListener('input',()=>{});panel.addEventListener('keydown',()=>{});panel.textContent=title;" } : file) });
  expect(chineseScriptCopy.appSpec.preview.entryPath === "index.html", "Chinese runtime copy may be rendered by JavaScript rather than duplicated in static HTML.");
  expect(getQualityGaps(validateGeneratedApplication(multiFile), blueprint).length > 0, "A structurally valid but sparse artifact must fail deterministic quality checks.");

  const previousApplication = validateGeneratedApplication({ ...qualityReady, files: qualityReady.files.map((file) => file.path === "index.html" ? { ...file, contents: "<html lang=\"zh-CN\"><header id=\"header\">页头</header><nav id=\"tabs\">导航</nav><main id=\"workspace\">主内容</main><section id=\"summary\">概览</section><aside id=\"details\">详情</aside><footer>页脚</footer></html>" } : file) });
  const previous = { versionId: "00000000-0000-0000-0000-000000000001", sequence: "1", appSpec: { ...previousApplication.appSpec, artifactManifest: previousApplication.manifest }, files: previousApplication.files };
  const summary = buildIncrementalCapabilitySummary(previous);
  expect(summary.filePaths.includes("src/ui.js") && summary.componentIds.includes("tabs") && summary.interactionCount >= 4, "An incremental summary must expose bounded capabilities without source code.");
  expect(!JSON.stringify(summary).includes("panel.addEventListener"), "An incremental summary must not expose generated source code.");
  validateIncrementalContinuity(previousApplication, previous);
  const discontinuousCandidate = validateGeneratedApplication({
    ...previousApplication,
    manifest: { ...previousApplication.manifest!, scripts: ["src/state.js", "src/extra.js", "src/app.js"] },
    files: previousApplication.files.map((file) => file.path === "src/ui.js" ? { ...file, path: "src/extra.js" } : file)
  });
  expectThrows(() => validateIncrementalContinuity(discontinuousCandidate, previous), "An incremental artifact must retain existing runtime file paths.");
  validateIncrementalContinuity(discontinuousCandidate, previous, { productPurpose: false, interactions: false, fileStructure: true });
  const changedInteractions = validateGeneratedApplication({
    ...previousApplication,
    files: previousApplication.files.map((file) => file.path === "index.html" ? { ...file, contents: "<html lang=\"zh-CN\"><header id=\"header\">页头</header><nav id=\"new-tabs\">新导航</nav><main id=\"workspace\">主内容</main><section id=\"summary\">概览</section><aside id=\"details\">详情</aside><footer>页脚</footer></html>" } : file)
  });
  expectThrows(() => validateIncrementalContinuity(changedInteractions, previous), "An incremental artifact must retain stable component identifiers when interactions are not explicitly changed.");
  validateIncrementalContinuity(changedInteractions, previous, { productPurpose: false, interactions: true, fileStructure: false });

  const interactionPreviousApplication = validateGeneratedApplication({
    ...previousApplication,
    files: previousApplication.files.map((file) => file.path === "index.html"
      ? { ...file, contents: `<html lang="zh-CN"><header id="header">页头</header><nav id="tabs">导航</nav><main id="workspace">${Array.from({ length: 25 }, (_, index) => `<div id="slot${index + 1}"></div>`).join("")}<button id="consultClose">我知道了</button><button id="consultSubmit">提交咨询</button></main><section id="summary">概览</section><aside id="details">详情</aside><footer>页脚</footer></html>` }
      : file.path === "src/app.js"
        ? { ...file, contents: "document.getElementById('tabs').addEventListener('click',()=>{});const close=document.getElementById('consultClose');close.addEventListener('click',()=>{});const submit=document.getElementById('consultSubmit');submit.addEventListener('click',()=>{});" }
        : file)
  });
  const interactionPrevious = { versionId: "00000000-0000-0000-0000-000000000002", sequence: "2", appSpec: { ...interactionPreviousApplication.appSpec, artifactManifest: interactionPreviousApplication.manifest }, files: interactionPreviousApplication.files };
  const interactionSummary = buildIncrementalCapabilitySummary(interactionPrevious);
  expect(interactionSummary.componentIds.includes("consultClose") && interactionSummary.interactionBindings.some((binding) => binding.id === "consultClose" && binding.event === "click"), "An incremental summary must include interaction targets beyond the former component-ID truncation boundary.");
  const weakenedInteractionCandidate = validateGeneratedApplication({
    ...interactionPreviousApplication,
    files: interactionPreviousApplication.files.map((file) => file.path === "src/app.js" ? { ...file, contents: "document.getElementById('tabs').addEventListener('click',()=>{});" } : file)
  });
  expectThrows(() => validateIncrementalContinuity(weakenedInteractionCandidate, interactionPrevious), "An incremental artifact must retain existing element event bindings and interaction coverage.");
  validateIncrementalContinuity(weakenedInteractionCandidate, interactionPrevious, { productPurpose: false, interactions: true, fileStructure: false });

  const retainedFallback = createGenerationFallback("新增学校荣誉", interactionPrevious);
  expect(retainedFallback.files.every((file) => interactionPrevious.files.some((previousFile) => previousFile.path === file.path && previousFile.contents === file.contents)), "An incremental fallback must retain the prior artifact instead of replacing it with a starter application.");
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
    console.log("QA: multi-file artifact contract checks");
    runArtifactContractChecks();
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
    const first = await call<{ job: { versionId: string | null; logs: Array<{ phase?: string; kind?: string; target?: string }> }; version: { id: string; sequence: string; appSpec: { generationRequest?: { prompt: string; instruction?: string } } }; files: Array<{ path: string }> }>(owner, "POST", `/api/projects/${projectId}/generate`, {});
    expect(first.statusCode === 201 && first.body.version.sequence === "1" && first.body.files.some((file) => file.path === "index.html"), "First generation must save version 1 and files.");
    expect(first.body.version.appSpec.generationRequest?.prompt === "Create a small reading tracker with a list and progress controls." && !first.body.version.appSpec.generationRequest.instruction, "The first version must persist its original product prompt.");
    expect(first.body.job.versionId === first.body.version.id && first.body.job.logs[0]?.target?.includes("Create a small reading tracker"), "The initial generation job must own v1 and begin with its original prompt.");
    expect(first.body.job.logs.length >= 8 && first.body.job.logs.some((log) => log.kind === "file_write" && log.target === "app.js") && first.body.job.logs.some((log) => log.kind === "preview_ready"), "Generation must persist truthful file-write and preview-ready events.");
    expect((await call<{ code: string }>(guest, "PUT", `/api/projects/${projectId}/versions/${first.body.version.id}/preview-state`, { saved: true })).statusCode === 404, "A second user must not write preview state.");
    expect((await call(owner, "PUT", `/api/projects/${projectId}/versions/${first.body.version.id}/preview-state`, { saved: true, count: 1 })).statusCode === 200, "Preview state must save.");
    const firstWorkspace = await call<{ version: { id: string }; previewState: { saved?: boolean; count?: number } }>(owner, "GET", `/api/projects/${projectId}/workspace`);
    expect(firstWorkspace.statusCode === 200 && firstWorkspace.body.version.id === first.body.version.id && firstWorkspace.body.previewState.saved === true && firstWorkspace.body.previewState.count === 1, "Preview state must persist on a fresh workspace read.");

    console.log("QA: version-history and restore checks");
    const second = await call<{ job: { versionId: string | null; logs: Array<{ target?: string }> }; version: { id: string; sequence: string; appSpec: { generationRequest?: { prompt: string; instruction?: string } } } }>(owner, "POST", `/api/projects/${projectId}/generate`, { instruction: "Make the layout denser and add a weekly progress summary." });
    expect(second.statusCode === 201 && second.body.version.sequence === "2", "Optimization must create version 2.");
    expect(second.body.version.appSpec.generationRequest?.instruction === "Make the layout denser and add a weekly progress summary.", "An optimized version must persist its optimization prompt.");
    expect(second.body.job.versionId === second.body.version.id && second.body.job.logs[0]?.target?.includes("Make the layout denser"), "The optimized generation job must own v2 and begin with its optimization prompt.");
    const history = await call<{ versions: Array<{ id: string; sequence: string }> }>(owner, "GET", `/api/projects/${projectId}/versions`);
    expect(history.statusCode === 200 && history.body.versions.length === 2 && history.body.versions[0]?.id === second.body.version.id, "Version history must include both versions in descending order.");
    const promptWorkspace = await call<{ job: { logs: Array<{ target?: string }> }; jobs: Array<{ versionId: string | null; logs: Array<{ target?: string }> }> }>(owner, "GET", `/api/projects/${projectId}/workspace`);
    const timelineTargets = promptWorkspace.body.job.logs.map((log) => log.target ?? "").join("\n");
    expect(promptWorkspace.statusCode === 200 && promptWorkspace.body.jobs.length === 2 && promptWorkspace.body.jobs[0]?.versionId === first.body.version.id && promptWorkspace.body.jobs[1]?.versionId === second.body.version.id && timelineTargets.indexOf("Create a small reading tracker") < timelineTargets.indexOf("Make the layout denser"), "Workspace must keep job/version ownership and show requests in chronological version order.");
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
