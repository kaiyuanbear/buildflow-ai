import { and, eq, inArray } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { complexityTargetSchema, generatedApplicationSchema, incrementalChangeScopeSchema, previewStateSchema, type GeneratedApplication, type GenerationEvent, type GenerationEventKind, type GenerationEventPhase, type GenerationEventStatus, type GenerationLogEntry, type IncrementalChangeScope, type StoredAppSpec } from "@buildflow/contracts";
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
const preservedChangeScope: IncrementalChangeScope = { productPurpose: false, interactions: false, fileStructure: false };
const artifactNavigationRequirements = "Every visible navigation link, tab, CTA, or internal anchor must lead to an existing, non-empty content region or render a concrete detail panel with initial demo data. Never leave an interaction at a blank page or placeholder state. For every href=\"#target\", include a matching id=\"target\" in the HTML. Bind the application navigation or tab interaction in JavaScript so the visible result changes after a user click; preserve active-state feedback where tabs are used.";
const generationBlueprintSchema = z.object({
  appName: z.string().min(2).max(80).catch("Generated Product"),
  tagline: z.string().min(2).max(160).catch("A focused browser application generated from your request."),
  visualDirection: z.string().min(12).max(280).catch("A deliberate responsive visual system with clear hierarchy and accessible contrast."),
  regions: z.array(z.object({ name: z.string().min(2).max(60), purpose: z.string().min(6).max(160) })).min(3).max(6).catch([{ name: "Overview", purpose: "Summarize the current state and important information." }, { name: "Workspace", purpose: "Provide the primary interactive controls and content." }, { name: "Insights", purpose: "Show useful secondary details and progress." }]),
  dataEntities: z.array(z.object({ name: z.string().min(2).max(60), fields: z.array(z.string().min(1).max(50)).min(1).max(6) })).min(1).max(3).catch([{ name: "Item", fields: ["title", "status", "note"] }]),
  interactions: z.array(z.string().min(6).max(180)).min(3).max(6).catch(["Create and update local items.", "Filter or search the displayed content.", "Show a summary that reacts to local changes."]),
  acceptanceChecks: z.array(z.string().min(6).max(180)).min(3).max(6).catch(["The application has three visible regions.", "Local interactions update the rendered UI.", "The layout remains usable on narrow screens."]),
  complexityTarget: complexityTargetSchema.catch({ minimumRegions: 5, minimumInteractions: 4, minimumDataEntities: 1, requiresResponsiveLayout: true }),
  changeScope: incrementalChangeScopeSchema.catch(preservedChangeScope)
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
      { path: "app.js", language: "js", contents: `const request=${promptText};const savedState=window.__BUILDFLOW_INITIAL_STATE__;const state={ideas:Array.isArray(savedState?.ideas)?savedState.ideas:[]};document.querySelector('#title').textContent='你的应用原型';document.querySelector('#prompt').textContent=request;const list=document.querySelector('#ideas');function render(){list.innerHTML='';state.ideas.forEach((idea)=>{const item=document.createElement('li');item.textContent=idea;list.append(item)})}document.querySelector('#idea-form').addEventListener('submit',(event)=>{event.preventDefault();const input=document.querySelector('#idea');state.ideas.push(input.value.trim());input.value='';window.__BUILDFLOW_SAVE_STATE__(state);render()});render();` },
      { path: "README.md", language: "md", contents: "当前未取得可用的 AI 产物，因此使用本地起步应用。配置服务端 DEEPSEEK_API_KEY 后可按提示词生成定制应用。" }
    ]
  });
}

