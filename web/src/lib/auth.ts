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

/**
 * Reads the session on the server by calling the auth Worker over the service
 * binding, forwarding the browser's cookies.
 *
 * The binding is read inside the handler, not at module scope: TanStack
 * Start's dev server evaluates route modules outside the Worker request
 * context, where a top-level binding read has nothing to resolve against.
 */
export const getSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser | null> => {
    const auth = (env as unknown as WebsiteEnv).AUTH;
    const response = await auth.fetch("http://auth/api/auth/get-session", {
      headers: getRequestHeaders() as unknown as HeadersInit,
    });
    if (!response.ok) return null;
    const session = (await response.json()) as { user?: SessionUser } | null;
    return session?.user ?? null;
  },
);
