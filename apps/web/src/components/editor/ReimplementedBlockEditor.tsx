import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react";
import type { ReactElement } from "react";
import { createPortal } from "react-dom";
import { Code } from "@phosphor-icons/react/dist/csr/Code";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { DotsSixVertical } from "@phosphor-icons/react/dist/csr/DotsSixVertical";
import { HighlighterCircle } from "@phosphor-icons/react/dist/csr/HighlighterCircle";
import { LinkSimple } from "@phosphor-icons/react/dist/csr/LinkSimple";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { TextB } from "@phosphor-icons/react/dist/csr/TextB";
import { TextItalic } from "@phosphor-icons/react/dist/csr/TextItalic";
import { TextStrikethrough } from "@phosphor-icons/react/dist/csr/TextStrikethrough";
import { TextUnderline } from "@phosphor-icons/react/dist/csr/TextUnderline";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { type Mark, type Node as ProseMirrorNode } from "prosemirror-model";
import { EditorState, NodeSelection, TextSelection, type Command } from "prosemirror-state";
import { liftListItem, sinkListItem } from "prosemirror-schema-list";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  columnResizing,
  deleteColumn,
  deleteRow,
  isInTable,
  tableEditing
} from "prosemirror-tables";
import { EditorView, type NodeView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import "prosemirror-tables/style/tables.css";
import {
  blockSelectionPlugin,
  canNestListItem,
  canMoveSelectedBlocks,
  collectSelectableBlockPositions,
  createDeleteSelectedBlocksTransaction,
  createDuplicateSelectedBlocksTransaction,
  createNestListItemTransaction,
  createMoveSelectedBlocksTransaction,
  getBlockSelection,
  isBlockSelected,
  replaceBlockSelection,
  selectableBlockPositionAt,
  setBlockSelection
} from "./blockSelection";
import { buildRumiInputRules, buildRumiKeymap } from "./editorActions";
import {
  BLOCK_CONVERSION_OPTIONS,
  changeBlockType,
  filterSlashCommands,
  slashCommandItems,
  type BlockConversionType,
  type SlashCommandItem
} from "./editorCommands";
import {
  codeBlockNodeView,
  collapsibleHeadingPlugin,
  databaseEmbedNodeView,
  fileEmbedNodeView,
  headingNodeView,
  imageBlockNodeView
} from "./editorNodeViews";
import { rumiPastePlugin } from "./editorPaste";
import { lightEditorSchema as schema, parseLightMarkdown, serializeLightMarkdown } from "./lightProseMirrorMarkdown";

export interface RumiBlockEditorHandle {
  focus: () => void;
  getMarkdown: () => string;
  markClean: (markdown: string) => void;
}

export interface RumiBlockEditorProps {
  documentKey: string;
  markdown: string;
  documents?: readonly RumiDocumentLink[];
  onOpenDocument?: (path: string) => void;
  onUploadAsset?: (file: File) => Promise<string>;
  onDirty: () => void;
}

export interface RumiDocumentLink {
  path: string;
  title: string;
}

interface SlashMenuState {
  from: number;
  to: number;
  query: string;
  left: number;
  top: number;
}

interface MentionMenuState extends SlashMenuState {}

interface LinkEditorState {
  from: number;
  to: number;
  text: string;
  href: string;
  left: number;
  top: number;
}

interface SelectionToolbarState {
  left: number;
  top: number;
}

interface TableToolbarState {
  left: number;
  top: number;
}

interface ActiveBlockState {
  pos: number;
  left: number;
  right: number;
  top: number;
  height: number;
  handleLeft: number;
  handleTop: number;
}

interface BlockMenuState {
  pos: number;
  left: number;
  top: number;
}

interface DraggedBlock {
  positions: number[];
  primaryPos: number;
  startX: number;
  isListItem: boolean;
}

type ListDragIntent = "reorder" | "indent" | "outdent";

interface DropIndicatorState {
  left: number;
  top: number;
  width: number;
}

interface AreaSelectionState {
  left: number;
  top: number;
  width: number;
  height: number;
}

const LIST_DRAG_INDENT_THRESHOLD = 36;
const LIST_DRAG_OUTDENT_THRESHOLD = 28;
const BLOCK_HOVER_GUTTER = 72;
const BLOCK_HOVER_VERTICAL_TOLERANCE = 12;

const HIGHLIGHT_COLORS = [
  ["yellow", "#fef08a"],
  ["green", "#bbf7d0"],
  ["blue", "#bfdbfe"],
  ["purple", "#ddd6fe"],
  ["pink", "#fbcfe8"],
  ["red", "#fecaca"],
  ["orange", "#fed7aa"],
  ["gray", "#e5e7eb"]
] as const;

export const RumiBlockEditor = forwardRef<RumiBlockEditorHandle, RumiBlockEditorProps>(
  function RumiBlockEditor(
    { documentKey, markdown, documents = [], onOpenDocument, onUploadAsset, onDirty },
    ref
  ): ReactElement {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const hostRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onDirtyRef = useRef(onDirty);
    const lastDocumentKeyRef = useRef(documentKey);
    const lastAppliedMarkdownRef = useRef(markdown);
    const slashStateRef = useRef<SlashMenuState | null>(null);
    const slashIndexRef = useRef(0);
    const mentionStateRef = useRef<MentionMenuState | null>(null);
    const mentionIndexRef = useRef(0);
    const documentsRef = useRef(documents);
    const onOpenDocumentRef = useRef(onOpenDocument);
    const onUploadAssetRef = useRef(onUploadAsset);
    const activeBlockRef = useRef<ActiveBlockState | null>(null);
    const draggedBlockRef = useRef<DraggedBlock | null>(null);
    const blockMenuRef = useRef<BlockMenuState | null>(null);
    const dragStartXRef = useRef(0);
    const suppressHandleClickRef = useRef(false);
    const hoverAnimationFrameRef = useRef(0);
    const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
    const [slashIndex, setSlashIndex] = useState(0);
    const [mentionMenu, setMentionMenu] = useState<MentionMenuState | null>(null);
    const [mentionIndex, setMentionIndex] = useState(0);
    const [linkEditor, setLinkEditor] = useState<LinkEditorState | null>(null);
    const [highlightPaletteOpen, setHighlightPaletteOpen] = useState(false);
    const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbarState | null>(null);
    const [tableToolbar, setTableToolbar] = useState<TableToolbarState | null>(null);
    const [activeBlock, setActiveBlock] = useState<ActiveBlockState | null>(null);
    const [blockMenu, setBlockMenu] = useState<BlockMenuState | null>(null);
    const [dropIndicator, setDropIndicator] = useState<DropIndicatorState | null>(null);
    const [areaSelection, setAreaSelection] = useState<AreaSelectionState | null>(null);

    onDirtyRef.current = onDirty;
    slashStateRef.current = slashMenu;
    slashIndexRef.current = slashIndex;
    mentionStateRef.current = mentionMenu;
    mentionIndexRef.current = mentionIndex;
    documentsRef.current = documents;
    onOpenDocumentRef.current = onOpenDocument;
    onUploadAssetRef.current = onUploadAsset;
    activeBlockRef.current = activeBlock;
    blockMenuRef.current = blockMenu;

    const slashCommands = slashCommandItems(onUploadAssetRef.current);
    const visibleSlashCommands = filterSlashCommands(slashCommands, slashMenu?.query ?? "");
    const visibleMentionDocuments = filterMentionDocuments(documents, mentionMenu?.query ?? "");

    const refreshEditorUi = useCallback((view: EditorView) => {
      const nextSlash = slashMenuState(view);
      setSlashMenu((current) => {
        if (!nextSlash || !current || nextSlash.query !== current.query) {
          slashIndexRef.current = 0;
          setSlashIndex(0);
        }

        return nextSlash;
      });
      setSelectionToolbar(selectionToolbarState(view));
      setTableToolbar(tableToolbarState(view));
      const nextMention = mentionMenuState(view);
      setMentionMenu((current) => {
        if (!nextMention || !current || nextMention.query !== current.query) {
          mentionIndexRef.current = 0;
          setMentionIndex(0);
        }
        return nextMention;
      });
    }, []);

    const runSlashCommand = useCallback((item: SlashCommandItem) => {
      const view = viewRef.current;
      const menu = slashStateRef.current;

      if (!view || !menu) {
        return;
      }

      view.dispatch(view.state.tr.delete(menu.from, menu.to));
      item.run(view);
      view.focus();
      setSlashMenu(null);
    }, []);

    const runMention = useCallback((document: RumiDocumentLink) => {
      const view = viewRef.current;
      const menu = mentionStateRef.current;
      const link = schema.marks.link;
      if (!view || !menu || !link) return;

      const transaction = view.state.tr
        .delete(menu.from, menu.to)
        .insert(menu.from, schema.text(document.title, [link.create({ href: document.path })]));
      view.dispatch(transaction.scrollIntoView());
      view.focus();
      setMentionMenu(null);
    }, []);

    const openEditorHref = useCallback((href: string) => {
      const normalized = normalizeEditorHref(href);
      if (!normalized) return;
      if (isExternalHref(normalized)) {
        window.open(normalized, "_blank", "noopener,noreferrer");
      } else {
        onOpenDocumentRef.current?.(normalized);
      }
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        focus() {
          viewRef.current?.focus();
        },
        getMarkdown() {
          return serializeEditorMarkdown(viewRef.current);
        },
        markClean(nextMarkdown: string) {
          lastAppliedMarkdownRef.current = nextMarkdown;
        }
      }),
      []
    );

    useEffect(() => {
      if (!hostRef.current) {
        return;
      }

      const view = new EditorView(hostRef.current, {
        state: createEditorState(markdown, onUploadAssetRef.current),
        dispatchTransaction(transaction) {
          const nextState = view.state.apply(transaction);
          view.updateState(nextState);

          if (transaction.docChanged) {
            onDirtyRef.current();
          }

          refreshEditorUi(view);
        },
        attributes: {
          class: "rumi-prosemirror rumi-block-editor"
        },
        nodeViews: {
          heading: (node, editorView, getPos) => headingNodeView(node, editorView, getPos),
          code_block: (node, editorView, getPos) => codeBlockNodeView(node, editorView, getPos),
          file_embed: (node) => fileEmbedNodeView(node),
          image_block: (node) => imageBlockNodeView(node),
          database_embed: (node, editorView, getPos) =>
            databaseEmbedNodeView(node, editorView, getPos, openEditorHref),
          list_item: (node, editorView, getPos) => taskListItemNodeView(node, editorView, getPos)
        },
        handleClick(editorView, pos, event) {
          const target = event.target;
          const anchor = target instanceof Element ? target.closest("a[href]") : null;
          if (!(anchor instanceof HTMLAnchorElement)) return false;

          const range = linkRangeAt(editorView.state, pos);
          if (!range) return false;
          event.preventDefault();
          const rect = anchor.getBoundingClientRect();
          setLinkEditor({
            ...range,
            left: Math.max(8, Math.min(rect.left, window.innerWidth - 320)),
            top: rect.bottom + 8
          });
          return true;
        },
        handleKeyDown(editorView, event) {
          const slash = slashStateRef.current;
          if (slash) {
            const items = filterSlashCommands(slashCommandItems(onUploadAssetRef.current), slash.query);

            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const delta = event.key === "ArrowDown" ? 1 : -1;
              const next = items.length > 0
                ? (slashIndexRef.current + delta + items.length) % items.length
                : 0;
              slashIndexRef.current = next;
              setSlashIndex(next);
              return true;
            }

            if ((event.key === "Enter" || event.key === "Tab") && items[slashIndexRef.current]) {
              event.preventDefault();
              runSlashCommand(items[slashIndexRef.current]!);
              return true;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              setSlashMenu(null);
              return true;
            }
          }

          const mention = mentionStateRef.current;
          if (!mention) return false;
          const matches = filterMentionDocuments(documentsRef.current, mention.query);

          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const delta = event.key === "ArrowDown" ? 1 : -1;
            const next = matches.length > 0
              ? (mentionIndexRef.current + delta + matches.length) % matches.length
              : 0;
            mentionIndexRef.current = next;
            setMentionIndex(next);
            return true;
          }

          if ((event.key === "Enter" || event.key === "Tab") && matches[mentionIndexRef.current]) {
            event.preventDefault();
            runMention(matches[mentionIndexRef.current]!);
            return true;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            setMentionMenu(null);
            return true;
          }

          return false;
        }
      });

      const handleMouseMove = (event: MouseEvent) => {
        if (draggedBlockRef.current) return;

        const target = event.target;
        if (target instanceof Element && target.closest("[data-rumi-editor-overlay]")) return;

        const editorRect = view.dom.getBoundingClientRect();
        const nearEditor =
          event.clientX >= editorRect.left - BLOCK_HOVER_GUTTER &&
          event.clientX <= editorRect.right &&
          event.clientY >= editorRect.top &&
          event.clientY <= editorRect.bottom;

        if (hoverAnimationFrameRef.current) {
          cancelAnimationFrame(hoverAnimationFrameRef.current);
        }

        hoverAnimationFrameRef.current = requestAnimationFrame(() => {
          const candidate = nearEditor
            ? blockAtCoordinates(view, event.clientX, event.clientY)
            : null;
          const block = candidate && isWithinBlockHoverZone(candidate, event.clientX, event.clientY)
            ? candidate
            : null;
          const current = activeBlockRef.current;

          if (
            current?.pos === block?.pos &&
            current?.top === block?.top &&
            current?.left === block?.left &&
            current?.handleLeft === block?.handleLeft
          ) {
            return;
          }

          if (!blockMenuRef.current || block) {
            setActiveBlock(block);
          }
        });
      };
      let areaStart: { x: number; y: number } | null = null;
      let lastAreaPositions = "";
      let areaSelectionFrame = 0;
      let pendingAreaPoint: { x: number; y: number } | null = null;

      const updateAreaSelection = (clientX: number, clientY: number) => {
        if (!areaStart) return;

        const left = Math.min(areaStart.x, clientX);
        const top = Math.min(areaStart.y, clientY);
        const right = Math.max(areaStart.x, clientX);
        const bottom = Math.max(areaStart.y, clientY);
        setAreaSelection({
          left,
          top,
          width: Math.max(2, right - left),
          height: Math.max(2, bottom - top)
        });

        const selected = collectSelectableBlockPositions(view.state.doc).filter((pos) => {
          const block = blockGeometryAtPosition(view, pos);
          return block !== null && block.top <= bottom && block.top + block.height >= top;
        });
        const serialized = selected.join(",");

        if (serialized !== lastAreaPositions) {
          lastAreaPositions = serialized;
          replaceBlockSelection(view, selected);
        }
      };

      const handleAreaSelectionMove = (event: MouseEvent) => {
        pendingAreaPoint = { x: event.clientX, y: event.clientY };

        if (areaSelectionFrame) return;
        areaSelectionFrame = requestAnimationFrame(() => {
          areaSelectionFrame = 0;
          const point = pendingAreaPoint;
          pendingAreaPoint = null;
          if (point) updateAreaSelection(point.x, point.y);
        });
      };

      const handleAreaSelectionEnd = (event: MouseEvent) => {
        if (!areaStart) return;

        if (areaSelectionFrame) {
          cancelAnimationFrame(areaSelectionFrame);
          areaSelectionFrame = 0;
        }

        pendingAreaPoint = null;
        updateAreaSelection(event.clientX, event.clientY);
        areaStart = null;
        lastAreaPositions = "";
        setAreaSelection(null);
        document.removeEventListener("mousemove", handleAreaSelectionMove);
        document.removeEventListener("mouseup", handleAreaSelectionEnd);
        view.focus();
      };

      const handleAreaSelectionStart = (event: MouseEvent) => {
        if (event.button !== 0) return;

        const target = event.target;
        if (target instanceof Element && target.closest("[data-rumi-editor-overlay]")) return;

        const editorRect = view.dom.getBoundingClientRect();
        const inLeftGutter =
          event.clientX >= editorRect.left - 88 && event.clientX <= editorRect.left - 6;
        const inEditorHeight =
          event.clientY >= editorRect.top && event.clientY <= editorRect.bottom;

        if (!inLeftGutter || !inEditorHeight) return;

        event.preventDefault();
        event.stopPropagation();
        areaStart = { x: event.clientX, y: event.clientY };
        lastAreaPositions = "";
        updateAreaSelection(event.clientX, event.clientY);
        document.addEventListener("mousemove", handleAreaSelectionMove);
        document.addEventListener("mouseup", handleAreaSelectionEnd);
      };
      const refreshOnScroll = () => {
        refreshEditorUi(view);
        const current = activeBlockRef.current;

        if (current) {
          setActiveBlock(blockGeometryAtPosition(view, current.pos));
        }
      };
      const closeEditorOverlays = (event: MouseEvent) => {
        const target = event.target;
        if (target instanceof Element && target.closest("[data-rumi-editor-overlay]")) return;
        setBlockMenu(null);
        setLinkEditor(null);
        setHighlightPaletteOpen(false);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mousedown", handleAreaSelectionStart, true);
      document.addEventListener("mousedown", closeEditorOverlays);
      window.addEventListener("scroll", refreshOnScroll, true);
      viewRef.current = view;
      lastDocumentKeyRef.current = documentKey;
      lastAppliedMarkdownRef.current = markdown;
      refreshEditorUi(view);

      return () => {
        if (hoverAnimationFrameRef.current) {
          cancelAnimationFrame(hoverAnimationFrameRef.current);
        }

        if (areaSelectionFrame) {
          cancelAnimationFrame(areaSelectionFrame);
        }

        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mousedown", handleAreaSelectionStart, true);
        document.removeEventListener("mousedown", closeEditorOverlays);
        document.removeEventListener("mousemove", handleAreaSelectionMove);
        document.removeEventListener("mouseup", handleAreaSelectionEnd);
        window.removeEventListener("scroll", refreshOnScroll, true);
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

      view.updateState(createEditorState(markdown, onUploadAssetRef.current));
      lastDocumentKeyRef.current = documentKey;
      lastAppliedMarkdownRef.current = markdown;
      setBlockMenu(null);
      setActiveBlock(null);
      setDropIndicator(null);
      refreshEditorUi(view);
    }, [documentKey, markdown, refreshEditorUi]);

    const applyMark = useCallback((markName: string, attrs?: Record<string, unknown>) => {
      const view = viewRef.current;
      const mark = schema.marks[markName];

      if (view && mark) {
        toggleMark(mark, attrs)(view.state, view.dispatch, view);
        view.focus();
        refreshEditorUi(view);
      }
    }, [refreshEditorUi]);

    const clearHighlight = useCallback(() => {
      const view = viewRef.current;
      const highlight = schema.marks.highlight;
      if (!view || !highlight || view.state.selection.empty) return;
      view.dispatch(view.state.tr.removeMark(view.state.selection.from, view.state.selection.to, highlight));
      setHighlightPaletteOpen(false);
      view.focus();
    }, []);

    const runTableCommand = useCallback((command: Command) => {
      const view = viewRef.current;
      if (!view) return;
      command(view.state, view.dispatch, view);
      view.focus();
      refreshEditorUi(view);
    }, [refreshEditorUi]);

    const startSelectionLinkEditor = useCallback(() => {
      const view = viewRef.current;
      if (!view || view.state.selection.empty) return;

      const { from, to } = view.state.selection;
      const start = view.coordsAtPos(from);
      const end = view.coordsAtPos(to);
      const existing = linkMarkInRange(view.state, from, to);
      setLinkEditor({
        from,
        to,
        text: view.state.doc.textBetween(from, to),
        href: existing?.attrs.href ? String(existing.attrs.href) : "",
        left: Math.max(8, Math.min((start.left + end.right) / 2 - 150, window.innerWidth - 320)),
        top: Math.max(8, Math.min(start.top, end.top) - 116)
      });
    }, []);

    const applyLinkEditor = useCallback((nextText: string, nextHref: string) => {
      const view = viewRef.current;
      const current = linkEditor;
      const link = schema.marks.link;
      const href = normalizeEditorHref(nextHref);
      if (!view || !current || !link || !nextText.trim() || !href) return;

      const transaction = view.state.tr
        .delete(current.from, current.to)
        .insert(current.from, schema.text(nextText.trim(), [link.create({ href })]));
      view.dispatch(transaction.scrollIntoView());
      setLinkEditor(null);
      view.focus();
    }, [linkEditor]);

    const removeLink = useCallback(() => {
      const view = viewRef.current;
      const current = linkEditor;
      const link = schema.marks.link;
      if (!view || !current || !link) return;
      view.dispatch(view.state.tr.removeMark(current.from, current.to, link));
      setLinkEditor(null);
      view.focus();
    }, [linkEditor]);

    const openLink = useCallback((href: string) => {
      openEditorHref(href);
      setLinkEditor(null);
    }, [openEditorHref]);

    const addBlock = useCallback((pos: number, after: boolean) => {
      const view = viewRef.current;
      const paragraph = schema.nodes.paragraph;

      if (!view || !paragraph) {
        return;
      }

      const target = view.state.doc.nodeAt(pos);
      const listItem = schema.nodes.list_item;
      const inserted = target && listItem && target.type === listItem
        ? listItem.create(
            target.attrs.checked === null ? null : { checked: false },
            paragraph.create()
          )
        : paragraph.create();
      const insertPos = after && target ? pos + target.nodeSize : pos;
      const transaction = view.state.tr.insert(insertPos, inserted);
      const textStart = insertPos + (inserted.type === listItem ? 2 : 1);
      transaction.setSelection(TextSelection.near(transaction.doc.resolve(textStart)));
      view.dispatch(transaction);
      view.focus();
    }, []);

    const mutateBlock = useCallback((action: "duplicate" | "delete") => {
      const view = viewRef.current;
      const menu = blockMenu;

      if (!view || !menu) {
        return;
      }

      const node = view.state.doc.nodeAt(menu.pos);

      if (!node) {
        return;
      }

      const selected = getBlockSelection(view.state);
      const positions = selected.selectedBlocks.includes(menu.pos)
        ? selected.selectedBlocks
        : [menu.pos];

      if (action === "duplicate") {
        const transaction = createDuplicateSelectedBlocksTransaction(view.state, positions);
        if (transaction) view.dispatch(transaction);
      } else if (action === "delete") {
        const transaction = createDeleteSelectedBlocksTransaction(view.state, positions);
        if (transaction) view.dispatch(transaction);
      }

      setBlockMenu(null);
      view.focus();
    }, [blockMenu]);

    const convertBlock = useCallback((type: BlockConversionType) => {
      const view = viewRef.current;
      if (!view || !blockMenu) return;
      changeBlockType(view, blockMenu.pos, type);
      setBlockMenu(null);
      view.focus();
    }, [blockMenu]);

    const dropAtCoordinates = useCallback((clientX: number, clientY: number) => {
      const view = viewRef.current;
      const dragged = draggedBlockRef.current;

      if (!view || !dragged) {
        return;
      }

      const target = blockAtCoordinates(view, clientX, clientY);

      if (!target) {
        draggedBlockRef.current = null;
        setDropIndicator(null);
        return;
      }

      const intent = listDragIntent(dragged, clientX);
      const targetNode = view.state.doc.nodeAt(target.pos);

      if (intent === "indent" && targetNode?.type.name === "list_item") {
        if (target.pos === dragged.primaryPos) {
          const listItem = schema.nodes.list_item;
          if (listItem) sinkListItem(listItem)(view.state, view.dispatch, view);
        } else {
          const transaction = createNestListItemTransaction(
            view.state,
            dragged.primaryPos,
            target.pos
          );
          if (transaction) view.dispatch(transaction);
        }

        draggedBlockRef.current = null;
        setDropIndicator(null);
        view.focus();
        return;
      }

      const insertAfterTarget = clientY > target.top + target.height / 2;
      const transaction = createMoveSelectedBlocksTransaction(
        view.state,
        dragged.positions,
        target.pos,
        insertAfterTarget
      );
      const canAdjustIndent =
        dragged.positions.length === 1 &&
        dragged.isListItem &&
        (transaction !== null || target.pos === dragged.primaryPos);

      if (transaction) {
        view.dispatch(transaction);
      }

      if (canAdjustIndent) {
        const listItem = schema.nodes.list_item;

        if (listItem && intent === "outdent") {
          liftListItem(listItem)(view.state, view.dispatch, view);
        }
      }

      draggedBlockRef.current = null;
      setDropIndicator(null);
      view.focus();
    }, []);

    const updateDragIndicator = useCallback((clientX: number, clientY: number) => {
      const dragged = draggedBlockRef.current;
      const view = viewRef.current;

      if (!dragged || !view) return;

      const target = blockAtCoordinates(view, clientX, clientY);
      const intent = listDragIntent(dragged, clientX);
      const targetNode = target ? view.state.doc.nodeAt(target.pos) : null;
      const isSelfIndentChange = Boolean(
        target &&
        intent !== "reorder" &&
        target.pos === dragged.primaryPos
      );
      const isNestDrop = Boolean(
        target &&
        intent === "indent" &&
        dragged.positions.length === 1 &&
        targetNode?.type.name === "list_item" &&
        canNestListItem(view.state.doc, dragged.primaryPos, target.pos)
      );

      if (
        !target ||
        (!isSelfIndentChange &&
          !isNestDrop &&
          !canMoveSelectedBlocks(view.state.doc, dragged.positions, target.pos))
      ) {
        setDropIndicator(null);
        return;
      }

      const insertAfterTarget = intent === "indent"
        ? true
        : clientY > target.top + target.height / 2;
      const indentationOffset = dragged.isListItem
        ? intent === "indent"
          ? 24
          : intent === "outdent"
            ? -24
            : 0
        : 0;
      const nextIndicator = {
        left: target.left + indentationOffset,
        top: insertAfterTarget ? target.top + target.height : target.top,
        width: Math.max(48, target.right - target.left - indentationOffset)
      };
      setDropIndicator((current) =>
        current?.left === nextIndicator.left &&
        current.top === nextIndicator.top &&
        current.width === nextIndicator.width
          ? current
          : nextIndicator
      );
    }, []);

    useEffect(() => {
      const handleDocumentDragOver = (event: DragEvent) => {
        if (!draggedBlockRef.current) return;
        event.preventDefault();
        updateDragIndicator(event.clientX, event.clientY);
      };
      const handleDocumentDrop = (event: DragEvent) => {
        if (!draggedBlockRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        dropAtCoordinates(event.clientX, event.clientY);
      };

      document.addEventListener("dragover", handleDocumentDragOver);
      document.addEventListener("drop", handleDocumentDrop);
      return () => {
        document.removeEventListener("dragover", handleDocumentDragOver);
        document.removeEventListener("drop", handleDocumentDrop);
      };
    }, [dropAtCoordinates, updateDragIndicator]);

    const blockMenuSelection = blockMenu && viewRef.current
      ? getBlockSelection(viewRef.current.state)
      : null;
    const blockMenuSelectionCount =
      blockMenu && blockMenuSelection?.selectedBlocks.includes(blockMenu.pos)
        ? blockMenuSelection.selectedBlocks.length
        : 1;
    const blockMenuIsBulk = blockMenuSelectionCount > 1;

    return (
      <div
        ref={wrapperRef}
        className="relative"
      >
        <div ref={hostRef} className="min-h-0" />

        {areaSelection && createPortal(
          <div
            data-rumi-editor-overlay
            className="rumi-block-area-selection fixed z-10"
            style={{
              left: areaSelection.left,
              top: areaSelection.top,
              width: areaSelection.width,
              height: areaSelection.height
            }}
          />,
          document.body
        )}

        {dropIndicator && createPortal(
          <div
            data-rumi-editor-overlay
            className="rumi-block-drop-indicator fixed z-30"
            style={{
              left: dropIndicator.left,
              top: dropIndicator.top - 1,
              width: dropIndicator.width
            }}
          />,
          document.body
        )}

        {activeBlock && createPortal(
          <div
            data-rumi-editor-overlay
            className="fixed z-20 flex items-center rounded-md border border-border bg-background p-0.5 shadow-sm"
            style={{ left: activeBlock.handleLeft, top: activeBlock.handleTop }}
            onMouseLeave={(event) => {
              if (draggedBlockRef.current) {
                return;
              }

              if (isWithinBlockHoverZone(activeBlock, event.clientX, event.clientY)) {
                return;
              }

              const nextTarget = event.relatedTarget;

              if (nextTarget instanceof Node && wrapperRef.current?.contains(nextTarget)) {
                return;
              }

              if (!blockMenuRef.current) {
                setActiveBlock(null);
              }
            }}
          >
            <button
              type="button"
              className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Add block above"
              aria-label="Add block above"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => addBlock(activeBlock.pos, false)}
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              draggable
              className="grid h-6 w-6 cursor-grab place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
              title="Drag or open block menu"
              aria-label="Block actions"
              onMouseDown={(event) => {
                event.stopPropagation();
                dragStartXRef.current = event.clientX;

                const view = viewRef.current;

                if (!view || event.button !== 0) return;

                if (event.shiftKey) {
                  setBlockSelection(view, activeBlock.pos, "range");
                } else if (event.metaKey || event.ctrlKey) {
                  setBlockSelection(view, activeBlock.pos, "toggle");
                } else if (!isBlockSelected(view.state, activeBlock.pos)) {
                  setBlockSelection(view, activeBlock.pos, "single");
                }
              }}
              onDragStart={(event) => {
                const view = viewRef.current;
                const node = view?.state.doc.nodeAt(activeBlock.pos);

                if (view && node) {
                  const selected = getBlockSelection(view.state);
                  const positions = selected.selectedBlocks.includes(activeBlock.pos)
                    ? selected.selectedBlocks
                    : [activeBlock.pos];
                  draggedBlockRef.current = {
                    positions,
                    primaryPos: activeBlock.pos,
                    startX: dragStartXRef.current,
                    isListItem: node.type.name === "list_item"
                  };
                  suppressHandleClickRef.current = true;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/x-rumi-block", positions.join(","));
                }
              }}
              onMouseUp={() => viewRef.current?.focus()}
              onDragEnd={() => {
                draggedBlockRef.current = null;
                setDropIndicator(null);
                viewRef.current?.focus();
                window.setTimeout(() => {
                  suppressHandleClickRef.current = false;
                }, 0);
              }}
              onClick={() => {
                if (suppressHandleClickRef.current) return;

                setBlockMenu({
                  pos: activeBlock.pos,
                  left: activeBlock.handleLeft,
                  top: activeBlock.handleTop + 32
                });
              }}
            >
              <DotsSixVertical size={15} weight="bold" />
            </button>
          </div>,
          document.body
        )}

        {blockMenu && createPortal(
          <div
            data-rumi-editor-overlay
            className="fixed z-50 max-h-[min(34rem,calc(100vh-1rem))] w-52 overflow-y-auto rounded-md border border-border bg-background p-1 text-sm shadow-lg"
            style={{ left: blockMenu.left, top: blockMenu.top }}
          >
            <BlockMenuButton
              icon={<Plus size={15} />}
              label="Add above"
              disabled={blockMenuIsBulk}
              onClick={() => {
                addBlock(blockMenu.pos, false);
                setBlockMenu(null);
              }}
            />
            <BlockMenuButton
              icon={<Plus size={15} />}
              label="Add below"
              disabled={blockMenuIsBulk}
              onClick={() => {
                addBlock(blockMenu.pos, true);
                setBlockMenu(null);
              }}
            />
            <BlockMenuButton
              icon={<Copy size={15} />}
              label={blockMenuIsBulk ? `Duplicate ${blockMenuSelectionCount} blocks` : "Duplicate"}
              onClick={() => mutateBlock("duplicate")}
            />
            <div className="my-1 border-t border-border" />
            <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Change type</p>
            {BLOCK_CONVERSION_OPTIONS.map((option) => (
              <BlockMenuButton
                key={option.type}
                icon={option.icon}
                label={option.label}
                disabled={blockMenuIsBulk}
                onClick={() => convertBlock(option.type)}
              />
            ))}
            <div className="my-1 border-t border-border" />
            <BlockMenuButton
              icon={<Trash size={15} />}
              label={blockMenuIsBulk ? `Delete ${blockMenuSelectionCount} blocks` : "Delete"}
              destructive
              onClick={() => mutateBlock("delete")}
            />
          </div>,
          document.body
        )}

        {selectionToolbar && createPortal(
          <div
            data-rumi-editor-overlay
            className="fixed z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-md border border-border bg-background p-1 shadow-lg"
            style={{ left: selectionToolbar.left, top: selectionToolbar.top }}
            onMouseDown={(event) => event.preventDefault()}
          >
            <ToolbarButton label="Bold" icon={<TextB size={15} weight="bold" />} onClick={() => applyMark("strong")} />
            <ToolbarButton label="Italic" icon={<TextItalic size={15} />} onClick={() => applyMark("em")} />
            <ToolbarButton label="Underline" icon={<TextUnderline size={15} />} onClick={() => applyMark("underline")} />
            <ToolbarButton label="Strikethrough" icon={<TextStrikethrough size={15} />} onClick={() => applyMark("strike")} />
            <ToolbarButton label="Inline code" icon={<Code size={15} />} onClick={() => applyMark("code")} />
            <span className="relative">
              <ToolbarButton
                label="Highlight color"
                icon={<HighlighterCircle size={15} />}
                onClick={() => setHighlightPaletteOpen((open) => !open)}
              />
              {highlightPaletteOpen && (
                <span className="absolute left-1/2 top-9 z-50 flex -translate-x-1/2 items-center gap-1 rounded-md border border-border bg-background p-1.5 shadow-lg">
                  {HIGHLIGHT_COLORS.map(([color, value]) => (
                    <button
                      key={color}
                      type="button"
                      className="h-5 w-5 rounded-full border border-black/10"
                      style={{ backgroundColor: value }}
                      title={`${color} highlight`}
                      aria-label={`${color} highlight`}
                      onClick={() => {
                        applyMark("highlight", { color });
                        setHighlightPaletteOpen(false);
                      }}
                    />
                  ))}
                  <button type="button" className="h-5 rounded px-1 text-[10px] text-muted-foreground hover:bg-muted" onClick={clearHighlight}>
                    Clear
                  </button>
                </span>
              )}
            </span>
            <ToolbarButton label="Add or edit link" icon={<LinkSimple size={15} />} onClick={startSelectionLinkEditor} />
          </div>,
          document.body
        )}

        {linkEditor && createPortal(
          <LinkEditorPopover
            key={`${linkEditor.from}:${linkEditor.to}:${linkEditor.href}`}
            state={linkEditor}
            onApply={applyLinkEditor}
            onRemove={removeLink}
            onOpen={openLink}
            onClose={() => {
              setLinkEditor(null);
              viewRef.current?.focus();
            }}
          />,
          document.body
        )}

        {tableToolbar && createPortal(
          <div
            data-rumi-editor-overlay
            className="fixed z-40 flex items-center gap-1 rounded-md border border-border bg-background p-1 text-xs shadow-lg"
            style={{ left: tableToolbar.left, top: tableToolbar.top }}
            onMouseDown={(event) => event.preventDefault()}
          >
            <span className="px-1 text-muted-foreground">Row</span>
            <TableToolbarButton label="Add row above" onClick={() => runTableCommand(addRowBefore)}>+↑</TableToolbarButton>
            <TableToolbarButton label="Add row below" onClick={() => runTableCommand(addRowAfter)}>+↓</TableToolbarButton>
            <TableToolbarButton label="Delete row" destructive onClick={() => runTableCommand(deleteRow)}>−</TableToolbarButton>
            <span className="mx-1 h-5 border-l border-border" />
            <span className="px-1 text-muted-foreground">Column</span>
            <TableToolbarButton label="Add column left" onClick={() => runTableCommand(addColumnBefore)}>+←</TableToolbarButton>
            <TableToolbarButton label="Add column right" onClick={() => runTableCommand(addColumnAfter)}>+→</TableToolbarButton>
            <TableToolbarButton label="Delete column" destructive onClick={() => runTableCommand(deleteColumn)}>−</TableToolbarButton>
          </div>,
          document.body
        )}

        {slashMenu && createPortal(
          <div
            data-rumi-editor-overlay
            className="fixed z-50 max-h-80 w-72 overflow-y-auto rounded-md border border-border bg-background p-1 shadow-xl"
            style={{ left: Math.min(slashMenu.left, window.innerWidth - 304), top: slashMenu.top }}
          >
            {visibleSlashCommands.length > 0 ? (
              visibleSlashCommands.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left ${
                    index === slashIndex ? "bg-muted" : "hover:bg-muted/70"
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => {
                    slashIndexRef.current = index;
                    setSlashIndex(index);
                  }}
                  onClick={() => runSlashCommand(item)}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded border border-border bg-muted/50">
                    {item.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                  </span>
                </button>
              ))
            ) : (
              <p className="px-3 py-4 text-sm text-muted-foreground">No matching block type.</p>
            )}
          </div>,
          document.body
        )}

        {mentionMenu && createPortal(
          <div
            data-rumi-editor-overlay
            className="fixed z-50 max-h-72 w-72 overflow-y-auto rounded-md border border-border bg-background p-1 shadow-xl"
            style={{ left: Math.min(mentionMenu.left, window.innerWidth - 304), top: mentionMenu.top }}
          >
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Link to a Rumi document</p>
            {visibleMentionDocuments.length > 0 ? visibleMentionDocuments.slice(0, 20).map((document, index) => (
              <button
                key={document.path}
                type="button"
                className={`block w-full rounded-md px-2 py-2 text-left ${index === mentionIndex ? "bg-muted" : "hover:bg-muted/70"}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => {
                  mentionIndexRef.current = index;
                  setMentionIndex(index);
                }}
                onClick={() => runMention(document)}
              >
                <span className="block truncate text-sm font-medium">{document.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{document.path}</span>
              </button>
            )) : (
              <p className="px-2 py-3 text-sm text-muted-foreground">No matching document.</p>
            )}
          </div>,
          document.body
        )}
      </div>
    );
  }
);

function createEditorState(
  markdown: string,
  uploadAsset?: (file: File) => Promise<string>
): EditorState {
  return EditorState.create({
    doc: parseLightMarkdown(markdown),
    plugins: [
      history(),
      collapsibleHeadingPlugin(),
      buildRumiInputRules(schema),
      rumiPastePlugin(schema, uploadAsset),
      blockSelectionPlugin(),
      buildRumiKeymap(schema),
      keymap(baseKeymap),
      columnResizing(),
      tableEditing()
    ]
  });
}

function slashMenuState(view: EditorView): SlashMenuState | null {
  const { selection } = view.state;

  if (!selection.empty || !selection.$from.parent.isTextblock) {
    return null;
  }

  const textBefore = selection.$from.parent.textBetween(0, selection.$from.parentOffset, "\0", "\0");
  const match = /(?:^|\s)\/([\w-]*)$/.exec(textBefore);

  if (!match) {
    return null;
  }

  const query = match[1] ?? "";
  const from = selection.from - query.length - 1;
  const coords = view.coordsAtPos(selection.from);

  return {
    from,
    to: selection.from,
    query,
    left: coords.left,
    top: coords.bottom + 6
  };
}

function mentionMenuState(view: EditorView): MentionMenuState | null {
  const { selection } = view.state;
  if (!selection.empty || !selection.$from.parent.isTextblock) return null;

  const textBefore = selection.$from.parent.textBetween(
    0,
    selection.$from.parentOffset,
    "\0",
    "\0"
  );
  const match = /(?:^|\s)@([^@\n]*)$/.exec(textBefore);
  if (!match) return null;

  const query = match[1] ?? "";
  const coords = view.coordsAtPos(selection.from);
  return {
    from: selection.from - query.length - 1,
    to: selection.from,
    query,
    left: coords.left,
    top: coords.bottom + 6
  };
}

export function filterMentionDocuments(
  documents: readonly RumiDocumentLink[],
  query: string
): RumiDocumentLink[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...documents];

  return documents
    .filter((document) =>
      document.title.toLocaleLowerCase().includes(normalized) ||
      document.path.toLocaleLowerCase().includes(normalized)
    )
    .sort((left, right) => {
      const leftStarts = left.title.toLocaleLowerCase().startsWith(normalized) ? 0 : 1;
      const rightStarts = right.title.toLocaleLowerCase().startsWith(normalized) ? 0 : 1;
      return leftStarts - rightStarts || left.title.localeCompare(right.title);
    });
}

function linkRangeAt(state: EditorState, pos: number): LinkEditorState | null {
  const linkType = state.schema.marks.link;
  if (!linkType) return null;
  const $pos = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)));
  const parent = $pos.parent;
  const parentStart = $pos.start();
  const segments: Array<{ from: number; to: number; node: ProseMirrorNode; mark: Mark }> = [];

  parent.forEach((node, offset) => {
    const mark = linkType.isInSet(node.marks);
    if (node.isText && mark) {
      segments.push({
        from: parentStart + offset,
        to: parentStart + offset + node.nodeSize,
        node,
        mark
      });
    }
  });

  const selectedIndex = segments.findIndex((segment) => pos >= segment.from && pos <= segment.to);
  if (selectedIndex < 0) return null;
  const href = String(segments[selectedIndex]!.mark.attrs.href ?? "");
  let first = selectedIndex;
  let last = selectedIndex;

  while (
    first > 0 &&
    segments[first - 1]!.to === segments[first]!.from &&
    String(segments[first - 1]!.mark.attrs.href ?? "") === href
  ) first -= 1;
  while (
    last + 1 < segments.length &&
    segments[last]!.to === segments[last + 1]!.from &&
    String(segments[last + 1]!.mark.attrs.href ?? "") === href
  ) last += 1;

  const from = segments[first]!.from;
  const to = segments[last]!.to;
  return {
    from,
    to,
    text: state.doc.textBetween(from, to),
    href,
    left: 0,
    top: 0
  };
}

function linkMarkInRange(state: EditorState, from: number, to: number): Mark | null {
  const link = state.schema.marks.link;
  if (!link) return null;
  let found: Mark | null = null;
  state.doc.nodesBetween(from, to, (node) => {
    found ??= link.isInSet(node.marks) ?? null;
    return found === null;
  });
  return found;
}

export function normalizeEditorHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLocaleLowerCase().startsWith("www.")) return `https://${trimmed}`;
  if (/^https?:\/\//iu.test(trimmed)) return trimmed;
  if (/^[a-z][a-z\d+.-]*:/iu.test(trimmed)) return null;
  return trimmed.replace(/^\.\//u, "");
}

function isExternalHref(href: string): boolean {
  return /^https?:\/\//iu.test(href);
}

function selectionToolbarState(view: EditorView): SelectionToolbarState | null {
  const { selection } = view.state;

  if (
    selection.empty ||
    selection instanceof NodeSelection ||
    getBlockSelection(view.state).selectedBlocks.length > 0
  ) {
    return null;
  }

  const start = view.coordsAtPos(selection.from);
  const end = view.coordsAtPos(selection.to);
  return {
    left: (start.left + end.right) / 2,
    top: Math.max(8, Math.min(start.top, end.top) - 44)
  };
}

function tableToolbarState(view: EditorView): TableToolbarState | null {
  if (!isInTable(view.state)) return null;

  const { $anchor } = view.state.selection;
  for (let depth = $anchor.depth; depth > 0; depth -= 1) {
    if ($anchor.node(depth).type.name !== "table") continue;

    const pos = $anchor.before(depth);
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return null;
    const rect = dom.getBoundingClientRect();
    return {
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 390)),
      top: rect.top > 54 ? rect.top - 42 : rect.bottom + 8
    };
  }

  return null;
}

function blockAtCoordinates(view: EditorView, left: number, top: number): ActiveBlockState | null {
  const editorRect = view.dom.getBoundingClientRect();

  if (left < editorRect.left || left > editorRect.right) {
    return blockAtVerticalCoordinate(view, top);
  }

  const found = view.posAtCoords({ left, top });

  if (!found) {
    return blockAtVerticalCoordinate(view, top);
  }

  const pos = selectableBlockPositionAt(view.state.doc, found.pos);

  if (pos === null) {
    return blockAtVerticalCoordinate(view, top);
  }

  return blockGeometryAtPosition(view, pos);
}

function blockAtVerticalCoordinate(view: EditorView, top: number): ActiveBlockState | null {
  const blocks = collectSelectableBlockPositions(view.state.doc)
    .map((pos) => blockGeometryAtPosition(view, pos))
    .filter((block): block is ActiveBlockState => block !== null);

  blocks.sort((left, right) => {
    const leftDistance = verticalDistance(left, top);
    const rightDistance = verticalDistance(right, top);
    return leftDistance - rightDistance || right.left - left.left;
  });

  return blocks[0] ?? null;
}

function verticalDistance(block: ActiveBlockState, top: number): number {
  if (top < block.top) return block.top - top;
  if (top > block.top + block.height) return top - (block.top + block.height);
  return 0;
}

function isWithinBlockHoverZone(block: ActiveBlockState, left: number, top: number): boolean {
  return (
    left >= block.handleLeft - 4 &&
    left <= block.right &&
    verticalDistance(block, top) <= BLOCK_HOVER_VERTICAL_TOLERANCE
  );
}

function blockGeometryAtPosition(view: EditorView, pos: number): ActiveBlockState | null {
  const dom = view.nodeDOM(pos);

  if (!(dom instanceof HTMLElement)) {
    return null;
  }

  const node = view.state.doc.nodeAt(pos);
  const itemContent = node?.type.name === "list_item"
    ? dom.querySelector<HTMLElement>(":scope > .rumi-list-item-content")
    : null;
  const firstLine = itemContent?.firstElementChild instanceof HTMLElement
    ? itemContent.firstElementChild
    : dom;
  const lineRect = firstLine.getBoundingClientRect();
  const blockRect = dom.getBoundingClientRect();
  const editorRect = view.dom.getBoundingClientRect();
  const anchorLeft = node?.type.name === "list_item" ? blockRect.left : lineRect.left;
  return {
    pos,
    left: anchorLeft,
    right: Math.max(anchorLeft, lineRect.right),
    top: lineRect.top,
    height: lineRect.height,
    handleLeft: Math.max(8, editorRect.left - 68),
    handleTop: lineRect.top + Math.max(0, (lineRect.height - 28) / 2)
  };
}

function listDragIntent(dragged: DraggedBlock, clientX: number): ListDragIntent {
  if (!dragged.isListItem || dragged.positions.length !== 1) return "reorder";

  const deltaX = clientX - dragged.startX;
  if (deltaX >= LIST_DRAG_INDENT_THRESHOLD) return "indent";
  if (deltaX <= -LIST_DRAG_OUTDENT_THRESHOLD) return "outdent";
  return "reorder";
}

function taskListItemNodeView(
  initialNode: ProseMirrorNode,
  view: EditorView,
  getPos: () => number | undefined
): NodeView {
  const dom = document.createElement("li");
  const contentDOM = document.createElement("div");
  contentDOM.className = "rumi-list-item-content";
  dom.append(contentDOM);
  let node = initialNode;
  let checkbox: HTMLButtonElement | null = null;

  const render = () => {
    const checked = node.attrs.checked as boolean | null;
    dom.classList.toggle("rumi-task-item", checked !== null);
    dom.dataset.checked = checked === null ? "" : String(checked);

    if (checked === null) {
      checkbox?.remove();
      checkbox = null;
      return;
    }

    if (!checkbox) {
      checkbox = document.createElement("button");
      checkbox.type = "button";
      checkbox.contentEditable = "false";
      checkbox.className = "rumi-task-checkbox";
      checkbox.setAttribute("aria-label", "Toggle task");
      checkbox.addEventListener("mousedown", (event) => event.preventDefault());
      checkbox.addEventListener("click", () => {
        const pos = getPos();

        if (typeof pos === "number") {
          view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: !node.attrs.checked }));
          view.focus();
        }
      });
      dom.insertBefore(checkbox, contentDOM);
    }

    checkbox.textContent = checked ? "✓" : "";
    checkbox.setAttribute("aria-pressed", String(checked));
  };

  render();
  return {
    dom,
    contentDOM,
    update(nextNode) {
      if (nextNode.type !== node.type) {
        return false;
      }

      node = nextNode;
      render();
      return true;
    }
  };
}

function LinkEditorPopover({
  state,
  onApply,
  onRemove,
  onOpen,
  onClose
}: {
  state: LinkEditorState;
  onApply: (text: string, href: string) => void;
  onRemove: () => void;
  onOpen: (href: string) => void;
  onClose: () => void;
}): ReactElement {
  const [text, setText] = useState(state.text);
  const [href, setHref] = useState(state.href);

  return (
    <form
      data-rumi-editor-overlay
      className="fixed z-50 w-[300px] rounded-md border border-border bg-background p-2 shadow-xl"
      style={{ left: state.left, top: state.top }}
      onSubmit={(event) => {
        event.preventDefault();
        onApply(text, href);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          className="h-8 min-w-0 flex-1 rounded border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          aria-label="Link text"
          placeholder="Link text"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="h-8 rounded bg-primary px-2.5 text-xs text-primary-foreground">
          Apply
        </button>
      </div>
      <input
        className="mt-1.5 h-8 w-full rounded border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        aria-label="Link destination"
        placeholder="URL or document path"
        value={href}
        onChange={(event) => setHref(event.target.value)}
      />
      <div className="mt-1.5 flex items-center justify-between">
        <button type="button" className="rounded px-2 py-1 text-xs text-destructive hover:bg-muted" onClick={onRemove}>
          Remove link
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => void navigator.clipboard?.writeText(href)}
          >
            Copy
          </button>
          {state.href && (
            <button
              type="button"
              className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onOpen(href)}
            >
              Open
            </button>
          )}
          <button type="button" className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </form>
  );
}

function ToolbarButton({
  label,
  icon,
  onClick
}: {
  label: string;
  icon: ReactElement;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      className="grid h-7 w-7 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

function TableToolbarButton({
  label,
  destructive = false,
  onClick,
  children
}: {
  label: string;
  destructive?: boolean;
  onClick: () => void;
  children: string;
}): ReactElement {
  return (
    <button
      type="button"
      className={`h-7 min-w-7 rounded px-1.5 hover:bg-muted ${destructive ? "text-destructive" : ""}`}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function BlockMenuButton({
  icon,
  label,
  destructive = false,
  disabled = false,
  onClick
}: {
  icon: ReactElement;
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 ${
        destructive ? "text-destructive" : ""
      }`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function serializeEditorMarkdown(view: EditorView | null): string {
  return view ? serializeLightMarkdown(view.state.doc) : "";
}
