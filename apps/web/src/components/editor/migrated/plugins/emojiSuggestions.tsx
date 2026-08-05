import type { MarkType, Schema } from "prosemirror-model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { createRoot, type Root } from "react-dom/client";
import {
  EmojiPicker,
  emojiOptionId,
  type EmojiPickerPresentation
} from "../../../emoji/EmojiPicker";
import {
  type EmojiDefinition,
  type EmojiSearchResult
} from "../../../emoji/emojiCatalog";
import {
  claimSuggestionMenu,
  suggestionMenuClaim
} from "./suggestionMenus";

export const emojiSuggestionsPluginKey = new PluginKey<EmojiSuggestionState>(
  "emojiSuggestions"
);

export interface EmojiSuggestionPickerConfig {
  presentation?: EmojiPickerPresentation;
  columns?: number;
  maxResults?: number;
  label?: string;
  allowedEmoji?: ReadonlySet<string> | ((emoji: EmojiDefinition) => boolean);
}

export interface EmojiSuggestionsPluginOptions {
  enabled?: boolean;
  workspaceKey?: string;
  picker?: EmojiSuggestionPickerConfig;
  searchEmoji?: EmojiSearchFunction;
}

type EmojiSearchFunction = typeof import("../../../emoji/emojiCatalog")["searchEmoji"];

interface EmojiQueryRange {
  from: number;
  to: number;
}

interface EmojiInsertionHistory {
  from: number;
  to: number;
  query: string;
  emoji: string;
}

interface EmojiSuggestionState {
  enabled: boolean;
  active: boolean;
  query: string;
  range: EmojiQueryRange | null;
  focusedIndex: number;
  lastInsertion: EmojiInsertionHistory | null;
  customRedo: EmojiInsertionHistory | null;
}

interface EmojiSuggestionMeta {
  enabled?: boolean;
  active?: boolean;
  query?: string;
  range?: EmojiQueryRange | null;
  focusedIndex?: number;
  lastInsertion?: EmojiInsertionHistory | null;
  customRedo?: EmojiInsertionHistory | null;
}

const PICKER_ID = "rumi-editor-emoji-picker";
const RECENT_LIMIT = 24;
let loadedEmojiSearch: EmojiSearchFunction | null = null;
let emojiSearchPromise: Promise<EmojiSearchFunction> | null = null;

function loadEmojiSearch(): Promise<EmojiSearchFunction> {
  emojiSearchPromise ??= import("../../../emoji/emojiCatalog")
    .then((module) => {
      loadedEmojiSearch = module.searchEmoji;
      return module.searchEmoji;
    })
    .catch((error: unknown) => {
      emojiSearchPromise = null;
      throw error;
    });
  return emojiSearchPromise;
}

