/**
 * Minimal GitHub App client: sign a JWT with the app's private key, trade it
 * for an installation access token, and use that to read the installation's
 * repositories.
 *
 * Tokens last an hour; nothing here caches them, since a Worker isolate is
 * not a safe place to keep one anyway.
 */

const API = "https://api.github.com";
const UA = "proxycroc";

// --- key handling ---------------------------------------------------------

const der = (tag: number, body: Uint8Array) => {
  const length =
    body.length < 0x80
      ? [body.length]
      : body.length < 0x100
        ? [0x81, body.length]
        : [0x82, body.length >> 8, body.length & 0xff];
  return Uint8Array.from([tag, ...length, ...body]);
};

/**
 * GitHub hands out PKCS#1 (`BEGIN RSA PRIVATE KEY`); WebCrypto only imports
 * PKCS#8, so wrap the key in the PKCS#8 envelope: version, the rsaEncryption
 * algorithm identifier, then the original key as an octet string.
 */
function toPkcs8(pkcs1: Uint8Array): Uint8Array {
  const version = der(0x02, Uint8Array.of(0x00));
  const algorithm = der(
    0x30,
    Uint8Array.of(0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00),
  );
  const key = der(0x04, pkcs1);
  return der(
    0x30,
    Uint8Array.from([...version, ...algorithm, ...key]),
  );
}

function pemBody(pem: string): Uint8Array {
  const base64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

const b64url = (bytes: Uint8Array | string) => {
  const base64 =
    typeof bytes === "string"
      ? btoa(bytes)
      : btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export interface AppCredentials {
  readonly appId: string;
  /** The `.pem`, either raw or base64-encoded (which is how it travels in env). */
  readonly privateKey: string;
}

/** A ten-minute app JWT — GitHub rejects anything longer. */
export async function appJwt({ appId, privateKey }: AppCredentials): Promise<string> {
  const pem = privateKey.includes("BEGIN")
    ? privateKey
    : new TextDecoder().decode(
        Uint8Array.from(atob(privateKey), (c) => c.charCodeAt(0)),
      );

  const pkcs1 = pemBody(pem);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    toPkcs8(pkcs1) as unknown as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  // Backdate `iat` to tolerate clock drift between us and GitHub.
  const payload = b64url(
    JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }),
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${payload}`) as unknown as ArrayBuffer,
  );

  return `${header}.${payload}.${b64url(new Uint8Array(signature))}`;
}

// --- API ------------------------------------------------------------------

export async function installationToken(
  credentials: AppCredentials,
  installationId: number,
): Promise<string> {
  const jwt = await appJwt(credentials);
  const response = await fetch(
    `${API}/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${jwt}`,
        accept: "application/vnd.github+json",
        "user-agent": UA,
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      `installation token failed: ${response.status} ${await response.text()}`,
    );
  }
  const body = (await response.json()) as { token: string };
  return body.token;
}

export interface Repository {
  readonly id: number;
  readonly fullName: string;
  readonly private: boolean;
}

/** Every repository the installation can see, following pagination. */
export async function listRepositories(
  credentials: AppCredentials,
  installationId: number,
): Promise<Repository[]> {
  const token = await installationToken(credentials, installationId);
  const repositories: Repository[] = [];

  for (let page = 1; page <= 10; page++) {
    const response = await fetch(
      `${API}/installation/repositories?per_page=100&page=${page}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "user-agent": UA,
        },
      },
    );
    if (!response.ok) break;

    const body = (await response.json()) as {
      repositories: { id: number; full_name: string; private: boolean }[];
    };
    repositories.push(
      ...body.repositories.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        private: r.private,
      })),
    );
    if (body.repositories.length < 100) break;
  }

  return repositories;
}

