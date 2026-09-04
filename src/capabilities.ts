/**
 * What a key is allowed to do, stored alongside its repository scope in the
 * key's metadata: `{ repository, capabilities }`.
 *
 * Reading is harmless, commenting is advisory, and approving moves code
 * toward merge (a bot approval counts toward required reviews in most branch
 * protection setups), so `approve` is opt-in rather than granted by default.
 *
 * `checks` is opt-in for the same reason: a passing check run satisfies a
 * required status check of that name, so a key that can publish checks can
 * clear a merge gate as well as raise one.
 */
export const CAPABILITIES = [
  "read",
  "comment",
  "issues",
  "review",
  "approve",
  "checks",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const DEFAULT_CAPABILITIES: Capability[] = [
  "read",
  "comment",
  "issues",
  "review",
];

export const LABELS: Record<Capability, string> = {
  read: "Read issues and pull requests",
  comment: "Comment on issues and pull requests",
  issues: "Open, edit, and close issues",
  review: "Review pull requests and request changes",
  approve: "Approve pull requests",
  checks: "Publish check runs on commits",
};

export interface KeyScope {
  /** null means every repository the installation can see. */
  readonly repository: string | null;
  readonly capabilities: Capability[];
}

/** Keys created before capabilities existed fall back to the defaults. */
export function readScope(metadata: unknown): KeyScope {
  const value = (metadata ?? {}) as {
    repository?: string | null;
    capabilities?: unknown;
  };
  const listed = Array.isArray(value.capabilities)
    ? value.capabilities.filter((c): c is Capability =>
        (CAPABILITIES as readonly string[]).includes(c as string),
      )
    : null;
  return {
    repository: value.repository ?? null,
    capabilities: listed ?? DEFAULT_CAPABILITIES,
  };
}
