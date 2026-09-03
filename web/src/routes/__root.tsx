import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "proxycroc" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // The SVG carries both crocs and switches on prefers-color-scheme
      // internally; `media` on a <link rel="icon"> is ignored by Chrome.
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/png", href: "/favicon-light.png" },
      { rel: "apple-touch-icon", href: "/logo-light.png" },
    ],
  }),
  notFoundComponent: () => (
    <main className="landing">
      <div>
        <img src="/logo-light.png" alt="" />
        <h1>Not found</h1>
        <p>That page does not exist.</p>
        <a className="button button--primary" href="/">
          Back home
        </a>
      </div>
    </main>
  ),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
