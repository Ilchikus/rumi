import { EditorState } from "prosemirror-state";
import { describe, expect, it } from "vitest";
import {
  collectSelectableBlockPositions,
  createNestListItemTransaction,
  createDeleteSelectedBlocksTransaction,
  createDuplicateSelectedBlocksTransaction,
  createMoveSelectedBlocksTransaction,
  normalizeSelectedBlockPositions,
  selectableBlockPositionAt
} from "./blockSelection";
import { parseLightMarkdown, serializeLightMarkdown } from "./lightProseMirrorMarkdown";

const nestedListMarkdown = [
  "Before",
  "",
  "- One",
  "- Two",
  "  - Nested",
  "- Three",
  "",
  "After",
  ""
].join("\n");

describe("block editor selectable units", () => {
  it("treats every list item as a block without selecting list containers", () => {
    const doc = parseLightMarkdown(nestedListMarkdown);
    const positions = collectSelectableBlockPositions(doc);

    expect(positions.map((pos) => doc.nodeAt(pos)?.type.name)).toEqual([
      "paragraph",
      "list_item",
      "list_item",
      "list_item",
      "list_item",
      "paragraph"
    ]);
    expect(positions.map((pos) => doc.nodeAt(pos)?.textContent)).toEqual([
      "Before",
      "One",
      "TwoNested",
      "Nested",
      "Three",
      "After"
    ]);
  });

  it("resolves text coordinates to the deepest containing list item", () => {
    const doc = parseLightMarkdown(nestedListMarkdown);
    const nestedPos = collectSelectableBlockPositions(doc).find(
      (pos) => doc.nodeAt(pos)?.textContent === "Nested"
    );

    expect(nestedPos).toBeTypeOf("number");
    expect(selectableBlockPositionAt(doc, nestedPos! + 3)).toBe(nestedPos);
  });

  it("removes nested selections when their parent list item is already selected", () => {
    const doc = parseLightMarkdown(nestedListMarkdown);
    const positions = collectSelectableBlockPositions(doc);
    const parentPos = positions.find((pos) => doc.nodeAt(pos)?.textContent === "TwoNested")!;
    const nestedPos = positions.find((pos) => doc.nodeAt(pos)?.textContent === "Nested")!;

    expect(normalizeSelectedBlockPositions(doc, [parentPos, nestedPos])).toEqual([parentPos]);
  });
});