/** One authenticated call against the installation. */
async function call<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": UA,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    // Pass GitHub's own message through: an agent can act on "line 12 is not
    // part of the diff" and cannot act on "502".
    throw new Error(`${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

export interface Thread {
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly body: string | null;
  readonly author: string | null;
  readonly labels: string[];
  readonly url: string;
  readonly updatedAt: string;
}

interface RawThread {
  number: number;
  title: string;
  state: string;
  body: string | null;
  user: { login: string } | null;
  labels: ({ name: string } | string)[];
  html_url: string;
  updated_at: string;
  pull_request?: unknown;
}

const thread = (raw: RawThread): Thread => ({
  number: raw.number,
  title: raw.title,
  state: raw.state,
  body: raw.body,
  author: raw.user?.login ?? null,
  labels: raw.labels.map((l) => (typeof l === "string" ? l : l.name)),
  url: raw.html_url,
  updatedAt: raw.updated_at,
});

/**
 * Issues in a repository. GitHub's issues endpoint also returns pull
 * requests, so those are filtered out here; `listPullRequests` is the way to
 * ask for them.
 */
export async function listIssues(
  credentials: AppCredentials,
  installationId: number,
  repository: string,
  state: string,
): Promise<Thread[]> {
  const token = await installationToken(credentials, installationId);
  const raw = await call<RawThread[]>(
    token,
    "GET",
    `/repos/${repository}/issues?state=${state}&per_page=50`,
  );
  return raw.filter((r) => !r.pull_request).map(thread);
}

export async function listPullRequests(
  credentials: AppCredentials,
  installationId: number,
  repository: string,
  state: string,
): Promise<Thread[]> {
  const token = await installationToken(credentials, installationId);
  const raw = await call<RawThread[]>(
    token,
    "GET",
    `/repos/${repository}/pulls?state=${state}&per_page=50`,
  );
  return raw.map(thread);
}

export async function createIssue(
  credentials: AppCredentials,
  installationId: number,
  repository: string,
  fields: { title: string; body?: string; labels?: string[] },
): Promise<Thread> {
  const token = await installationToken(credentials, installationId);
  return thread(
    await call<RawThread>(token, "POST", `/repos/${repository}/issues`, fields),
  );
}

/** Edits an issue: title, body, labels, or `state` to close or reopen it. */
export async function updateIssue(
  credentials: AppCredentials,
  installationId: number,
  repository: string,
  number: number,
  fields: Record<string, unknown>,
): Promise<Thread> {
  const token = await installationToken(credentials, installationId);
  return thread(
    await call<RawThread>(
      token,
      "PATCH",
      `/repos/${repository}/issues/${number}`,
      fields,
    ),
  );
}

/** Comments on the conversation timeline of an issue or a pull request. */
export async function comment(
  credentials: AppCredentials,
  installationId: number,
  repository: string,
  number: number,
  body: string,
): Promise<string> {
  const token = await installationToken(credentials, installationId);
  const created = await call<{ html_url: string }>(
    token,
    "POST",
    `/repos/${repository}/issues/${number}/comments`,
    { body },
  );
  return created.html_url;
}

export interface ReviewComment {
  readonly path: string;
  readonly line: number;
  readonly startLine?: number;
  readonly body: string;
  /** Replacement text for the commented lines, rendered as a suggestion. */
  readonly suggestion?: string;
}

/**
 * Submits a pull request review: a summary, optional line comments, and a
 * verdict of COMMENT, APPROVE, or REQUEST_CHANGES.
 *
 * The head SHA is resolved here rather than left to GitHub's default, so a
 * push that lands mid-review fails loudly instead of anchoring comments to
 * the wrong commit.
 */
export async function createReview(
  credentials: AppCredentials,
  installationId: number,
  repository: string,
  pullRequest: number,
  review: {
    event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES";
    body?: string;
    comments?: ReviewComment[];
  },
): Promise<string> {
  const token = await installationToken(credentials, installationId);
  const pull = await call<{ head: { sha: string } }>(
    token,
    "GET",
    `/repos/${repository}/pulls/${pullRequest}`,
  );

  const comments = (review.comments ?? []).map((c) => ({
    path: c.path,
    line: c.line,
    ...(c.startLine === undefined ? {} : { start_line: c.startLine }),
    // A suggestion is an ordinary comment carrying a fenced block whose
    // contents replace the commented lines. Agents send the replacement; the
    // fence is our job, because a malformed one renders as plain text and
    // nothing reports it.
    body:
      c.suggestion === undefined
        ? c.body
        : `${c.body}\n\n\`\`\`suggestion\n${c.suggestion}\n\`\`\``,
  }));

  const created = await call<{ html_url: string }>(
    token,
    "POST",
    `/repos/${repository}/pulls/${pullRequest}/reviews`,
    {
      commit_id: pull.head.sha,
      event: review.event,
      ...(review.body ? { body: review.body } : {}),
      ...(comments.length ? { comments } : {}),
    },
  );
  return created.html_url;
}

// --- check runs -----------------------------------------------------------

export const CHECK_STATUSES = ["queued", "in_progress", "completed"] as const;

