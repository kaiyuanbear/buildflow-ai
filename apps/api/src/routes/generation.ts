import { and, eq, inArray } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { complexityTargetSchema, generatedApplicationSchema, previewStateSchema, type GeneratedApplication, type GenerationEvent, type GenerationEventKind, type GenerationEventPhase, type GenerationEventStatus, type GenerationLogEntry } from "@buildflow/contracts";
import { z } from "zod";
import { getDatabase } from "../db/client.js";
import { generatedFiles, generationJobs, projects, projectPreviewStates, projectVersions } from "../db/schema.js";

const projectParams = z.object({ projectId: z.string().uuid() });
const versionParams = projectParams.extend({ versionId: z.string().uuid() });
const workspaceQuery = z.object({ versionId: z.string().uuid().optional() });
const generateBody = z.object({ instruction: z.string().trim().min(3).max(2_000).optional() });
const legacyAllowedPaths = ["index.html", "styles.css", "app.js", "README.md"] as const;
const modelTimeoutMs = 100_000;
const wholeGenerationTimeoutMs = 300_000;
const generationBlueprintSchema = z.object({
  appName: z.string().min(2).max(80).catch("Generated Product"),
  tagline: z.string().min(2).max(160).catch("A focused browser application generated from your request."),
  visualDirection: z.string().min(12).max(280).catch("A deliberate responsive visual system with clear hierarchy and accessible contrast."),
  regions: z.array(z.object({ name: z.string().min(2).max(60), purpose: z.string().min(6).max(160) })).min(3).max(6).catch([{ name: "Overview", purpose: "Summarize the current state and important information." }, { name: "Workspace", purpose: "Provide the primary interactive controls and content." }, { name: "Insights", purpose: "Show useful secondary details and progress." }]),
  dataEntities: z.array(z.object({ name: z.string().min(2).max(60), fields: z.array(z.string().min(1).max(50)).min(1).max(6) })).min(1).max(3).catch([{ name: "Item", fields: ["title", "status", "note"] }]),
  interactions: z.array(z.string().min(6).max(180)).min(3).max(6).catch(["Create and update local items.", "Filter or search the displayed content.", "Show a summary that reacts to local changes."]),
  acceptanceChecks: z.array(z.string().min(6).max(180)).min(3).max(6).catch(["The application has three visible regions.", "Local interactions update the rendered UI.", "The layout remains usable on narrow screens."]),
  complexityTarget: complexityTargetSchema.catch({ minimumRegions: 5, minimumInteractions: 4, minimumDataEntities: 1, requiresResponsiveLayout: true })
}).passthrough();
type GenerationBlueprint = z.infer<typeof generationBlueprintSchema>;
type EmitEvent = (phase: GenerationEventPhase, kind: GenerationEventKind, status: GenerationEventStatus, message: string, target?: string) => Promise<void>;
const eventAt = (phase: GenerationEventPhase, kind: GenerationEventKind, status: GenerationEventStatus, message: string, target?: string): GenerationEvent => ({ phase, kind, status, message, ...(target ? { target } : {}), createdAt: new Date().toISOString() });

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function createFallbackApplication(prompt: string): GeneratedApplication {
  const promptText = safeJson(prompt);
  return generatedApplicationSchema.parse({
    appSpec: {
      appName: "BuildFlow 本地起步应用",
      tagline: "AI 暂时不可用时，为你的想法生成的本地可交互起步应用。",
      features: ["记录需求", "添加想法", "在预览中继续完善"],
      preview: { entryPath: "index.html" },
      plan: [
        { stage: "analysis", message: "已理解产品需求与核心使用场景。" },
        { stage: "planning", message: "已准备轻量单页应用方案。" },
        { stage: "generation", message: "已创建浏览器端可交互起步应用。" },
        { stage: "validation", message: "已准备隔离预览所需文件。" }
      ]
    },
    files: [
      { path: "index.html", language: "html", contents: "<main class=\"app\"><p class=\"eyebrow\">本地起步应用</p><h1 id=\"title\"></h1><p id=\"prompt\"></p><form id=\"idea-form\"><input id=\"idea\" placeholder=\"输入一个产品想法\" maxlength=\"120\" required><button>保存想法</button></form><ul id=\"ideas\"></ul></main>" },
      { path: "styles.css", language: "css", contents: "*{box-sizing:border-box}body{margin:0;background:#f4f6fb;color:#1b2437;font-family:Inter,system-ui,sans-serif}.app{max-width:760px;margin:8vh auto;padding:44px;background:#fff;border:1px solid #e5e8f0;border-radius:24px;box-shadow:0 18px 55px #17204014}.eyebrow{color:#635bdb;font-size:12px;font-weight:800;letter-spacing:.12em}h1{font-size:38px;margin:8px 0}#prompt{color:#5d6677;line-height:1.6}form{display:flex;gap:8px;margin:28px 0}input{flex:1;padding:12px;border:1px solid #ccd3e2;border-radius:10px}button{border:0;border-radius:10px;padding:12px 16px;background:#635bdb;color:#fff;font-weight:700;cursor:pointer}li{margin:8px 0;padding:12px;border-radius:10px;background:#f4f5ff}" },
      { path: "app.js", language: "js", contents: `const request=${promptText};const state=window.__BUILDFLOW_INITIAL_STATE__||{ideas:[]};document.querySelector('#title').textContent='你的应用原型';document.querySelector('#prompt').textContent=request;const list=document.querySelector('#ideas');function render(){list.innerHTML='';state.ideas.forEach((idea)=>{const item=document.createElement('li');item.textContent=idea;list.append(item)})}document.querySelector('#idea-form').addEventListener('submit',(event)=>{event.preventDefault();const input=document.querySelector('#idea');state.ideas.push(input.value.trim());input.value='';window.__BUILDFLOW_SAVE_STATE__(state);render()});render();` },
      { path: "README.md", language: "md", contents: "当前未取得可用的 AI 产物，因此使用本地起步应用。配置服务端 DEEPSEEK_API_KEY 后可按提示词生成定制应用。" }
    ]
  });
}

