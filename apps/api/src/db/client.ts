import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;
export function getDatabase() { if (!process.env.DATABASE_URL) return undefined; database ??= drizzle(postgres(process.env.DATABASE_URL, { prepare: false }), { schema }); return database; }