const blueprintInstructions = (isIncremental: boolean) => `Return JSON only. You are designing a small, original browser-only application from the user's product request. Do not write source code and do not choose from a fixed application catalog. Return exactly: {"appName":string,"tagline":string,"visualDirection":string,"regions":[{"name":string,"purpose":string}],"dataEntities":[{"name":string,"fields":[string]}],"interactions":[string],"acceptanceChecks":[string],"complexityTarget":{"minimumRegions":5,"minimumInteractions":4,"minimumDataEntities":1,"requiresResponsiveLayout":true},"changeScope":{"productPurpose":boolean,"interactions":boolean,"fileStructure":boolean}}. Plan 5-6 distinct regions, 4-6 useful local interactions, meaningful initial data, and a coherent visual direction. The product is for Chinese interview reviewers: write every human-facing blueprint field in Simplified Chinese unless the user explicitly requests another language.${isIncremental ? " This is an incremental update. Set each changeScope field to true only when the optimization request explicitly asks to change that dimension: productPurpose changes the application’s primary goal or domain; interactions adds, removes, or replaces existing user flows/controls; fileStructure renames, removes, merges, or splits generated files or runtime modules. A vague visual or content refinement does not authorize any of these changes. Keep all fields false when the request does not clearly ask for the corresponding change." : " For a first version, set every changeScope field to false."}`;
const artifactInstructions = (blueprint: GenerationBlueprint, isIncremental: boolean, changeScope: IncrementalChangeScope = preservedChangeScope) => `Return one complete JSON object only, with no code fences and no explanation. It must contain all three top-level keys: appSpec, manifest, files. Use exactly this shape: {"appSpec":{"appName":string,"tagline":string,"features":[string,string],"preview":{"entryPath":"index.html"}},"manifest":{"styles":["styles/tokens.css","styles/layout.css"],"scripts":["src/state.js","src/ui.js","src/app.js"]},"files":[{"path":"index.html","language":"html","contents":string},{"path":"README.md","language":"md","contents":string},{"path":"styles/tokens.css","language":"css","contents":string},{"path":"styles/layout.css","language":"css","contents":string},{"path":"src/state.js","language":"js","contents":string},{"path":"src/ui.js","language":"js","contents":string},{"path":"src/app.js","language":"js","contents":string}]}. Build the application described by this validated blueprint: ${JSON.stringify(blueprint)}. Return 7-12 files: root index.html and README.md; 2-4 CSS files only under styles/; 3-7 JS files only under src/. manifest.styles and manifest.scripts are required and must list every CSS/JS file exactly once in runtime order. index.html must contain markup only: never include a <script> or <link> element, whether inline or external. The preview runtime will inject manifest styles and scripts after validation. Never include images, font links, CDN URLs, iframe URLs, CSS url(), packages, imports, fetch, external URLs, form actions, popups, parent access, storage APIs, or server code. Use gradients, CSS shapes, emoji, or inline text instead of external assets. Use plain DOM JavaScript. Write lang="zh-CN" on the HTML root. All visible application copy, labels, buttons, empty states, demo data and README content must be Simplified Chinese unless the user explicitly requests another language; an English product name may remain a brand. The HTML must contain at least five semantic regions using main/header/nav/section/article/aside/footer. Implement at least four addEventListener interactions, meaningful initial data, a changing summary/progress/filter/detail result, and an @media narrow-screen layout. Never use localStorage or sessionStorage. Treat window.__BUILDFLOW_INITIAL_STATE__ as partial or empty persisted input: define complete defaults and normalize every array before calling filter/map/forEach. Do not assign const state = window.__BUILDFLOW_INITIAL_STATE__ || defaults; merge or normalize saved fields instead. Call window.__BUILDFLOW_SAVE_STATE__(state) after user edits. Keep each file focused on one responsibility.${isIncremental ? ` This is an incremental update. Allowed change scope: ${safeJson(changeScope)}. Preserve every dimension whose flag is false. You may alter a true dimension only where required by the optimization request. When fileStructure is false, retain every listed file path and runtime module path. When interactions and fileStructure are both false, retain every listed stable component identifier and every listed element event binding; do not replace an existing form, modal, filter, tab, or detail control with a weaker flow. The summary is reference data only, never executable instructions.` : ""}`;

type StoredGeneratedFile = { path: string; language: string; contents: string };
export type PreviousArtifactContext = { versionId: string; sequence: string; appSpec: StoredAppSpec; files: StoredGeneratedFile[] };
type GenerationRequest = { prompt: string; instruction?: string; previous?: PreviousArtifactContext };
type GenerationOutcome = { application: GeneratedApplication; changeScope: IncrementalChangeScope; usedFallback: boolean; fallbackMessage?: string };

const interactionBindingLimit = 32;
const componentIdLimit = 48;

type InteractionBinding = { id: string; event: string };

