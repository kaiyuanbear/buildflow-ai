import { and, eq, inArray } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { generatedApplicationSchema, previewStateSchema, type GeneratedApplication, type GenerationEvent, type GenerationEventKind, type GenerationEventPhase, type GenerationEventStatus, type GenerationLogEntry } from "@buildflow/contracts";
import { z } from "zod";
import { getDatabase } from "../db/client.js";
import { generatedFiles, generationJobs, projects, projectPreviewStates, projectVersions } from "../db/schema.js";

const projectParams = z.object({ projectId: z.string().uuid() });
const versionParams = projectParams.extend({ versionId: z.string().uuid() });
const workspaceQuery = z.object({ versionId: z.string().uuid().optional() });
const generateBody = z.object({ instruction: z.string().trim().min(3).max(2_000).optional() });
const allowedPaths = ["index.html", "styles.css", "app.js", "README.md"] as const;
const modelTimeoutMs = 90_000;
const wholeGenerationTimeoutMs = 250_000;
const generationBlueprintSchema = z.object({
  appName: z.string().min(2).max(80).catch("Generated Product"),
  tagline: z.string().min(2).max(160).catch("A focused browser application generated from your request."),
  visualDirection: z.string().min(12).max(280).catch("A deliberate responsive visual system with clear hierarchy and accessible contrast."),
  regions: z.array(z.object({ name: z.string().min(2).max(60), purpose: z.string().min(6).max(160) })).min(3).max(6).catch([{ name: "Overview", purpose: "Summarize the current state and important information." }, { name: "Workspace", purpose: "Provide the primary interactive controls and content." }, { name: "Insights", purpose: "Show useful secondary details and progress." }]),
  dataEntities: z.array(z.object({ name: z.string().min(2).max(60), fields: z.array(z.string().min(1).max(50)).min(1).max(6) })).min(1).max(3).catch([{ name: "Item", fields: ["title", "status", "note"] }]),
  interactions: z.array(z.string().min(6).max(180)).min(3).max(6).catch(["Create and update local items.", "Filter or search the displayed content.", "Show a summary that reacts to local changes."]),
  acceptanceChecks: z.array(z.string().min(6).max(180)).min(3).max(6).catch(["The application has three visible regions.", "Local interactions update the rendered UI.", "The layout remains usable on narrow screens."])
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
      appName: "BuildFlow Starter",
      tagline: "A locally generated interactive starter for your idea.",
      features: ["Capture requirements", "Add ideas", "Keep work in the preview"],
      preview: { entryPath: "index.html" },
      plan: [
        { stage: "analysis", message: "Reviewed the requested product outcome." },
        { stage: "planning", message: "Prepared a lightweight single-page application plan." },
        { stage: "generation", message: "Created a browser-only interactive starter application." },
        { stage: "validation", message: "Prepared files for isolated preview execution." }
      ]
    },
    files: [
      { path: "index.html", language: "html", contents: "<main class=\"app\"><p class=\"eyebrow\">GENERATED STARTER</p><h1 id=\"title\"></h1><p id=\"prompt\"></p><form id=\"idea-form\"><input id=\"idea\" placeholder=\"Add a product idea\" maxlength=\"120\" required><button>Save idea</button></form><ul id=\"ideas\"></ul></main>" },
      { path: "styles.css", language: "css", contents: "*{box-sizing:border-box}body{margin:0;background:#f4f6fb;color:#1b2437;font-family:Inter,system-ui,sans-serif}.app{max-width:760px;margin:8vh auto;padding:44px;background:#fff;border:1px solid #e5e8f0;border-radius:24px;box-shadow:0 18px 55px #17204014}.eyebrow{color:#635bdb;font-size:12px;font-weight:800;letter-spacing:.12em}h1{font-size:38px;margin:8px 0}#prompt{color:#5d6677;line-height:1.6}form{display:flex;gap:8px;margin:28px 0}input{flex:1;padding:12px;border:1px solid #ccd3e2;border-radius:10px}button{border:0;border-radius:10px;padding:12px 16px;background:#635bdb;color:#fff;font-weight:700;cursor:pointer}li{margin:8px 0;padding:12px;border-radius:10px;background:#f4f5ff}" },
      { path: "app.js", language: "js", contents: `const request=${promptText};const state=window.__BUILDFLOW_INITIAL_STATE__||{ideas:[]};document.querySelector('#title').textContent='Your generated product';document.querySelector('#prompt').textContent=request;const list=document.querySelector('#ideas');function render(){list.innerHTML='';state.ideas.forEach((idea)=>{const item=document.createElement('li');item.textContent=idea;list.append(item)})}document.querySelector('#idea-form').addEventListener('submit',(event)=>{event.preventDefault();const input=document.querySelector('#idea');state.ideas.push(input.value.trim());input.value='';window.__BUILDFLOW_SAVE_STATE__(state);render()});render();` },
      { path: "README.md", language: "md", contents: "Generated locally because no usable AI response was available. Configure DEEPSEEK_API_KEY to produce a custom application from the prompt." }
    ]
  });
}