const blueprintInstructions = `Return JSON only. You are designing a small, original browser-only application from the user's product request. Do not write source code and do not choose from a fixed application catalog. Return exactly: {"appName":string,"tagline":string,"visualDirection":string,"regions":[{"name":string,"purpose":string}],"dataEntities":[{"name":string,"fields":[string]}],"interactions":[string],"acceptanceChecks":[string],"complexityTarget":{"minimumRegions":5,"minimumInteractions":4,"minimumDataEntities":1,"requiresResponsiveLayout":true}}. Plan 5-6 distinct regions, 4-6 useful local interactions, meaningful initial data, and a coherent visual direction.`;
const artifactInstructions = (blueprint: GenerationBlueprint) => `Return JSON only, with no code fences, and exactly this shape: {"appSpec":{"appName":string,"tagline":string,"features":[string],"preview":{"entryPath":"index.html"}},"manifest":{"styles":["styles/tokens.css","styles/layout.css"],"scripts":["src/state.js","src/ui.js","src/app.js"]},"files":[{"path":"index.html","language":"html","contents":string},{"path":"README.md","language":"md","contents":string},{"path":"styles/tokens.css","language":"css","contents":string},{"path":"styles/layout.css","language":"css","contents":string},{"path":"src/state.js","language":"js","contents":string},{"path":"src/ui.js","language":"js","contents":string},{"path":"src/app.js","language":"js","contents":string}]}. Build the application described by this validated blueprint: ${JSON.stringify(blueprint)}. Return 7-12 files: root index.html and README.md; 2-4 CSS files only under styles/; 3-7 JS files only under src/. The manifest must list every CSS and JS file exactly once in runtime order. index.html must contain markup only: never include a <script> or <link> element, whether inline or external. The preview runtime will inject manifest styles and scripts after validation. Never include images, font links, CDN URLs, iframe URLs, CSS url(), packages, imports, fetch, external URLs, form actions, popups, parent access, storage APIs, or server code. Use gradients, CSS shapes, emoji, or inline text instead of external assets. Use plain DOM JavaScript. The HTML must contain at least five semantic regions using main/header/nav/section/article/aside/footer. Implement at least four addEventListener interactions, meaningful initial data, a changing summary/progress/filter/detail result, and an @media narrow-screen layout. Never use localStorage or sessionStorage. Start state with window.__BUILDFLOW_INITIAL_STATE__ || {} and call window.__BUILDFLOW_SAVE_STATE__(state) after user edits. Keep each file focused on one responsibility.`;