export function emojiSuggestionsPlugin(
  schema: Schema,
  options: EmojiSuggestionsPluginOptions = {}
): Plugin<EmojiSuggestionState> {
  const initialEnabled = options.enabled ?? true;
  const pickerConfig = options.picker ?? {};
  const columns = pickerConfig.columns ?? 8;

  return new Plugin<EmojiSuggestionState>({
    key: emojiSuggestionsPluginKey,
    state: {
      init: () => ({
        enabled: initialEnabled,
        active: false,
        query: "",
        range: null,
        focusedIndex: 0,
        lastInsertion: null,
        customRedo: null
      }),
      apply(transaction, pluginState) {
        let nextState = pluginState;
        const claim = suggestionMenuClaim(transaction);
        if (claim && claim !== "emoji" && pluginState.active) {
          nextState = closeState(pluginState);
        }

        const meta = transaction.getMeta(emojiSuggestionsPluginKey) as
          | EmojiSuggestionMeta
          | undefined;
        if (meta) {
          return {
            enabled: meta.enabled ?? nextState.enabled,
            active: meta.active ?? nextState.active,
            query: meta.query ?? nextState.query,
            range: meta.range !== undefined ? meta.range : nextState.range,
            focusedIndex: meta.focusedIndex ?? nextState.focusedIndex,
            lastInsertion: meta.lastInsertion !== undefined
              ? meta.lastInsertion
              : nextState.lastInsertion,
            customRedo: meta.customRedo !== undefined
              ? meta.customRedo
              : nextState.customRedo
          };
        }

        if (transaction.docChanged) {
          return {
            ...closeState(nextState),
            lastInsertion: null,
            customRedo: null
          };
        }
        if (transaction.selectionSet) {
          const range = nextState.range;
          const selectionInsideQuery = Boolean(
            nextState.active &&
            range &&
            transaction.selection.empty &&
            transaction.selection.from >= range.from + 1 &&
            transaction.selection.from <= range.to
          );
          return {
            ...(selectionInsideQuery ? nextState : closeState(nextState)),
            lastInsertion: null,
            customRedo: null
          };
        }
        return nextState;
      }
    },
    props: {
      handleTextInput(view, from, to, text) {
        const pluginState = emojiSuggestionsPluginKey.getState(view.state);
        if (!pluginState?.enabled || view.composing) return false;

        if (pluginState.active && pluginState.range) {
          if (
            from === to &&
            from === pluginState.range.to &&
            isEmojiQueryInput(text)
          ) {
            const query = `${pluginState.query}${text}`;
            const transaction = view.state.tr
              .insertText(text, from, to)
              .setMeta(emojiSuggestionsPluginKey, {
                query,
                range: { from: pluginState.range.from, to: from + text.length },
                focusedIndex: 0,
                lastInsertion: null,
                customRedo: null
              } satisfies EmojiSuggestionMeta);
            view.dispatch(transaction);
            return true;
          }

          view.dispatch(
            view.state.tr.setMeta(emojiSuggestionsPluginKey, {
              active: false,
              query: "",
              range: null,
              focusedIndex: 0
            } satisfies EmojiSuggestionMeta)
          );
          return false;
        }

        if (
          text !== ":" ||
          !isEligibleEmojiTrigger(view.state, from, to, schema)
        ) {
          return false;
        }

        let transaction = view.state.tr
          .insertText(text, from, to)
          .setMeta(emojiSuggestionsPluginKey, {
            active: true,
            query: "",
            range: { from, to: from + 1 },
            focusedIndex: 0,
            lastInsertion: null,
            customRedo: null
          } satisfies EmojiSuggestionMeta);
        transaction = claimSuggestionMenu(transaction, "emoji");
        view.dispatch(transaction);
        if (!options.searchEmoji && !loadedEmojiSearch) {
          void loadEmojiSearch().catch(() => undefined);
        }
        return true;
      },
      handleKeyDown(view, event) {
        const pluginState = emojiSuggestionsPluginKey.getState(view.state);
        if (!pluginState) return false;

        if (isUndoShortcut(event) && !event.shiftKey && pluginState.lastInsertion) {
          return restoreEmojiQuery(view, pluginState.lastInsertion);
        }
        if (isUndoShortcut(event) && event.shiftKey && pluginState.customRedo) {
          return reapplyEmoji(view, pluginState.customRedo);
        }
        if (!pluginState.active || !pluginState.range) return false;

        const searchEmoji = options.searchEmoji ?? loadedEmojiSearch;
        if (!searchEmoji && event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          void loadEmojiSearch().catch(() => undefined);
          return true;
        }
        const results = searchEmoji
          ? resultsForState(pluginState, options, searchEmoji)
          : [];
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          const delta = event.key === "ArrowRight" ? 1 : columns;
          return focusResult(view, Math.min(
            Math.max(0, results.length - 1),
            pluginState.focusedIndex + delta
          ), event);
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          const delta = event.key === "ArrowLeft" ? 1 : columns;
          return focusResult(view, Math.max(0, pluginState.focusedIndex - delta), event);
        }
        if (event.key === "Home") {
          return focusResult(view, 0, event);
        }
        if (event.key === "End") {
          return focusResult(view, Math.max(0, results.length - 1), event);
        }
        if (event.key === "Enter") {
          const result = results[pluginState.focusedIndex] ?? results[0];
          if (!result) {
            closeEmojiSuggestions(view);
            return false;
          }
          event.preventDefault();
          event.stopPropagation();
          insertEmoji(view, result, pluginState, options.workspaceKey ?? "");
          return true;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeEmojiSuggestions(view);
          return true;
        }
        if (event.key === "Backspace") {
          event.preventDefault();
          event.stopPropagation();
          if (pluginState.query) {
            const deleteFrom = pluginState.range.to - 1;
            const query = pluginState.query.slice(0, -1);
            const transaction = view.state.tr
              .delete(deleteFrom, pluginState.range.to)
              .setMeta(emojiSuggestionsPluginKey, {
                query,
                range: { from: pluginState.range.from, to: deleteFrom },
                focusedIndex: 0
              } satisfies EmojiSuggestionMeta);
            view.dispatch(transaction);
          } else {
            const transaction = view.state.tr
              .delete(pluginState.range.from, pluginState.range.to)
              .setMeta(emojiSuggestionsPluginKey, {
                active: false,
                query: "",
                range: null,
                focusedIndex: 0
              } satisfies EmojiSuggestionMeta);
            view.dispatch(transaction);
          }
          return true;
        }
        if (event.key === "Tab") {
          closeEmojiSuggestions(view);
          return false;
        }
        return false;
      }
    },
    view(editorView) {
      if (typeof document === "undefined") return {};

      const host = document.createElement("div");
      host.dataset.rumiEmojiPickerHost = "true";
      document.body.appendChild(host);
      const root: Root = createRoot(host);
      let destroyed = false;
      let searchLoadRequested = false;

      const renderPicker = () => {
        const pluginState = emojiSuggestionsPluginKey.getState(editorView.state);
        if (!pluginState) return;
        if (!pluginState.active) {
          editorView.dom.removeAttribute("aria-expanded");
          editorView.dom.removeAttribute("aria-controls");
          editorView.dom.removeAttribute("aria-activedescendant");
          root.render(null);
          return;
        }

        const searchEmoji = options.searchEmoji ?? loadedEmojiSearch;
        if (!searchEmoji) {
          if (!searchLoadRequested) {
            searchLoadRequested = true;
            void loadEmojiSearch().then(
              () => {
                searchLoadRequested = false;
                if (!destroyed) renderPicker();
              },
              () => {
                searchLoadRequested = false;
              }
            );
          }
          root.render(null);
          return;
        }

        const results = resultsForState(pluginState, options, searchEmoji);
        const focusedIndex = Math.min(
          pluginState.focusedIndex,
          Math.max(0, results.length - 1)
        );
        const anchor = pluginState.range
          ? editorView.coordsAtPos(pluginState.range.to)
          : undefined;

        editorView.dom.setAttribute("aria-expanded", "true");
        editorView.dom.setAttribute("aria-controls", PICKER_ID);
        if (results[focusedIndex]) {
          editorView.dom.setAttribute(
            "aria-activedescendant",
            emojiOptionId(PICKER_ID, focusedIndex)
          );
        } else {
          editorView.dom.removeAttribute("aria-activedescendant");
        }

        root.render(
          <EmojiPicker
            id={PICKER_ID}
            open
            query={pluginState.query}
            items={results}
            focusedIndex={focusedIndex}
            {...(anchor ? { anchor } : {})}
            {...(pickerConfig.presentation
              ? { presentation: pickerConfig.presentation }
              : {})}
            columns={columns}
            {...(pickerConfig.label ? { label: pickerConfig.label } : {})}
            onFocusedIndexChange={(index) => {
              editorView.dispatch(
                editorView.state.tr.setMeta(emojiSuggestionsPluginKey, {
                  focusedIndex: index
                } satisfies EmojiSuggestionMeta)
              );
            }}
            onSelect={(emoji) => {
              const state = emojiSuggestionsPluginKey.getState(editorView.state);
              if (state?.active && state.range) {
                insertEmoji(editorView, emoji, state, options.workspaceKey ?? "");
              }
            }}
          />
        );
      };

      const handleOutsidePointerDown = (event: PointerEvent) => {
        if (host.contains(event.target as Node)) return;
        const pluginState = emojiSuggestionsPluginKey.getState(editorView.state);
        if (pluginState?.active) closeEmojiSuggestions(editorView);
      };
      document.addEventListener("pointerdown", handleOutsidePointerDown);
      renderPicker();

      return {
        update: renderPicker,
        destroy() {
          destroyed = true;
          document.removeEventListener("pointerdown", handleOutsidePointerDown);
          editorView.dom.removeAttribute("aria-expanded");
          editorView.dom.removeAttribute("aria-controls");
          editorView.dom.removeAttribute("aria-activedescendant");
          root.unmount();
          host.remove();
        }
      };
    }
  });
}

