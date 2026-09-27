import { and, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { getDatabase } from "../db/client.js";
import { projects } from "../db/schema.js";

const createProject = z.object({ name: z.string().trim().min(2).max(100), prompt: z.string().trim().min(10).max(4000) });
const unavailable = { code: "DATABASE_NOT_CONFIGURED", message: "Database is not configured yet." };
async function currentUser(request: FastifyRequest): Promise<{ id: string; email: string } | undefined> { try { await request.jwtVerify(); return request.user; } catch { return undefined; } }

export const registerProjectRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async (request, reply) => { const user = await currentUser(request); if (!user) return reply.code(401).send({ code: "UNAUTHENTICATED" }); const db = getDatabase(); if (!db) return reply.code(503).send(unavailable); return { projects: await db.select({ id: projects.id, name: projects.name, prompt: projects.prompt, createdAt: projects.createdAt, updatedAt: projects.updatedAt }).from(projects).where(eq(projects.ownerId, user.id)).orderBy(desc(projects.updatedAt)) }; });
  app.post("/", async (request, reply) => { const user = await currentUser(request); if (!user) return reply.code(401).send({ code: "UNAUTHENTICATED" }); const input = createProject.parse(request.body); const db = getDatabase(); if (!db) return reply.code(503).send(unavailable); const [project] = await db.insert(projects).values({ ...input, ownerId: user.id }).returning(); return reply.code(201).send({ project }); });
  app.get("/:projectId", async (request, reply) => { const user = await currentUser(request); if (!user) return reply.code(401).send({ code: "UNAUTHENTICATED" }); const id = z.string().uuid().parse((request.params as { projectId: string }).projectId); const db = getDatabase(); if (!db) return reply.code(503).send(unavailable); const [project] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.ownerId, user.id))); return project ? { project } : reply.code(404).send({ code: "PROJECT_NOT_FOUND" }); });
  app.delete("/:projectId", async (request, reply) => { const user = await currentUser(request); if (!user) return reply.code(401).send({ code: "UNAUTHENTICATED" }); const id = z.string().uuid().parse((request.params as { projectId: string }).projectId); const db = getDatabase(); if (!db) return reply.code(503).send(unavailable); const deleted = await db.delete(projects).where(and(eq(projects.id, id), eq(projects.ownerId, user.id))).returning({ id: projects.id }); return deleted.length ? reply.code(204).send() : reply.code(404).send({ code: "PROJECT_NOT_FOUND" }); });
};