type GenerationOutcome = { application: GeneratedApplication; usedFallback: boolean; fallbackMessage?: string };

const canonicalLanguageByPath: Record<string, "html" | "css" | "js" | "md"> = { "index.html": "html", "styles.css": "css", "app.js": "js", "README.md": "md" };
const canonicalPathAliases: Record<string, keyof typeof canonicalLanguageByPath> = { "./index.html": "index.html", "./styles.css": "styles.css", "./app.js": "app.js", "./README.md": "README.md", "style.css": "styles.css", "main.css": "styles.css", "script.js": "app.js", "main.js": "app.js", "index.js": "app.js", "readme.md": "README.md" };

function inferLanguage(path: string, current: unknown) {
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".js")) return "js";
  if (path.endsWith(".md")) return "md";
  return current;
}

function createReadmeFromPayload(value: Record<string, unknown>) {
  const spec = value.appSpec && typeof value.appSpec === "object" ? value.appSpec as Record<string, unknown> : {};
  const name = typeof spec.appName === "string" ? spec.appName : "生成应用";
  const tagline = typeof spec.tagline === "string" ? spec.tagline : "由 BuildFlow AI 生成的浏览器端应用。";
  return `# ${name}\n\n${tagline}\n\n此应用仅在 BuildFlow 的隔离浏览器预览中运行。`;
}

