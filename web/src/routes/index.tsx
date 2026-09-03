import { createFileRoute, Link } from "@tanstack/react-router";
import { getSession } from "../lib/auth";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/")({
  loader: () => getSession(),
  component: Home,
});

function Home() {
  const user = Route.useLoaderData();

  return (
    <main className="landing">
      <div>
        <img src="/logo-light.png" alt="proxycroc" />
        <h1>proxycroc</h1>
        <p>
          A proxy bot for agents. Give one an API key and it can read your
          issues and pull requests, comment, and review, without ever holding
          your GitHub credentials.
        </p>

        {user ? (
          <Link to="/console" className="button button--primary">
            Go to console
          </Link>
        ) : (
          <button
            type="button"
            className="button button--primary"
            onClick={() =>
              authClient.signIn.social({
                provider: "github",
                callbackURL: "/console",
              })
            }
          >
            Sign in with GitHub
          </button>
        )}
      </div>
    </main>
  );
}
