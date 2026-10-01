import {
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { useRef, useState } from "react";
import { getConsole, listRepositories } from "../lib/auth";
import { authClient } from "../lib/auth-client";
import { ago, capabilitiesOf, masked, scopeOf } from "../lib/format";
import { KeyFields, KeyReveal, useKeyForm } from "../components/KeyForm";
import { LABELS } from "../../../src/capabilities";

export const Route = createFileRoute("/console")({
  loader: async () => {
    const data = await getConsole();
    if (!data) throw redirect({ to: "/" });
    // Not awaited: the page streams without it and only the key form
    // suspends, since listing goes through GitHub and is the slowest call.
    return { ...data, repositories: listRepositories() };
  },
  component: Console,
});

/** Elevated capabilities move code toward merge; they get a warning tint. */
const ELEVATED = new Set(["approve", "checks"]);

/** Revoking takes two clicks: the first arms the button, the second fires. */
function useConfirm(timeout = 3000) {
  const [armed, setArmed] = useState<string | null>(null);
  return {
    armed,
    request(id: string, fire: () => void) {
      if (armed === id) {
        setArmed(null);
        fire();
        return;
      }
      setArmed(id);
      setTimeout(() => setArmed((a) => (a === id ? null : a)), timeout);
    },
  };
}

function Console() {
  const { user, keys, installations, installUrl, repositories } =
    Route.useLoaderData();
  const connected = installations.length > 0;
  const router = useRouter();
  const form = useKeyForm();
  const confirm = useConfirm();
  const drawer = useRef<HTMLDialogElement>(null);

  const open = () => {
    form.reset();
    drawer.current?.showModal();
  };

  async function revoke(keyId: string) {
    await authClient.apiKey.delete({ keyId });
    await router.invalidate();
  }

  return (
    <div className="console">
      <header className="console__top">
        <a href="/" className="console__brand">
          <img src="/logo-light.png" alt="" />
          proxycroc
        </a>
        <span className="console__crumb">/</span>
        <span className="console__crumb console__crumb--here">Console</span>
        <nav className="console__nav">
          <a href="/docs">Docs</a>
          {user.image ? (
            <img className="console__avatar" src={user.image} alt={user.name} />
          ) : (
            <span className="console__avatar">{user.name[0]}</span>
          )}
        </nav>
      </header>

      <main className="console__main">
        <div className="console__head">
          <div>
            <h1>API keys</h1>
            <p>Keys let an agent act on your repositories as the bot.</p>
          </div>
          <button
            type="button"
            className="console__primary"
            onClick={open}
            disabled={!connected}
          >
            New key
          </button>
        </div>

        {connected ? (
          <div className="console__status">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span>
              {installations
                .map((i) => i.accountLogin ?? `#${i.id}`)
                .join(", ")}
            </span>
            {installUrl && <a href={installUrl}>Manage</a>}
          </div>
        ) : (
          <div className="console__banner">
            <div>
              <strong>Install the GitHub App first</strong>
              <p>proxycroc needs it to read and comment on your repositories.</p>
            </div>
            {installUrl && (
              <a
                className="console__primary"
                href={`${installUrl}?state=${encodeURIComponent(user.id)}`}
              >
                Install
              </a>
            )}
          </div>
        )}

        <div className="console__table">
          <div className="console__row console__row--head">
            <span>Name</span>
            <span>Repository</span>
            <span>Permissions</span>
            <span>Last used</span>
            <span />
          </div>
          {keys.length === 0 && (
            <div className="console__empty">
              {connected
                ? "No keys yet. Create one to let an agent authenticate."
                : "Keys appear here once the App is installed."}
            </div>
          )}
          {keys.map((key) => (
            <div className="console__row" key={key.id}>
              <span className="console__name">
                <strong>{key.name ?? "Untitled"}</strong>
                <code>{masked(key)}</code>
              </span>
              <span className="console__repo">
                {scopeOf(key) ?? <em>All repositories</em>}
              </span>
              <span className="console__chips">
                {capabilitiesOf(key).map((c) => (
                  <span
                    key={c}
                    title={LABELS[c]}
                    className={ELEVATED.has(c) ? "is-elevated" : undefined}
                  >
                    {c}
                  </span>
                ))}
              </span>
              <span className="console__muted">{ago(key.lastRequest) ?? "Never"}</span>
              <button
                type="button"
                className={
                  confirm.armed === key.id ? "console__revoke is-armed" : "console__revoke"
                }
                onClick={() =>
                  confirm.request(key.id, () => revoke(key.id))
                }
              >
                {confirm.armed === key.id ? "Confirm" : "Revoke"}
              </button>
            </div>
          ))}
        </div>
      </main>

      <dialog ref={drawer} className="console__drawer">
        <div className="console__drawerhead">
          <h2>{form.created ? "Key created" : "New API key"}</h2>
          <button
            type="button"
            className="console__x"
            aria-label="Close"
            onClick={() => drawer.current?.close()}
          >
            ×
          </button>
        </div>
        {form.created ? (
          <div className="console__drawerbody">
            <KeyReveal form={form} />
            <div className="console__drawerfoot">
              <button
                type="button"
                className="console__primary"
                onClick={() => drawer.current?.close()}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form className="console__drawerbody" onSubmit={form.submit}>
            <KeyFields form={form} repositories={repositories} />
            <div className="console__drawerfoot">
              <button
                type="button"
                className="console__ghost"
                onClick={() => drawer.current?.close()}
              >
                Cancel
              </button>
              <button type="submit" className="console__primary" disabled={form.busy}>
                {form.busy ? "Creating…" : "Create key"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
