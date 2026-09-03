import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

/** Relational-query graph over the auth tables (drizzle rc5 style). */
export const relations = defineRelations(schema, (r) => ({
  user: {
    sessions: r.many.session(),
    accounts: r.many.account(),
    apiKeys: r.many.apikey(),
  },
  session: {
    user: r.one.user({ from: r.session.userId, to: r.user.id }),
  },
  account: {
    user: r.one.user({ from: r.account.userId, to: r.user.id }),
  },
  apikey: {
    user: r.one.user({ from: r.apikey.referenceId, to: r.user.id }),
  },
}));
