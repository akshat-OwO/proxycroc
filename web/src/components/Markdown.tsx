import type { ReactNode } from "react";

/**
 * Renders the subset of markdown `src/docs.ts` uses: headings, paragraphs,
 * fenced code, ordered lists, and pipe tables. A library would be a lot of
 * bytes for one page, and the input is ours.
 */
export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.split("\n");

  let i = 0;
  let key = 0;

  const inline = (text: string): ReactNode[] =>
    text.split(/(`[^`]+`)/).map((part, n) =>
      part.startsWith("`") && part.endsWith("`") ? (
        <code className="mono" key={n}>
          {part.slice(1, -1)}
        </code>
      ) : (
        part
      ),
    );

  while (i < lines.length) {
    const line = lines[i]!;

    if (!line.trim()) {
      i++;
    } else if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) {
        code.push(lines[i]!);
        i++;
      }
      i++;
      blocks.push(<pre key={key++}>{code.join("\n")}</pre>);
    } else if (line.startsWith("## ")) {
      blocks.push(<h2 key={key++}>{line.slice(3)}</h2>);
      i++;
    } else if (line.startsWith("# ")) {
      blocks.push(<h1 key={key++}>{line.slice(2)}</h1>);
      i++;
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.startsWith("|")) {
        const cells = lines[i]!
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());
        // The |---|---| separator carries no content.
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <table key={key++}>
          {head && (
            <thead>
              <tr>
                {head.map((cell, n) => (
                  <th key={n}>{cell}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {body.map((row, n) => (
              <tr key={n}>
                {row.map((cell, m) => (
                  <td key={m} className={m < 2 ? "mono" : undefined}>
                    {inline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
    } else if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^(\d+\.\s|\s+\S)/.test(lines[i] ?? "")) {
        if (/^\d+\.\s/.test(lines[i]!)) items.push(lines[i]!.replace(/^\d+\.\s/, ""));
        else items[items.length - 1] += ` ${lines[i]!.trim()}`;
        i++;
      }
      blocks.push(
        <ol key={key++}>
          {items.map((item, n) => (
            <li key={n}>{inline(item)}</li>
          ))}
        </ol>,
      );
    } else {
      const paragraph: string[] = [];
      while (
        i < lines.length &&
        lines[i]!.trim() &&
        !/^(#{1,2} |```|\||\d+\.\s)/.test(lines[i]!)
      ) {
        paragraph.push(lines[i]!.trim());
        i++;
      }
      blocks.push(<p key={key++}>{inline(paragraph.join(" "))}</p>);
    }
  }

  return <>{blocks}</>;
}
