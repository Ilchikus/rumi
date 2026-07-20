import { describe, expect, it } from "vitest";
import {
  DEEPER_LIST_INDENT_RATIO,
  FIRST_LIST_INDENT_RATIO,
  listDropIndent
} from "./listDropIndent";

const baseGeometry = {
  editorLeft: 100,
  editorWidth: 1_000,
  targetBlockLeft: 100,
  targetBlockWidth: 1_000,
  targetBlockIndent: 0,
  maxIndent: 3
};

describe("list drag indentation thresholds", () => {
  it("uses 30% of the editor width for the first indentation", () => {
    const threshold = baseGeometry.editorLeft + baseGeometry.editorWidth * FIRST_LIST_INDENT_RATIO;

    expect(listDropIndent({ ...baseGeometry, pointerX: threshold })).toBe(0);
    expect(listDropIndent({ ...baseGeometry, pointerX: threshold + 1 })).toBe(1);
  });

  it("uses 20% of the already-indented target block for the next level", () => {
    const geometry = {
      ...baseGeometry,
      targetBlockLeft: 220,
      targetBlockWidth: 600,
      targetBlockIndent: 1
    };
    const threshold = geometry.targetBlockLeft + geometry.targetBlockWidth * DEEPER_LIST_INDENT_RATIO;

    expect(listDropIndent({ ...geometry, pointerX: threshold })).toBe(1);
    expect(listDropIndent({ ...geometry, pointerX: threshold + 1 })).toBe(2);
  });

  it("aligns with a deeper target before its threshold and nests one level after it", () => {
    const geometry = {
      ...baseGeometry,
      targetBlockLeft: 260,
      targetBlockWidth: 520,
      targetBlockIndent: 2
    };

    expect(listDropIndent({ ...geometry, pointerX: 300 })).toBe(2);
    expect(listDropIndent({ ...geometry, pointerX: 365 })).toBe(3);
  });

  it("does not indent without a preceding list target or beyond the maximum level", () => {
    expect(listDropIndent({ ...baseGeometry, pointerX: 1_000, targetBlockIndent: -1 })).toBe(0);
    expect(listDropIndent({
      ...baseGeometry,
      pointerX: 1_000,
      targetBlockIndent: 3
    })).toBe(3);
  });
});
