import type { MarkType, Schema } from "prosemirror-model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

export const inlineReplacementsPluginKey = new PluginKey<InlineReplacementState>(
  "inlineReplacements"
);

export interface InlineReplacement {
  source: string;
  replacement: string;
}

interface ReplacementHistory {
  from: number;
  to: number;
  source: string;
  replacement: string;
  trailingLength: number;
}

interface InlineReplacementState {
  enabled: boolean;
  lastReplacement: ReplacementHistory | null;
  customRedo: ReplacementHistory | null;
}

interface InlineReplacementMeta {
  enabled?: boolean;
  lastReplacement?: ReplacementHistory | null;
  customRedo?: ReplacementHistory | null;
}

export const INLINE_REPLACEMENTS: readonly InlineReplacement[] = Object.freeze([
  { source: "<->", replacement: "↔" },
  { source: "<=>", replacement: "⇔" },
  { source: "(tm)", replacement: "™" },
  { source: "->", replacement: "→" },
  { source: "<-", replacement: "←" },
  { source: "=>", replacement: "⇒" },
  { source: "<=", replacement: "≤" },
  { source: ">=", replacement: "≥" },
  { source: "!=", replacement: "≠" },
  { source: "~=", replacement: "≈" },
  { source: "+-", replacement: "±" },
  { source: "...", replacement: "…" },
  { source: "(c)", replacement: "©" },
  { source: "(r)", replacement: "®" }
]);

const LEGAL_REPLACEMENTS = new Map([
  ["(c)", "©"],
  ["(r)", "®"],
  ["(tm)", "™"]
]);

const DIRECT_REPLACEMENTS = INLINE_REPLACEMENTS.filter(
  ({ source }) => !LEGAL_REPLACEMENTS.has(source) && source !== "<->" && source !== "<=>"
);

const CHAINED_REPLACEMENTS = new Map([
  ["←>", { source: "<->", replacement: "↔", previousSource: "<-" }],
  ["≤>", { source: "<=>", replacement: "⇔", previousSource: "<=" }]
]);

export function inlineReplacementsPlugin(
  schema: Schema,
  enabled = true
): Plugin<InlineReplacementState> {
  return new Plugin<InlineReplacementState>({
    key: inlineReplacementsPluginKey,
    state: {
      init: () => ({
        enabled,
        lastReplacement: null,
        customRedo: null
      }),
      apply(transaction, pluginState) {
        const meta = transaction.getMeta(inlineReplacementsPluginKey) as
          | InlineReplacementMeta
          | undefined;
        if (meta) {
          return {
            enabled: meta.enabled ?? pluginState.enabled,
            lastReplacement: meta.lastReplacement !== undefined
              ? meta.lastReplacement
              : pluginState.lastReplacement,
            customRedo: meta.customRedo !== undefined
              ? meta.customRedo
              : pluginState.customRedo
          };
        }

        if (transaction.docChanged || transaction.selectionSet) {
          return {
            ...pluginState,
            lastReplacement: null,
            customRedo: null
          };
        }
        return pluginState;
      }
    },
    props: {
      handleTextInput(view, from, to, text) {
        const pluginState = inlineReplacementsPluginKey.getState(view.state);
        if (
          !pluginState?.enabled ||
          view.composing ||
          !isEligibleTextPosition(view.state, from, to, schema)
        ) {
          return false;
        }

        const chained = chainedReplacementAtInput(pluginState, view.state, from, to, text);
        if (chained) {
          applyReplacement(
            view,
            chained.from,
            to,
            chained.source,
            chained.replacement
          );
          return true;
        }

        const direct = directReplacementAtInput(view.state, from, text);
        if (direct) {
          applyReplacement(view, direct.from, to, direct.source, direct.replacement);
          return true;
        }

        const legal = legalReplacementBeforeBoundary(view.state, from, text);
        if (legal) {
          applyReplacement(
            view,
            legal.from,
            to,
            legal.source,
            `${legal.replacement}${text}`,
            legal.replacement
          );
          return true;
        }

        return false;
      },
      handleKeyDown(view, event) {
        const pluginState = inlineReplacementsPluginKey.getState(view.state);
        if (!pluginState) return false;

        if (isUndoShortcut(event) && !event.shiftKey && pluginState.lastReplacement) {
          return restoreReplacementSource(view, pluginState.lastReplacement);
        }
        if (isUndoShortcut(event) && event.shiftKey && pluginState.customRedo) {
          return reapplyReplacement(view, pluginState.customRedo);
        }
        if (!pluginState.enabled || event.key !== "Enter" || view.composing) return false;

        const legal = legalReplacementAtCursor(view.state);
        if (!legal) return false;

        const transaction = view.state.tr
          .insertText(legal.replacement, legal.from, view.state.selection.from)
          .setMeta(inlineReplacementsPluginKey, {
            lastReplacement: {
              from: legal.from,
              to: legal.from + legal.replacement.length,
              source: legal.source,
              replacement: legal.replacement,
              trailingLength: 0
            },
            customRedo: null
          } satisfies InlineReplacementMeta);
        view.dispatch(transaction);
        return false;
      }
    }
  });
}

