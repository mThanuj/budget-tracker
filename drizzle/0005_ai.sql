CREATE TABLE "ai_usage" (
	"scope" text NOT NULL,
	"day" date NOT NULL,
	"feature" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_scope_day_feature_pk" PRIMARY KEY("scope","day","feature")
);
--> statement-breakpoint
CREATE TABLE "merchant_rule" (
	"user_id" text NOT NULL,
	"merchant_key" text NOT NULL,
	"category_id" uuid NOT NULL,
	"hits" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_rule_user_id_merchant_key_pk" PRIMARY KEY("user_id","merchant_key")
);
--> statement-breakpoint
ALTER TABLE "merchant_rule" ADD CONSTRAINT "merchant_rule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_rule" ADD CONSTRAINT "merchant_rule_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;