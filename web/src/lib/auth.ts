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
  /** `{ repository, capabilities }`; a null repository means every one. */
  readonly metadata: {
    repository?: string | null;
    capabilities?: string[];
  } | null;
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

async function readSession(): Promise<SessionUser | null> {
  const response = await callAuth("auth/get-session");
  if (!response.ok) return null;
  const session = (await response.json()) as { user?: SessionUser } | null;
  return session?.user ?? null;
}

export const getSession = createServerFn({ method: "GET" }).handler(readSession);

export interface Repository {
  readonly id: number;
  readonly fullName: string;
  readonly private: boolean;
}

/** Repositories reachable through the user's installations. */
export const listRepositories = createServerFn({ method: "GET" }).handler(
  async (): Promise<Repository[]> => {
    const response = await callAuth("github/repositories");
    if (!response.ok) return [];
    return (await response.json()) as Repository[];
  },
);

export interface Installation {
  readonly id: number;
  readonly accountLogin: string | null;
  readonly createdAt: number;
}

async function readInstallations(): Promise<Installation[]> {
  const response = await callAuth("github/installations");
  if (!response.ok) return [];
  return (await response.json()) as Installation[];
}

async function readApiKeys(): Promise<ApiKeySummary[]> {
  const response = await callAuth("auth/api-key/list");
  if (!response.ok) return [];
  // The endpoint answers with a paginated envelope, not a bare array.
  const body = (await response.json()) as { apiKeys?: ApiKeySummary[] };
  return body.apiKeys ?? [];
}

function installUrl(): string | null {
  const slug = (env as unknown as WebsiteEnv).GITHUB_APP_SLUG;
  return slug ? `https://github.com/apps/${slug}/installations/new` : null;
}

export interface ConsoleData {
  readonly user: SessionUser;
  readonly keys: ApiKeySummary[];
  readonly installations: Installation[];
  readonly installUrl: string | null;
}

/**
 * Everything the console needs to paint, in one round trip. The three auth
 * calls run side by side; without a session the other two answer empty, so
 * nothing waits on the session check. Repositories are left out on purpose:
 * listing them goes through GitHub and is only needed once a key is created.
 */
export const getConsole = createServerFn({ method: "GET" }).handler(
  async (): Promise<ConsoleData | null> => {
    const [user, keys, installations] = await Promise.all([
      readSession(),
      readApiKeys(),
      readInstallations(),
    ]);
    if (!user) return null;
    return { user, keys, installations, installUrl: installUrl() };
  },
);
