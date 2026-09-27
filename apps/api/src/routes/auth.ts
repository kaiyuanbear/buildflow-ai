import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDatabase } from "../db/client.js";
import { users } from "../db/schema.js";

const credentials = z.object({ email: z.string().email().max(255).transform((value) => value.trim().toLowerCase()), password: z.string().min(8).max(128) });
const unavailable = { code: "DATABASE_NOT_CONFIGURED", message: "Database is not configured yet." };

export const registerAuthRoutes: FastifyPluginAsync = async (app) => {
  app.post("/register", async (request, reply) => { const input = credentials.parse(request.body); const db = getDatabase(); if (!db) return reply.code(503).send(unavailable); if (await db.query.users.findFirst({ where: eq(users.email, input.email) })) return reply.code(409).send({ code: "EMAIL_TAKEN", message: "An account already uses this email." }); const [user] = await db.insert(users).values({ email: input.email, passwordHash: await hash(input.password, 12) }).returning({ id: users.id, email: users.email }); const token = await reply.jwtSign(user!); reply.setCookie("buildflow_session", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" }); return reply.code(201).send({ user }); });
  app.post("/login", async (request, reply) => { const input = credentials.parse(request.body); const db = getDatabase(); if (!db) return reply.code(503).send(unavailable); const user = await db.query.users.findFirst({ where: eq(users.email, input.email) }); if (!user || !(await compare(input.password, user.passwordHash))) return reply.code(401).send({ code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." }); const safe = { id: user.id, email: user.email }; reply.setCookie("buildflow_session", await reply.jwtSign(safe), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" }); return { user: safe }; });
  app.post("/logout", async (_request, reply) => { reply.clearCookie("buildflow_session", { path: "/" }); return reply.code(204).send(); });
  app.get("/me", async (request, reply) => { try { await request.jwtVerify(); return { user: request.user }; } catch { return reply.code(401).send({ code: "UNAUTHENTICATED", message: "Please sign in." }); } });
};