const blueprintInstructions = `Return JSON only. You are designing a small, original browser-only single-page application from the user's product request. Do not write source code. Return exactly: {"appName":string,"tagline":string,"visualDirection":string,"regions":[{"name":string,"purpose":string}],"dataEntities":[{"name":string,"fields":[string]}],"interactions":[string],"acceptanceChecks":[string]}. Make 3-6 distinct regions, 3-6 useful local interactions, and a coherent visual direction. Do not choose from a fixed application catalog.`;
const artifactInstructions = (blueprint: GenerationBlueprint) => `Return JSON only with exactly this shape: {"appSpec":{"appName":string,"tagline":string,"features":[string],"preview":{"entryPath":"index.html"},"plan":[{"stage":"analysis","message":string},{"stage":"planning","message":string},{"stage":"generation","message":string},{"stage":"validation","message":string}]},"files":[{"path":"index.html","language":"html","contents":string},{"path":"styles.css","language":"css","contents":string},{"path":"app.js","language":"js","contents":string},{"path":"README.md","language":"md","contents":string}]}. Build the application described by this validated blueprint: ${JSON.stringify(blueprint)}. Return exactly the four listed paths, no code fences, no external assets, packages, imports, fetch, external URLs, form actions, popups, parent access, storage APIs, or server code. Use plain DOM JavaScript. Include at least three page regions and three usable interactions. For persisted preview state, read window.__BUILDFLOW_INITIAL_STATE__ || {} and call window.__BUILDFLOW_SAVE_STATE__(state) after user edits. Make the layout responsive and visually intentional. Keep comments concise.`;

type GenerationOutcome = { application: GeneratedApplication; usedFallback: boolean; fallbackMessage?: string };

