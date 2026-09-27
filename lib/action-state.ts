/** Result returned by simple server actions and shown by <ActionForm>. */
export interface ActionState {
  status?: "success" | "error";
  message?: string;
}

/** Map a PostgREST / Postgres error to a message an administrator can act on. */
export function friendlyDbError(error: { code?: string; message?: string } | null | undefined, fallback: string): string {
  switch (error?.code) {
    case "23505":
      return "That already exists. Use a different name or code.";
    case "23503":
      return "It is still in use, so it can’t be removed. Remove what depends on it first.";
    case "23514":
      return "One of the values isn’t allowed. Check the lengths, dates and formats.";
    case "42501":
      return "You don’t have permission to do that.";
    case "22023":
    case "P0001":
      // Raised deliberately by our own database functions with a readable message.
      return error.message && error.message.length < 200 ? error.message : fallback;
    default:
      return fallback;
  }
}
