CREATE TYPE "public"."recurrence_frequency" AS ENUM('weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."recurrence_mode" AS ENUM('auto', 'confirm');--> statement-breakpoint
CREATE TABLE "recurring_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"description" text NOT NULL,
	"category_id" uuid,
	"wallet_id" uuid NOT NULL,
	"to_wallet_id" uuid,
	"frequency" "recurrence_frequency" NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"anchor_date" date NOT NULL,
	"end_date" date,
	"next_due_on" date,
	"mode" "recurrence_mode" DEFAULT 'auto' NOT NULL,
	"is_subscription" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_rule_amount_positive" CHECK ("recurring_rule"."amount_minor" > 0),
	CONSTRAINT "recurring_rule_interval" CHECK ("recurring_rule"."interval" between 1 and 52),
	CONSTRAINT "recurring_rule_transfer_shape" CHECK (("recurring_rule"."type" = 'transfer' AND "recurring_rule"."to_wallet_id" IS NOT NULL AND "recurring_rule"."to_wallet_id" <> "recurring_rule"."wallet_id" AND "recurring_rule"."category_id" IS NULL)
        OR ("recurring_rule"."type" <> 'transfer' AND "recurring_rule"."to_wallet_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "recurring_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "recurrence_on" date;--> statement-breakpoint
ALTER TABLE "recurring_rule" ADD CONSTRAINT "recurring_rule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rule" ADD CONSTRAINT "recurring_rule_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rule" ADD CONSTRAINT "recurring_rule_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rule" ADD CONSTRAINT "recurring_rule_to_wallet_id_wallet_id_fk" FOREIGN KEY ("to_wallet_id") REFERENCES "public"."wallet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_rule_due_idx" ON "recurring_rule" USING btree ("next_due_on") WHERE "recurring_rule"."active";--> statement-breakpoint
CREATE INDEX "recurring_rule_user_idx" ON "recurring_rule" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_recurring_rule_id_recurring_rule_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."recurring_rule"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_rule_occurrence_key" ON "transaction" USING btree ("recurring_rule_id","recurrence_on");