import * as Effect from "effect/Effect";
import * as Drizzle from "alchemy/Drizzle";
import * as Cloudflare from "alchemy/Cloudflare";

export const Database = Effect.gen(function* () {
  const schema = yield* Drizzle.Schema("app-schema", {
    schema: "./src/schema.ts",
    out: "./migrations",
    dialect: "sqlite",
  });

  return yield* Cloudflare.D1.Database("proxycroc-database", {
    migrations: schema,
  });
});
