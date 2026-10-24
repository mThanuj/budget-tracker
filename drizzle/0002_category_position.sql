ALTER TABLE "category" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Data: order existing categories like new accounts (defaults in their intended
-- order, then custom categories by creation time).
UPDATE "category" c SET "position" = o.pos
FROM (
  SELECT c."id", CASE
    WHEN c."kind" = 'expense' AND lower(c."name") = 'groceries' THEN 0
    WHEN c."kind" = 'expense' AND lower(c."name") = 'dining out' THEN 1
    WHEN c."kind" = 'expense' AND lower(c."name") = 'rent & housing' THEN 2
    WHEN c."kind" = 'expense' AND lower(c."name") = 'bills & utilities' THEN 3
    WHEN c."kind" = 'expense' AND lower(c."name") = 'transport' THEN 4
    WHEN c."kind" = 'expense' AND lower(c."name") = 'fuel' THEN 5
    WHEN c."kind" = 'expense' AND lower(c."name") = 'health' THEN 6
    WHEN c."kind" = 'expense' AND lower(c."name") = 'insurance' THEN 7
    WHEN c."kind" = 'expense' AND lower(c."name") = 'entertainment' THEN 8
    WHEN c."kind" = 'expense' AND lower(c."name") = 'shopping' THEN 9
    WHEN c."kind" = 'expense' AND lower(c."name") = 'subscriptions' THEN 10
    WHEN c."kind" = 'expense' AND lower(c."name") = 'travel' THEN 11
    WHEN c."kind" = 'expense' AND lower(c."name") = 'education' THEN 12
    WHEN c."kind" = 'expense' AND lower(c."name") = 'personal care' THEN 13
    WHEN c."kind" = 'expense' AND lower(c."name") = 'gifts & donations' THEN 14
    WHEN c."kind" = 'expense' AND lower(c."name") = 'emi & loans' THEN 15
    WHEN c."kind" = 'expense' AND lower(c."name") = 'fees & charges' THEN 16
    WHEN c."kind" = 'expense' AND lower(c."name") = 'other' THEN 17
    WHEN c."kind" = 'income' AND lower(c."name") = 'salary' THEN 0
    WHEN c."kind" = 'income' AND lower(c."name") = 'freelance' THEN 1
    WHEN c."kind" = 'income' AND lower(c."name") = 'business' THEN 2
    WHEN c."kind" = 'income' AND lower(c."name") = 'investments' THEN 3
    WHEN c."kind" = 'income' AND lower(c."name") = 'refunds & cashback' THEN 4
    WHEN c."kind" = 'income' AND lower(c."name") = 'gifts received' THEN 5
    WHEN c."kind" = 'income' AND lower(c."name") = 'other income' THEN 6
    ELSE 100 + row_number() OVER (PARTITION BY c."user_id", c."kind" ORDER BY c."created_at", c."name")
  END AS pos
  FROM "category" c
) o
WHERE o."id" = c."id";