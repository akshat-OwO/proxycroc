/// <reference types="@cloudflare/workers-types" />
import handler from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";
import type { WebsiteEnv } from "../alchemy.run";

/**
 * Deployed Worker entry (wired up via `Cloudflare.Website.Vite`'s `main`).
 *
 * Everything under `/api/auth` and `/api/github` is forwarded over the `AUTH`
 * service binding to the API Worker, which owns the session and the database.
 * The browser only ever talks to one origin, so the session cookie stays
 * first-party. Everything else is TanStack Start's SSR handler.
 */
export default {
  fetch(request: Request): Response | Promise<Response> {
    const url = new URL(request.url);
    if (
      url.pathname === "/api/auth" ||
      url.pathname.startsWith("/api/auth/") ||
      url.pathname.startsWith("/api/github/")
    ) {
      return (env as unknown as WebsiteEnv).AUTH.fetch(request);
    }
    return handler.fetch(request);
  },
};
