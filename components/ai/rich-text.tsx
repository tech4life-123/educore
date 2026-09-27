import { Fragment } from "react";
import { parseRichText, type Inline } from "@/lib/ai/rich-text";

function Inlines({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "bold" ? (
          <strong key={i} className="font-semibold">
            {p.text}
          </strong>
        ) : p.kind === "code" ? (
          <code key={i} className="rounded bg-surface px-1 py-0.5 font-mono text-[0.85em]">
            {p.text}
          </code>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}

/** Assistant reply rendered as React elements (never raw HTML). */
export function RichText({ text }: { text: string }) {
  const blocks = parseRichText(text);
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "heading":
            return (
              <p key={i} className="font-semibold">
                <Inlines parts={b.content} />
              </p>
            );
          case "bullets":
            return (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {b.items.map((item, j) => (
                  <li key={j}>
                    <Inlines parts={item} />
                  </li>
                ))}
              </ul>
            );
          case "numbers":
            return (
              <ol key={i} start={b.start} className="list-decimal space-y-1 pl-5">
                {b.items.map((item, j) => (
                  <li key={j}>
                    <Inlines parts={item} />
                  </li>
                ))}
              </ol>
            );
          default:
            return (
              <p key={i}>
                <Inlines parts={b.content} />
              </p>
            );
        }
      })}
    </div>
  );
}
