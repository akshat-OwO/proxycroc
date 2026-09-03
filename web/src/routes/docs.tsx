import { createFileRoute, Link } from "@tanstack/react-router";
import { Markdown } from "../components/Markdown";
import { DOCS } from "../../../src/docs";

export const Route = createFileRoute("/docs")({ component: Docs });

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
