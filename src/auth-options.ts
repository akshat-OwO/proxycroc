import { apiKey } from "@better-auth/api-key";

export interface AuthConfig {
  /** Public origin of the web app, e.g. https://proxycroc.example.com. */
  readonly baseURL: string;
  readonly github: GithubCredentials;
}

export interface GithubCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

/**
 * Better Auth options, defined once and shared by two consumers:
 *  - `src/worker.ts`, which passes them to Alchemy's `BetterAuth(...)`
 *  - `src/auth.cli.ts`, which the `@better-auth/cli` reads to regenerate
 *    `src/auth-schema.ts`
 *
 * Credentials are a parameter because the CLI never has (or needs) them —
 * only the plugin/provider *shape* drives the generated schema.
 *
 * Keep every auth feature/plugin here so the generated drizzle schema can
 * never drift from the running config.
 */
export const authOptions = ({ baseURL, github }: AuthConfig) => ({
  baseURL,
  basePath: "/api/auth",
  socialProviders: { github },
  // Keys carry their scope in metadata: { repository: "owner/name" | null },
  // where null means every repository the installation can see.
  plugins: [
    apiKey({
      enableMetadata: true,
      // An agent working one task bursts: list issues, read comments, reply.
      // 60/minute leaves room for that while still capping a runaway loop
      // far below GitHub's 5,000/hour per-installation limit. These values
      // are copied onto each key row at creation time, so changing them
      // only affects keys created afterwards.
      rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 60 },
    }),
  ],
});
