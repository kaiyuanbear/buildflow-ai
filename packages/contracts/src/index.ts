import { z } from "zod";

export const generationStageSchema = z.enum(["analysis", "planning", "generation", "validation"]);
export type GenerationStage = z.infer<typeof generationStageSchema>;

export const generationStatusSchema = z.enum(["idle", "queued", "running", "completed", "failed"]);
export type GenerationStatus = z.infer<typeof generationStatusSchema>;

export const generatedFileSchema = z.object({
  path: z.string().regex(/^[a-zA-Z0-9_./-]+$/).min(1).max(255),
  language: z.enum(["html", "css", "js", "tsx", "ts", "json", "md"]),
  contents: z.string().max(60_000)
});
export type GeneratedFile = z.infer<typeof generatedFileSchema>;

export const generationPlanStepSchema = z.object({
  stage: generationStageSchema,
  message: z.string().min(4).max(240)
});
export type GenerationPlanStep = z.infer<typeof generationPlanStepSchema>;

export const appSpecSchema = z.object({
  appName: z.string().min(2).max(80),
  tagline: z.string().min(2).max(160),
  features: z.array(z.string().min(2).max(100)).min(2).max(6),
  preview: z.object({ entryPath: z.string().min(1).max(255) }),
  plan: z.array(generationPlanStepSchema).length(4)
});
export type AppSpec = z.infer<typeof appSpecSchema>;

export const generatedApplicationSchema = z.object({
  appSpec: appSpecSchema,
  files: z.array(generatedFileSchema).min(3).max(6)
    .refine((files) => files.some((file) => file.path === "index.html"), "index.html is required")
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
