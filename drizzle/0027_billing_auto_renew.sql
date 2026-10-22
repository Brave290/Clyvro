ALTER TABLE "organizations" ADD COLUMN "auto_renew" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "flw_payment_plan_id" text;
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "flw_subscription_id" text;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "kind" text DEFAULT 'one_time' NOT NULL;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "flw_payment_plan_id" text;
