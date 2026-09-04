/**
 * The proxycroc manual, and the single source of truth for it: `/llm.txt`
 * serves this verbatim for agents, and `/docs` renders it for people.
 */
export const DOCS = `# proxycroc

A proxy bot for agents. proxycroc gives an agent a way into your issues and
pull requests without giving it your GitHub credentials. You install the
GitHub App, create an API key, and hand that key to the agent. It reads
issues, comments, opens and closes them, and reviews pull requests.
Everything it writes appears as the bot, never as you.

The key carries its own limits. Scope it to one repository and it can reach
nothing else. Uncheck a capability and the API refuses that whole class of
call, so a key meant for triage cannot approve a merge.

## Finding your way

| Path | What it is |
| --- | --- |
| /llm.txt | This manual, as plain text. /llms.txt serves the same. |
| /docs | The same manual, rendered. |
| /console | Sign in, install the App, manage keys. |
| /sitemap.xml | Every page listed. |
| /robots.txt | Points here and at the sitemap. |

## Setup

1. Install the GitHub App from the console and choose its repositories.
2. Create an API key. Pick the repository and tick what it may do.
3. Copy the key when it appears. It is stored hashed, so that is the only
   time you can read it.

## Routes

Every route takes \`repository\` as "owner/name": in the query string for GET,
in the JSON body for POST. Authenticate with \`Authorization: Bearer <key>\`.

| Method | Path | What it does |
| --- | --- | --- |
| GET | /api/issues | Open issues in a repository. Add ?state=closed or all. |
| GET | /api/pulls | Pull requests, same state filter. |
| POST | /api/comment | Comment on an issue or a pull request. |
| POST | /api/issue | Open an issue, or edit one by sending its number. |
| POST | /api/review | Review a pull request, with line comments and a verdict. |
| POST | /api/check | Publish a check run on a commit, with annotations. |

## Reading

\`\`\`
curl "https://proxycroc.4kshat.dev/api/issues?repository=owner/name&state=open" \\
  -H "Authorization: Bearer $PROXYCROC_KEY"
\`\`\`

Each issue comes back with its number, title, state, body, author, labels,
and URL. Pull requests are filtered out of /api/issues, since GitHub returns
them there by default and an agent asking for issues rarely wants both.

## Commenting

\`\`\`
curl https://proxycroc.4kshat.dev/api/comment \\
  -H "Authorization: Bearer $PROXYCROC_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"repository": "owner/name", "number": 42, "body": "Looks good."}'
\`\`\`

\`number\` is the issue or PR number from the URL. The body is markdown,
rendered exactly as a typed comment.

## Issues

\`\`\`
curl https://proxycroc.4kshat.dev/api/issue \\
  -H "Authorization: Bearer $PROXYCROC_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "repository": "owner/name",
    "title": "Race condition in the token refresh",
    "body": "Two requests can refresh at once...",
    "labels": ["bug"]
  }'
\`\`\`

Send a number instead of a title to edit an existing issue. State accepts
open and closed.

\`\`\`
curl https://proxycroc.4kshat.dev/api/issue \\
  -H "Authorization: Bearer $PROXYCROC_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"repository": "owner/name", "number": 17, "state": "closed"}'
\`\`\`

## Reviews

A review is a summary, any number of line comments, and a verdict of COMMENT,
APPROVE, or REQUEST_CHANGES.

\`\`\`
curl https://proxycroc.4kshat.dev/api/review \\
  -H "Authorization: Bearer $PROXYCROC_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "repository": "owner/name",
    "pull_request": 42,
    "event": "REQUEST_CHANGES",
    "body": "Two things before this merges.",
    "comments": [
      {
        "path": "src/worker.ts",
        "line": 128,
        "body": "This parses the header twice.",
        "suggestion": "const key = header.slice(7).trim();"
      }
    ]
  }'
\`\`\`

A comment with a \`suggestion\` renders as a change the author can apply in one
click. Send the replacement text for the commented lines and proxycroc writes
the suggestion block. Add \`start_line\` to span a range.

Line numbers have to fall inside the diff. GitHub rejects the whole review
otherwise, and returns 502 carrying the line it refused. Requesting changes
blocks the merge until someone dismisses it, so an agent that fires it on a
false positive makes work for a person.

## Check runs

A check run is the pass/fail row GitHub shows on a commit and at the bottom of
a pull request. Use it when the agent is a gate rather than a reviewer: the
verdict is machine-readable, it can be marked required in branch protection,
and it does not add to the conversation.

\`\`\`
curl https://proxycroc.4kshat.dev/api/check \\
  -H "Authorization: Bearer $PROXYCROC_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "repository": "owner/name",
    "pull_request": 42,
    "name": "agent review",
    "status": "completed",
    "conclusion": "failure",
    "title": "1 blocking finding",
    "summary": "The token refresh can run twice.",
    "annotations": [
      {
        "path": "src/worker.ts",
        "line": 128,
        "level": "failure",
        "message": "This parses the header twice."
      }
    ]
  }'
\`\`\`

Name the commit with \`head_sha\` (full 40 characters), or send
\`pull_request\` and proxycroc resolves its head. \`status\` is queued,
in_progress, or completed; a completed run needs a \`conclusion\` of success,
failure, neutral, cancelled, timed_out, action_required, or skipped.

Posting the same \`name\` on the same commit updates the existing run instead
of stacking a second one, so an agent can report in_progress first and the
result after. \`id\` from a previous response targets that exact run.

Annotations attach a finding to lines in the diff and show up in the Files
tab. \`line\` covers one line; \`start_line\` and \`end_line\` span a range.
Unlike review comments they are not restricted to the diff, and more than 50
are sent in batches rather than dropped.

The GitHub App needs Checks at read and write. Without it GitHub returns 403
through as a 502.

## Capabilities

| Capability | Allows |
| --- | --- |
| read | GET /api/issues and /api/pulls |
| comment | POST /api/comment |
| issues | POST /api/issue, opening and editing |
| review | POST /api/review with COMMENT or REQUEST_CHANGES |
| approve | POST /api/review with APPROVE. Off by default. |
| checks | POST /api/check. Off by default. |

Approving and checks are the two that are off unless you tick them. A bot
approval counts toward required reviews under most branch protection rules,
and a passing check run satisfies a required check of that name, so either
key can move code into main if it leaks. Commenting keys are noise by
comparison.

## Errors

Failures return JSON with an \`error\` string.

| Status | Cause |
| --- | --- |
| 400 | A field is missing or malformed. The message names it. |
| 401 | No Authorization header, or the key is revoked or expired. |
| 403 | Wrong repository for this key, a capability it lacks, or no installation covers the repo. |
| 404 | No such route. |
| 405 | GET on a write route, or POST on a read route. |
| 502 | GitHub refused. Its own message comes through. |

## From an agent

None of this is proxycroc specific. Review the diff with whatever tool you
use, then send the text.

\`\`\`
REVIEW=$(git diff main...HEAD | your-agent-here)

curl https://proxycroc.4kshat.dev/api/review \\
  -H "Authorization: Bearer $PROXYCROC_KEY" \\
  -H "Content-Type: application/json" \\
  --data "$(jq -n --arg b "$REVIEW" \\
    '{repository: "owner/name", pull_request: 42, event: "COMMENT", body: $b}')"
\`\`\`
`;