export function setEmojiSuggestionsEnabled(view: EditorView, enabled: boolean): void {
  const current = emojiSuggestionsPluginKey.getState(view.state);
  if (!current || current.enabled === enabled) return;
  view.dispatch(
    view.state.tr.setMeta(emojiSuggestionsPluginKey, {
      enabled,
      active: enabled ? current.active : false,
      query: enabled ? current.query : "",
      range: enabled ? current.range : null,
      focusedIndex: enabled ? current.focusedIndex : 0,
      lastInsertion: null,
      customRedo: null
    } satisfies EmojiSuggestionMeta)
  );
}

function resultsForState(
  state: EmojiSuggestionState,
  options: EmojiSuggestionsPluginOptions,
  searchEmoji: EmojiSearchFunction
): EmojiSearchResult[] {
  return searchEmoji(state.query, {
    limit: options.picker?.maxResults ?? 80,
    recent: state.query ? [] : readRecentEmoji(options.workspaceKey ?? ""),
    ...(options.picker?.allowedEmoji
      ? { allowedEmoji: options.picker.allowedEmoji }
      : {})
  });
}

function insertEmoji(
  view: EditorView,
  emoji: EmojiSearchResult,
  state: EmojiSuggestionState,
  workspaceKey: string
): void {
  if (!state.range) return;
  const query = `:${state.query}`;
  const transaction = view.state.tr
    .insertText(emoji.emoji, state.range.from, state.range.to)
    .setMeta(emojiSuggestionsPluginKey, {
      active: false,
      query: "",
      range: null,
      focusedIndex: 0,
      lastInsertion: {
        from: state.range.from,
        to: state.range.from + emoji.emoji.length,
        query,
        emoji: emoji.emoji
      },
      customRedo: null
    } satisfies EmojiSuggestionMeta);
  transaction.setSelection(
    TextSelection.create(transaction.doc, state.range.from + emoji.emoji.length)
  );
  view.dispatch(transaction.scrollIntoView());
  writeRecentEmoji(workspaceKey, emoji.emoji);
  view.focus();
}

