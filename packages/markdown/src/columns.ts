/** Split the explicit two-column body; nested fenced code owns its own pipes. */
export function splitColumnsSource(source: string): [string, string] | null {
  let fence: { marker: string; length: number } | null = null;
  let divider: { start: number; end: number } | null = null;
  let offset = 0;
  for (const piece of source.matchAll(/[^\n]*(?:\n|$)/gu)) {
    if (!piece[0]) continue;
    const line = piece[0].replace(/\r?\n$/u, "");
    const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
    if (fence) {
      if (match && match[1]![0] === fence.marker && match[1]!.length >= fence.length && !match[2]!.trim()) fence = null;
    } else if (match) {
      fence = { marker: match[1]![0]!, length: match[1]!.length };
    } else if (line === "|||") {
      if (divider) return null;
      divider = { start: offset, end: offset + piece[0].length };
    }
    offset += piece[0].length;
  }
  return divider ? [source.slice(0, divider.start), source.slice(divider.end)] : null;
}
