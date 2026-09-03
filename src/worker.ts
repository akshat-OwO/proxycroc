import * as Effect from "effect/Effect";
import * as Cloudflare from "alchemy/Cloudflare";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { BetterAuth } from "@alchemy.run/better-auth";
import { Drizzle } from "@alchemy.run/better-auth/Drizzle";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as Config from "effect/Config";
import * as Redacted from "effect/Redacted";
import { Database } from "./database";
import { authOptions } from "./auth-options";
import * as schema from "./schema";

export default Cloudflare.Worker(
  "proxycroc-worker",
  { main: import.meta.url, compatibility: { flags: ["nodejs_compat"] } },
  Effect.gen(function* () {
    const d1 = yield* Cloudflare.D1.QueryDatabase(Database);

    // Better Auth's storage adapter. It needs a plain promise-based drizzle
    // instance (not alchemy's chainable proxy), built lazily off the same D1
    // binding — hence the Effect rather than a value.
    const authDb = Effect.map(
      d1.raw,
      (binding) => drizzle(binding) as unknown as Record<string, unknown>,
    );

    // Yielding a Config in the Worker's Init phase registers it as a
    // `secret_text` binding at deploy; values come from .env locally.
    const baseURL = yield* Config.string("BETTER_AUTH_URL");
    const clientId = yield* Config.string("GITHUB_CLIENT_ID");
    const clientSecret = yield* Config.redacted("GITHUB_CLIENT_SECRET");

    const auth = yield* BetterAuth({
      ...authOptions({
        baseURL,
        github: { clientId, clientSecret: Redacted.value(clientSecret) },
      }),
      // Drizzle owns the auth tables now: they live in `src/auth-schema.ts`
      // and ship in the same drizzle-kit migrations as everything else.
      migrate: false,
    }).pipe(Effect.provide(Drizzle(authDb, { provider: "sqlite", schema })));

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const url = new URL(request.url, "http://proxycroc");

        if (url.pathname.startsWith("/api/auth")) {
          return yield* auth.fetch;
        }

        if (url.pathname === "/api/github/installed") {
          return yield* installed(url, yield* auth.getSession());
        }

        if (url.pathname === "/api/github/installations") {
          const session = yield* auth.getSession();
          if (!session) return yield* HttpServerResponse.json([]);
          const db = yield* Effect.map(d1.raw, (binding) => drizzle(binding));
          const rows = yield* Effect.promise(() =>
            db
              .select()
              .from(schema.githubInstallation)
              .where(eq(schema.githubInstallation.userId, session.user.id)),
          );
          return yield* HttpServerResponse.json(rows);
        }

        // Everything else is the web app's job; this Worker is reached only
        // through the website's `AUTH` service binding.
        const session = yield* auth.getSession();
        return yield* HttpServerResponse.json({ user: session?.user ?? null });
      }).pipe(Effect.orDie),
    };

    /**
     * Where GitHub sends the user after they pick repositories. Records the
     * installation against the signed-in user, then returns them to /console.
     *
     * `state` carries the user id we put on the install link, but it is
     * attacker-controllable, so the session is what actually decides ownership.
     */
    function installed(
      url: URL,
      session: { user: { id: string } } | null,
    ) {
      return Effect.gen(function* () {
        if (!session) return HttpServerResponse.redirect("/", { status: 302 });

        const installationId = Number(url.searchParams.get("installation_id"));
        if (!Number.isInteger(installationId) || installationId <= 0) {
          return HttpServerResponse.redirect("/console?install=failed", {
            status: 302,
          });
        }

        const db = yield* Effect.map(d1.raw, (binding) =>
          drizzle(binding),
        );

        yield* Effect.promise(() =>
          db
            .insert(schema.githubInstallation)
            .values({ id: installationId, userId: session.user.id })
            .onConflictDoUpdate({
              target: schema.githubInstallation.id,
              set: { userId: session.user.id },
            }),
        );

        return HttpServerResponse.redirect("/console?install=ok", {
          status: 302,
        });
      });
    }
  }).pipe(Effect.provide(Cloudflare.D1.QueryDatabaseBinding)),
);
