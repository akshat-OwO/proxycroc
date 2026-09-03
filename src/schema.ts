/**
 * Single source of truth for the whole database — this is the file
 * `Drizzle.Schema` in `src/database.ts` points drizzle-kit at, so every table
 * exported here gets migrations generated and applied on deploy.
 *
 * Regenerate the auth half after any change to `src/auth-options.ts`:
 *   bun run auth:generate
 */
export * from "./auth-schema";
export * from "./app-schema";
