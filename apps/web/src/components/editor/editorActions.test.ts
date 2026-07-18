import { EditorState, TextSelection } from "prosemirror-state";
import { describe, expect, it } from "vitest";
import {
  createBookmarkTransaction,
  createDividerTransaction,
  createTaskListTransaction
} from "./editorActions";
import { createPlainTextPasteTransaction } from "./editorPaste";
import {
  lightEditorSchema,
  parseLightMarkdown,
  serializeLightMarkdown
} from "./lightProseMirrorMarkdown";

function stateAtEnd(markdown: string): EditorState {
  const doc = parseLightMarkdown(markdown);
  const state = EditorState.create({ doc });
  return state.apply(
    state.tr.setSelection(TextSelection.atEnd(doc))
  );
}

function paragraphState(text: string): EditorState {
  const paragraph = lightEditorSchema.nodes.paragraph!.create(
    null,
    text ? lightEditorSchema.text(text) : undefined
  );
  const doc = lightEditorSchema.nodes.doc!.create(null, paragraph);
  const state = EditorState.create({ doc });
  return state.apply(state.tr.setSelection(TextSelection.atEnd(doc)));
}

describe("Rumi editor structural actions", () => {
  it("turns a Markdown checkbox trigger into a real task list item", () => {
    const state = paragraphState("- [ ] ");
    const transaction = createTaskListTransaction(state, false);

    expect(transaction).not.toBeNull();
    expect(serializeLightMarkdown(transaction!.doc)).toBe("- [ ] ");
    expect(transaction!.doc.firstChild?.firstChild?.attrs.checked).toBe(false);
  });

  it("inserts a divider with a writable paragraph after it", () => {
    const state = paragraphState("---");
    const transaction = createDividerTransaction(state);

    expect(transaction).not.toBeNull();
    expect(transaction!.doc.child(0).type.name).toBe("horizontal_rule");
    expect(transaction!.doc.child(1).type.name).toBe("paragraph");
  });

  it("turns a standalone URL into a bookmark and keeps a place to continue writing", () => {
    const state = paragraphState("https://rumi.md");
    const transaction = createBookmarkTransaction(state);

    expect(transaction).not.toBeNull();
    expect(transaction!.doc.child(0).type.name).toBe("bookmark");
    expect(transaction!.doc.child(0).attrs.url).toBe("https://rumi.md");
    expect(transaction!.doc.child(1).type.name).toBe("paragraph");
  });
});

describe("Rumi editor paste actions", () => {
  it("applies a pasted URL to selected text", () => {
    const doc = parseLightMarkdown("Rumi docs");
    const base = EditorState.create({ doc });
    const state = base.apply(base.tr.setSelection(TextSelection.create(doc, 1, 10)));
    const transaction = createPlainTextPasteTransaction(
      state,
      "https://rumi.md",
      lightEditorSchema
    );

    expect(transaction).not.toBeNull();
    expect(serializeLightMarkdown(transaction!.doc)).toBe("[Rumi docs](https://rumi.md)");
  });

  it("pastes a standalone URL into an empty paragraph as a bookmark", () => {
    const transaction = createPlainTextPasteTransaction(
      paragraphState(""),
      "https://rumi.md",
      lightEditorSchema
    );

    expect(transaction?.doc.firstChild?.type.name).toBe("bookmark");
  });

  it("parses multi-block Markdown instead of flattening it", () => {
    const state = stateAtEnd("");
    const transaction = createPlainTextPasteTransaction(
      state,
      "## Imported\n\n- One\n- Two\n",
      lightEditorSchema
    );

    expect(transaction).not.toBeNull();
    expect(serializeLightMarkdown(transaction!.doc)).toContain("## Imported");
    expect(serializeLightMarkdown(transaction!.doc)).toContain("- One");
  });

  it("leaves ordinary single-line text and code-block paste to ProseMirror", () => {
    expect(createPlainTextPasteTransaction(stateAtEnd("Text"), "plain", lightEditorSchema)).toBeNull();
    expect(createPlainTextPasteTransaction(stateAtEnd("```ts\ncode\n```"), "x\ny", lightEditorSchema)).toBeNull();
  });
});