export function setInlineReplacementsEnabled(view: EditorView, enabled: boolean): void {
  const current = inlineReplacementsPluginKey.getState(view.state);
  if (!current || current.enabled === enabled) return;
  view.dispatch(
    view.state.tr.setMeta(inlineReplacementsPluginKey, {
      enabled,
      lastReplacement: null,
      customRedo: null
    } satisfies InlineReplacementMeta)
  );
}

function applyReplacement(
  view: EditorView,
  from: number,
  to: number,
  source: string,
  insertedText: string,
  historyReplacement = insertedText
): void {
  const transaction = view.state.tr.insertText(insertedText, from, to);
  const replacementTo = from + historyReplacement.length;
  transaction.setSelection(TextSelection.create(transaction.doc, from + insertedText.length));
  transaction.setMeta(inlineReplacementsPluginKey, {
    lastReplacement: {
      from,
      to: replacementTo,
      source,
      replacement: historyReplacement,
      trailingLength: insertedText.length - historyReplacement.length
    },
    customRedo: null
  } satisfies InlineReplacementMeta);
  view.dispatch(transaction);
}

function directReplacementAtInput(
  state: EditorState,
  from: number,
  text: string
): (InlineReplacement & { from: number }) | null {
  const $from = state.doc.resolve(from);
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
  const candidate = `${textBefore}${text}`;

  for (const replacement of DIRECT_REPLACEMENTS) {
    if (!candidate.endsWith(replacement.source)) continue;
    return {
      ...replacement,
      from: from - (replacement.source.length - text.length)
    };
  }
  return null;
}

function chainedReplacementAtInput(
  pluginState: InlineReplacementState,
  state: EditorState,
  from: number,
  to: number,
  text: string
): (InlineReplacement & { from: number }) | null {
  if (from !== to || text !== ">" || !pluginState.lastReplacement) return null;
  const previous = pluginState.lastReplacement;
  if (previous.to !== from) return null;
  const visibleText = state.doc.textBetween(previous.from, previous.to);
  const chained = CHAINED_REPLACEMENTS.get(`${visibleText}${text}`);
  if (!chained || chained.previousSource !== previous.source) return null;
  return {
    from: previous.from,
    source: chained.source,
    replacement: chained.replacement
  };
}

function legalReplacementBeforeBoundary(
  state: EditorState,
  from: number,
  text: string
): (InlineReplacement & { from: number }) | null {
  if (!isLegalBoundary(text)) return null;
  const match = legalReplacementEndingAt(state, from);
  return match && hasLegalLeadingBoundary(state, match.from) ? match : null;
}

