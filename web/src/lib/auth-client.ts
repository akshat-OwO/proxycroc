import { createAuthClient } from "better-auth/react";

/** Same-origin: `/api/auth/*` is proxied to the auth Worker by `web/worker.ts`. */
export const authClient = createAuthClient({ basePath: "/api/auth" });
