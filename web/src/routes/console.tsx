import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  getInstallUrl,
  getSession,
  listApiKeys,
  listInstallations,
  listRepositories,
} from "../lib/auth";
import { authClient } from "../lib/auth-client";
import { RepositoryPicker } from "../components/RepositoryPicker";
import {
  CAPABILITIES,
  DEFAULT_CAPABILITIES,
  LABELS,
  type Capability,
} from "../../../src/capabilities";

export const Route = createFileRoute("/console")({
  beforeLoad: async () => {
    const user = await getSession();
    if (!user) throw redirect({ to: "/" });
    return { user };
  },
  loader: async ({ context }) => ({
    user: context.user,
    keys: await listApiKeys(),
    installUrl: await getInstallUrl(),
    installations: await listInstallations(),
    repositories: await listRepositories(),
  }),
  component: Console,
});

function Console() {
  const { user, keys, installUrl, installations, repositories } =
    Route.useLoaderData();
  const connected = installations.length > 0;
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);

  const [name, setName] = useState("");
  // "" means every repository the installation can see.
  const [repository, setRepository] = useState("");
  const [capabilities, setCapabilities] =
    useState<Capability[]>(DEFAULT_CAPABILITIES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The plaintext key exists only in the create response; it is stored hashed.
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function open() {
    setName("");
    setRepository("");
    setCapabilities(DEFAULT_CAPABILITIES);
    setError(null);
    setCreated(null);
    setCopied(false);
    dialog.current?.showModal();
  }

  function close() {
    dialog.current?.close();
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result = await authClient.apiKey.create({
      name: name.trim() || "agent",
      prefix: "pxc_",
      metadata: { repository: repository || null, capabilities },
    });
    setBusy(false);

    if (result.error) {
      setError(result.error.message ?? "Could not create the key.");
      return;
    }
    setCreated(result.data.key);
    await router.invalidate();
  }

  async function copy() {
    if (!created) return;
    await navigator.clipboard.writeText(created);
    setCopied(true);
  }

  async function revoke(keyId: string) {
    await authClient.apiKey.delete({ keyId });
    await router.invalidate();
  }

  return (
    <div className="page">
      <section className="card">
        <div className="card__bar">
          <div className="brand">
            <img src="/logo-light.png" alt="" />
            <span>proxycroc</span>
          </div>
          <div className="card__actions">
            <Link to="/docs" className="button--ghost button">
              Docs
            </Link>
            <button type="button" onClick={open} disabled={!connected}>
              New key
            </button>
          </div>
        </div>

        <div className="card__body">
          <p className="card__label">Your API keys</p>

          {keys.length === 0 ? (
            <p className="empty">
              {connected
                ? "No keys yet. Create one to let an agent authenticate."
                : "Connect your repositories below, then create a key."}
            </p>
          ) : (
            <ul className="keys">
              {keys.map((key) => (
                <li key={key.id}>
                  <div className="keys__meta">
                    <span className="keys__name">{key.name ?? "Untitled"}</span>
                    <span className="mono">
                      {key.prefix ?? ""}
                      {key.start ?? "•••"}…
                      {" · "}
                      {key.metadata?.repository ?? "all repositories"}
                      {" · "}
                      {(key.metadata?.capabilities ?? DEFAULT_CAPABILITIES).join(
                        ", ",
                      )}
                      {" · "}
                      {key.lastRequest
                        ? `last used ${new Date(key.lastRequest).toLocaleDateString()}`
                        : "never used"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="button--ghost"
                    onClick={() => revoke(key.id)}
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card cta">
        {installations.length > 0 ? (
          <>
            <h2>Repositories connected</h2>
            <p>
              proxycroc can comment on pull requests through{" "}
              {installations.length === 1
                ? "1 installation"
                : `${installations.length} installations`}
              .
            </p>
            {installUrl && (
              <a className="button button--ghost" href={installUrl}>
                Manage on GitHub
              </a>
            )}
          </>
        ) : (
          <>
            <h2>Connect your repositories</h2>
            <p>
              Install the GitHub App so proxycroc can post review comments on
              your pull requests.
            </p>
            {installUrl ? (
              <a
                className="button button--primary"
                href={`${installUrl}?state=${encodeURIComponent(user.id)}`}
              >
                Install GitHub App
              </a>
            ) : (
              <button type="button" className="button button--primary" disabled>
                Install GitHub App
              </button>
            )}
          </>
        )}
      </section>

      <KeyDialog
        ref={dialog}
        name={name}
        onName={setName}
        repository={repository}
        onRepository={setRepository}
        repositories={repositories}
        capabilities={capabilities}
        onCapabilities={setCapabilities}
        busy={busy}
        error={error}
        created={created}
        copied={copied}
        onCreate={create}
        onCopy={copy}
        onClose={close}
      />
    </div>
  );
}

function KeyDialog({
  ref,
  name,
  onName,
  repository,
  onRepository,
  repositories,
  capabilities,
  onCapabilities,
  busy,
  error,
  created,
  copied,
  onCreate,
  onCopy,
  onClose,
}: {
  ref: React.Ref<HTMLDialogElement>;
  name: string;
  onName: (value: string) => void;
  repository: string;
  onRepository: (value: string) => void;
  repositories: { id: number; fullName: string }[];
  capabilities: Capability[];
  onCapabilities: (value: Capability[]) => void;
  busy: boolean;
  error: string | null;
  created: string | null;
  copied: boolean;
  onCreate: (event: React.FormEvent) => void;
  onCopy: () => void;
  onClose: () => void;
}) {
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (created) field.current?.select();
  }, [created]);

  return (
    <dialog ref={ref}>
      <div className="dialog__body">
        {created ? (
          <>
            <h2>Copy your key</h2>
            <p>
              This is the only time it is shown — proxycroc stores it hashed.
            </p>
            <div className="copyfield">
              <input ref={field} className="field" readOnly value={created} />
              <button type="button" onClick={onCopy} aria-label="Copy key">
                {copied ? "✓" : "⧉"}
              </button>
            </div>
            <div className="dialog__actions">
              <button type="button" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={onCreate} className="dialog__body" style={{ padding: 0 }}>
            <h2>New API key</h2>
            <input
              className="field"
              value={name}
              onChange={(e) => onName(e.target.value)}
              placeholder="What is this key for?"
              aria-label="Key name"
              autoFocus
            />
            <RepositoryPicker
              value={repository}
              onChange={onRepository}
              repositories={repositories}
            />

            <fieldset className="caps">
              <legend>This key may</legend>
              {CAPABILITIES.map((capability) => (
                <label key={capability}>
                  <input
                    type="checkbox"
                    checked={capabilities.includes(capability)}
                    onChange={(e) =>
                      onCapabilities(
                        e.target.checked
                          ? [...capabilities, capability]
                          : capabilities.filter((c) => c !== capability),
                      )
                    }
                  />
                  {LABELS[capability]}
                </label>
              ))}
            </fieldset>
            {error && <p className="error">{error}</p>}
            <div className="dialog__actions">
              <button type="button" className="button--ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