function legalReplacementAtCursor(
  state: EditorState
): (InlineReplacement & { from: number }) | null {
  if (!state.selection.empty) return null;
  const match = legalReplacementEndingAt(state, state.selection.from);
  return match && hasLegalLeadingBoundary(state, match.from) ? match : null;
}

function legalReplacementEndingAt(
  state: EditorState,
  position: number
): (InlineReplacement & { from: number }) | null {
  const $position = state.doc.resolve(position);
  const textBefore = $position.parent.textBetween(
    0,
    $position.parentOffset,
    undefined,
    "\ufffc"
  );
  const normalized = textBefore.toLowerCase();

  for (const [source, replacement] of [...LEGAL_REPLACEMENTS].sort(
    ([left], [right]) => right.length - left.length
  )) {
    if (!normalized.endsWith(source)) continue;
    return { source: textBefore.slice(-source.length), replacement, from: position - source.length };
  }
  return null;
}

function hasLegalLeadingBoundary(state: EditorState, from: number): boolean {
  const $from = state.doc.resolve(from);
  if ($from.parentOffset === 0) return true;
  const previous = $from.parent.textBetween(
    $from.parentOffset - 1,
    $from.parentOffset,
    undefined,
    "\ufffc"
  );
  return /\s/u.test(previous);
}

function isLegalBoundary(text: string): boolean {
  return /^[\s.,;:!?)}\]]$/u.test(text);
}

function isEligibleTextPosition(
  state: EditorState,
  from: number,
  to: number,
  schema: Schema
): boolean {
  const $from = state.doc.resolve(from);
  const $to = state.doc.resolve(to);
  if ($from.parent !== $to.parent || !$from.parent.isTextblock) return false;

  const allowed = new Set([
    schema.nodes.paragraph,
    schema.nodes.heading,
    schema.nodes.bullet_item,
    schema.nodes.numbered_item,
    schema.nodes.task_item
  ].filter(Boolean));
  if (!allowed.has($from.parent.type) || $from.parent.type.spec.code) return false;

  const code = schema.marks.code as MarkType | undefined;
  if (!code) return true;
  if (state.storedMarks?.some((mark) => mark.type === code)) return false;
  if ($from.marks().some((mark) => mark.type === code)) return false;
  return from === to || !state.doc.rangeHasMark(from, to, code);
}

function restoreReplacementSource(
  view: EditorView,
  replacement: ReplacementHistory
): boolean {
  if (view.state.doc.textBetween(replacement.from, replacement.to) !== replacement.replacement) {
    return false;
  }
  const transaction = view.state.tr
    .insertText(replacement.source, replacement.from, replacement.to)
    .setMeta("addToHistory", false)
    .setMeta(inlineReplacementsPluginKey, {
      lastReplacement: null,
      customRedo: {
        ...replacement,
        to: replacement.from + replacement.source.length
      }
    } satisfies InlineReplacementMeta);
  transaction.setSelection(
    TextSelection.create(
      transaction.doc,
      replacement.from + replacement.source.length + replacement.trailingLength
    )
  );
  view.dispatch(transaction);
  return true;
}

function reapplyReplacement(
  view: EditorView,
  replacement: ReplacementHistory
): boolean {
  if (view.state.doc.textBetween(replacement.from, replacement.to) !== replacement.source) {
    return false;
  }
  const transaction = view.state.tr
    .insertText(replacement.replacement, replacement.from, replacement.to)
    .setMeta("addToHistory", false)
    .setMeta(inlineReplacementsPluginKey, {
      lastReplacement: {
        ...replacement,
        to: replacement.from + replacement.replacement.length
      },
      customRedo: null
    } satisfies InlineReplacementMeta);
  transaction.setSelection(
    TextSelection.create(
      transaction.doc,
      replacement.from + replacement.replacement.length + replacement.trailingLength
    )
  );
  view.dispatch(transaction);
  return true;
}

function isUndoShortcut(event: KeyboardEvent): boolean {
  return event.key.toLowerCase() === "z" && (event.metaKey || event.ctrlKey) && !event.altKey;
}
