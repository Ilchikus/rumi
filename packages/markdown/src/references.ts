export interface RewrittenReferences {
  markdown: string;
  referenceCount: number;
}

export function rewriteMarkdownReferences(
  markdown: string,
  previousPath: string,
  nextPath: string,
  sourcePath?: string
): RewrittenReferences {
  const previous = normalizeReferencePath(previousPath);
  const next = normalizeReferencePath(nextPath);
  if (previous === null || next === null) return { markdown, referenceCount: 0 };

  let referenceCount = 0;
  const rewriteText = (text: string): string => {
    let rewritten = text.replace(
      /(!?)\[([^\]\n]*)\]\(([^)\n]*)\)/gu,
      (match, imagePrefix: string, label: string, destinationBody: string) => {
        const destination = rewriteDestinationBody(destinationBody, previous, next, sourcePath);
        if (!destination.changed) return match;
        referenceCount += 1;
        const nextLabel = imagePrefix || label !== displayTitle(previous)
          ? label
          : displayTitle(next);
        return `${imagePrefix}[${nextLabel}](${destination.value})`;
      }
    );

    rewritten = rewritten.replace(
      /(!?\[\[)([^\]|#\n]+)(#[^\]\n]*)?(\|[^\]\n]*)?(\]\])/gu,
      (match, opening: string, target: string, fragment: string | undefined, alias: string | undefined, closing: string) => {
        const mapped = rewriteReferenceTarget(target.trim(), previous, next, sourcePath, false);
        if (!mapped) return match;
        referenceCount += 1;
        return `${opening}${mapped}${fragment ?? ""}${alias ?? ""}${closing}`;
      }
    );

    rewritten = rewritten.replace(
      /(\bhref\s*=\s*["'])([^"']+)(["'])/giu,
      (match, opening: string, target: string, closing: string) => {
        const mapped = rewriteReferenceTarget(target, previous, next, sourcePath, true);
        if (!mapped) return match;
        referenceCount += 1;
        return `${opening}${mapped}${closing}`;
      }
    );

    rewritten = rewritten.replace(
      /^(\s{0,3}\[[^\]\n]+\]:\s*)(<[^>\n]+>|\S+)(.*)$/gmu,
      (match, opening: string, target: string, suffix: string) => {
        const wrapped = target.startsWith("<") && target.endsWith(">");
        const rawTarget = wrapped ? target.slice(1, -1) : target;
        const mapped = rewriteReferenceTarget(rawTarget, previous, next, sourcePath, true);
        if (!mapped) return match;
        referenceCount += 1;
        return `${opening}${wrapped ? `<${mapped}>` : mapped}${suffix}`;
      }
    );

    return rewritten;
  };

  return {
    markdown: rewriteOutsideCode(markdown, rewriteText),
    referenceCount
  };
}

function rewriteDestinationBody(
  body: string,
  previousPath: string,
  nextPath: string,
  sourcePath?: string
): { changed: boolean; value: string } {
  const leading = body.match(/^\s*/u)?.[0] ?? "";
  const trailing = body.match(/\s*$/u)?.[0] ?? "";
  let core = body.slice(leading.length, body.length - trailing.length);
  let title = "";
  const titleMatch = core.match(/^(.*?)(\s+(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\([^)]*\)))$/u);
  if (titleMatch) {
    core = titleMatch[1] ?? core;
    title = titleMatch[2] ?? "";
  }

  const wrapped = core.startsWith("<") && core.endsWith(">");
  const target = wrapped ? core.slice(1, -1) : core;
  const mapped = rewriteReferenceTarget(target, previousPath, nextPath, sourcePath, true);
  if (!mapped) return { changed: false, value: body };
  return {
    changed: true,
    value: `${leading}${wrapped ? `<${mapped}>` : mapped}${title}${trailing}`
  };
}