export const CHECK_CONCLUSIONS = [
  "success",
  "failure",
  "neutral",
  "cancelled",
  "timed_out",
  "action_required",
  "skipped",
] as const;

export type CheckStatus = (typeof CHECK_STATUSES)[number];
export type CheckConclusion = (typeof CHECK_CONCLUSIONS)[number];

/** A file-and-line finding, shown inline on the pull request's Files tab. */
export interface CheckAnnotation {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly level: "notice" | "warning" | "failure";
  readonly message: string;
  readonly title?: string;
}

export interface CheckRun {
  readonly id: number;
  readonly name: string;
  readonly headSha: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly url: string;
}

export interface CheckRunFields {
  readonly name: string;
  readonly headSha: string;
  readonly status: CheckStatus;
  readonly conclusion?: CheckConclusion;
  readonly detailsUrl?: string;
  readonly title?: string;
  readonly summary?: string;
  readonly text?: string;
  readonly annotations?: CheckAnnotation[];
}

const checkRun = (raw: {
  id: number;
  name: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
  html_url: string | null;
}): CheckRun => ({
  id: raw.id,
  name: raw.name,
  headSha: raw.head_sha,
  status: raw.status,
  conclusion: raw.conclusion,
  url: raw.html_url ?? "",
});

/** The head SHA of a pull request, so callers can name a PR instead of a commit. */
export async function pullRequestHead(
  credentials: AppCredentials,
  installationId: number,
  repository: string,
  pullRequest: number,
): Promise<string> {
  const token = await installationToken(credentials, installationId);
  const pull = await call<{ head: { sha: string } }>(
    token,
    "GET",
    `/repos/${repository}/pulls/${pullRequest}`,
  );
  return pull.head.sha;
}

/**
 * Creates a check run, or updates the one this app already published under
 * the same name on the same commit.
 *
 * GitHub happily stacks duplicates: posting the same name twice leaves two
 * rows on the commit, one of them stale. An agent that reports progress then
 * a result is the normal case here, so the existing run is looked up first
 * and patched. Pass `id` to skip the lookup.
 *
 * GitHub caps annotations at 50 per request; more than that are sent in
 * follow-up updates rather than silently dropped.
 */
export async function publishCheckRun(
  credentials: AppCredentials,
  installationId: number,
  repository: string,
  fields: CheckRunFields & { id?: number },
): Promise<CheckRun> {
  const token = await installationToken(credentials, installationId);

  const annotations = (fields.annotations ?? []).map((a) => ({
    path: a.path,
    start_line: a.startLine,
    end_line: a.endLine,
    annotation_level: a.level,
    message: a.message,
    ...(a.title === undefined ? {} : { title: a.title }),
  }));

  const output = (batch: typeof annotations) =>
    fields.title || fields.summary || batch.length
      ? {
          output: {
            title: fields.title ?? fields.name,
            summary: fields.summary ?? "",
            ...(fields.text === undefined ? {} : { text: fields.text }),
            ...(batch.length ? { annotations: batch } : {}),
          },
        }
      : {};

  const payload = {
    status: fields.status,
    ...(fields.status === "completed"
      ? { conclusion: fields.conclusion ?? "neutral" }
      : {}),
    ...(fields.detailsUrl ? { details_url: fields.detailsUrl } : {}),
    ...output(annotations.slice(0, 50)),
  };

  const existing =
    fields.id ??
    (
      await call<{ check_runs: { id: number; app: { id: number } | null }[] }>(
        token,
        "GET",
        `/repos/${repository}/commits/${fields.headSha}/check-runs?check_name=${encodeURIComponent(fields.name)}&per_page=100`,
      )
    ).check_runs.find((r) => String(r.app?.id) === String(credentials.appId))?.id;

  let run = checkRun(
    existing
      ? await call(token, "PATCH", `/repos/${repository}/check-runs/${existing}`, {
          name: fields.name,
          head_sha: fields.headSha,
          ...payload,
        })
      : await call(token, "POST", `/repos/${repository}/check-runs`, {
          name: fields.name,
          head_sha: fields.headSha,
          ...payload,
        }),
  );

  for (let from = 50; from < annotations.length; from += 50) {
    run = checkRun(
      await call(token, "PATCH", `/repos/${repository}/check-runs/${run.id}`, {
        ...output(annotations.slice(from, from + 50)),
      }),
    );
  }

  return run;
}
