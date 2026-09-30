ALTER TABLE "generation_jobs" ADD COLUMN "version_id" uuid;
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_version_id_project_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."project_versions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "generation_jobs_project_created_at_idx" ON "generation_jobs" USING btree ("project_id", "created_at");
