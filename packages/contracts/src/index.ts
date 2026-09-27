import { z } from "zod";

export const appTemplateSchema = z.enum(["task-manager", "landing-page", "analytics-dashboard"]);
export type AppTemplate = z.infer<typeof appTemplateSchema>;

export const generationStageSchema = z.enum(["analysis", "planning", "generation", "validation"]);
export type GenerationStage = z.infer<typeof generationStageSchema>;

export const generationStatusSchema = z.enum(["idle", "queued", "running", "completed", "failed"]);
export type GenerationStatus = z.infer<typeof generationStatusSchema>;

export const generatedFileSchema = z.object({
  path: z.string().min(1),
  language: z.enum(["tsx", "ts", "css", "json", "md"]),
  contents: z.string()
});
export type GeneratedFile = z.infer<typeof generatedFileSchema>;

export const appSpecSchema = z.object({
  template: appTemplateSchema,
  appName: z.string().min(2).max(80),
  tagline: z.string().min(2).max(160),
  theme: z.object({
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    surface: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    text: z.string().regex(/^#[0-9a-fA-F]{6}$/)
  }),
  features: z.array(z.string().min(2).max(80)).min(2).max(5),
  seedData: z.record(z.unknown())
});
export type AppSpec = z.infer<typeof appSpecSchema>;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("buildflow-api"),
  timestamp: z.string()
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
