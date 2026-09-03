/// <reference types="@cloudflare/workers-types" />
import handler from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";
import type { WebsiteEnv } from "../alchemy.run";
import { DOCS } from "../src/docs";
import { robots, sitemap } from "../src/site";

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

    // Discovery, for anything arriving with only the domain. The manual as
    // plain text, plus the two files a crawler looks for by name.
    const text = (body: string, type = "text/plain") =>
      new Response(body, {
        headers: {
          "content-type": `${type}; charset=utf-8`,
          "cache-control": "public, max-age=300",
        },
      });

    if (url.pathname === "/llm.txt" || url.pathname === "/llms.txt") {
      return text(DOCS);
    }
    if (url.pathname === "/sitemap.xml") {
      return text(sitemap(url.origin), "application/xml");
    }
    if (url.pathname === "/robots.txt") {
      return text(robots(url.origin));
    }

    // Everything under /api belongs to the API worker; the web app owns no
    // routes there, so listing prefixes only invites forgetting one.
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return (env as unknown as WebsiteEnv).AUTH.fetch(request);
    }
    return handler.fetch(request);
  },
};
