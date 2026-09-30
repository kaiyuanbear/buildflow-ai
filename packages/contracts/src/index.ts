import { z } from "zod";

export const generationStageSchema = z.enum(["analysis", "planning", "generation", "validation"]);
export type GenerationStage = z.infer<typeof generationStageSchema>;

export const generationEventPhaseSchema = z.enum(["analysis", "planning", "generation", "validation", "persistence"]);
export type GenerationEventPhase = z.infer<typeof generationEventPhaseSchema>;

export const generationEventKindSchema = z.enum(["status", "model_request", "model_response", "validation", "file_write", "version_save", "preview_ready"]);
export type GenerationEventKind = z.infer<typeof generationEventKindSchema>;

export const generationEventStatusSchema = z.enum(["pending", "active", "succeeded", "failed", "skipped"]);
export type GenerationEventStatus = z.infer<typeof generationEventStatusSchema>;

export const generationStatusSchema = z.enum(["idle", "queued", "running", "completed", "failed"]);
export type GenerationStatus = z.infer<typeof generationStatusSchema>;

export const generatedFileLanguages = ["html", "css", "js", "tsx", "ts", "json", "md"] as const;
export const generatedFileLanguageSchema = z.enum(generatedFileLanguages);
export const legacyGeneratedFilePaths = ["index.html", "styles.css", "app.js", "README.md"] as const;
export const generatedArtifactLimits = {
  legacyMinFiles: 3,
  legacyMaxFiles: 6,
  multiFileMinFiles: 7,
  multiFileMaxFiles: 12,
  maxFileBytes: 40_000,
  maxTotalBytes: 180_000
} as const;

export function isAllowedMultiFilePath(path: string) {
  return path === "index.html" || path === "README.md" || /^styles\/[a-zA-Z0-9_-]+\.css$/.test(path) || /^src\/[a-zA-Z0-9_-]+\.js$/.test(path);
}

export const generatedFileSchema = z.object({
  path: z.string().regex(/^[a-zA-Z0-9_./-]+$/).min(1).max(255),
  language: generatedFileLanguageSchema,
  contents: z.string().max(generatedArtifactLimits.maxFileBytes)
});
export type GeneratedFile = z.infer<typeof generatedFileSchema>;

export const generatedArtifactManifestSchema = z.object({
  styles: z.array(z.string().regex(/^styles\/[a-zA-Z0-9_-]+\.css$/)).min(2).max(4),
  scripts: z.array(z.string().regex(/^src\/[a-zA-Z0-9_-]+\.js$/)).min(3).max(7)
}).strict().superRefine((manifest, context) => {
  if (new Set(manifest.styles).size !== manifest.styles.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["styles"], message: "Manifest styles must not contain duplicates." });
  if (new Set(manifest.scripts).size !== manifest.scripts.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["scripts"], message: "Manifest scripts must not contain duplicates." });
});
export type GeneratedArtifactManifest = z.infer<typeof generatedArtifactManifestSchema>;

export const complexityTargetSchema = z.object({
  minimumRegions: z.number().int().min(5).max(8),
  minimumInteractions: z.number().int().min(4).max(8),
  minimumDataEntities: z.number().int().min(1).max(3),
  requiresResponsiveLayout: z.literal(true)
}).strict();
export type ComplexityTarget = z.infer<typeof complexityTargetSchema>;

/**
 * The dimensions an optimization request is explicitly allowed to change.
 * Absent or false values preserve the corresponding capability of the
 * previous generated version.
 */
export const incrementalChangeScopeSchema = z.object({
  productPurpose: z.boolean(),
  interactions: z.boolean(),
  fileStructure: z.boolean()
}).strict();
export type IncrementalChangeScope = z.infer<typeof incrementalChangeScopeSchema>;

export const generationPlanStepSchema = z.object({
  stage: generationStageSchema,
  message: z.string().min(4).max(240)
});
export type GenerationPlanStep = z.infer<typeof generationPlanStepSchema>;

