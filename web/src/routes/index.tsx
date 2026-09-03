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
    <main>
      <h1>proxycroc</h1>
      <p className="tagline">
        Let an agent review a branch locally and comment the diff on the PR.
      </p>

      {user ? (
        <Link to="/console" className="button">
          Go to /console
        </Link>
      ) : (
        <button
          type="button"
          className="button"
          onClick={() =>
            authClient.signIn.social({ provider: "github", callbackURL: "/console" })
          }
        >
          Sign in with GitHub
        </button>
      )}
    </main>
  );
}