describe("block editor structural mutations", () => {
  it("moves a group of top-level blocks without reversing them", () => {
    const doc = parseLightMarkdown("A\n\nB\n\nC\n");
    const state = EditorState.create({ doc });
    const [a, b, c] = collectSelectableBlockPositions(doc);
    const transaction = createMoveSelectedBlocksTransaction(state, [a!, b!], c!, true);

    expect(transaction).not.toBeNull();
    expect(serializeLightMarkdown(transaction!.doc)).toBe("C\n\nA\n\nB");
  });

  it("duplicates sibling blocks as a group after the selection", () => {
    const doc = parseLightMarkdown("A\n\nB\n\nC\n");
    const state = EditorState.create({ doc });
    const [a, b] = collectSelectableBlockPositions(doc);
    const transaction = createDuplicateSelectedBlocksTransaction(state, [a!, b!]);

    expect(serializeLightMarkdown(transaction!.doc)).toBe("A\n\nB\n\nA\n\nB\n\nC");
  });

  it("reorders sibling list items and rejects a cross-level move", () => {
    const doc = parseLightMarkdown(nestedListMarkdown);
    const state = EditorState.create({ doc });
    const positions = collectSelectableBlockPositions(doc);
    const two = positions.find((pos) => doc.nodeAt(pos)?.textContent === "TwoNested")!;
    const nested = positions.find((pos) => doc.nodeAt(pos)?.textContent === "Nested")!;
    const three = positions.find((pos) => doc.nodeAt(pos)?.textContent === "Three")!;
    const transaction = createMoveSelectedBlocksTransaction(state, [two], three, true);

    expect(transaction).not.toBeNull();
    expect(serializeLightMarkdown(transaction!.doc)).toMatch(/- One\n- Three\n- Two\n  - Nested/);
    expect(createMoveSelectedBlocksTransaction(state, [nested], three, true)).toBeNull();
  });

  it("nests a dragged list item directly under its drop target", () => {
    const doc = parseLightMarkdown("- One\n- Two\n- Three\n");
    const state = EditorState.create({ doc });
    const positions = collectSelectableBlockPositions(doc);
    const one = positions.find((pos) => doc.nodeAt(pos)?.textContent === "One")!;
    const three = positions.find((pos) => doc.nodeAt(pos)?.textContent === "Three")!;
    const transaction = createNestListItemTransaction(state, three, one);

    expect(transaction).not.toBeNull();
    expect(serializeLightMarkdown(transaction!.doc)).toBe("- One\n  - Three\n- Two");
  });

  it("moves a nested item across levels without leaving an empty source list", () => {
    const doc = parseLightMarkdown("- One\n  - Nested\n- Two\n");
    const state = EditorState.create({ doc });
    const positions = collectSelectableBlockPositions(doc);
    const nested = positions.find((pos) => doc.nodeAt(pos)?.textContent === "Nested")!;
    const two = positions.find((pos) => doc.nodeAt(pos)?.textContent === "Two")!;
    const transaction = createNestListItemTransaction(state, nested, two);

    expect(transaction).not.toBeNull();
    expect(serializeLightMarkdown(transaction!.doc)).toBe("- One\n- Two\n  - Nested");
  });

  it("appends to an existing nested list and refuses to nest a parent under its child", () => {
    const doc = parseLightMarkdown("- One\n  - Child\n- Two\n");
    const state = EditorState.create({ doc });
    const positions = collectSelectableBlockPositions(doc);
    const one = positions.find((pos) => doc.nodeAt(pos)?.textContent === "OneChild")!;
    const child = positions.find((pos) => doc.nodeAt(pos)?.textContent === "Child")!;
    const two = positions.find((pos) => doc.nodeAt(pos)?.textContent === "Two")!;
    const transaction = createNestListItemTransaction(state, two, one);

    expect(transaction).not.toBeNull();
    expect(serializeLightMarkdown(transaction!.doc)).toBe("- One\n  - Child\n  - Two");
    expect(createNestListItemTransaction(state, one, child)).toBeNull();
  });

  it("duplicates a parent list item only once when its child is also selected", () => {
    const doc = parseLightMarkdown(nestedListMarkdown);
    const state = EditorState.create({ doc });
    const positions = collectSelectableBlockPositions(doc);
    const parent = positions.find((pos) => doc.nodeAt(pos)?.textContent === "TwoNested")!;
    const nested = positions.find((pos) => doc.nodeAt(pos)?.textContent === "Nested")!;
    const transaction = createDuplicateSelectedBlocksTransaction(state, [parent, nested]);
    const markdown = serializeLightMarkdown(transaction!.doc);

    expect(markdown.match(/- Two/g)).toHaveLength(2);
    expect(markdown.match(/  - Nested/g)).toHaveLength(2);
  });

  it("keeps the document valid when all selected top-level blocks are deleted", () => {
    const doc = parseLightMarkdown("Only\n");
    const state = EditorState.create({ doc });
    const transaction = createDeleteSelectedBlocksTransaction(
      state,
      collectSelectableBlockPositions(doc)
    );

    expect(transaction).not.toBeNull();
    expect(transaction!.doc.check()).toBeUndefined();
    expect(transaction!.doc.childCount).toBeGreaterThan(0);
  });

  it("removes a whole list instead of leaving an empty bullet behind", () => {
    const doc = parseLightMarkdown("Before\n\n- One\n- Two\n\nAfter\n");
    const state = EditorState.create({ doc });
    const listItems = collectSelectableBlockPositions(doc).filter(
      (pos) => doc.nodeAt(pos)?.type.name === "list_item"
    );
    const transaction = createDeleteSelectedBlocksTransaction(state, listItems);

    expect(serializeLightMarkdown(transaction!.doc)).toBe("Before\n\nAfter");
  });
});
