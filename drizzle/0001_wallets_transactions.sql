CREATE TYPE "public"."transaction_source" AS ENUM('manual', 'nl', 'recurring', 'onboarding');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('income', 'expense', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."wallet_kind" AS ENUM('cash', 'bank', 'credit_card', 'other');--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"occurred_on" date NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"notes" text,
	"merchant_key" text,
	"category_id" uuid,
	"wallet_id" uuid NOT NULL,
	"to_wallet_id" uuid,
	"source" "transaction_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_amount_positive" CHECK ("transaction"."amount_minor" > 0),
	CONSTRAINT "transaction_transfer_shape" CHECK (("transaction"."type" = 'transfer' AND "transaction"."to_wallet_id" IS NOT NULL AND "transaction"."to_wallet_id" <> "transaction"."wallet_id" AND "transaction"."category_id" IS NULL)
        OR ("transaction"."type" <> 'transfer' AND "transaction"."to_wallet_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "wallet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "wallet_kind" NOT NULL,
	"opening_balance_minor" bigint DEFAULT 0 NOT NULL,
	"color" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "default_wallet_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_wallet_id_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_to_wallet_id_wallet_id_fk" FOREIGN KEY ("to_wallet_id") REFERENCES "public"."wallet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transaction_user_date_idx" ON "transaction" USING btree ("user_id","occurred_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transaction_user_wallet_idx" ON "transaction" USING btree ("user_id","wallet_id");--> statement-breakpoint
CREATE INDEX "transaction_user_to_wallet_idx" ON "transaction" USING btree ("user_id","to_wallet_id");--> statement-breakpoint
CREATE INDEX "transaction_user_category_date_idx" ON "transaction" USING btree ("user_id","category_id","occurred_on");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_user_name_key" ON "wallet" USING btree ("user_id",lower("name"));--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_default_wallet_id_wallet_id_fk" FOREIGN KEY ("default_wallet_id") REFERENCES "public"."wallet"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Data: every existing user starts with a default "Cash" wallet (new users get it on signup).
INSERT INTO "wallet" ("user_id", "name", "kind", "opening_balance_minor", "color")
SELECT u."id", 'Cash', 'cash', 0, '#3f9b74' FROM "user" u
WHERE NOT EXISTS (SELECT 1 FROM "wallet" w WHERE w."user_id" = u."id");--> statement-breakpoint
UPDATE "user" u SET "default_wallet_id" = w."id"
FROM "wallet" w
WHERE w."user_id" = u."id" AND w."name" = 'Cash' AND u."default_wallet_id" IS NULL;
