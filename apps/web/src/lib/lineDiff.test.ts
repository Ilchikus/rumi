import { describe, expect, it } from "vitest";
import { createLineDiff, summarizeLineDiff } from "./lineDiff";

describe("revision line diff", () => {
  it("marks unchanged, removed, and added lines with both line-number columns", () => {
    const diff = createLineDiff("first\nold\nlast\n", "first\nnew\nlast\n");

    expect(diff).toEqual([
      { kind: "unchanged", text: "first", oldLineNumber: 1, newLineNumber: 1 },
      { kind: "removed", text: "old", oldLineNumber: 2, newLineNumber: null },
      { kind: "added", text: "new", oldLineNumber: null, newLineNumber: 2 },
      { kind: "unchanged", text: "last", oldLineNumber: 3, newLineNumber: 3 }
    ]);
    expect(summarizeLineDiff(diff)).toEqual({ added: 1, removed: 1, unchanged: 2 });
  });

  it("handles insertions and deletions around repeated lines", () => {
    const diff = createLineDiff("same\nrepeat\nrepeat\nend", "same\nrepeat\ninserted\nend");

    expect(diff.map(({ kind, text }) => `${kind}:${text}`)).toEqual([
      "unchanged:same",
      "unchanged:repeat",
      "removed:repeat",
      "added:inserted",
      "unchanged:end"
    ]);
  });

  it("represents empty documents and normalizes Windows line endings", () => {
    expect(createLineDiff("", "created\r\n")).toEqual([
      { kind: "added", text: "created", oldLineNumber: null, newLineNumber: 1 }
    ]);
    expect(createLineDiff("removed\r\n", "")).toEqual([
      { kind: "removed", text: "removed", oldLineNumber: 1, newLineNumber: null }
    ]);
    expect(createLineDiff("", "")).toEqual([]);
  });

  it("keeps a large document aligned when only one line is inserted", () => {
    const previous = Array.from({ length: 3_000 }, (_, index) => `line ${index}`);
    const current = [...previous.slice(0, 1_500), "new middle line", ...previous.slice(1_500)];
    const diff = createLineDiff(previous.join("\n"), current.join("\n"));

    expect(summarizeLineDiff(diff)).toEqual({ added: 1, removed: 0, unchanged: 3_000 });
    expect(diff[1_500]).toEqual({
      kind: "added",
      text: "new middle line",
      oldLineNumber: null,
      newLineNumber: 1_501
    });
  });
});
