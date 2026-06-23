import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { ReactElement } from "react";
import { baseKeymap, chainCommands, createParagraphNear, exitCode, liftEmptyBlock, newlineInCode, setBlockType, splitBlock, toggleMark } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { inputRules, textblockTypeInputRule, wrappingInputRule, type InputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { EditorState, type Command } from "prosemirror-state";
import { liftListItem, sinkListItem, splitListItem, wrapInList } from "prosemirror-schema-list";
import { EditorView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import { lightEditorSchema as schema, parseLightMarkdown, serializeLightMarkdown } from "./lightProseMirrorMarkdown";

export interface LightProseMirrorEditorHandle {
  focus: () => void;
  getMarkdown: () => string;
  markClean: (markdown: string) => void;
}

export interface LightProseMirrorEditorProps {
  documentKey: string;
  markdown: string;
  onDirty: () => void;
}

export const LightProseMirrorEditor = forwardRef<
  LightProseMirrorEditorHandle,
  LightProseMirrorEditorProps
>(function LightProseMirrorEditor({ documentKey, markdown, onDirty }, ref): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onDirtyRef = useRef(onDirty);
  const lastDocumentKeyRef = useRef(documentKey);
  const lastAppliedMarkdownRef = useRef(markdown);

  onDirtyRef.current = onDirty;

  useImperativeHandle(ref, () => ({
    focus() {
      viewRef.current?.focus();
    },
    getMarkdown() {
      return serializeEditorMarkdown(viewRef.current);
    },
    markClean(nextMarkdown: string) {
      lastAppliedMarkdownRef.current = nextMarkdown;
    }
  }), []);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const view = new EditorView(hostRef.current, {
      state: createEditorState(markdown),
      dispatchTransaction(transaction) {
        const nextState = view.state.apply(transaction);
        view.updateState(nextState);

        if (transaction.docChanged) {
          onDirtyRef.current();
        }
      },
      attributes: {
        class: "rumi-prosemirror"
      }
    });

    viewRef.current = view;
    lastDocumentKeyRef.current = documentKey;
    lastAppliedMarkdownRef.current = markdown;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    const documentChanged = documentKey !== lastDocumentKeyRef.current;
    const markdownChanged = markdown !== lastAppliedMarkdownRef.current;

    if (!documentChanged && !markdownChanged) {
      return;
    }

    view.updateState(createEditorState(markdown));
    lastDocumentKeyRef.current = documentKey;
    lastAppliedMarkdownRef.current = markdown;
  }, [documentKey, markdown]);

  return <div ref={hostRef} className="min-h-0" />;
});

function createEditorState(markdown: string): EditorState {
  return EditorState.create({
    doc: parseLightMarkdown(markdown),
    plugins: [
      history(),
      buildInputRules(),
      buildKeymap(),
      keymap(baseKeymap),
    ]
  });
}

function buildInputRules() {
  const rules: InputRule[] = [];
  const heading = schema.nodes.heading;
  const blockquote = schema.nodes.blockquote;
  const codeBlock = schema.nodes.code_block;
  const bulletList = schema.nodes.bullet_list;
  const orderedList = schema.nodes.ordered_list;

  if (heading) {
    rules.push(textblockTypeInputRule(/^(#{1,6})\s$/, heading, (match) => ({
      level: match[1]?.length ?? 1
    })));
  }

  if (blockquote) {
    rules.push(wrappingInputRule(/^\s*>\s$/, blockquote));
  }

  if (codeBlock) {
    rules.push(textblockTypeInputRule(/^```$/, codeBlock));
  }

  if (bulletList) {
    rules.push(wrappingInputRule(/^\s*([-+*])\s$/, bulletList));
  }

  if (orderedList) {
    rules.push(wrappingInputRule(/^(\d+)\.\s$/, orderedList, (match) => ({
      order: Number(match[1] ?? 1)
    })));
  }

  return inputRules({ rules });
}

function buildKeymap() {
  const keys: Record<string, Command> = {};
  const paragraph = schema.nodes.paragraph;
  const heading = schema.nodes.heading;
  const bulletList = schema.nodes.bullet_list;
  const orderedList = schema.nodes.ordered_list;
  const listItem = schema.nodes.list_item;
  const strong = schema.marks.strong;
  const em = schema.marks.em;
  const code = schema.marks.code;

  keys["Mod-z"] = undo;
  keys["Shift-Mod-z"] = redo;
  keys["Mod-y"] = redo;

  if (strong) {
    keys["Mod-b"] = toggleMark(strong);
  }

  if (em) {
    keys["Mod-i"] = toggleMark(em);
  }

  if (code) {
    keys["Mod-e"] = toggleMark(code);
  }

  if (paragraph) {
    keys["Mod-Alt-0"] = setBlockType(paragraph);
  }

  if (heading) {
    keys["Mod-Alt-1"] = setBlockType(heading, { level: 1 });
    keys["Mod-Alt-2"] = setBlockType(heading, { level: 2 });
    keys["Mod-Alt-3"] = setBlockType(heading, { level: 3 });
  }

  if (bulletList) {
    keys["Shift-Mod-8"] = wrapInList(bulletList);
  }

  if (orderedList) {
    keys["Shift-Mod-7"] = wrapInList(orderedList);
  }

  if (listItem) {
    keys.Enter = chainCommands(splitListItem(listItem), newlineInCode, createParagraphNear, liftEmptyBlock, splitBlock);
    keys.Tab = sinkListItem(listItem);
    keys["Shift-Tab"] = liftListItem(listItem);
  } else {
    keys.Enter = chainCommands(newlineInCode, createParagraphNear, liftEmptyBlock, splitBlock);
  }

  keys["Mod-Enter"] = exitCode;

  return keymap(keys);
}

function serializeEditorMarkdown(view: EditorView | null): string {
  if (!view) {
    return "";
  }

  return serializeLightMarkdown(view.state.doc);
}
