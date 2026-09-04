import * as Effect from "effect/Effect";
import type { RuntimeContext } from "alchemy";
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
import {
  comment,
  createIssue,
  createReview,
  listIssues,
  listPullRequests,
  listRepositories,
  updateIssue,
  type ReviewComment,
} from "./github";
import { readScope, type Capability } from "./capabilities";
import * as schema from "./schema";

/**
 * Turn a `verifyApiKey` rejection into a response an agent can act on.
 *
 * Every rejection used to come back as a flat 401 "Invalid or expired API
 * key", which sent agents off to mint a new key when the real answer was
 * "wait a few seconds" — a retryable condition dressed up as a fatal one.
 */
function describeKeyDenial(
  error: { code?: string | null; details?: unknown } | null | undefined,
): {
  status: number;
  error: string;
  headers?: Record<string, string>;
} {
  const tryAgainIn = (details: unknown): number | null => {
    const value =
      details && typeof details === "object"
        ? (details as { tryAgainIn?: unknown }).tryAgainIn
        : undefined;
    return typeof value === "number" && value > 0 ? Math.ceil(value / 1000) : null;
  };

  switch (error?.code) {
    case "RATE_LIMITED": {
      const seconds = tryAgainIn(error.details);
      return {
        status: 429,
        error: seconds
          ? `Rate limit exceeded for this API key. Try again in ${seconds}s.`
          : "Rate limit exceeded for this API key.",
        headers: seconds ? { "retry-after": String(seconds) } : undefined,
      };
    }
    case "USAGE_EXCEEDED":
      return {
        status: 429,
        error: "This API key has reached its usage limit.",
      };
    case "KEY_EXPIRED":
      return { status: 401, error: "This API key has expired. Create a new one." };
    case "KEY_DISABLED":
      return { status: 401, error: "This API key is disabled." };
    default:
      return { status: 401, error: "Invalid API key." };
  }
}

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
    const appId = yield* Config.string("GITHUB_APP_ID");
    const appPrivateKey = yield* Config.redacted("GITHUB_APP_PRIVATE_KEY");

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

        const agentRoute = url.pathname.match(
          /^\/api\/(issues|pulls|comment|issue|review)$/,
        );
        if (agentRoute) {
          return yield* agentApi(request, agentRoute[1]!);
        }

        if (url.pathname === "/api/github/repositories") {
          const session = yield* auth.getSession();
          if (!session) return yield* HttpServerResponse.json([]);

          const db = yield* Effect.map(d1.raw, (binding) => drizzle(binding));
          const installations = yield* Effect.promise(() =>
            db
              .select()
              .from(schema.githubInstallation)
              .where(eq(schema.githubInstallation.userId, session.user.id)),
          );

          const credentials = {
            appId,
            privateKey: Redacted.value(appPrivateKey),
          };
          const repositories = yield* Effect.promise(async () => {
            const lists = await Promise.all(
              installations.map((i) =>
                listRepositories(credentials, i.id).catch(() => []),
              ),
            );
            return lists.flat().sort((a, b) => a.fullName.localeCompare(b.fullName));
          });

          return yield* HttpServerResponse.json(repositories);
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
     * The agent-facing API. Every route authenticates with an API key, checks
     * the key's repository scope and capabilities, then acts through the
     * GitHub App installation that can reach the repository.
     *
     * Errors are specific on purpose: the caller is an agent, and "line 12 is
     * not part of the diff" is the difference between a retry and a dead end.
     */
    function agentApi(
      request: HttpServerRequest.HttpServerRequest,
      route: string,
    ): Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      never,
      RuntimeContext
    > {
      return Effect.gen(function* () {
        const url = new URL(request.url, "http://proxycroc");
        const fail = (status: number, error: string) =>
          HttpServerResponse.json({ error }, { status }).pipe(Effect.orDie);
        const ok = (data: unknown, status = 200) =>
          HttpServerResponse.json(data, { status }).pipe(Effect.orDie);

        const reading = request.method === "GET";
        if (!reading && request.method !== "POST") {
          return yield* fail(405, "Use GET to read and POST to write.");
        }

        const key = (request.headers.authorization ?? "")
          .replace(/^Bearer /i, "")
          .trim();
        if (!key) {
          return yield* fail(401, "Missing Authorization: Bearer <api key>.");
        }

        const body = reading
          ? {}
          : yield* request.json.pipe(
              Effect.map((value) => (value ?? {}) as Record<string, unknown>),
              Effect.catch(() => Effect.succeed({})),
            );

        const repository = String(
          (reading ? url.searchParams.get("repository") : body.repository) ?? "",
        );
        if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
          return yield* fail(400, '`repository` must be "owner/name".');
        }

        const verified = yield* auth.api
          .verifyApiKey({ body: { key } })
          .pipe(Effect.catch(() => Effect.succeed(null)));
        if (!verified?.valid || !verified.key) {
          const denial = describeKeyDenial(verified?.error);
          return yield* HttpServerResponse.json(
            { error: denial.error },
            { status: denial.status, headers: denial.headers },
          ).pipe(Effect.orDie);
        }

        const scope = readScope(verified.key.metadata);
        if (scope.repository && scope.repository !== repository) {
          return yield* fail(
            403,
            `This key is scoped to ${scope.repository}, not ${repository}.`,
          );
        }

        const needs = (capability: Capability) =>
          scope.capabilities.includes(capability);

        const db = yield* Effect.map(d1.raw, (binding) => drizzle(binding));
        const installations = yield* Effect.promise(() =>
          db
            .select()
            .from(schema.githubInstallation)
            .where(
              eq(schema.githubInstallation.userId, verified.key!.referenceId),
            ),
        );

        if (installations.length === 0) {
          return yield* fail(403, "No GitHub App installation for this key.");
        }

        const credentials = {
          appId,
          privateKey: Redacted.value(appPrivateKey),
        };

        /**
         * Runs the action against whichever installation can see the
         * repository. A user may have several and only one will match, so a
         * failure is only reported once every installation has been tried.
         */
        const attempt = <T>(action: (installationId: number) => Promise<T>) =>
          Effect.promise(async () => {
            let last = `No installation can reach ${repository}.`;
            for (const installation of installations) {
              try {
                return { data: await action(installation.id) };
              } catch (cause) {
                last = (cause as Error).message;
              }
            }
            return { error: last };
          });

        const respond = <T>(result: { data?: T; error?: string }, status = 200) =>
          result.error === undefined
            ? ok(result.data, status)
            : fail(502, result.error);

        // --- read ---------------------------------------------------------

        if (route === "issues" && reading) {
          if (!needs("read")) return yield* fail(403, "This key cannot read.");
          const state = url.searchParams.get("state") ?? "open";
          return yield* respond(
            yield* attempt((id) =>
              listIssues(credentials, id, repository, state),
            ),
          );
        }

        if (route === "pulls" && reading) {
          if (!needs("read")) return yield* fail(403, "This key cannot read.");
          const state = url.searchParams.get("state") ?? "open";
          return yield* respond(
            yield* attempt((id) =>
              listPullRequests(credentials, id, repository, state),
            ),
          );
        }

        // --- write --------------------------------------------------------

        if (route === "comment") {
          if (!needs("comment")) {
            return yield* fail(403, "This key cannot comment.");
          }
          const number = Number(body.number ?? body.pull_request);
          const text = String(body.body ?? "");
          if (!Number.isInteger(number) || number <= 0) {
            return yield* fail(400, "`number` must be a positive integer.");
          }
          if (!text.trim()) return yield* fail(400, "`body` must not be empty.");

          return yield* respond(
            yield* attempt(async (id) => ({
              url: await comment(credentials, id, repository, number, text),
            })),
            201,
          );
        }

        if (route === "issue") {
          if (!needs("issues")) {
            return yield* fail(403, "This key cannot write issues.");
          }
          const number = Number(body.number ?? 0);

          if (number > 0) {
            const fields: Record<string, unknown> = {};
            for (const field of ["title", "body", "state", "labels"]) {
              if (body[field] !== undefined) fields[field] = body[field];
            }
            if (Object.keys(fields).length === 0) {
              return yield* fail(
                400,
                "Send at least one of `title`, `body`, `state`, `labels`.",
              );
            }
            return yield* respond(
              yield* attempt((id) =>
                updateIssue(credentials, id, repository, number, fields),
              ),
            );
          }

          const title = String(body.title ?? "");
          if (!title.trim()) {
            return yield* fail(400, "`title` is required to open an issue.");
          }
          return yield* respond(
            yield* attempt((id) =>
              createIssue(credentials, id, repository, {
                title,
                body: body.body === undefined ? undefined : String(body.body),
                labels: Array.isArray(body.labels)
                  ? (body.labels as string[])
                  : undefined,
              }),
            ),
            201,
          );
        }

        if (route === "review") {
          const event = String(body.event ?? "COMMENT").toUpperCase();
          if (!["COMMENT", "APPROVE", "REQUEST_CHANGES"].includes(event)) {
            return yield* fail(
              400,
              "`event` must be COMMENT, APPROVE, or REQUEST_CHANGES.",
            );
          }
          if (!needs("review")) {
            return yield* fail(403, "This key cannot review.");
          }
          if (event === "APPROVE" && !needs("approve")) {
            return yield* fail(403, "This key cannot approve pull requests.");
          }

          const number = Number(body.pull_request ?? body.number);
          if (!Number.isInteger(number) || number <= 0) {
            return yield* fail(400, "`pull_request` must be a positive integer.");
          }

          const comments = Array.isArray(body.comments)
            ? (body.comments as Record<string, unknown>[]).map((c) => ({
                path: String(c.path ?? ""),
                line: Number(c.line),
                startLine:
                  c.start_line === undefined ? undefined : Number(c.start_line),
                body: String(c.body ?? ""),
                suggestion:
                  c.suggestion === undefined ? undefined : String(c.suggestion),
              }))
            : [];

          const bad = comments.find(
            (c) => !c.path || !Number.isInteger(c.line) || c.line <= 0,
          );
          if (bad) {
            return yield* fail(
              400,
              "Every comment needs a `path` and a positive `line`.",
            );
          }
          if (!comments.length && !String(body.body ?? "").trim()) {
            return yield* fail(400, "Send a `body`, `comments`, or both.");
          }

          return yield* respond(
            yield* attempt(async (id) => ({
              url: await createReview(credentials, id, repository, number, {
                event: event as "COMMENT" | "APPROVE" | "REQUEST_CHANGES",
                body: body.body === undefined ? undefined : String(body.body),
                comments: comments as ReviewComment[],
              }),
            })),
            201,
          );
        }

        return yield* fail(404, `Unknown route /api/${route}.`);
      });
    }

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
