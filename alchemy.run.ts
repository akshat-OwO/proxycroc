import * as Alchemy from "alchemy";
import * as Drizzle from "alchemy/Drizzle";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Config from "effect/Config";
import { Database } from "./src/database";
import AuthWorker from "./src/worker";

/**
 * The web app: TanStack Start built by Vite, deployed as a Worker with static
 * assets. `web/worker.ts` is the entry — it forwards `/auth/*` over the `AUTH`
 * service binding and hands everything else to TanStack's SSR handler.
 */
export const Website = Cloudflare.Website.Vite("proxycroc-web", {
  rootDir: "web",
  main: "worker.ts",
  // Matches the production redirect URI registered on the GitHub OAuth app.
  // Requires the `4kshat.dev` zone to already exist in the Cloudflare account.
  domain: "proxycroc.4kshat.dev",
  env: {
    AUTH: AuthWorker,
    // Public: only the app slug, used to build the install link.
    GITHUB_APP_SLUG: Config.string("GITHUB_APP_SLUG"),
  },
});

export type WebsiteEnv = Cloudflare.InferEnv<typeof Website>;

export default Alchemy.Stack(
  "proxycroc",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Drizzle.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const db = yield* Database;
    const site = yield* Website;

    return { databaseName: db.databaseName, url: site.url };
  }),
);
