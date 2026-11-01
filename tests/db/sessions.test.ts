// The signed-in devices list (D-035): only the user's own live sessions, and
// never the token that is the sign-in itself.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/server/db/schema";
import { listSignedInDevices } from "@/server/services/sessions";
import { createTestDb, createTestUser } from "./helpers";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

const HOUR = 60 * 60_000;
async function addSession(userId: string, { createdAgo = 0, expiresIn = 24 * HOUR, userAgent = "Firefox" } = {}) {
  const id = crypto.randomUUID();
  await t.db.insert(schema.session).values({
    id,
    userId,
    token: `secret-${id}`,
    userAgent,
    ipAddress: "203.0.113.7",
    createdAt: new Date(Date.now() - createdAgo),
    expiresAt: new Date(Date.now() + expiresIn),
  });
  return id;
}

describe("signed-in devices (listSignedInDevices)", () => {
  it("lists the user's live sessions, newest first, without tokens or addresses", async () => {
    const alice = await createTestUser(t.db);
    const bob = await createTestUser(t.db);
    const older = await addSession(alice.id, { createdAgo: 3 * HOUR, userAgent: "Safari" });
    const newer = await addSession(alice.id, { createdAgo: HOUR });
    await addSession(alice.id, { createdAgo: 2 * HOUR, expiresIn: -HOUR }); // expired
    await addSession(bob.id);

    const devices = await listSignedInDevices(t.db, alice.id);
    expect(devices.map((d) => d.id)).toEqual([newer, older]);
    expect(devices[1]).toEqual({ id: older, userAgent: "Safari", createdAt: expect.any(Date) });
    expect(JSON.stringify(devices)).not.toMatch(/secret-|203\.0\.113\.7/);
  });
});
