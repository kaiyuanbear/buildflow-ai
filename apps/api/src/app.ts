import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import Fastify from "fastify";
import { healthResponseSchema } from "@buildflow/contracts";
import { registerAuthRoutes } from "./routes/auth.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: process.env.WEB_ORIGIN ?? "http://127.0.0.1:5173",
    credentials: true
  });
  app.register(cookie);
  app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "development-only-secret-change-me",
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

  return app;
}
