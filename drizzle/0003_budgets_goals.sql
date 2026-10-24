CREATE TABLE "alert_dismissal" (
	"user_id" text NOT NULL,
	"alert_key" text NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_dismissal_user_id_alert_key_pk" PRIMARY KEY("user_id","alert_key")
);
--> statement-breakpoint
CREATE TABLE "budget" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"category_id" uuid,
	"amount_minor" bigint NOT NULL,
	"rollover" boolean DEFAULT false NOT NULL,
	"rollover_from" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_user_category_key" UNIQUE NULLS NOT DISTINCT("user_id","category_id"),
	CONSTRAINT "budget_amount_positive" CHECK ("budget"."amount_minor" > 0),
	CONSTRAINT "budget_rollover_shape" CHECK (("budget"."rollover" AND "budget"."rollover_from" IS NOT NULL AND "budget"."category_id" IS NOT NULL) OR (NOT "budget"."rollover" AND "budget"."rollover_from" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "goal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"target_minor" bigint NOT NULL,
	"target_date" date,
	"icon" text NOT NULL,
	"color" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_target_positive" CHECK ("goal"."target_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "goal_contribution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"goal_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"occurred_on" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_contribution_nonzero" CHECK ("goal_contribution"."amount_minor" <> 0)
);
--> statement-breakpoint
ALTER TABLE "alert_dismissal" ADD CONSTRAINT "alert_dismissal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contribution" ADD CONSTRAINT "goal_contribution_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contribution" ADD CONSTRAINT "goal_contribution_goal_id_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_user_idx" ON "goal" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goal_contribution_goal_idx" ON "goal_contribution" USING btree ("goal_id","occurred_on");