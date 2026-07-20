export type LineDiffKind = "unchanged" | "added" | "removed";

export interface LineDiffEntry {
  kind: LineDiffKind;
  text: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

export interface LineDiffSummary {
  added: number;
  removed: number;
  unchanged: number;
}

interface LineDiffOperation {
  kind: LineDiffKind;
  text: string;
}

const MAX_EDIT_DISTANCE = 1_200;

export function createLineDiff(previous: string, current: string): LineDiffEntry[] {
  const previousLines = splitLines(previous);
  const currentLines = splitLines(current);
  const operations = diffWithStableEdges(previousLines, currentLines);
  let oldLineNumber = 1;
  let newLineNumber = 1;

  return operations.map((operation) => {
    if (operation.kind === "added") {
      return {
        ...operation,
        oldLineNumber: null,
        newLineNumber: newLineNumber++
      };
    }

    if (operation.kind === "removed") {
      return {
        ...operation,
        oldLineNumber: oldLineNumber++,
        newLineNumber: null
      };
    }

    return {
      ...operation,
      oldLineNumber: oldLineNumber++,
      newLineNumber: newLineNumber++
    };
  });
}

export function summarizeLineDiff(entries: readonly LineDiffEntry[]): LineDiffSummary {
  return entries.reduce<LineDiffSummary>(
    (summary, entry) => {
      summary[entry.kind] += 1;
      return summary;
    },
    { added: 0, removed: 0, unchanged: 0 }
  );
}

function splitLines(markdown: string): string[] {
  if (!markdown) return [];

  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function diffWithStableEdges(previous: string[], current: string[]): LineDiffOperation[] {
  let prefixLength = 0;
  while (
    prefixLength < previous.length &&
    prefixLength < current.length &&
    previous[prefixLength] === current[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < previous.length - prefixLength &&
    suffixLength < current.length - prefixLength &&
    previous[previous.length - 1 - suffixLength] === current[current.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const prefix = previous.slice(0, prefixLength).map(unchangedLine);
  const previousMiddle = previous.slice(prefixLength, previous.length - suffixLength);
  const currentMiddle = current.slice(prefixLength, current.length - suffixLength);
  const suffix = previous.slice(previous.length - suffixLength).map(unchangedLine);

  return [...prefix, ...diffMiddle(previousMiddle, currentMiddle), ...suffix];
}

function diffMiddle(previous: string[], current: string[]): LineDiffOperation[] {
  if (previous.length === 0) return current.map(addedLine);
  if (current.length === 0) return previous.map(removedLine);

  const frontier = new Map<number, number>([[1, 0]]);
  const trace: Array<Map<number, number>> = [];
  const maximumDistance = previous.length + current.length;
  const distanceLimit = Math.min(maximumDistance, MAX_EDIT_DISTANCE);

  for (let distance = 0; distance <= distanceLimit; distance += 1) {
    trace.push(new Map(frontier));

    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const left = frontier.get(diagonal - 1);
      const down = frontier.get(diagonal + 1);
      let previousIndex: number;

      if (
        diagonal === -distance ||
        (diagonal !== distance && (left ?? Number.NEGATIVE_INFINITY) < (down ?? Number.NEGATIVE_INFINITY))
      ) {
        previousIndex = down ?? 0;
      } else {
        previousIndex = (left ?? 0) + 1;
      }

      let currentIndex = previousIndex - diagonal;
      while (
        previousIndex < previous.length &&
        currentIndex < current.length &&
        previous[previousIndex] === current[currentIndex]
      ) {
        previousIndex += 1;
        currentIndex += 1;
      }

      frontier.set(diagonal, previousIndex);
      if (previousIndex >= previous.length && currentIndex >= current.length) {
        return backtrack(trace, previous, current, distance);
      }
    }
  }

  // Extremely dissimilar documents should remain responsive even when an exact
  // shortest diff would require a very large search graph.
  return [...previous.map(removedLine), ...current.map(addedLine)];
}

function backtrack(
  trace: Array<Map<number, number>>,
  previous: string[],
  current: string[],
  finalDistance: number
): LineDiffOperation[] {
  let previousIndex = previous.length;
  let currentIndex = current.length;
  const reversed: LineDiffOperation[] = [];

  for (let distance = finalDistance; distance >= 0; distance -= 1) {
    const frontier = trace[distance]!;
    const diagonal = previousIndex - currentIndex;
    const left = frontier.get(diagonal - 1);
    const down = frontier.get(diagonal + 1);
    const previousDiagonal =
      diagonal === -distance ||
      (diagonal !== distance && (left ?? Number.NEGATIVE_INFINITY) < (down ?? Number.NEGATIVE_INFINITY))
        ? diagonal + 1
        : diagonal - 1;
    const priorPreviousIndex = frontier.get(previousDiagonal) ?? 0;
    const priorCurrentIndex = priorPreviousIndex - previousDiagonal;

    while (previousIndex > priorPreviousIndex && currentIndex > priorCurrentIndex) {
      reversed.push(unchangedLine(previous[previousIndex - 1]!));
      previousIndex -= 1;
      currentIndex -= 1;
    }

    if (distance === 0) break;

    if (previousIndex === priorPreviousIndex) {
      reversed.push(addedLine(current[currentIndex - 1]!));
      currentIndex -= 1;
    } else {
      reversed.push(removedLine(previous[previousIndex - 1]!));
      previousIndex -= 1;
    }
  }

  return reversed.reverse();
}

function unchangedLine(text: string): LineDiffOperation {
  return { kind: "unchanged", text };
}

function addedLine(text: string): LineDiffOperation {
  return { kind: "added", text };
}

function removedLine(text: string): LineDiffOperation {
  return { kind: "removed", text };
}
