/// <reference types="@cloudflare/workers-types" />
import handler from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";
import type { WebsiteEnv } from "../alchemy.run";
import { DOCS } from "../src/docs";

/**
 * Deployed Worker entry (wired up via `Cloudflare.Website.Vite`'s `main`).
 *
 * Everything under `/api` is forwarded over the `AUTH` service binding to the
 * API Worker, which owns the session, the database, and the agent routes.
 * The browser only ever talks to one origin, so the session cookie stays
 * first-party. Everything else is TanStack Start's SSR handler.
 */
export default {
  fetch(request: Request): Response | Promise<Response> {
    const url = new URL(request.url);

    // The manual as plain text, for agents that fetch it directly.
    if (url.pathname === "/llm.txt" || url.pathname === "/llms.txt") {
      return new Response(DOCS, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=300",
        },
      });
    }

    // Everything under /api belongs to the API worker; the web app owns no
    // routes there, so listing prefixes only invites forgetting one.
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return (env as unknown as WebsiteEnv).AUTH.fetch(request);
    }
    return handler.fetch(request);
  },
};
