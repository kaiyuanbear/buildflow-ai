import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(moduleDirectory, "../../../.env") });
import { buildApp } from "./app.js";

const app = buildApp();
const port = Number(process.env.PORT ?? 3001);

try {
  await app.listen({ host: "0.0.0.0", port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