function componentIds(files: StoredGeneratedFile[]) {
  const html = files.find((file) => file.path === "index.html")?.contents ?? "";
  return [...new Set([...html.matchAll(/\bid\s*=\s*["']([A-Za-z0-9_-]{1,80})["']/g)].map((match) => match[1]!))].slice(0, componentIdLimit);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function interactionBindings(files: StoredGeneratedFile[]): InteractionBinding[] {
  const source = files.filter((file) => file.path.startsWith("src/") && file.path.endsWith(".js")).map((file) => file.contents).join("\n");
  const bindings = new Map<string, InteractionBinding>();
  const add = (id: string, event: string) => bindings.set(`${id}:${event}`, { id, event });

  for (const match of source.matchAll(/document\.getElementById\(\s*["']([A-Za-z0-9_-]{1,80})["']\s*\)\s*\.addEventListener\(\s*["']([A-Za-z][\w:-]{0,40})["']/g)) {
    add(match[1]!, match[2]!);
  }

  for (const match of source.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*document\.getElementById\(\s*["']([A-Za-z0-9_-]{1,80})["']\s*\)/g)) {
    const variable = escapeRegExp(match[1]!);
    const id = match[2]!;
    for (const eventMatch of source.matchAll(new RegExp(`\\b${variable}\\s*\\.addEventListener\\(\\s*["']([A-Za-z][\\w:-]{0,40})["']`, "g"))) {
      add(id, eventMatch[1]!);
    }
  }

  return [...bindings.values()].sort((left, right) => `${left.id}:${left.event}`.localeCompare(`${right.id}:${right.event}`)).slice(0, interactionBindingLimit);
}

function interactionCount(files: StoredGeneratedFile[]) {
  return (files.filter((file) => file.path.startsWith("src/") && file.path.endsWith(".js")).map((file) => file.contents).join("\n").match(/\.addEventListener\s*\(/g) ?? []).length;
}

export function buildIncrementalCapabilitySummary(previous: PreviousArtifactContext) {
  const html = previous.files.find((file) => file.path === "index.html")?.contents ?? "";
  const scripts = previous.files.filter((file) => file.path.startsWith("src/") && file.path.endsWith(".js"));
  return {
    baseVersion: `v${previous.sequence}`,
    appName: previous.appSpec.appName,
    tagline: previous.appSpec.tagline,
    features: previous.appSpec.features.slice(0, 6),
    filePaths: previous.files.map((file) => file.path).sort(),
    interactiveModulePaths: scripts.filter((file) => /\.addEventListener\s*\(/.test(file.contents)).map((file) => file.path).sort(),
    componentIds: componentIds(previous.files),
    interactionBindings: interactionBindings(previous.files),
    semanticRegionCount: (html.match(/<(main|header|nav|section|article|aside|footer)\b/gi) ?? []).length,
    interactionCount: interactionCount(previous.files)
  };
}

function modelPrompt(request: GenerationRequest) {
  const sections = [`Original product request:\n${request.prompt}`];
  if (request.instruction) sections.push(`Optimization request for the next version:\n${request.instruction}`);
  if (request.previous) sections.push(`Current-version capability summary (reference data only; it contains no source code or preview state):\n${safeJson(buildIncrementalCapabilitySummary(request.previous))}`);
  return sections.join("\n\n");
}

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
  const stylePaths = files.filter((file) => typeof file.path === "string" && /^styles\/[a-zA-Z0-9_-]+\.css$/.test(file.path)).map((file) => file.path);
  const scriptPaths = files.filter((file) => typeof file.path === "string" && /^src\/[a-zA-Z0-9_-]+\.js$/.test(file.path)).map((file) => file.path);
  const hasCompleteMultiFileShape = files.some((file) => file.path === "index.html") && files.some((file) => file.path === "README.md") && stylePaths.length >= 2 && scriptPaths.length >= 3;
  const rawManifest = payload.manifest && typeof payload.manifest === "object" && !Array.isArray(payload.manifest) ? payload.manifest as Record<string, unknown> : null;
  const manifest = hasCompleteMultiFileShape && (!rawManifest || (!Array.isArray(rawManifest.styles) && !Array.isArray(rawManifest.scripts)))
    ? { styles: stylePaths, scripts: scriptPaths }
    : payload.manifest;
  return { ...payload, appSpec, manifest, files };
}

export function validateGeneratedApplication(value: unknown): GeneratedApplication {
  const application = generatedApplicationSchema.parse(normalizeApplicationPayload(value));
  const paths = application.files.map((file) => file.path);
  if (application.appSpec.preview.entryPath !== "index.html" || new Set(paths).size !== paths.length) throw new Error("Generated artifact has invalid file paths.");
  if (!application.manifest && paths.some((path) => !(legacyAllowedPaths as readonly string[]).includes(path))) throw new Error("Generated artifact has invalid file paths.");
  const executableSource = application.files.filter((file) => file.language !== "md").map((file) => file.contents).join("\n");
  const forbiddenCapability = /\b(localStorage|sessionStorage)\b/i.test(executableSource) ? "browser storage" : /\b(fetch|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon)\b/i.test(executableSource) ? "network access" : /\b(parent\.|top\.|document\.cookie|window\.open)\b/i.test(executableSource) ? "parent-window access" : /<form\b[^>]*\baction\s*=|<script\b|<link\b|\burl\s*\(|\bimport\s*(?:\(|[\w{"'])|https?:\/\//i.test(executableSource) ? "external executable content" : null;
  if (forbiddenCapability) throw new Error(`Generated artifact uses a forbidden browser capability: ${forbiddenCapability}.`);
  const compatibilityGaps = getPreviewCompatibilityGaps(application);
  if (compatibilityGaps.length) throw new Error(`Generated artifact violates preview compatibility: ${compatibilityGaps.join("; ")}.`);
  return application;
}

export function createGenerationFallback(prompt: string, previous?: PreviousArtifactContext): GeneratedApplication {
  if (previous) {
    const { artifactManifest, generationRequest: _generationRequest, ...appSpec } = previous.appSpec;
    try {
      return validateGeneratedApplication({
        appSpec,
        ...(artifactManifest ? { manifest: artifactManifest } : {}),
        files: previous.files
      });
    } catch {
      // A legacy or manually corrupted historical artifact must never make the
      // fallback path fail. The generic starter remains the safe last resort.
    }
  }
  return createFallbackApplication(prompt);
}

function getPreviewCompatibilityGaps(application: GeneratedApplication) {
  const html = application.files.find((file) => file.path === "index.html")?.contents ?? "";
  const runtimeSource = application.files.filter((file) => file.language === "html" || file.language === "js").map((file) => file.contents).join("\n");
  const gaps: string[] = [];
  if (!/<html\b[^>]*\blang\s*=\s*["']zh-CN["']/i.test(html)) gaps.push('HTML 根节点缺少 lang="zh-CN"');
  if (!/[\u4e00-\u9fff]/.test(runtimeSource)) gaps.push("运行时界面缺少简体中文文案");
  return gaps;
}

export function getQualityGaps(application: GeneratedApplication, blueprint: GenerationBlueprint) {
  if (!application.manifest) return ["未生成多文件 manifest"];
  const html = application.files.find((file) => file.path === "index.html")?.contents ?? "";
  const styles = application.files.filter((file) => file.language === "css").map((file) => file.contents).join("\n");
  const scripts = application.files.filter((file) => file.language === "js").map((file) => file.contents).join("\n");
  const semanticRegions = (html.match(/<(main|header|nav|section|article|aside|footer)\b/gi) ?? []).length;
  const handlers = (scripts.match(/\.addEventListener\s*\(/g) ?? []).length;
  const initialData = /(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:\[[\s\S]{3,}?\]|\{[\s\S]{3,}?\})/.test(scripts)
    || /__BUILDFLOW_INITIAL_STATE__\s*\|\|\s*(?:\[[\s\S]{3,}?\]|\{[\s\S]{3,}?\})/.test(scripts);
  const stateFeedback = /(?:textContent|innerHTML|classList\.(?:add|remove|toggle)|style\.)/.test(scripts);
  const declaredIds = new Set(Array.from(html.matchAll(/\bid\s*=\s*["']([^"']{1,120})["']/gi), (match) => match[1]!));
  const internalAnchorTargets = Array.from(html.matchAll(/\bhref\s*=\s*["']#([^"'#][^"']*)["']/gi), (match) => match[1]!);
  const missingAnchorTargets = [...new Set(internalAnchorTargets.filter((target) => !declaredIds.has(target)))];
  const gaps: string[] = [];
  if (semanticRegions < blueprint.complexityTarget.minimumRegions) gaps.push(`页面区域不足 ${blueprint.complexityTarget.minimumRegions} 个`);
  if (handlers < blueprint.complexityTarget.minimumInteractions) gaps.push(`交互处理不足 ${blueprint.complexityTarget.minimumInteractions} 个`);
  if (!initialData) gaps.push("缺少首屏演示数据");
  if (!stateFeedback) gaps.push("缺少随状态变化的反馈");
  if (blueprint.complexityTarget.requiresResponsiveLayout && !/@media\s*\(/.test(styles)) gaps.push("缺少窄屏响应式布局");
  if (missingAnchorTargets.length) gaps.push(`内部导航缺少目标内容：${missingAnchorTargets.slice(0, 4).join("、")}`);
  return gaps;
}

function validateQuality(application: GeneratedApplication, blueprint: GenerationBlueprint) {
  const gaps = getQualityGaps(application, blueprint);
  if (gaps.length) throw new Error(`Generated artifact failed quality checks: ${gaps.join("；")}。`);
}

export function validateIncrementalContinuity(application: GeneratedApplication, previous?: PreviousArtifactContext, changeScope: IncrementalChangeScope = preservedChangeScope) {
  if (!previous?.appSpec.artifactManifest) return;
  const candidatePaths = new Set(application.files.map((file) => file.path));
  if (!changeScope.fileStructure) {
    const requiredPaths = previous.files.map((file) => file.path);
    const missingPaths = requiredPaths.filter((path) => !candidatePaths.has(path));
    if (missingPaths.length) throw new Error(`Incremental artifact omitted existing files: ${missingPaths.slice(0, 4).join(", ")}.`);

    const priorInteractiveModules = buildIncrementalCapabilitySummary(previous).interactiveModulePaths;
    const missingInteractiveModules = priorInteractiveModules.filter((path) => !candidatePaths.has(path));
    if (missingInteractiveModules.length) throw new Error(`Incremental artifact omitted existing interactive modules: ${missingInteractiveModules.slice(0, 4).join(", ")}.`);
  }

  if (!changeScope.interactions && !changeScope.fileStructure) {
    const requiredIds = componentIds(previous.files);
    const candidateHtml = application.files.find((file) => file.path === "index.html")?.contents ?? "";
    const missingIds = requiredIds.filter((id) => !new RegExp(`\\bid\\s*=\\s*["']${id}["']`).test(candidateHtml));
    if (missingIds.length) throw new Error(`Incremental artifact omitted stable components: ${missingIds.slice(0, 6).join(", ")}.`);

    const candidateBindings = new Set(interactionBindings(application.files).map((binding) => `${binding.id}:${binding.event}`));
    const missingBindings = interactionBindings(previous.files).filter((binding) => !candidateBindings.has(`${binding.id}:${binding.event}`));
    if (missingBindings.length) throw new Error(`Incremental artifact omitted existing interaction bindings: ${missingBindings.slice(0, 4).map((binding) => `${binding.id}:${binding.event}`).join(", ")}.`);

    if (interactionCount(application.files) < interactionCount(previous.files)) {
      throw new Error("Incremental artifact reduced the existing interaction coverage.");
    }
  }
}

function changeScopeTarget(changeScope: IncrementalChangeScope) {
  const changed = [
    changeScope.productPurpose ? "产品目的" : null,
    changeScope.interactions ? "交互流程" : null,
    changeScope.fileStructure ? "文件结构" : null
  ].filter((value): value is string => Boolean(value));
  return changed.length ? `允许调整：${changed.join("、")}` : "未明确要求改变：保持产品目的、交互流程与文件结构";
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
  if (/preview compatibility/i.test(message)) return message.replace(/^Generated artifact violates preview compatibility:\s*/i, "").replace(/\.$/, "");
  if (/invalid file paths/i.test(message)) return "生成应用未返回要求的文件结构。";
  if (/oversized file/i.test(message)) return "生成应用超过了单文件大小上限。";
  if (/Incremental artifact omitted/i.test(message)) return "增量生成结果未完整保留当前版本的既有文件、交互模块或组件结构。";
  if (/quality checks/i.test(message)) return message.replace(/^Generated artifact failed quality checks:\s*/i, "质量校验未通过：").replace(/。?$/, "");
  return "AI 响应未能通过 BuildFlow 的安全应用契约校验。";
}

function repairDetail(reason: unknown) {
  const message = reason instanceof Error ? reason.message : "Unknown deterministic validation failure.";
  // This detail originates from server-side deterministic validation, not from
  // user input. Bound it anyway so malformed model output cannot enlarge the
  // repair prompt indefinitely. Provider failures deliberately stay generic.
  if (/^Generated artifact (?:violates preview compatibility|failed quality checks|uses a forbidden browser capability|has invalid file paths|exceeds)/i.test(message)) return message.slice(0, 700);
  return fallbackReason(reason);
}

async function generateWithDeepSeek(request: GenerationRequest, emit: EmitEvent): Promise<GenerationOutcome> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || process.env.NODE_ENV === "test") {
    await emit("generation", "model_request", "skipped", "未发起 AI 请求，正在使用本地起步应用。");
    return { application: createGenerationFallback(request.prompt, request.previous), changeScope: preservedChangeScope, usedFallback: true, fallbackMessage: request.previous ? "AI 暂不可用，已保留当前版本的全部文件与交互。" : "服务端未配置可用的 AI 密钥。" };
  }
  const deadline = Date.now() + wholeGenerationTimeoutMs;
  const prompt = modelPrompt(request);
  try {
    await emit("planning", "model_request", "active", "正在请求 AI 生成应用蓝图。", "应用蓝图");
    const blueprint = generationBlueprintSchema.parse(await requestDeepSeekJson<unknown>(apiKey, blueprintInstructions(Boolean(request.previous)), prompt, 2_500, deadline));
    const changeScope = request.previous ? blueprint.changeScope : preservedChangeScope;
    await emit("planning", "model_response", "succeeded", "已校验应用结构、交互设计与视觉方向。", "应用蓝图");
    if (request.previous) await emit("planning", "validation", "succeeded", "已根据优化提示词确认本次增量变更范围。", changeScopeTarget(changeScope));
    await emit("planning", "validation", "succeeded", `已规划 ${blueprint.complexityTarget.minimumRegions} 个页面区域、${blueprint.complexityTarget.minimumInteractions} 个交互与响应式布局。`, "复杂度目标");
    await emit("generation", "model_request", "active", "正在请求 AI 生成多文件浏览器应用。", "7–12 个生成文件");
    let application: GeneratedApplication;
    try {
      application = validateGeneratedApplication(await requestDeepSeekJson<unknown>(apiKey, `${artifactInstructions(blueprint, Boolean(request.previous), changeScope)} ${artifactNavigationRequirements}`, prompt, 18_000, deadline));
      validateQuality(application, blueprint);
      validateIncrementalContinuity(application, request.previous, changeScope);
    } catch (reason) {
      const repairReason = fallbackReason(reason);
      const preciseRepairDetail = repairDetail(reason);
      await emit("generation", "validation", "active", "检测到安全或质量问题，正在请求一次受限修复。", repairReason);
      const repairInstructions = `${artifactInstructions(blueprint, Boolean(request.previous), changeScope)} ${artifactNavigationRequirements} A previous candidate was rejected by deterministic validation: ${safeJson(preciseRepairDetail)}. Correct that exact failure while preserving the requested application. Return a complete replacement artifact that satisfies every file, security, quality, and incremental-continuity rule. Never use localStorage, sessionStorage, fetch, external URLs, imports, CSS url(), form actions, popups, parent/top access, or document.cookie.`;
      application = validateGeneratedApplication(await requestDeepSeekJson<unknown>(apiKey, repairInstructions, prompt, 18_000, deadline));
      validateQuality(application, blueprint);
      validateIncrementalContinuity(application, request.previous, changeScope);
    }
    await emit("generation", "model_response", "succeeded", "已接收结构化多文件浏览器应用产物。", `${application.files.length} 个生成文件`);
    await emit("validation", "validation", "succeeded", "已校验文件路径、预览入口、大小限制与浏览器安全约束。", "结构与安全校验");
    await emit("validation", "validation", "succeeded", "已通过区域、交互、演示数据、状态反馈与响应式质量校验。", "质量校验");
    return { application, changeScope, usedFallback: false };
  } catch (reason) {
    const message = fallbackReason(reason);
    await emit("validation", "validation", "failed", message);
    return { application: createGenerationFallback(request.prompt, request.previous), changeScope: preservedChangeScope, usedFallback: true, fallbackMessage: request.previous ? `${message} 已保留当前版本的全部文件与交互。` : message };
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
    const orderedJobs = jobs.slice().sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    const latestJob = orderedJobs.at(-1) ?? null;
    const versionsById = new Map(versions.map((item) => [item.id, item]));
    // `job` stays backward-compatible for the polling client, while `logs` becomes an
    // ordered, version-labelled display projection. Individual job logs remain persisted
    // separately in `jobs`, so no older prompt is injected into a newer job record.
    const timelineLogs = orderedJobs.flatMap((item, index) => {
      const linkedVersion = item.versionId ? versionsById.get(item.versionId) : undefined;
      const label = linkedVersion ? `v${linkedVersion.sequence} · ${linkedVersion.appSpec.appName}` : item.status === "running" ? `第 ${index + 1} 次生成（进行中）` : `第 ${index + 1} 次历史生成`;
      return [{ ...eventAt("analysis", "status", "succeeded", "开始本次 Agent 生成流程。", label), createdAt: item.createdAt.toISOString() }, ...item.logs];
    });
    const job = latestJob ? { ...latestJob, logs: timelineLogs } : null;
    return { project, job, jobs: orderedJobs, version, files, previewState: previewState?.state ?? {} };
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

    const requestText = instruction ?? project.prompt;
    const requestLabel = instruction ? "优化需求" : "初始需求";
    const initialLogs: GenerationLogEntry[] = [
      eventAt("analysis", "status", "succeeded", "已记录用户需求。", `${requestLabel}：${requestText.length > 220 ? `${requestText.slice(0, 220)}…` : requestText}`),
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
      let previous: PreviousArtifactContext | undefined;
      if (instruction && project.currentVersionId) {
        const [currentVersion] = await db.select().from(projectVersions).where(and(eq(projectVersions.id, project.currentVersionId), eq(projectVersions.projectId, projectId)));
        if (currentVersion) {
          const currentFiles = await db.select({ path: generatedFiles.path, language: generatedFiles.language, contents: generatedFiles.contents }).from(generatedFiles).where(eq(generatedFiles.versionId, currentVersion.id));
          previous = { versionId: currentVersion.id, sequence: currentVersion.sequence, appSpec: currentVersion.appSpec, files: currentFiles };
          await emit("analysis", "status", "succeeded", "已提取当前版本的能力摘要，将在保留既有功能的前提下增量生成。", `v${currentVersion.sequence} · 功能、文件结构、组件标识、交互数量`);
        }
      }
      const result = await generateWithDeepSeek({ prompt: project.prompt, instruction, previous }, emit);
      const application = result.application;
      if (result.usedFallback) await emit("generation", "status", "skipped", previous ? `AI 生成未通过，已稳定保留当前版本。${result.fallbackMessage ?? ""}` : `已使用本地可交互起步应用。${result.fallbackMessage ?? "AI 暂时不可用。"}`);
      const versions = await db.select({ id: projectVersions.id }).from(projectVersions).where(eq(projectVersions.projectId, projectId));
      const appSpec = {
        ...application.appSpec,
        ...(application.manifest ? { artifactManifest: application.manifest } : {}),
        generationRequest: { prompt: project.prompt, ...(instruction ? { instruction } : {}), changeScope: result.changeScope }
      };
      const [version] = await db.insert(projectVersions).values({ projectId, sequence: String(versions.length + 1), appSpec, summary: application.appSpec.tagline }).returning();
      if (!version) throw new Error("Could not create project version");
      await db.update(generationJobs).set({ versionId: version.id }).where(eq(generationJobs.id, jobId));
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
