import type { Mark, Node as ProseMirrorNode } from "prosemirror-model";
import {
  EditorState,
  TextSelection,
  type Transaction
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { describe, expect, it } from "vitest";
import { serializeMarkdown } from "../markdown";
import { schema } from "../schema";
import { searchEmoji } from "../../../emoji/emojiCatalog";
import {
  emojiSuggestionsPlugin,
  emojiSuggestionsPluginKey,
  setEmojiSuggestionsEnabled
} from "./emojiSuggestions";
import { claimSuggestionMenu } from "./suggestionMenus";

describe("colon emoji suggestions", () => {
  it("tracks :smile as a live query and inserts the focused emoji on Enter", () => {
    const harness = createHarness();
    harness.type(":smile");

    expect(emojiSuggestionsPluginKey.getState(harness.state)).toMatchObject({
      active: true,
      query: "smile",
      focusedIndex: 0
    });
    expect(harness.state.doc.textContent).toBe(":smile");

    expect(harness.key({ key: "Enter" })).toBe(true);
    expect(harness.state.doc.textContent).toBe("😄");
    expect(serializeMarkdown(harness.state.doc)).toBe("😄\n");
    expect(emojiSuggestionsPluginKey.getState(harness.state)?.active).toBe(false);
  });

  it("keeps the literal query on Escape", () => {
    const harness = createHarness();
    harness.type(":smile");

    expect(harness.key({ key: "Escape" })).toBe(true);
    expect(harness.state.doc.textContent).toBe(":smile");
    expect(emojiSuggestionsPluginKey.getState(harness.state)?.active).toBe(false);
  });

  it("moves focus through the configurable result grid with arrow keys", () => {
    const harness = createHarness();
    harness.type(":");

    expect(harness.key({ key: "ArrowRight" })).toBe(true);
    expect(emojiSuggestionsPluginKey.getState(harness.state)?.focusedIndex).toBe(1);
    expect(harness.key({ key: "ArrowDown" })).toBe(true);
    expect(emojiSuggestionsPluginKey.getState(harness.state)?.focusedIndex).toBe(9);
    expect(harness.key({ key: "ArrowLeft" })).toBe(true);
    expect(emojiSuggestionsPluginKey.getState(harness.state)?.focusedIndex).toBe(8);
  });

  it("restores the exact query on undo and the emoji on redo", () => {
    const harness = createHarness();
    harness.type(":smile");
    harness.key({ key: "Enter" });

    expect(harness.key({ key: "z", ctrlKey: true })).toBe(true);
    expect(harness.state.doc.textContent).toBe(":smile");
    expect(emojiSuggestionsPluginKey.getState(harness.state)?.active).toBe(false);
    expect(harness.key({ key: "z", ctrlKey: true, shiftKey: true })).toBe(true);
    expect(harness.state.doc.textContent).toBe("😄");
  });

  it("does not trigger inside words, times, URLs, code blocks, or inline code", () => {
    const prose = createHarness();
    prose.type("note:value 12:30 https://rumi.md");
    expect(emojiSuggestionsPluginKey.getState(prose.state)?.active).toBe(false);

    const block = createHarness(
      schema.nodes.doc!.create(null, schema.nodes.code_block!.create())
    );
    block.type(":smile");
    expect(emojiSuggestionsPluginKey.getState(block.state)?.active).toBe(false);

    const codeMark = schema.marks.code!.create();
    const inline = createHarness(paragraph("code", [codeMark]));
    inline.setCursor(5);
    inline.type(":smile");
    expect(emojiSuggestionsPluginKey.getState(inline.state)?.active).toBe(false);

    const storedInline = createHarness();
    storedInline.view.dispatch(
      storedInline.state.tr.setStoredMarks([codeMark])
    );
    storedInline.type(":smile");
    expect(emojiSuggestionsPluginKey.getState(storedInline.state)?.active).toBe(
      false
    );
  });

  it("supports live enable and disable without rebuilding editor state", () => {
    const harness = createHarness();
    setEmojiSuggestionsEnabled(harness.view, false);
    harness.type(":smile");
    expect(emojiSuggestionsPluginKey.getState(harness.state)?.active).toBe(false);

    harness.type(" ");
    setEmojiSuggestionsEnabled(harness.view, true);
    harness.type(":smile");
    expect(emojiSuggestionsPluginKey.getState(harness.state)).toMatchObject({
      active: true,
      query: "smile"
    });
  });

  it("keeps programmatic and composing input literal and closes on another menu claim", () => {
    const programmatic = createHarness();
    programmatic.view.dispatch(programmatic.state.tr.insertText(":smile"));
    expect(emojiSuggestionsPluginKey.getState(programmatic.state)?.active).toBe(false);

    const composing = createHarness();
    composing.setComposing(true);
    composing.type(":smile");
    expect(emojiSuggestionsPluginKey.getState(composing.state)?.active).toBe(false);

    const coordinated = createHarness();
    coordinated.type(":smile");
    coordinated.view.dispatch(
      claimSuggestionMenu(coordinated.state.tr, "slash")
    );
    expect(emojiSuggestionsPluginKey.getState(coordinated.state)?.active).toBe(false);
    expect(coordinated.state.doc.textContent).toBe(":smile");
  });

  it("inherits active marks and closes an empty result before normal Enter handling", () => {
    const bold = schema.marks.bold!.create();
    const marked = createHarness(paragraph(" ", [bold]));
    marked.setCursor(2);
    marked.type(":smile");
    marked.key({ key: "Enter" });
    expect(marked.state.doc.firstChild?.lastChild?.marks.map((mark) => mark.type.name))
      .toContain("bold");

    const empty = createHarness();
    empty.type(":querywithnoresult");
    expect(empty.key({ key: "Enter" })).toBe(false);
    expect(empty.state.doc.textContent).toBe(":querywithnoresult");
    expect(emojiSuggestionsPluginKey.getState(empty.state)?.active).toBe(false);
  });

  it("uses Backspace to edit the mirrored query and remove its trigger", () => {
    const harness = createHarness();
    harness.type(":sm");

    expect(harness.key({ key: "Backspace" })).toBe(true);
    expect(harness.state.doc.textContent).toBe(":s");
    expect(emojiSuggestionsPluginKey.getState(harness.state)?.query).toBe("s");
    expect(harness.key({ key: "Backspace" })).toBe(true);
    expect(harness.key({ key: "Backspace" })).toBe(true);
    expect(harness.state.doc.textContent).toBe("");
    expect(emojiSuggestionsPluginKey.getState(harness.state)?.active).toBe(false);
  });
});

function createHarness(initialDoc = paragraph("")) {
  const plugin = emojiSuggestionsPlugin(schema, { searchEmoji });
  let composing = false;
  let state = EditorState.create({
    doc: initialDoc.type === schema.nodes.doc
      ? initialDoc
      : schema.nodes.doc!.create(null, initialDoc),
    plugins: [plugin]
  });
  const view = {
    get state() {
      return state;
    },
    get composing() {
      return composing;
    },
    dispatch(transaction: Transaction) {
      state = state.apply(transaction);
    },
    focus() {}
  } as unknown as EditorView;

  return {
    get state() {
      return state;
    },
    view,
    type(text: string) {
      for (const character of text) {
        const { from, to } = state.selection;
        const handled = plugin.props.handleTextInput?.call(
          plugin,
          view,
          from,
          to,
          character,
          () => state.tr.insertText(character, from, to)
        );
        if (!handled) view.dispatch(state.tr.insertText(character, from, to));
      }
    },
    key(input: Partial<KeyboardEvent> & Pick<KeyboardEvent, "key">) {
      const event = {
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        preventDefault() {},
        stopPropagation() {},
        ...input
      } as KeyboardEvent;
      return plugin.props.handleKeyDown?.call(plugin, view, event) ?? false;
    },
    setCursor(position: number) {
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, position)));
    },
    setComposing(value: boolean) {
      composing = value;
    }
  };
}

function paragraph(
  text: string,
  marks: readonly Mark[] = []
): ProseMirrorNode {
  return schema.nodes.paragraph!.create(
    null,
    text ? schema.text(text, [...marks]) : undefined
  );
}
