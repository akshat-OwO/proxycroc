/**
 * Single source of truth for the whole database — this is the file
 * `Drizzle.Schema` in `src/database.ts` points drizzle-kit at, so every table
 * exported here gets migrations generated and applied on deploy.
 *
 * Right now that's the Better Auth tables only. Regenerate them after any
 * change to `src/auth-options.ts`:
 *   bunx @better-auth/cli generate --config src/auth.cli.ts --output src/auth-schema.ts -y
 * then re-trim the trailing legacy `relations()` block (drizzle rc5 dropped it).
 */
export * from "./auth-schema";