function normalizeApplicationPayload(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const payload = value as Record<string, unknown>;
  if (!Array.isArray(payload.files)) return payload;
  const rawAppSpec = payload.appSpec && typeof payload.appSpec === "object" && !Array.isArray(payload.appSpec) ? payload.appSpec as Record<string, unknown> : {};
  const appSpec = {
    ...rawAppSpec,
    features: Array.isArray(rawAppSpec.features) && rawAppSpec.features.length >= 2 ? rawAppSpec.features : ["本地交互", "响应式界面"],
    preview: rawAppSpec.preview && typeof rawAppSpec.preview === "object" && !Array.isArray(rawAppSpec.preview) ? rawAppSpec.preview : { entryPath: "index.html" }
  };
  const files: Array<Record<string, unknown>> = payload.files.filter((file): file is Record<string, unknown> => Boolean(file) && typeof file === "object" && !Array.isArray(file)).map((file) => {
    const rawPath = typeof file.path === "string" ? file.path.trim() : "";
    const path = canonicalPathAliases[rawPath] ?? rawPath.replace(/^\.\//, "");
    return { ...file, path, language: canonicalLanguageByPath[path] ?? inferLanguage(path, file.language) };
  });
  if (!files.some((file) => file.path === "README.md")) files.push({ path: "README.md", language: "md", contents: createReadmeFromPayload(payload) });
  return { ...payload, appSpec, files };
}

export function validateGeneratedApplication(value: unknown): GeneratedApplication {
  const application = generatedApplicationSchema.parse(normalizeApplicationPayload(value));
  const paths = application.files.map((file) => file.path);
  if (application.appSpec.preview.entryPath !== "index.html" || new Set(paths).size !== paths.length) throw new Error("Generated artifact has invalid file paths.");
  if (!application.manifest && paths.some((path) => !(legacyAllowedPaths as readonly string[]).includes(path))) throw new Error("Generated artifact has invalid file paths.");
  const executableSource = application.files.filter((file) => file.language !== "md").map((file) => file.contents).join("\n");
  const forbiddenCapability = /\b(localStorage|sessionStorage)\b/i.test(executableSource) ? "browser storage" : /\b(fetch|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon)\b/i.test(executableSource) ? "network access" : /\b(parent\.|top\.|document\.cookie|window\.open)\b/i.test(executableSource) ? "parent-window access" : /<form\b[^>]*\baction\s*=|<script\b|<link\b|\burl\s*\(|\bimport\s*(?:\(|[\w{"'])|https?:\/\//i.test(executableSource) ? "external executable content" : null;
  if (forbiddenCapability) throw new Error(`Generated artifact uses a forbidden browser capability: ${forbiddenCapability}.`);
  return application;
}

export function getQualityGaps(application: GeneratedApplication, blueprint: GenerationBlueprint) {
  if (!application.manifest) return ["未生成多文件 manifest"];
  const html = application.files.find((file) => file.path === "index.html")?.contents ?? "";
  const styles = application.files.filter((file) => file.language === "css").map((file) => file.contents).join("\n");
  const scripts = application.files.filter((file) => file.language === "js").map((file) => file.contents).join("\n");
  const semanticRegions = (html.match(/<(main|header|nav|section|article|aside|footer)\b/gi) ?? []).length;
  const handlers = (scripts.match(/\.addEventListener\s*\(/g) ?? []).length;
  const initialData = /(?:const|let)\s+[A-Za-z_$][\w$]*\s*=\s*(?:\[[\s\S]{3,}?\]|\{[\s\S]{3,}?\})/.test(scripts);
  const stateFeedback = /(?:textContent|innerHTML|classList\.(?:add|remove|toggle)|style\.)/.test(scripts);
  const gaps: string[] = [];
  if (semanticRegions < blueprint.complexityTarget.minimumRegions) gaps.push(`页面区域不足 ${blueprint.complexityTarget.minimumRegions} 个`);
  if (handlers < blueprint.complexityTarget.minimumInteractions) gaps.push(`交互处理不足 ${blueprint.complexityTarget.minimumInteractions} 个`);
  if (!initialData) gaps.push("缺少首屏演示数据");
  if (!stateFeedback) gaps.push("缺少随状态变化的反馈");
  if (blueprint.complexityTarget.requiresResponsiveLayout && !/@media\s*\(/.test(styles)) gaps.push("缺少窄屏响应式布局");
  return gaps;
}

function validateQuality(application: GeneratedApplication, blueprint: GenerationBlueprint) {
  const gaps = getQualityGaps(application, blueprint);
  if (gaps.length) throw new Error(`Generated artifact failed quality checks: ${gaps.join("；")}。`);
}

async function requestDeepSeekJson<T>(apiKey: string, system: string, user: string, maxTokens: number, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining < 3_000) throw new Error("The overall generation deadline was exceeded.");
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(Math.min(modelTimeoutMs, remaining)),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL ?? "deepseek-flash", thinking: { type: "disabled" }, max_tokens: maxTokens, temperature: 0.25, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: user }] })
  });
  if (!response.ok) throw new Error(`DeepSeek request failed with status ${response.status}`);
  const body = await response.json() as { choices?: Array<{ finish_reason?: string; message?: { content?: string } }> };
  const choice = body.choices?.[0];
  if (choice?.finish_reason === "length") throw new Error("DeepSeek response reached the output limit.");
  if (!choice?.message?.content) throw new Error("DeepSeek returned no JSON content.");
  return JSON.parse(choice.message.content) as T;
}

function fallbackReason(reason: unknown) {
  const message = reason instanceof Error ? reason.message : "未知的 AI 响应错误";
  if (reason instanceof z.ZodError) {
    const fields = [...new Set(reason.issues.map((issue) => issue.path.join(".")).filter(Boolean))].slice(0, 4);
    return fields.length ? `生成结果缺少或不符合字段：${fields.join("、")}。` : "生成结果不符合多文件应用数据结构。";
  }
  if (/timeout|deadline/i.test(message)) return "AI 请求超过了当前生成时限。";
  if (/status \d+/.test(message)) return "AI 服务未返回可用结果。";
  if (/output limit/i.test(message)) return "AI 响应超过了当前输出上限。";
  if (/browser storage/i.test(message)) return "生成应用使用了不支持的浏览器存储能力。";
  if (/network access/i.test(message)) return "生成应用使用了不支持的网络访问能力。";
  if (/parent-window access/i.test(message)) return "生成应用使用了不支持的父窗口访问能力。";
  if (/external executable content/i.test(message)) return "生成应用包含不支持的外部可执行内容。";
  if (/forbidden browser capability/i.test(message)) return "生成应用使用了不支持的浏览器能力。";
  if (/invalid file paths/i.test(message)) return "生成应用未返回要求的文件结构。";
  if (/oversized file/i.test(message)) return "生成应用超过了单文件大小上限。";
  if (/quality checks/i.test(message)) return message.replace(/^Generated artifact failed quality checks:\s*/i, "质量校验未通过：").replace(/。?$/, "");
  return "AI 响应未能通过 BuildFlow 的安全应用契约校验。";
}

async function generateWithDeepSeek(prompt: string, emit: EmitEvent): Promise<GenerationOutcome> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || process.env.NODE_ENV === "test") {
    await emit("generation", "model_request", "skipped", "未发起 AI 请求，正在使用本地起步应用。");
    return { application: createFallbackApplication(prompt), usedFallback: true, fallbackMessage: "服务端未配置可用的 AI 密钥。" };
  }
  const deadline = Date.now() + wholeGenerationTimeoutMs;
  try {
    await emit("planning", "model_request", "active", "正在请求 AI 生成应用蓝图。", "应用蓝图");
    const blueprint = generationBlueprintSchema.parse(await requestDeepSeekJson<unknown>(apiKey, blueprintInstructions, prompt, 2_500, deadline));
    await emit("planning", "model_response", "succeeded", "已校验应用结构、交互设计与视觉方向。", "应用蓝图");
    await emit("planning", "validation", "succeeded", `已规划 ${blueprint.complexityTarget.minimumRegions} 个页面区域、${blueprint.complexityTarget.minimumInteractions} 个交互与响应式布局。`, "复杂度目标");
    await emit("generation", "model_request", "active", "正在请求 AI 生成多文件浏览器应用。", "7–12 个生成文件");
    let application: GeneratedApplication;
    try {
      application = validateGeneratedApplication(await requestDeepSeekJson<unknown>(apiKey, artifactInstructions(blueprint), prompt, 18_000, deadline));
      validateQuality(application, blueprint);
    } catch (reason) {
      const repairReason = fallbackReason(reason);
      await emit("generation", "validation", "active", "检测到安全或质量问题，正在请求一次受限修复。", repairReason);
      const repairInstructions = `${artifactInstructions(blueprint)} A previous candidate was rejected: ${repairReason} Return a complete replacement artifact that satisfies every file, security, and quality rule. Never use localStorage, sessionStorage, fetch, external URLs, imports, CSS url(), form actions, popups, parent/top access, or document.cookie.`;
      application = validateGeneratedApplication(await requestDeepSeekJson<unknown>(apiKey, repairInstructions, prompt, 18_000, deadline));
      validateQuality(application, blueprint);
    }
    await emit("generation", "model_response", "succeeded", "已接收结构化多文件浏览器应用产物。", `${application.files.length} 个生成文件`);
    await emit("validation", "validation", "succeeded", "已校验文件路径、预览入口、大小限制与浏览器安全约束。", "结构与安全校验");
    await emit("validation", "validation", "succeeded", "已通过区域、交互、演示数据、状态反馈与响应式质量校验。", "质量校验");
    return { application, usedFallback: false };
  } catch (reason) {
    const message = fallbackReason(reason);
    await emit("validation", "validation", "failed", message);
    return { application: createFallbackApplication(prompt), usedFallback: true, fallbackMessage: message };
  }
}