export const legacyGenerationLogSchema = generationPlanStepSchema.extend({ createdAt: z.string().datetime() });
export const generationEventSchema = z.object({
  phase: generationEventPhaseSchema,
  kind: generationEventKindSchema,
  status: generationEventStatusSchema,
  message: z.string().min(4).max(240),
  target: z.string().min(1).max(255).optional(),
  createdAt: z.string().datetime()
});
export type GenerationEvent = z.infer<typeof generationEventSchema>;
export const generationLogEntrySchema = z.union([legacyGenerationLogSchema, generationEventSchema]);
export type GenerationLogEntry = z.infer<typeof generationLogEntrySchema>;

export const appSpecSchema = z.object({
  appName: z.string().min(2).max(80),
  tagline: z.string().min(2).max(160),
  features: z.array(z.string().min(2).max(100)).min(2).max(6),
  preview: z.object({ entryPath: z.string().min(1).max(255) }),
  plan: z.array(generationPlanStepSchema).length(4).optional().default([
    { stage: "analysis", message: "Reviewed the requested product outcome." },
    { stage: "planning", message: "Prepared a browser-only application plan." },
    { stage: "generation", message: "Generated the browser-only source files." },
    { stage: "validation", message: "Validated the artifact for isolated preview." }
  ])
});
export type AppSpec = z.infer<typeof appSpecSchema>;

export const storedAppSpecSchema = appSpecSchema.extend({
  artifactManifest: generatedArtifactManifestSchema.optional(),
  generationRequest: z.object({
    prompt: z.string().min(3).max(2_000),
    instruction: z.string().min(3).max(2_000).optional(),
    changeScope: incrementalChangeScopeSchema.optional()
  }).optional()
});
export type StoredAppSpec = z.infer<typeof storedAppSpecSchema>;

export const generatedApplicationSchema = z.object({
  appSpec: appSpecSchema,
  manifest: generatedArtifactManifestSchema.optional(),
  files: z.array(generatedFileSchema).min(generatedArtifactLimits.legacyMinFiles).max(generatedArtifactLimits.multiFileMaxFiles)
}).superRefine((application, context) => {
  const paths = application.files.map((file) => file.path);
  const totalBytes = application.files.reduce((total, file) => total + new TextEncoder().encode(file.contents).byteLength, 0);
  if (!paths.includes("index.html")) context.addIssue({ code: z.ZodIssueCode.custom, path: ["files"], message: "index.html is required." });
  if (new Set(paths).size !== paths.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["files"], message: "Generated file paths must be unique." });
  if (totalBytes > generatedArtifactLimits.maxTotalBytes) context.addIssue({ code: z.ZodIssueCode.custom, path: ["files"], message: "Generated files exceed the total size limit." });
  if (!application.manifest) {
    if (application.files.length > generatedArtifactLimits.legacyMaxFiles) context.addIssue({ code: z.ZodIssueCode.custom, path: ["files"], message: "Legacy artifacts may contain at most six files." });
    for (const file of application.files) if (!(legacyGeneratedFilePaths as readonly string[]).includes(file.path)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["files"], message: `Unsupported legacy file path: ${file.path}` });
    return;
  }
  if (application.files.length < generatedArtifactLimits.multiFileMinFiles) context.addIssue({ code: z.ZodIssueCode.custom, path: ["files"], message: "Multi-file artifacts require at least seven files." });
  for (const file of application.files) if (!isAllowedMultiFilePath(file.path)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["files"], message: `Unsupported multi-file path: ${file.path}` });
  const styles = application.files.filter((file) => file.language === "css").map((file) => file.path);
  const scripts = application.files.filter((file) => file.language === "js").map((file) => file.path);
  if (styles.length !== application.manifest.styles.length || application.manifest.styles.some((path) => !styles.includes(path))) context.addIssue({ code: z.ZodIssueCode.custom, path: ["manifest", "styles"], message: "Manifest must reference every generated CSS file exactly once." });
  if (scripts.length !== application.manifest.scripts.length || application.manifest.scripts.some((path) => !scripts.includes(path))) context.addIssue({ code: z.ZodIssueCode.custom, path: ["manifest", "scripts"], message: "Manifest must reference every generated JavaScript file exactly once." });
});
export type GeneratedApplication = z.infer<typeof generatedApplicationSchema>;

export const previewStateSchema = z.record(z.unknown()).refine(
  (value) => JSON.stringify(value).length <= 50_000,
  "Preview state is too large"
);
export type PreviewState = z.infer<typeof previewStateSchema>;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("buildflow-api"),
  timestamp: z.string()
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
