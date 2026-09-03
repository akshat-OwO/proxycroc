import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

/**
 * A GitHub App installation, created when a user completes the install flow
 * and GitHub redirects back to `/api/github/installed`.
 *
 * `installationId` is what the token exchange needs: sign a JWT with the app's
 * private key, trade it at `/app/installations/{id}/access_tokens`, then
 * comment with the resulting hour-long token.
 */
export const githubInstallation = sqliteTable(
  "github_installation",
  {
    // GitHub's own installation id, so re-installing updates in place.
    id: integer("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Login of the account the app is installed on (user or org). */
    accountLogin: text("account_login"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("github_installation_user_id_idx").on(t.userId)],
);
