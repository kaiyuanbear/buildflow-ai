import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { healthResponseSchema } from "@buildflow/contracts";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerProjectRoutes } from "./routes/projects.js";
import { registerGenerationRoutes } from "./routes/generation.js";

export function buildApp() {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  app.register(cors, {
    origin: process.env.WEB_ORIGIN ?? "http://127.0.0.1:5173",
    credentials: true
  });
  app.register(cookie);
  app.register(jwt, {
    secret: jwtSecret,
    cookie: {
      cookieName: "buildflow_session",
      signed: false
    }
  });

  app.get("/api/health", async () =>
    healthResponseSchema.parse({
      status: "ok",
      service: "buildflow-api",
      timestamp: new Date().toISOString()
    })
  );
  app.register(registerAuthRoutes, { prefix: "/api/auth" });
  app.register(registerProjectRoutes, { prefix: "/api/projects" });
  app.register(registerGenerationRoutes, { prefix: "/api/projects" });

  if (process.env.NODE_ENV === "production") {
    const moduleDirectory = dirname(fileURLToPath(import.meta.url));
    const webDistDirectory = resolve(moduleDirectory, "../../web/dist");
    app.register(fastifyStatic, { root: webDistDirectory, wildcard: false });
    app.get("/*", async (request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ code: "API_ROUTE_NOT_FOUND" });
      return reply.sendFile("index.html");
    });
  }

  return app;
}
