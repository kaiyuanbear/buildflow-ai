import { and, asc, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDatabase } from "../db/client.js";
import { projects, projectTasks } from "../db/schema.js";

const projectParams = z.object({ projectId: z.string().uuid() });
const taskParams = projectParams.extend({ taskId: z.string().uuid() });
const createTaskBody = z.object({ title: z.string().trim().min(1).max(180) });
const updateTaskBody = z.object({ completed: z.boolean() });

async function requireOwnedProject(projectId: string, userId: string) {
  const db = getDatabase();
  if (!db) return { db: null, project: null };
  const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)));
  return { db, project: project ?? null };
}

export const registerTaskRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:projectId/tasks", async (request, reply) => {
    try { await request.jwtVerify(); } catch { return reply.code(401).send({ code: "UNAUTHENTICATED" }); }
    const { projectId } = projectParams.parse(request.params);
    const { db, project } = await requireOwnedProject(projectId, request.user.id);
    if (!db) return reply.code(503).send({ code: "DATABASE_NOT_CONFIGURED" });
    if (!project) return reply.code(404).send({ code: "PROJECT_NOT_FOUND" });
    const tasks = await db.select().from(projectTasks).where(eq(projectTasks.projectId, projectId)).orderBy(asc(projectTasks.createdAt));
    return { tasks };
  });

  app.post("/:projectId/tasks", async (request, reply) => {
    try { await request.jwtVerify(); } catch { return reply.code(401).send({ code: "UNAUTHENTICATED" }); }
    const { projectId } = projectParams.parse(request.params);
    const body = createTaskBody.parse(request.body);
    const { db, project } = await requireOwnedProject(projectId, request.user.id);
    if (!db) return reply.code(503).send({ code: "DATABASE_NOT_CONFIGURED" });
    if (!project) return reply.code(404).send({ code: "PROJECT_NOT_FOUND" });
    const [task] = await db.insert(projectTasks).values({ projectId, title: body.title }).returning();
    return reply.code(201).send({ task });
  });

  app.patch("/:projectId/tasks/:taskId", async (request, reply) => {
    try { await request.jwtVerify(); } catch { return reply.code(401).send({ code: "UNAUTHENTICATED" }); }
    const { projectId, taskId } = taskParams.parse(request.params);
    const body = updateTaskBody.parse(request.body);
    const { db, project } = await requireOwnedProject(projectId, request.user.id);
    if (!db) return reply.code(503).send({ code: "DATABASE_NOT_CONFIGURED" });
    if (!project) return reply.code(404).send({ code: "PROJECT_NOT_FOUND" });
    const [task] = await db.update(projectTasks).set({ completed: body.completed, updatedAt: new Date() }).where(and(eq(projectTasks.id, taskId), eq(projectTasks.projectId, projectId))).returning();
    if (!task) return reply.code(404).send({ code: "TASK_NOT_FOUND" });
    return { task };
  });
};