function isUniqueViolation(reason: unknown) {
  return typeof reason === "object" && reason !== null && "code" in reason && (reason as { code?: string }).code === "23505";
}

async function ownedProject(projectId: string, userId: string) {
  const db = getDatabase();
  if (!db) return { db: null, project: null };
  const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)));
  return { db, project: project ?? null };
}

export const registerGenerationRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:projectId/workspace", async (request, reply) => {
    try { await request.jwtVerify(); } catch { return reply.code(401).send({ code: "UNAUTHENTICATED" }); }
    const { projectId } = projectParams.parse(request.params);
    const { versionId } = workspaceQuery.parse(request.query);
    const { db, project } = await ownedProject(projectId, request.user.id);
    if (!db) return reply.code(503).send({ code: "DATABASE_NOT_CONFIGURED" });
    if (!project) return reply.code(404).send({ code: "PROJECT_NOT_FOUND" });
    const jobs = await db.select().from(generationJobs).where(eq(generationJobs.projectId, projectId));
    const versions = await db.select().from(projectVersions).where(eq(projectVersions.projectId, projectId));
    const currentVersion = versions.find((item) => item.id === project.currentVersionId) ?? versions.at(-1) ?? null;
    const version = versionId ? versions.find((item) => item.id === versionId) ?? null : currentVersion;
    if (versionId && !version) return reply.code(404).send({ code: "VERSION_NOT_FOUND" });
    const files = version ? await db.select().from(generatedFiles).where(eq(generatedFiles.versionId, version.id)) : [];
    const [previewState] = version ? await db.select().from(projectPreviewStates).where(and(eq(projectPreviewStates.projectId, projectId), eq(projectPreviewStates.versionId, version.id))) : [];
    return { project, job: jobs.at(-1) ?? null, version, files, previewState: previewState?.state ?? {} };
  });

  app.get("/:projectId/versions", async (request, reply) => {
    try { await request.jwtVerify(); } catch { return reply.code(401).send({ code: "UNAUTHENTICATED" }); }
    const { projectId } = projectParams.parse(request.params);
    const { db, project } = await ownedProject(projectId, request.user.id);
    if (!db) return reply.code(503).send({ code: "DATABASE_NOT_CONFIGURED" });
    if (!project) return reply.code(404).send({ code: "PROJECT_NOT_FOUND" });
    const versions = await db.select().from(projectVersions).where(eq(projectVersions.projectId, projectId));
    return { currentVersionId: project.currentVersionId, versions: versions.sort((left, right) => Number(right.sequence) - Number(left.sequence)) };
  });

  app.post("/:projectId/versions/:versionId/restore", async (request, reply) => {
    try { await request.jwtVerify(); } catch { return reply.code(401).send({ code: "UNAUTHENTICATED" }); }
    const { projectId, versionId } = versionParams.parse(request.params);
    const { db, project } = await ownedProject(projectId, request.user.id);
    if (!db) return reply.code(503).send({ code: "DATABASE_NOT_CONFIGURED" });
    if (!project) return reply.code(404).send({ code: "PROJECT_NOT_FOUND" });
    const [version] = await db.select().from(projectVersions).where(and(eq(projectVersions.id, versionId), eq(projectVersions.projectId, projectId)));
    if (!version) return reply.code(404).send({ code: "VERSION_NOT_FOUND" });
    const [updatedProject] = await db.update(projects).set({ currentVersionId: version.id, updatedAt: new Date() }).where(eq(projects.id, projectId)).returning();
    return { project: updatedProject, version };
  });

  app.put("/:projectId/versions/:versionId/preview-state", async (request, reply) => {
    try { await request.jwtVerify(); } catch { return reply.code(401).send({ code: "UNAUTHENTICATED" }); }
    const { projectId, versionId } = versionParams.parse(request.params);
    const state = previewStateSchema.parse(request.body);
    const { db, project } = await ownedProject(projectId, request.user.id);
    if (!db) return reply.code(503).send({ code: "DATABASE_NOT_CONFIGURED" });
    if (!project) return reply.code(404).send({ code: "PROJECT_NOT_FOUND" });
    const [version] = await db.select({ id: projectVersions.id }).from(projectVersions).where(and(eq(projectVersions.id, versionId), eq(projectVersions.projectId, projectId)));
    if (!version) return reply.code(404).send({ code: "VERSION_NOT_FOUND" });
    const [saved] = await db.insert(projectPreviewStates).values({ projectId, versionId, state }).onConflictDoUpdate({ target: [projectPreviewStates.projectId, projectPreviewStates.versionId], set: { state, updatedAt: new Date() } }).returning();
    return { previewState: saved?.state ?? state };
  });

  app.post("/:projectId/generate", async (request, reply) => {
    try { await request.jwtVerify(); } catch { return reply.code(401).send({ code: "UNAUTHENTICATED" }); }
    const { projectId } = projectParams.parse(request.params);
    const { instruction } = generateBody.parse(request.body ?? {});
    const { db, project } = await ownedProject(projectId, request.user.id);
    if (!db) return reply.code(503).send({ code: "DATABASE_NOT_CONFIGURED" });
    if (!project) return reply.code(404).send({ code: "PROJECT_NOT_FOUND" });
    const active = await db.select({ id: generationJobs.id }).from(generationJobs).where(and(eq(generationJobs.projectId, projectId), inArray(generationJobs.status, ["queued", "running"])));
    if (active.length) return reply.code(409).send({ code: "GENERATION_ALREADY_RUNNING" });

    const initialLogs: GenerationLogEntry[] = [
      eventAt("analysis", "status", "succeeded", instruction ? "已接收原始需求与本次优化要求。" : "已接收产品需求，已创建 Agent 生成任务。"),
      eventAt("analysis", "validation", "succeeded", "已应用浏览器预览与安全约束。")
    ];
    let job;
    try {
      [job] = await db.insert(generationJobs).values({ projectId, status: "running", stage: "analysis", logs: initialLogs }).returning();
    } catch (reason) {
      if (isUniqueViolation(reason)) return reply.code(409).send({ code: "GENERATION_ALREADY_RUNNING" });
      throw reason;
    }
    const jobId = job!.id;
    let logs = initialLogs;
    const emit: EmitEvent = async (phase, kind, status, message, target) => {
      const entry = eventAt(phase, kind, status, message, target);
      logs = [...logs, entry];
      const stage = phase === "persistence" ? "validation" : phase;
      await db.update(generationJobs).set({ stage, logs }).where(eq(generationJobs.id, jobId));
    };
    try {
      const effectivePrompt = instruction ? `${project.prompt}\n\nOptimization request for the next version:\n${instruction}` : project.prompt;
      const result = await generateWithDeepSeek(effectivePrompt, emit);
      const application = result.application;
      if (result.usedFallback) await emit("generation", "status", "skipped", `已使用本地可交互起步应用。${result.fallbackMessage ?? "AI 暂时不可用。"}`);
      const versions = await db.select({ id: projectVersions.id }).from(projectVersions).where(eq(projectVersions.projectId, projectId));
      const appSpec = application.manifest ? { ...application.appSpec, artifactManifest: application.manifest } : application.appSpec;
      const [version] = await db.insert(projectVersions).values({ projectId, sequence: String(versions.length + 1), appSpec, summary: application.appSpec.tagline }).returning();
      if (!version) throw new Error("Could not create project version");
      await emit("persistence", "version_save", "succeeded", "已为通过校验的产物创建不可变版本。", `v${version.sequence}`);
      await db.insert(generatedFiles).values(application.files.map((file) => ({ versionId: version.id, ...file })));
      for (const file of application.files) await emit("persistence", "file_write", "succeeded", "已保存生成源文件。", file.path);
      await db.insert(projectPreviewStates).values({ projectId, versionId: version.id, state: {} });
      await db.update(projects).set({ currentVersionId: version.id, updatedAt: new Date() }).where(eq(projects.id, projectId));
      await emit("persistence", "preview_ready", "succeeded", "已初始化隔离预览状态，并设为当前版本。", `v${version.sequence}`);
      const [completedJob] = await db.update(generationJobs).set({ status: "completed", stage: "validation", logs, completedAt: new Date() }).where(eq(generationJobs.id, jobId)).returning();
      return reply.code(201).send({ job: completedJob, version, files: application.files });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "生成失败";
      await emit("validation", "validation", "failed", "构建在保存可用预览前停止。");
      await db.update(generationJobs).set({ status: "failed", stage: "validation", logs, failureReason: message, completedAt: new Date() }).where(eq(generationJobs.id, jobId));
      return reply.code(502).send({ code: "GENERATION_FAILED", message: "暂时无法生成应用，请稍后重试。" });
    }
  });
};
