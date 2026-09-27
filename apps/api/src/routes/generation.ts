import { and, eq, inArray } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { generatedApplicationSchema, previewStateSchema, type GeneratedApplication, type GenerationPlanStep } from "@buildflow/contracts";
import { z } from "zod";
import { getDatabase } from "../db/client.js";
import { generatedFiles, generationJobs, projects, projectPreviewStates, projectVersions } from "../db/schema.js";

const projectParams = z.object({ projectId: z.string().uuid() });
const versionParams = projectParams.extend({ versionId: z.string().uuid() });
const workspaceQuery = z.object({ versionId: z.string().uuid().optional() });
const generateBody = z.object({ instruction: z.string().trim().min(3).max(2_000).optional() });
const logAt = (stage: GenerationPlanStep["stage"], message: string) => ({ stage, message, createdAt: new Date().toISOString() });

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

const generatorInstructions = `You generate a small, original browser-only web application from a user request. Return JSON only with this exact shape: {"appSpec":{"appName":string,"tagline":string,"features":string[],"preview":{"entryPath":"index.html"},"plan":[{"stage":"analysis","message":string},{"stage":"planning","message":string},{"stage":"generation","message":string},{"stage":"validation","message":string}]},"files":[{"path":"index.html","language":"html","contents":string},{"path":"styles.css","language":"css","contents":string},{"path":"app.js","language":"js","contents":string},{"path":"README.md","language":"md","contents":string}]}. Build a distinct application appropriate to the request, not a generic todo app. Do not use external assets, packages, imports, fetch, forms that submit to a server, or external URLs. Make it interactive with plain DOM JavaScript. For persistent preview state, read window.__BUILDFLOW_INITIAL_STATE__ || {} and call window.__BUILDFLOW_SAVE_STATE__(state) after user edits. Keep the complete JSON response below 5000 tokens: use concise code, no code fences, no long comments, and no more than four files.`;

type GenerationOutcome = { application: GeneratedApplication; usedFallback: boolean; fallbackMessage?: string };

async function generateWithDeepSeek(prompt: string): Promise<GenerationOutcome> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || process.env.NODE_ENV === "test") return { application: createFallbackApplication(prompt), usedFallback: true, fallbackMessage: "No server-side AI key is configured." };
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(60_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL ?? "deepseek-flash", thinking: { type: "disabled" }, max_tokens: 6_000, temperature: 0.25, response_format: { type: "json_object" }, messages: [{ role: "system", content: generatorInstructions }, { role: "user", content: prompt }] })
    });
    if (!response.ok) throw new Error(`DeepSeek request failed with status ${response.status}`);
    const body = await response.json() as { choices?: Array<{ finish_reason?: string; message?: { content?: string } }> };
    const choice = body.choices?.[0];
    const content = choice?.message?.content;
    if (!content) throw new Error("DeepSeek returned no generated application");
    if (choice?.finish_reason === "length") throw new Error("DeepSeek response reached the output limit");
    return { application: generatedApplicationSchema.parse(JSON.parse(content)), usedFallback: false };
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Unknown AI response error";
    const safeMessage = message.includes("timeout") || message.includes("Timeout") ? "The AI request exceeded the 60-second limit." : message.startsWith("DeepSeek request failed with status") ? message : "The AI response did not match the required application artifact format.";
    return { application: createFallbackApplication(prompt), usedFallback: true, fallbackMessage: safeMessage };
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

    const requestDescription = instruction ? "Received the original request and an optimization instruction." : "Received the product request and started requirement analysis.";
    const initialLog = [logAt("analysis", requestDescription)];
    let job;
    try {
      [job] = await db.insert(generationJobs).values({ projectId, status: "running", stage: "analysis", logs: initialLog }).returning();
    } catch (reason) {
      if (isUniqueViolation(reason)) return reply.code(409).send({ code: "GENERATION_ALREADY_RUNNING" });
      throw reason;
    }
    const jobId = job!.id;
    const planningLogs = [...initialLog, logAt("planning", "Prepared a browser-only implementation plan and preview boundary.")];
    await db.update(generationJobs).set({ stage: "planning", logs: planningLogs }).where(eq(generationJobs.id, jobId));
    const generatingLogs = [...planningLogs, logAt("generation", "Generating source files and validating the browser preview artifact.")];
    await db.update(generationJobs).set({ stage: "generation", logs: generatingLogs }).where(eq(generationJobs.id, jobId));
    try {
      const effectivePrompt = instruction ? `${project.prompt}\n\nOptimization request for the next version:\n${instruction}` : project.prompt;
      const result = await generateWithDeepSeek(effectivePrompt);
      const application = result.application;
      const logs = application.appSpec.plan.map((item) => logAt(item.stage, item.message));
      if (result.usedFallback) logs[2] = logAt("generation", `BuildFlow used a local interactive starter artifact. ${result.fallbackMessage ?? "AI generation was unavailable."}`);
      const versions = await db.select({ id: projectVersions.id }).from(projectVersions).where(eq(projectVersions.projectId, projectId));
      const [version] = await db.insert(projectVersions).values({ projectId, sequence: String(versions.length + 1), appSpec: application.appSpec, summary: application.appSpec.tagline }).returning();
      if (!version) throw new Error("Could not create project version");
      await db.insert(generatedFiles).values(application.files.map((file) => ({ versionId: version.id, ...file })));
      await db.insert(projectPreviewStates).values({ projectId, versionId: version.id, state: {} });
      await db.update(projects).set({ currentVersionId: version.id, updatedAt: new Date() }).where(eq(projects.id, projectId));
      const [completedJob] = await db.update(generationJobs).set({ status: "completed", stage: "validation", logs, completedAt: new Date() }).where(eq(generationJobs.id, jobId)).returning();
      return reply.code(201).send({ job: completedJob, version, files: application.files });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Generation failed";
      await db.update(generationJobs).set({ status: "failed", stage: "validation", logs: [...generatingLogs, logAt("validation", "Generation failed before a usable preview could be produced.")], failureReason: message, completedAt: new Date() }).where(eq(generationJobs.id, jobId));
      return reply.code(502).send({ code: "GENERATION_FAILED", message: "Unable to generate the application. Please try again." });
    }
  });
};
