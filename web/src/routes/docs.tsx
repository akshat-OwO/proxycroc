import { createFileRoute, Link } from "@tanstack/react-router";
import { Markdown } from "../components/Markdown";
import { DOCS } from "../../../src/docs";
import { meta } from "../../../src/seo";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: meta({
      title: "Docs",
      description:
        "Every proxycroc route: read issues and pull requests, comment, open and close issues, and review code with line comments and suggestions.",
      path: "/docs",
    }),
  }),
  component: Docs,
});

function Docs() {
  return (
    <div className="page docs">
      <header className="card__bar docs__bar">
        <Link to="/" className="brand">
          <img src="/logo-light.png" alt="" />
          <span>proxycroc</span>
        </Link>
        <a href="/llm.txt">llm.txt</a>
      </header>

      <Markdown source={DOCS} />
    </div>
  );
}
