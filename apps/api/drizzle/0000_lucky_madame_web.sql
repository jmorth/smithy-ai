CREATE TYPE "public"."package_status" AS ENUM('PENDING', 'IN_TRANSIT', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."worker_version_status" AS ENUM('ACTIVE', 'DEPRECATED');--> statement-breakpoint
CREATE TYPE "public"."assembly_line_status" AS ENUM('ACTIVE', 'PAUSED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."worker_pool_status" AS ENUM('ACTIVE', 'PAUSED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('QUEUED', 'RUNNING', 'COMPLETED', 'STUCK', 'ERROR', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('PENDING', 'SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('EMAIL', 'IN_APP', 'WEBHOOK');--> statement-breakpoint
CREATE TABLE "package_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"file_key" varchar NOT NULL,
	"filename" varchar NOT NULL,
	"mime_type" varchar NOT NULL,
	"size_bytes" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar NOT NULL,
	"status" "package_status" DEFAULT 'PENDING' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assembly_line_id" uuid,
	"current_step" integer,
	"created_by" varchar,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"yaml_config" jsonb NOT NULL,
	"dockerfile_hash" varchar,
	"status" "worker_version_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "worker_versions_worker_id_version_unique" UNIQUE("worker_id","version")
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "assembly_line_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assembly_line_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"worker_version_id" uuid NOT NULL,
	"config_overrides" jsonb,
	CONSTRAINT "assembly_line_steps_assembly_line_id_step_number_unique" UNIQUE("assembly_line_id","step_number")
);
--> statement-breakpoint
CREATE TABLE "assembly_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"description" text,
	"status" "assembly_line_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assembly_lines_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "worker_pool_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pool_id" uuid NOT NULL,
	"worker_version_id" uuid NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"description" text,
	"status" "worker_pool_status" DEFAULT 'ACTIVE' NOT NULL,
	"max_concurrency" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "worker_pools_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "job_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"worker_version_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'QUEUED' NOT NULL,
	"container_id" varchar,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error_message" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"logs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "notification_type" NOT NULL,
	"recipient" varchar NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "notification_status" DEFAULT 'PENDING' NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" varchar NOT NULL,
	"secret" varchar NOT NULL,
	"events" text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "package_files" ADD CONSTRAINT "package_files_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_assembly_line_id_assembly_lines_id_fk" FOREIGN KEY ("assembly_line_id") REFERENCES "public"."assembly_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_versions" ADD CONSTRAINT "worker_versions_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_line_steps" ADD CONSTRAINT "assembly_line_steps_assembly_line_id_assembly_lines_id_fk" FOREIGN KEY ("assembly_line_id") REFERENCES "public"."assembly_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_line_steps" ADD CONSTRAINT "assembly_line_steps_worker_version_id_worker_versions_id_fk" FOREIGN KEY ("worker_version_id") REFERENCES "public"."worker_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_pool_members" ADD CONSTRAINT "worker_pool_members_pool_id_worker_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."worker_pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_pool_members" ADD CONSTRAINT "worker_pool_members_worker_version_id_worker_versions_id_fk" FOREIGN KEY ("worker_version_id") REFERENCES "public"."worker_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_worker_version_id_worker_versions_id_fk" FOREIGN KEY ("worker_version_id") REFERENCES "public"."worker_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_executions_package_id_idx" ON "job_executions" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "job_executions_status_idx" ON "job_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_executions_worker_version_id_idx" ON "job_executions" USING btree ("worker_version_id");