function restoreEmojiQuery(
  view: EditorView,
  insertion: EmojiInsertionHistory
): boolean {
  if (view.state.doc.textBetween(insertion.from, insertion.to) !== insertion.emoji) return false;
  const transaction = view.state.tr
    .insertText(insertion.query, insertion.from, insertion.to)
    .setMeta("addToHistory", false)
    .setMeta(emojiSuggestionsPluginKey, {
      lastInsertion: null,
      customRedo: {
        ...insertion,
        to: insertion.from + insertion.query.length
      }
    } satisfies EmojiSuggestionMeta);
  transaction.setSelection(
    TextSelection.create(transaction.doc, insertion.from + insertion.query.length)
  );
  view.dispatch(transaction);
  return true;
}

function reapplyEmoji(
  view: EditorView,
  insertion: EmojiInsertionHistory
): boolean {
  if (view.state.doc.textBetween(insertion.from, insertion.to) !== insertion.query) return false;
  const transaction = view.state.tr
    .insertText(insertion.emoji, insertion.from, insertion.to)
    .setMeta("addToHistory", false)
    .setMeta(emojiSuggestionsPluginKey, {
      lastInsertion: {
        ...insertion,
        to: insertion.from + insertion.emoji.length
      },
      customRedo: null
    } satisfies EmojiSuggestionMeta);
  transaction.setSelection(
    TextSelection.create(transaction.doc, insertion.from + insertion.emoji.length)
  );
  view.dispatch(transaction);
  return true;
}

