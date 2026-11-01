CREATE TABLE "deleted_entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"row" jsonb NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deleted_entry" ADD CONSTRAINT "deleted_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deleted_entry_user_deleted_idx" ON "deleted_entry" USING btree ("user_id","deleted_at");