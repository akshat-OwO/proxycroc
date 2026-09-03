import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSession } from "../lib/auth";

export const Route = createFileRoute("/console")({
  beforeLoad: async () => {
    const user = await getSession();
    if (!user) throw redirect({ to: "/" });
    return { user };
  },
  loader: ({ context }) => context.user,
  component: Console,
});

function Console() {
  const user = Route.useLoaderData();

  return (
    <main>
      <h1>Console</h1>
      <p className="tagline">Signed in as {user.name || user.email}.</p>
    </main>
  );
}
