ALTER TYPE "public"."notification_status" ADD VALUE 'READ' BEFORE 'FAILED';--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "read_at" timestamp;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "owner_id" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "last_delivery_at" timestamp;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN "last_delivery_status" varchar;