function rewriteReferenceTarget(
  target: string,
  previousPath: string,
  nextPath: string,
  sourcePath: string | undefined,
  encodeWhitespace: boolean
): string | null {
  if (
    !target ||
    target.startsWith("#") ||
    target.startsWith("/") ||
    (target.startsWith("../") && !sourcePath) ||
    /^[a-z][a-z\d+.-]*:/iu.test(target) ||
    target.startsWith("//")
  ) {
    return null;
  }

  const suffixIndex = firstSuffixIndex(target);
  const rawPath = suffixIndex === -1 ? target : target.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : target.slice(suffixIndex);
  const dotPrefix = rawPath.startsWith("./") ? "./" : "";
  const encodedPath = dotPrefix ? rawPath.slice(2) : rawPath;
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(encodedPath);
  } catch {
    return null;
  }

  const normalized = normalizeReferencePath(decodedPath);
  let moved = normalized
    ? movedReferencePath(normalized, previousPath, nextPath)
    : null;
  if (!moved && sourcePath) {
    const sourceDirectory = directoryName(sourcePath);
    const absoluteTarget = normalizeReferencePath(joinReferencePath(sourceDirectory, decodedPath));
    const movedAbsolute = absoluteTarget
      ? movedReferencePath(absoluteTarget, previousPath, nextPath)
      : null;
    if (movedAbsolute) moved = relativeReferencePath(sourceDirectory, movedAbsolute);
  }
  if (!moved) return null;
  const outputPath = /%[0-9a-f]{2}/iu.test(encodedPath) || (encodeWhitespace && /\s/u.test(moved))
    ? encodeURI(moved).replace(/#/gu, "%23")
    : moved;
  return `${dotPrefix}${outputPath}${suffix}`;
}

function movedReferencePath(target: string, previousPath: string, nextPath: string): string | null {
  if (target === previousPath) return nextPath;

  const previousWithoutExtension = stripMarkdownExtension(previousPath);
  if (previousWithoutExtension !== previousPath && target === previousWithoutExtension) {
    return stripMarkdownExtension(nextPath);
  }

  if (!target.startsWith(`${previousPath}/`)) return null;
  const relative = target.slice(previousPath.length + 1);
  const previousName = baseName(previousPath);
  const nextName = baseName(nextPath);
  if (relative === `${previousName}.index.md`) {
    return joinReferencePath(nextPath, `${nextName}.index.md`);
  }
  if (relative === `${previousName}.db.md`) {
    return joinReferencePath(nextPath, `${nextName}.db.md`);
  }
  return joinReferencePath(nextPath, relative);
}

function rewriteOutsideCode(markdown: string, rewrite: (text: string) => string): string {
  const pieces = markdown.split(/(\r?\n)/u);
  let fence: { marker: "`" | "~"; length: number } | null = null;

  return pieces.map((piece, index) => {
    if (index % 2 === 1) return piece;
    const markerMatch = piece.match(/^\s{0,3}(`{3,}|~{3,})/u);
    if (markerMatch) {
      const markerText = markerMatch[1]!;
      const marker = markerText[0] as "`" | "~";
      if (!fence) fence = { marker, length: markerText.length };
      else if (marker === fence.marker && markerText.length >= fence.length) fence = null;
      return piece;
    }
    if (fence) return piece;

    let result = "";
    let cursor = 0;
    for (const match of piece.matchAll(/(`+)(.*?)\1/gu)) {
      const start = match.index ?? 0;
      result += rewrite(piece.slice(cursor, start));
      result += match[0];
      cursor = start + match[0].length;
    }
    return result + rewrite(piece.slice(cursor));
  }).join("");
}

function firstSuffixIndex(target: string): number {
  const queryIndex = target.indexOf("?");
  const fragmentIndex = target.indexOf("#");
  if (queryIndex === -1) return fragmentIndex;
  if (fragmentIndex === -1) return queryIndex;
  return Math.min(queryIndex, fragmentIndex);
}

function stripMarkdownExtension(value: string): string {
  return value.toLocaleLowerCase().endsWith(".md") ? value.slice(0, -3) : value;
}

function displayTitle(value: string): string {
  return stripMarkdownExtension(baseName(value));
}

function baseName(value: string): string {
  return value.split("/").at(-1) ?? value;
}

function joinReferencePath(parent: string, child: string): string {
  return parent ? `${parent}/${child}` : child;
}

function directoryName(value: string): string {
  const parts = value.split("/");
  parts.pop();
  return parts.join("/");
}

function relativeReferencePath(fromDirectory: string, target: string): string {
  const fromParts = fromDirectory ? fromDirectory.split("/") : [];
  const targetParts = target ? target.split("/") : [];
  let commonLength = 0;
  while (
    commonLength < fromParts.length &&
    commonLength < targetParts.length &&
    fromParts[commonLength] === targetParts[commonLength]
  ) {
    commonLength += 1;
  }
  return [
    ...fromParts.slice(commonLength).map(() => ".."),
    ...targetParts.slice(commonLength)
  ].join("/") || ".";
}

function normalizeReferencePath(input: string): string | null {
  const parts: string[] = [];
  for (const part of input.replace(/\\/gu, "/").trim().split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}