function focusResult(view: EditorView, index: number, event: KeyboardEvent): true {
  event.preventDefault();
  event.stopPropagation();
  view.dispatch(
    view.state.tr.setMeta(emojiSuggestionsPluginKey, {
      focusedIndex: index
    } satisfies EmojiSuggestionMeta)
  );
  return true;
}

function closeEmojiSuggestions(view: EditorView): void {
  view.dispatch(
    view.state.tr.setMeta(emojiSuggestionsPluginKey, {
      active: false,
      query: "",
      range: null,
      focusedIndex: 0
    } satisfies EmojiSuggestionMeta)
  );
}

function closeState(state: EmojiSuggestionState): EmojiSuggestionState {
  return {
    ...state,
    active: false,
    query: "",
    range: null,
    focusedIndex: 0
  };
}

function isEligibleEmojiTrigger(
  state: EditorState,
  from: number,
  to: number,
  schema: Schema
): boolean {
  if (from !== to || !state.selection.empty) return false;
  const $from = state.doc.resolve(from);
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return false;

  const allowed = new Set([
    schema.nodes.paragraph,
    schema.nodes.heading,
    schema.nodes.bullet_item,
    schema.nodes.numbered_item,
    schema.nodes.task_item
  ].filter(Boolean));
  if (!allowed.has($from.parent.type)) return false;

  const code = schema.marks.code as MarkType | undefined;
  if (code && state.storedMarks?.some((mark) => mark.type === code)) return false;
  if (code && $from.marks().some((mark) => mark.type === code)) return false;

  if ($from.parentOffset === 0) return true;
  const previous = $from.parent.textBetween(
    $from.parentOffset - 1,
    $from.parentOffset,
    undefined,
    "\ufffc"
  );
  return /[\s([{]/u.test(previous);
}

function isEmojiQueryInput(text: string): boolean {
  return /^[A-Za-z0-9_+\-]+$/u.test(text);
}

function recentEmojiStorageKey(workspaceKey: string): string {
  return `rumi-new-recent-emoji:${encodeURIComponent(workspaceKey)}`;
}

function readRecentEmoji(workspaceKey: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(
      window.localStorage.getItem(recentEmojiStorageKey(workspaceKey)) ?? "[]"
    ) as unknown;
    return Array.isArray(value)
      ? value.filter((emoji): emoji is string => typeof emoji === "string")
      : [];
  } catch {
    return [];
  }
}

function writeRecentEmoji(workspaceKey: string, emoji: string): void {
  if (typeof window === "undefined") return;
  try {
    const recent = [
      emoji,
      ...readRecentEmoji(workspaceKey).filter((item) => item !== emoji)
    ].slice(0, RECENT_LIMIT);
    window.localStorage.setItem(
      recentEmojiStorageKey(workspaceKey),
      JSON.stringify(recent)
    );
  } catch {
    // Browser storage is an optional convenience; insertion must still succeed.
  }
}

function isUndoShortcut(event: KeyboardEvent): boolean {
  return event.key.toLowerCase() === "z" && (event.metaKey || event.ctrlKey) && !event.altKey;
}
