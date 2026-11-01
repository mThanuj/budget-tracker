CREATE INDEX "goal_contribution_user_created_idx" ON "goal_contribution" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "transaction_category_idx" ON "transaction" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "transaction_wallet_idx" ON "transaction" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "transaction_to_wallet_idx" ON "transaction" USING btree ("to_wallet_id");