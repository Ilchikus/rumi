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
import {
  inlineReplacementsPlugin,
  setInlineReplacementsEnabled
} from "./inlineReplacements";

describe("inline replacements", () => {
  it.each([
    ["->", "→"],
    ["<-", "←"],
    ["<->", "↔"],
    ["=>", "⇒"],
    ["<=>", "⇔"],
    ["<=", "≤"],
    [">=", "≥"],
    ["!=", "≠"],
    ["~=", "≈"],
    ["+-", "±"],
    ["...", "…"]
  ])("replaces %s with literal %s while typing", (source, replacement) => {
    const harness = createHarness();
    harness.type(source);

    expect(harness.state.doc.textContent).toBe(replacement);
    expect(serializeMarkdown(harness.state.doc)).toBe(`${replacement}\n`);
  });

  it.each([
    ["(c) ", "© "],
    ["(R).", "®."],
    ["(TM)\n", "™"]
  ])("commits legal symbol %s at its following boundary", (source, replacement) => {
    const harness = createHarness();
    if (source.endsWith("\n")) {
      harness.type(source.slice(0, -1));
      harness.key({ key: "Enter" });
    } else {
      harness.type(source);
    }

    expect(harness.state.doc.textContent).toBe(replacement);
  });

  it("does not replace a legal token embedded in a word", () => {
    const harness = createHarness();
    harness.type("function(c) ");

    expect(harness.state.doc.textContent).toBe("function(c) ");
  });

  it("keeps the caret after a retained legal-symbol boundary during undo and redo", () => {
    const harness = createHarness();
    harness.type("(c) ");
    expect(harness.state.selection.$from.parentOffset).toBe(2);

    harness.key({ key: "z", ctrlKey: true });
    expect(harness.state.doc.textContent).toBe("(c) ");
    expect(harness.state.selection.$from.parentOffset).toBe(4);

    harness.key({ key: "z", ctrlKey: true, shiftKey: true });
    expect(harness.state.doc.textContent).toBe("© ");
    expect(harness.state.selection.$from.parentOffset).toBe(2);
  });

  it("chains only a plugin-produced short replacement into a bidirectional arrow", () => {
    const chained = createHarness();
    chained.type("<-");
    expect(chained.state.doc.textContent).toBe("←");
    chained.type(">");
    expect(chained.state.doc.textContent).toBe("↔");

    const literal = createHarness(paragraph("←"));
    literal.setCursor(2);
    literal.type(">");
    expect(literal.state.doc.textContent).toBe("←>");
  });

  it("restores the exact longest source with one undo and reapplies it with redo", () => {
    const harness = createHarness();
    harness.type("<->");

    expect(harness.key({ key: "z", ctrlKey: true })).toBe(true);
    expect(harness.state.doc.textContent).toBe("<->");
    expect(harness.key({ key: "z", ctrlKey: true, shiftKey: true })).toBe(true);
    expect(harness.state.doc.textContent).toBe("↔");
  });

  it("can be toggled live without rebuilding the editor state", () => {
    const harness = createHarness();
    setInlineReplacementsEnabled(harness.view, false);
    harness.type("->");
    expect(harness.state.doc.textContent).toBe("->");

    setInlineReplacementsEnabled(harness.view, true);
    harness.type(" ->");
    expect(harness.state.doc.textContent).toBe("-> →");
  });

  it("does not run during composition or for programmatic document changes", () => {
    const composing = createHarness();
    composing.setComposing(true);
    composing.type("->");
    expect(composing.state.doc.textContent).toBe("->");

    const programmatic = createHarness();
    programmatic.view.dispatch(programmatic.state.tr.insertText("->"));
    expect(programmatic.state.doc.textContent).toBe("->");
  });

  it("recognizes shorthand after ordinary typing replaces a text selection", () => {
    const harness = createHarness(paragraph("replace me"));
    harness.setSelection(1, harness.state.doc.content.size - 1);
    harness.type("->");

    expect(harness.state.doc.textContent).toBe("→");
  });

  it("does not run in code blocks or inline code", () => {
    const block = createHarness(
      schema.nodes.doc!.create(null, schema.nodes.code_block!.create())
    );
    block.type("->");
    expect(block.state.doc.textContent).toBe("->");

    const codeMark = schema.marks.code!.create();
    const inline = createHarness(paragraph("code", [codeMark]));
    inline.setCursor(4);
    inline.type("->");
    expect(inline.state.doc.textContent).toBe("cod->e");
    expect(inline.state.doc.firstChild?.lastChild?.marks[0]?.type.name).toBe("code");

    const storedInline = createHarness();
    storedInline.view.dispatch(
      storedInline.state.tr.setStoredMarks([codeMark])
    );
    storedInline.type("->");
    expect(storedInline.state.doc.textContent).toBe("->");
  });
});

function createHarness(initialDoc = paragraph("")) {
  const plugin = inlineReplacementsPlugin(schema);
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
    }
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
    setSelection(from: number, to: number) {
      view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
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
