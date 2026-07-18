import {
  chainCommands,
  createParagraphNear,
  exitCode,
  liftEmptyBlock,
  newlineInCode,
  setBlockType,
  splitBlock,
  toggleMark,
  wrapIn
} from "prosemirror-commands";
import { redo, undo } from "prosemirror-history";
import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule
} from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import type { MarkType, NodeType, Schema } from "prosemirror-model";
import {
  NodeSelection,
  TextSelection,
  type Command,
  type EditorState,
  type Transaction
} from "prosemirror-state";
import { liftListItem, sinkListItem, splitListItem, wrapInList } from "prosemirror-schema-list";
import { goToNextCell } from "prosemirror-tables";

export function buildRumiInputRules(schema: Schema) {
  const rules: InputRule[] = [];
  const heading = schema.nodes.heading;
  const blockquote = schema.nodes.blockquote;
  const codeBlock = schema.nodes.code_block;
  const bulletList = schema.nodes.bullet_list;
  const orderedList = schema.nodes.ordered_list;

  if (heading) {
    rules.push(
      textblockTypeInputRule(/^(#{1,6})\s$/, heading, (match) => ({
        level: match[1]?.length ?? 1
      }))
    );
  }

  if (blockquote) {
    rules.push(wrappingInputRule(/^\s*>\s$/, blockquote));
  }

  if (codeBlock) {
    rules.push(
      textblockTypeInputRule(/^```([A-Za-z0-9_+-]+)?\s$/, codeBlock, (match) => ({
        params: match[1] ?? ""
      })),
      textblockTypeInputRule(/^```$/, codeBlock, () => ({ params: "" }))
    );
  }

  if (bulletList) {
    rules.push(wrappingInputRule(/^\s*([-+*])\s$/, bulletList));
  }

  if (orderedList) {
    rules.push(
      wrappingInputRule(/^(\d+)\.\s$/, orderedList, (match) => ({
        order: Number(match[1] ?? 1)
      }))
    );
  }

  const taskRule = createTaskListInputRule(schema);
  if (taskRule) rules.unshift(taskRule);

  const dividerRule = createDividerInputRule(schema);
  if (dividerRule) rules.push(dividerRule);

  pushMarkRule(rules, /\*\*([^*]+)\*\*$/, schema.marks.strong);
  pushMarkRule(rules, /(?<!\*)\*([^*]+)\*(?!\*)$/, schema.marks.em);
  pushMarkRule(rules, /(?<!_)_([^_]+)_(?!_)$/, schema.marks.em);
  pushMarkRule(rules, /~~([^~]+)~~$/, schema.marks.strike);
  pushMarkRule(rules, /`([^`]+)`$/, schema.marks.code);
  pushMarkRule(
    rules,
    /==([A-Za-z]+)::([^=]+)==$/,
    schema.marks.highlight,
    2,
    (match) => ({ color: normalizeHighlightColor(match[1]) })
  );
  pushMarkRule(rules, /==([^=]+)==$/, schema.marks.highlight);
  pushMarkRule(rules, /\+\+([^+]+)\+\+$/, schema.marks.underline);
  pushMarkRule(rules, /__([^_]+)__$/, schema.marks.underline);

  if (schema.marks.link) {
    rules.push(
      new InputRule(/\[([^\]]+)]\(([^)\s]+)\)$/, (state, match, start, end) => {
        const label = match[1];
        const href = match[2];
        if (!label || !href) return null;

        return state.tr
          .delete(start, end)
          .insert(start, schema.text(label, [schema.marks.link!.create({ href })]));
      })
    );
  }

  return inputRules({ rules });
}

export function buildRumiKeymap(schema: Schema) {
  const keys: Record<string, Command> = {};
  const paragraph = schema.nodes.paragraph;
  const heading = schema.nodes.heading;
  const bulletList = schema.nodes.bullet_list;
  const orderedList = schema.nodes.ordered_list;
  const listItem = schema.nodes.list_item;
  const hardBreak = schema.nodes.hard_break;

  keys["Mod-z"] = undo;
  keys["Shift-Mod-z"] = redo;
  keys["Mod-y"] = redo;

  for (const [shortcut, markName] of [
    ["Mod-b", "strong"],
    ["Mod-i", "em"],
    ["Mod-e", "code"],
    ["Mod-u", "underline"],
    ["Shift-Mod-s", "strike"],
    ["Shift-Mod-h", "highlight"]
  ] as const) {
    const mark = schema.marks[markName];
    if (mark) keys[shortcut] = toggleMark(mark);
  }

  if (paragraph) keys["Mod-Alt-0"] = setBlockType(paragraph);
  if (heading) {
    keys["Mod-Alt-1"] = setBlockType(heading, { level: 1 });
    keys["Mod-Alt-2"] = setBlockType(heading, { level: 2 });
    keys["Mod-Alt-3"] = setBlockType(heading, { level: 3 });
  }
  if (bulletList) keys["Shift-Mod-8"] = wrapInList(bulletList);
  if (orderedList) keys["Shift-Mod-7"] = wrapInList(orderedList);
  if (schema.nodes.blockquote) keys["Mod-Shift-."] = wrapIn(schema.nodes.blockquote);

  const enterCommands: Command[] = [enterAfterDivider(schema)];
  if (listItem) enterCommands.push(splitListItem(listItem));
  enterCommands.push(newlineInCode, createParagraphNear, liftEmptyBlock, splitBlock);
  keys.Enter = chainCommands(...enterCommands);

  keys.Tab = chainCommands(
    insertTabInCode(schema),
    goToNextCell(1),
    listItem ? consumeListCommand(sinkListItem(listItem), listItem) : () => false
  );
  keys["Shift-Tab"] = chainCommands(
    goToNextCell(-1),
    listItem ? consumeListCommand(liftListItem(listItem), listItem) : () => false
  );

  if (hardBreak) {
    keys["Shift-Enter"] = (state, dispatch) => {
      dispatch?.(state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView());
      return true;
    };
  }

  if (schema.nodes.horizontal_rule) {
    keys.ArrowDown = arrowDownFromDivider(schema);
  }

  if (schema.nodes.code_block) keys["Mod-Enter"] = exitCode;
  return keymap(keys);
}

export function createTaskListTransaction(
  state: EditorState,
  checked: boolean
): Transaction | null {
  const paragraph = state.schema.nodes.paragraph;
  const bulletList = state.schema.nodes.bullet_list;
  const listItem = state.schema.nodes.list_item;
  const { $from } = state.selection;

  if (!paragraph || !bulletList || !listItem || $from.parent.type !== paragraph || $from.depth !== 1) {
    return null;
  }

  const blockStart = $from.before();
  const blockEnd = $from.after();
  const item = listItem.create({ checked }, paragraph.create());
  const list = bulletList.create(null, item);
  const transaction = state.tr.replaceWith(blockStart, blockEnd, list);
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(blockStart + 3)));
  return transaction;
}

export function createDividerTransaction(state: EditorState): Transaction | null {
  const horizontalRule = state.schema.nodes.horizontal_rule;
  const paragraph = state.schema.nodes.paragraph;
  const { $from } = state.selection;

  if (!horizontalRule || !paragraph || $from.depth !== 1 || $from.parent.type !== paragraph) {
    return null;
  }

  const blockStart = $from.before();
  const transaction = state.tr.replaceWith(
    blockStart,
    $from.after(),
    [horizontalRule.create(), paragraph.create()]
  );
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(blockStart + 2)));
  return transaction;
}

function createTaskListInputRule(schema: Schema): InputRule | null {
  if (!schema.nodes.bullet_list || !schema.nodes.list_item || !schema.nodes.paragraph) return null;

  return new InputRule(/^\s*-\s\[([ xX])]\s$/, (state, match) =>
    createTaskListTransaction(state, match[1]?.toLocaleLowerCase() === "x")
  );
}

function createDividerInputRule(schema: Schema): InputRule | null {
  if (!schema.nodes.horizontal_rule || !schema.nodes.paragraph) return null;
  return new InputRule(/^(---|___|\*\*\*)$/, (state) => createDividerTransaction(state));
}

function pushMarkRule(
  rules: InputRule[],
  regexp: RegExp,
  markType: MarkType | undefined,
  contentIndex = 1,
  getAttrs?: (match: RegExpMatchArray) => Record<string, unknown>
): void {
  if (!markType) return;

  rules.push(
    new InputRule(regexp, (state, match, start, end) => {
      const content = match[contentIndex];
      if (!content) return null;

      const contentOffset = match[0].indexOf(content);
      const transaction = state.tr
        .delete(start, end)
        .insert(start, state.schema.text(content, [markType.create(getAttrs?.(match))]));
      transaction.removeStoredMark(markType);

      if (contentOffset < 0) return null;
      return transaction;
    })
  );
}

function normalizeHighlightColor(value: string | undefined): string {
  const color = value?.toLocaleLowerCase() ?? "yellow";
  return ["yellow", "green", "blue", "purple", "pink", "red", "orange", "gray"].includes(color)
    ? color
    : "yellow";
}

function consumeListCommand(command: Command, listItem: NodeType): Command {
  return (state, dispatch, view) => {
    const { $from } = state.selection;
    let insideList = false;

    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type === listItem) {
        insideList = true;
        break;
      }
    }

    if (!insideList) return false;
    command(state, dispatch, view);
    return true;
  };
}

function insertTabInCode(schema: Schema): Command {
  return (state, dispatch) => {
    if (state.selection.$from.parent.type !== schema.nodes.code_block) return false;
    dispatch?.(state.tr.insertText("\t").scrollIntoView());
    return true;
  };
}

function enterAfterDivider(schema: Schema): Command {
  return (state, dispatch) => {
    if (!(state.selection instanceof NodeSelection)) return false;
    const node = state.doc.nodeAt(state.selection.from);
    const paragraph = schema.nodes.paragraph;
    if (!node || node.type !== schema.nodes.horizontal_rule || !paragraph) return false;

    if (dispatch) {
      const pos = state.selection.to;
      const transaction = state.tr.insert(pos, paragraph.create());
      transaction.setSelection(TextSelection.near(transaction.doc.resolve(pos + 1)));
      dispatch(transaction.scrollIntoView());
    }
    return true;
  };
}

function arrowDownFromDivider(schema: Schema): Command {
  return (state, dispatch) => {
    if (!(state.selection instanceof NodeSelection)) return false;
    const node = state.doc.nodeAt(state.selection.from);
    if (!node || node.type !== schema.nodes.horizontal_rule) return false;

    const nextPos = state.selection.to;
    if (nextPos >= state.doc.content.size) return true;
    if (!dispatch) return true;

    const nextNode = state.doc.nodeAt(nextPos);
    const selection = nextNode?.type === schema.nodes.horizontal_rule
      ? NodeSelection.create(state.doc, nextPos)
      : TextSelection.near(state.doc.resolve(nextPos + 1));
    dispatch(state.tr.setSelection(selection).scrollIntoView());
    return true;
  };
}
