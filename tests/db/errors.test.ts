// Expected refusals become messages; real database failures stay errors, so
// they reach error monitoring instead of being shown as a wrong reason.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedNewUser } from "@/server/db/seed-defaults";
import { createCategory } from "@/server/services/categories";
import { isUniqueViolation, UserError } from "@/server/services/errors";
import { createTransaction } from "@/server/services/transactions";
import { listWallets } from "@/server/services/wallets";
import { createTestDb, createTestUser, freeCategoryColor } from "./helpers";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

async function newUser() {
  const u = await createTestUser(t.db);
  await seedNewUser(t.db, u.id);
  const [cash] = await listWallets(t.db, u.id);
  return { id: u.id, cashId: cash.id };
}
const caught = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (err: unknown) => err,
  );

describe("duplicates", () => {
  it("a second category with the same name (any case) is a message on the name field", async () => {
    const u = await newUser();
    const err = await caught(
      createCategory(t.db, u.id, {
        name: "groceries",
        kind: "expense",
        icon: "tag",
        color: await freeCategoryColor(t.db, u.id, "expense"),
      }),
    );
    expect(err).toBeInstanceOf(UserError);
    expect(err).toMatchObject({ message: "You already have a category with that name.", field: "name" });
  });

  it("are recognised by Postgres's code and constraint name, however the driver's error is wrapped", async () => {
    const u = await newUser();
    const err = await caught(
      t.db.execute(
        `insert into category (user_id, name, kind, icon, color) values ('${u.id}', 'Groceries', 'expense', 'tag', '#399e78')`,
      ),
    );
    expect(isUniqueViolation(err, "category_user_kind_name_key")).toBe(true);
    expect(isUniqueViolation(err, "wallet_user_name_key")).toBe(false);
    expect(
      isUniqueViolation(new Error("duplicate key value violates unique constraint"), "category_user_kind_name_key"),
    ).toBe(false);
    expect(
      isUniqueViolation({ code: "23503", constraint: "category_user_kind_name_key" }, "category_user_kind_name_key"),
    ).toBe(false);
    expect(isUniqueViolation(undefined, "category_user_kind_name_key")).toBe(false);
  });
});

describe("a real failure behind an ownership check", () => {
  it("stays an error instead of becoming “That wallet doesn't exist.”", async () => {
    const u = await newUser();
    // A malformed id the action's validation would never let through: Postgres refuses it (22P02).
    const err = await caught(
      createTransaction(t.db, u.id, {
        type: "transfer",
        amount: 10_00,
        occurredOn: "2026-10-25",
        description: "Move",
        notes: null,
        walletId: u.cashId,
        toWalletId: "not-a-uuid",
        categoryId: null,
      }),
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(UserError);
  });

  it("while another user's wallet is still refused as if it didn't exist, on the right field", async () => {
    const u = await newUser();
    const other = await newUser();
    const err = await caught(
      createTransaction(t.db, u.id, {
        type: "transfer",
        amount: 10_00,
        occurredOn: "2026-10-25",
        description: "Move",
        notes: null,
        walletId: u.cashId,
        toWalletId: other.cashId,
        categoryId: null,
      }),
    );
    expect(err).toBeInstanceOf(UserError);
    expect(err).toMatchObject({ message: "That wallet doesn't exist.", field: "toWalletId" });
  });
});
