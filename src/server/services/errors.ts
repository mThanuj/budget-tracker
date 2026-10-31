/** An expected failure whose message is safe to show the user as-is. */
export class UserError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "UserError";
  }
}

/** An error and what caused it, a few levels down (Drizzle wraps the driver's error in `cause`). */
function* causes(err: unknown) {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current; depth++) {
    yield current;
    current = current instanceof Error ? current.cause : undefined;
  }
}

/** Whether Postgres refused a duplicate of the named unique constraint (code 23505), however wrapped. */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  for (const e of causes(err)) {
    if (typeof e === "object" && e !== null && "code" in e && "constraint" in e) {
      if (e.code === "23505" && e.constraint === constraint) return true;
    }
  }
  return false;
}

/** A `.catch` handler: a duplicate of `constraint` becomes this UserError; anything else is rethrown. */
export function rethrowUnique(constraint: string, message: string, field?: string) {
  return (err: unknown): never => {
    if (isUniqueViolation(err, constraint)) throw new UserError(message, field);
    throw err;
  };
}
