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
