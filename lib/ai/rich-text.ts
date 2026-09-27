/**
 * A tiny, safe formatter for assistant replies (pure).
 *
 * Replies are rendered as React elements built from this structure — never
 * as HTML — so text from the model (or from school data it quotes later) can
 * never inject markup or scripts. Supported: paragraphs, "-"/"*" bullet
 * lists, "1." numbered lists, "#" headings, **bold** and `code`.
 */

export type Inline = { kind: "text" | "bold" | "code"; text: string };

export type Block =
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "heading"; content: Inline[] }
  | { kind: "bullets"; items: Inline[][] }
  | { kind: "numbers"; items: Inline[][]; start: number };

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    out.push(m[1] !== undefined ? { kind: "bold", text: m[1] } : { kind: "code", text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

export function parseRichText(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", content: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const number = /^(\d{1,3})[.)]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", content: parseInline(heading[1]) });
    } else if (bullet) {
      flush();
      const prev = blocks[blocks.length - 1];
      if (prev?.kind === "bullets") prev.items.push(parseInline(bullet[1]));
      else blocks.push({ kind: "bullets", items: [parseInline(bullet[1])] });
    } else if (number) {
      flush();
      const prev = blocks[blocks.length - 1];
      if (prev?.kind === "numbers") prev.items.push(parseInline(number[2]));
      else blocks.push({ kind: "numbers", items: [parseInline(number[2])], start: Number(number[1]) });
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}
