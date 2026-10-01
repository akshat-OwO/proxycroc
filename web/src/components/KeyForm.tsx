import { useRouter } from "@tanstack/react-router";
import { Suspense, use, useEffect, useRef, useState } from "react";
import {
  CAPABILITIES,
  DEFAULT_CAPABILITIES,
  LABELS,
  type Capability,
} from "../../../src/capabilities";
import type { Repository } from "../lib/auth";
import { authClient } from "../lib/auth-client";
import { snippet } from "../lib/format";
import { RepositoryPicker } from "./RepositoryPicker";

/** State for creating one key. */
export function useKeyForm() {
  const router = useRouter();
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

  function reset() {
    setName("");
    setRepository("");
    setCapabilities(DEFAULT_CAPABILITIES);
    setError(null);
    setCreated(null);
    setCopied(false);
  }

  function toggle(capability: Capability, on: boolean) {
    setCapabilities((current) =>
      on ? [...current, capability] : current.filter((c) => c !== capability),
    );
  }

  async function submit(event: React.FormEvent) {
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

  return {
    name,
    setName,
    repository,
    setRepository,
    capabilities,
    toggle,
    busy,
    error,
    created,
    copied,
    reset,
    submit,
    copy,
  };
}

export type KeyForm = ReturnType<typeof useKeyForm>;

/** The inputs for a new key. */
export function KeyFields({
  form,
  repositories,
}: {
  form: KeyForm;
  repositories: Promise<Repository[]>;
}) {
  return (
    <>
      <label className="keyform__field">
        <span className="keyform__label">Name</span>
        <input
          className="field"
          value={form.name}
          onChange={(e) => form.setName(e.target.value)}
          placeholder="What is this key for?"
          autoFocus
        />
      </label>
      <div className="keyform__field">
        <span className="keyform__label">Repository</span>
        <Suspense
          fallback={
            <input className="field" disabled placeholder="Loading repositories…" />
          }
        >
          <Picker form={form} repositories={repositories} />
        </Suspense>
      </div>
      <fieldset className="keyform__caps">
        <legend className="keyform__label">This key may</legend>
        {CAPABILITIES.map((capability) => (
          <label key={capability} className="keyform__cap">
            <input
              type="checkbox"
              checked={form.capabilities.includes(capability)}
              onChange={(e) => form.toggle(capability, e.target.checked)}
            />
            <span>{LABELS[capability]}</span>
          </label>
        ))}
      </fieldset>
      {form.error && <p className="keyform__error">{form.error}</p>}
    </>
  );
}

/** Suspends on the streamed repository list; nothing else on the page does. */
function Picker({
  form,
  repositories,
}: {
  form: KeyForm;
  repositories: Promise<Repository[]>;
}) {
  return (
    <RepositoryPicker
      value={form.repository}
      onChange={form.setRepository}
      repositories={use(repositories)}
    />
  );
}

/** The one-time view of a freshly created key. */
export function KeyReveal({ form }: { form: KeyForm }) {
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (form.created) field.current?.select();
  }, [form.created]);
  if (!form.created) return null;

  return (
    <div className="keyform__reveal">
      <div className="keyform__copy">
        <input ref={field} className="field" readOnly value={form.created} />
        <button type="button" onClick={form.copy}>
          {form.copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="keyform__hint">
        This is the only time it is shown. proxycroc stores it hashed.
      </p>
      <pre className="keyform__snippet">
        {snippet(form.created, form.repository || null)}
      </pre>
    </div>
  );
}
