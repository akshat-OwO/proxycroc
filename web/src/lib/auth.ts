import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import type { WebsiteEnv } from "../../../alchemy.run";

export interface SessionUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly image: string | null;
}

/** An API key as the list endpoint returns it — never the secret itself. */
export interface ApiKeySummary {
  readonly id: string;
  readonly name: string | null;
  readonly start: string | null;
  readonly prefix: string | null;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly lastRequest: string | null;
}

/**
 * Calls the auth Worker over the service binding, forwarding the browser's
 * cookies so the request carries the caller's session.
 *
 * The binding is read inside the handler, not at module scope: TanStack
 * Start's dev server evaluates route modules outside the Worker request
 * context, where a top-level binding read has nothing to resolve against.
 */
const callAuth = (path: string) =>
  (env as unknown as WebsiteEnv).AUTH.fetch(`http://auth/api/${path}`, {
    headers: getRequestHeaders() as unknown as HeadersInit,
  });

export const getSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser | null> => {
    const response = await callAuth("auth/get-session");
    if (!response.ok) return null;
    const session = (await response.json()) as { user?: SessionUser } | null;
    return session?.user ?? null;
  },
);

export interface Installation {
  readonly id: number;
  readonly accountLogin: string | null;
  readonly createdAt: number;
}

export const listInstallations = createServerFn({ method: "GET" }).handler(
  async (): Promise<Installation[]> => {
    const response = await callAuth("github/installations");
    if (!response.ok) return [];
    return (await response.json()) as Installation[];
  },
);

export const getInstallUrl = createServerFn({ method: "GET" }).handler(
  async (): Promise<string | null> => {
    const slug = (env as unknown as WebsiteEnv).GITHUB_APP_SLUG;
    return slug ? `https://github.com/apps/${slug}/installations/new` : null;
  },
);

export const listApiKeys = createServerFn({ method: "GET" }).handler(
  async (): Promise<ApiKeySummary[]> => {
    const response = await callAuth("auth/api-key/list");
    if (!response.ok) return [];
    // The endpoint answers with a paginated envelope, not a bare array.
    const body = (await response.json()) as { apiKeys?: ApiKeySummary[] };
    return body.apiKeys ?? [];
  },
);