function validateApplication(value: unknown): GeneratedApplication {
  const application = generatedApplicationSchema.parse(value);
  const paths = application.files.map((file) => file.path);
  if (application.appSpec.preview.entryPath !== "index.html" || application.files.length !== allowedPaths.length || new Set(paths).size !== paths.length || allowedPaths.some((path) => !paths.includes(path))) throw new Error("Generated artifact has invalid file paths.");
  if (application.files.some((file) => Buffer.byteLength(file.contents, "utf8") > 55_000)) throw new Error("Generated artifact contains an oversized file.");
  const executableSource = application.files.filter((file) => file.language !== "md").map((file) => file.contents).join("\n");
  const forbiddenCapability = /\b(localStorage|sessionStorage)\b/i.test(executableSource) ? "browser storage" : /\b(fetch|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon)\b/i.test(executableSource) ? "network access" : /\b(parent\.|top\.|document\.cookie|window\.open)\b/i.test(executableSource) ? "parent-window access" : /<form\b[^>]*\baction\s*=|\bimport\s*(?:\(|[\w{])|https?:\/\//i.test(executableSource) ? "external executable content" : null;
  if (forbiddenCapability) throw new Error(`Generated artifact uses a forbidden browser capability: ${forbiddenCapability}.`);
  return application;
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
  const message = reason instanceof Error ? reason.message : "Unknown AI response error";
  if (/timeout|deadline/i.test(message)) return "The AI request exceeded the configured generation limit.";
  if (/status \d+/.test(message)) return "The AI service did not return a usable response.";
  if (/output limit/i.test(message)) return "The AI response exceeded the configured output limit.";
  if (/browser storage/i.test(message)) return "The generated application requested unsupported browser storage.";
  if (/network access/i.test(message)) return "The generated application requested unsupported network access.";
  if (/parent-window access/i.test(message)) return "The generated application requested unsupported parent-window access.";
  if (/external executable content/i.test(message)) return "The generated application included unsupported external executable content.";
  if (/forbidden browser capability/i.test(message)) return "The generated application requested an unsupported browser capability.";
  if (/invalid file paths/i.test(message)) return "The generated application did not return the required four-file layout.";
  if (/oversized file/i.test(message)) return "The generated application exceeded the per-file size limit.";
  return "The AI response did not match BuildFlow's safe application contract.";
}

async function generateWithDeepSeek(prompt: string, emit: EmitEvent): Promise<GenerationOutcome> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || process.env.NODE_ENV === "test") {
    await emit("generation", "model_request", "skipped", "Skipped the AI request; using the local starter artifact.");
    return { application: createFallbackApplication(prompt), usedFallback: true, fallbackMessage: "No server-side AI key is configured." };
  }
  const deadline = Date.now() + wholeGenerationTimeoutMs;
  try {
    await emit("planning", "model_request", "active", "Requesting an application blueprint from the AI model.", "application blueprint");
    const blueprint = generationBlueprintSchema.parse(await requestDeepSeekJson<unknown>(apiKey, blueprintInstructions, prompt, 2_000, deadline));
    await emit("planning", "model_response", "succeeded", "Validated the application structure, interactions, and visual direction.", "application blueprint");
    await emit("generation", "model_request", "active", "Requesting browser-only source files from the AI model.", "index.html, styles.css, app.js");
    let application: GeneratedApplication;
    try {
      application = validateApplication(await requestDeepSeekJson<unknown>(apiKey, artifactInstructions(blueprint), prompt, 12_000, deadline));
    } catch (reason) {
      const repairReason = fallbackReason(reason);
      await emit("generation", "validation", "active", "Requesting one bounded safety repair for the generated artifact.", repairReason);
      const repairInstructions = `${artifactInstructions(blueprint)} A previous candidate was rejected: ${repairReason} Return a complete replacement artifact. Never use localStorage, sessionStorage, fetch, external URLs, imports, form actions, popups, parent/top access, or document.cookie.`;
      application = validateApplication(await requestDeepSeekJson<unknown>(apiKey, repairInstructions, prompt, 12_000, deadline));
    }
    await emit("generation", "model_response", "succeeded", "Received a structured browser application artifact.", "4 generated files");
    await emit("validation", "validation", "succeeded", "Validated file paths, preview entry, size limits, and browser safety constraints.");
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
      eventAt("analysis", "status", "succeeded", instruction ? "Received the original request and an optimization instruction." : "Received the product request and created an Agent generation task."),
      eventAt("analysis", "validation", "succeeded", "Applied the browser-only preview and safety constraints.")
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
      if (result.usedFallback) await emit("generation", "status", "skipped", `Using a local interactive starter artifact. ${result.fallbackMessage ?? "AI generation was unavailable."}`);
      const versions = await db.select({ id: projectVersions.id }).from(projectVersions).where(eq(projectVersions.projectId, projectId));
      const [version] = await db.insert(projectVersions).values({ projectId, sequence: String(versions.length + 1), appSpec: application.appSpec, summary: application.appSpec.tagline }).returning();
      if (!version) throw new Error("Could not create project version");
      await emit("persistence", "version_save", "succeeded", "Created an immutable project version for the validated artifact.", `v${version.sequence}`);
      await db.insert(generatedFiles).values(application.files.map((file) => ({ versionId: version.id, ...file })));
      for (const file of application.files) await emit("persistence", "file_write", "succeeded", "Saved the generated source file.", file.path);
      await db.insert(projectPreviewStates).values({ projectId, versionId: version.id, state: {} });
      await db.update(projects).set({ currentVersionId: version.id, updatedAt: new Date() }).where(eq(projects.id, projectId));
      await emit("persistence", "preview_ready", "succeeded", "Initialized isolated preview state and made the version current.", `v${version.sequence}`);
      const [completedJob] = await db.update(generationJobs).set({ status: "completed", stage: "validation", logs, completedAt: new Date() }).where(eq(generationJobs.id, jobId)).returning();
      return reply.code(201).send({ job: completedJob, version, files: application.files });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Generation failed";
      await emit("validation", "validation", "failed", "Generation stopped before a usable preview could be saved.");
      await db.update(generationJobs).set({ status: "failed", stage: "validation", logs, failureReason: message, completedAt: new Date() }).where(eq(generationJobs.id, jobId));
      return reply.code(502).send({ code: "GENERATION_FAILED", message: "Unable to generate the application. Please try again." });
    }
  });
};
