import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from "react";
import type { ReactElement } from "react";
import { BracketsCurly } from "@phosphor-icons/react/dist/csr/BracketsCurly";
import { CheckSquare } from "@phosphor-icons/react/dist/csr/CheckSquare";
import { Code } from "@phosphor-icons/react/dist/csr/Code";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { DotsSixVertical } from "@phosphor-icons/react/dist/csr/DotsSixVertical";
import { HighlighterCircle } from "@phosphor-icons/react/dist/csr/HighlighterCircle";
import { ListBullets } from "@phosphor-icons/react/dist/csr/ListBullets";
import { ListNumbers } from "@phosphor-icons/react/dist/csr/ListNumbers";
import { Minus } from "@phosphor-icons/react/dist/csr/Minus";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { Quotes } from "@phosphor-icons/react/dist/csr/Quotes";
import { Table } from "@phosphor-icons/react/dist/csr/Table";
import { TextB } from "@phosphor-icons/react/dist/csr/TextB";
import { TextHOne } from "@phosphor-icons/react/dist/csr/TextHOne";
import { TextItalic } from "@phosphor-icons/react/dist/csr/TextItalic";
import { TextStrikethrough } from "@phosphor-icons/react/dist/csr/TextStrikethrough";
import { TextUnderline } from "@phosphor-icons/react/dist/csr/TextUnderline";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import {
  baseKeymap,
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
import { history, redo, undo } from "prosemirror-history";
import { inputRules, textblockTypeInputRule, wrappingInputRule, type InputRule } from "prosemirror-inputrules";
import { keymap } from "prosemirror-keymap";
import { Fragment, type Node as ProseMirrorNode } from "prosemirror-model";
import { EditorState, NodeSelection, TextSelection, type Command } from "prosemirror-state";
import { liftListItem, sinkListItem, splitListItem, wrapInList } from "prosemirror-schema-list";
import { columnResizing, tableEditing } from "prosemirror-tables";
import { EditorView, type NodeView } from "prosemirror-view";
import "prosemirror-view/style/prosemirror.css";
import "prosemirror-tables/style/tables.css";
import { lightEditorSchema as schema, parseLightMarkdown, serializeLightMarkdown } from "./lightProseMirrorMarkdown";

export interface RumiBlockEditorHandle {
  focus: () => void;
  getMarkdown: () => string;
  markClean: (markdown: string) => void;
}

export interface RumiBlockEditorProps {
  documentKey: string;
  markdown: string;
  onDirty: () => void;
}

interface SlashMenuState {
  from: number;
  to: number;
  query: string;
  left: number;
  top: number;
}

interface SelectionToolbarState {
  left: number;
  top: number;
}

interface ActiveBlockState {
  pos: number;
  left: number;
  top: number;
  height: number;
}

interface BlockMenuState {
  pos: number;
  left: number;
  top: number;
}

interface DraggedBlock {
  pos: number;
  node: ProseMirrorNode;
}

interface SlashCommandItem {
  id: string;
  label: string;
  description: string;
  aliases: string[];
  icon: ReactElement;
  run: (view: EditorView) => void;
}

export const RumiBlockEditor = forwardRef<RumiBlockEditorHandle, RumiBlockEditorProps>(
  function RumiBlockEditor({ documentKey, markdown, onDirty }, ref): ReactElement {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const hostRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onDirtyRef = useRef(onDirty);
    const lastDocumentKeyRef = useRef(documentKey);
    const lastAppliedMarkdownRef = useRef(markdown);
    const slashStateRef = useRef<SlashMenuState | null>(null);
    const slashIndexRef = useRef(0);
    const activeBlockRef = useRef<ActiveBlockState | null>(null);
    const draggedBlockRef = useRef<DraggedBlock | null>(null);
    const hoverAnimationFrameRef = useRef(0);
    const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
    const [slashIndex, setSlashIndex] = useState(0);
    const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbarState | null>(null);
    const [activeBlock, setActiveBlock] = useState<ActiveBlockState | null>(null);
    const [blockMenu, setBlockMenu] = useState<BlockMenuState | null>(null);

    onDirtyRef.current = onDirty;
    slashStateRef.current = slashMenu;
    slashIndexRef.current = slashIndex;
    activeBlockRef.current = activeBlock;

    const slashCommands = slashCommandItems();
    const visibleSlashCommands = filterSlashCommands(slashCommands, slashMenu?.query ?? "");

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
        state: createEditorState(markdown),
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
          list_item: (node, editorView, getPos) => taskListItemNodeView(node, editorView, getPos)
        },
        handleKeyDown(editorView, event) {
          const menu = slashStateRef.current;

          if (!menu) {
            return false;
          }

          const items = filterSlashCommands(slashCommandItems(), menu.query);

          if (event.key === "ArrowDown") {
            event.preventDefault();
            const next = items.length > 0 ? (slashIndexRef.current + 1) % items.length : 0;
            slashIndexRef.current = next;
            setSlashIndex(next);
            return true;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            const next = items.length > 0 ? (slashIndexRef.current - 1 + items.length) % items.length : 0;
            slashIndexRef.current = next;
            setSlashIndex(next);
            return true;
          }

          if (event.key === "Enter" && items[slashIndexRef.current]) {
            event.preventDefault();
            runSlashCommand(items[slashIndexRef.current]!);
            return true;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            setSlashMenu(null);
            return true;
          }

          return false;
        }
      });

      const handleMouseMove = (event: MouseEvent) => {
        if (hoverAnimationFrameRef.current) {
          cancelAnimationFrame(hoverAnimationFrameRef.current);
        }

        hoverAnimationFrameRef.current = requestAnimationFrame(() => {
          const block = blockAtCoordinates(view, event.clientX, event.clientY);
          const current = activeBlockRef.current;

          if (
            current?.pos === block?.pos &&
            current?.top === block?.top &&
            current?.left === block?.left
          ) {
            return;
          }

          setActiveBlock(block);
        });
      };
      const handleMouseLeave = () => {
        if (!blockMenu) {
          setActiveBlock(null);
        }
      };
      const refreshOnScroll = () => refreshEditorUi(view);

      view.dom.addEventListener("mousemove", handleMouseMove);
      view.dom.addEventListener("mouseleave", handleMouseLeave);
      window.addEventListener("scroll", refreshOnScroll, true);
      viewRef.current = view;
      lastDocumentKeyRef.current = documentKey;
      lastAppliedMarkdownRef.current = markdown;
      refreshEditorUi(view);

      return () => {
        if (hoverAnimationFrameRef.current) {
          cancelAnimationFrame(hoverAnimationFrameRef.current);
        }

        view.dom.removeEventListener("mousemove", handleMouseMove);
        view.dom.removeEventListener("mouseleave", handleMouseLeave);
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

      view.updateState(createEditorState(markdown));
      lastDocumentKeyRef.current = documentKey;
      lastAppliedMarkdownRef.current = markdown;
      setBlockMenu(null);
      setActiveBlock(null);
      refreshEditorUi(view);
    }, [documentKey, markdown, refreshEditorUi]);

    const applyMark = useCallback((markName: string) => {
      const view = viewRef.current;
      const mark = schema.marks[markName];

      if (view && mark) {
        toggleMark(mark)(view.state, view.dispatch, view);
        view.focus();
        refreshEditorUi(view);
      }
    }, [refreshEditorUi]);

    const addBlockBefore = useCallback((pos: number) => {
      const view = viewRef.current;
      const paragraph = schema.nodes.paragraph;

      if (!view || !paragraph) {
        return;
      }

      const transaction = view.state.tr.insert(pos, paragraph.create());
      transaction.setSelection(TextSelection.near(transaction.doc.resolve(pos + 1)));
      view.dispatch(transaction);
      view.focus();
    }, []);

    const mutateBlock = useCallback((action: "duplicate" | "delete" | "paragraph" | "heading") => {
      const view = viewRef.current;
      const menu = blockMenu;

      if (!view || !menu) {
        return;
      }

      const node = view.state.doc.nodeAt(menu.pos);

      if (!node) {
        return;
      }

      if (action === "duplicate") {
        view.dispatch(view.state.tr.insert(menu.pos + node.nodeSize, node.copy(node.content)));
      } else if (action === "delete") {
        if (view.state.doc.childCount === 1) {
          const paragraph = schema.nodes.paragraph?.create();

          if (paragraph) {
            view.dispatch(view.state.tr.replaceWith(menu.pos, menu.pos + node.nodeSize, paragraph));
          }
        } else {
          view.dispatch(view.state.tr.delete(menu.pos, menu.pos + node.nodeSize));
        }
      } else {
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, menu.pos)));
        const type = action === "heading" ? schema.nodes.heading : schema.nodes.paragraph;

        if (type) {
          setBlockType(type, action === "heading" ? { level: 2 } : undefined)(
            view.state,
            view.dispatch,
            view
          );
        }
      }

      setBlockMenu(null);
      view.focus();
    }, [blockMenu]);

    const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
      const view = viewRef.current;
      const dragged = draggedBlockRef.current;

      if (!view || !dragged) {
        return;
      }

      const target = blockAtCoordinates(view, event.clientX, event.clientY);

      if (!target || target.pos === dragged.pos) {
        draggedBlockRef.current = null;
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const targetNode = view.state.doc.nodeAt(target.pos);
      const insertAfterTarget = event.clientY > target.top + target.height / 2;
      const originalTarget = target.pos + (insertAfterTarget ? targetNode?.nodeSize ?? 0 : 0);
      const transaction = view.state.tr.delete(dragged.pos, dragged.pos + dragged.node.nodeSize);
      const mappedTarget = transaction.mapping.map(originalTarget, 1);
      transaction.insert(mappedTarget, dragged.node);
      view.dispatch(transaction);
      draggedBlockRef.current = null;
      view.focus();
    }, []);

    return (
      <div
        ref={wrapperRef}
        className="relative"
        onDragOver={(event) => {
          if (draggedBlockRef.current) {
            event.preventDefault();
          }
        }}
        onDrop={handleDrop}
      >
        <div ref={hostRef} className="min-h-0" />

        {activeBlock && (
          <div
            className="fixed z-20 flex items-center rounded-md border border-border bg-background p-0.5 shadow-sm"
            style={{ left: Math.max(8, activeBlock.left - 58), top: activeBlock.top }}
            onMouseLeave={() => {
              if (!blockMenu) {
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
              onClick={() => addBlockBefore(activeBlock.pos)}
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              draggable
              className="grid h-6 w-6 cursor-grab place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing"
              title="Drag or open block menu"
              aria-label="Block actions"
              onMouseDown={(event) => event.preventDefault()}
              onDragStart={(event) => {
                const view = viewRef.current;
                const node = view?.state.doc.nodeAt(activeBlock.pos);

                if (node) {
                  draggedBlockRef.current = { pos: activeBlock.pos, node };
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/x-rumi-block", String(activeBlock.pos));
                }
              }}
              onDragEnd={() => {
                draggedBlockRef.current = null;
              }}
              onClick={() =>
                setBlockMenu({
                  pos: activeBlock.pos,
                  left: Math.max(8, activeBlock.left - 22),
                  top: activeBlock.top + 30
                })
              }
            >
              <DotsSixVertical size={15} weight="bold" />
            </button>
          </div>
        )}

        {blockMenu && (
          <div
            className="fixed z-50 w-48 rounded-md border border-border bg-background p-1 text-sm shadow-lg"
            style={{ left: blockMenu.left, top: blockMenu.top }}
          >
            <BlockMenuButton icon={<Copy size={15} />} label="Duplicate" onClick={() => mutateBlock("duplicate")} />
            <BlockMenuButton icon={<TextHOne size={15} />} label="Heading 2" onClick={() => mutateBlock("heading")} />
            <BlockMenuButton icon={<BracketsCurly size={15} />} label="Paragraph" onClick={() => mutateBlock("paragraph")} />
            <div className="my-1 border-t border-border" />
            <BlockMenuButton icon={<Trash size={15} />} label="Delete" destructive onClick={() => mutateBlock("delete")} />
          </div>
        )}

        {selectionToolbar && (
          <div
            className="fixed z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-md border border-border bg-background p-1 shadow-lg"
            style={{ left: selectionToolbar.left, top: selectionToolbar.top }}
            onMouseDown={(event) => event.preventDefault()}
          >
            <ToolbarButton label="Bold" icon={<TextB size={15} weight="bold" />} onClick={() => applyMark("strong")} />
            <ToolbarButton label="Italic" icon={<TextItalic size={15} />} onClick={() => applyMark("em")} />
            <ToolbarButton label="Underline" icon={<TextUnderline size={15} />} onClick={() => applyMark("underline")} />
            <ToolbarButton label="Strikethrough" icon={<TextStrikethrough size={15} />} onClick={() => applyMark("strike")} />
            <ToolbarButton label="Inline code" icon={<Code size={15} />} onClick={() => applyMark("code")} />
            <ToolbarButton label="Highlight" icon={<HighlighterCircle size={15} />} onClick={() => applyMark("highlight")} />
          </div>
        )}

        {slashMenu && (
          <div
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
          </div>
        )}
      </div>
    );
  }
);

function createEditorState(markdown: string): EditorState {
  return EditorState.create({
    doc: parseLightMarkdown(markdown),
    plugins: [
      history(),
      buildInputRules(),
      buildKeymap(),
      keymap(baseKeymap),
      columnResizing(),
      tableEditing()
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
    rules.push(textblockTypeInputRule(/^```$/, codeBlock));
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

  return inputRules({ rules });
}

function buildKeymap() {
  const keys: Record<string, Command> = {};
  const paragraph = schema.nodes.paragraph;
  const heading = schema.nodes.heading;
  const bulletList = schema.nodes.bullet_list;
  const orderedList = schema.nodes.ordered_list;
  const listItem = schema.nodes.list_item;

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

    if (mark) {
      keys[shortcut] = toggleMark(mark);
    }
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
    keys.Enter = chainCommands(
      splitListItem(listItem),
      newlineInCode,
      createParagraphNear,
      liftEmptyBlock,
      splitBlock
    );
    keys.Tab = sinkListItem(listItem);
    keys["Shift-Tab"] = liftListItem(listItem);
  } else {
    keys.Enter = chainCommands(newlineInCode, createParagraphNear, liftEmptyBlock, splitBlock);
  }

  keys["Mod-Enter"] = exitCode;
  return keymap(keys);
}

function slashCommandItems(): SlashCommandItem[] {
  return [
    blockTypeCommand("paragraph", "Text", "Plain paragraph", ["p", "text"], <BracketsCurly size={17} />, "paragraph"),
    blockTypeCommand("heading-1", "Heading 1", "Large section heading", ["h1", "title"], <TextHOne size={17} />, "heading", { level: 1 }),
    blockTypeCommand("heading-2", "Heading 2", "Medium section heading", ["h2", "subtitle"], <TextHOne size={17} />, "heading", { level: 2 }),
    blockTypeCommand("heading-3", "Heading 3", "Small section heading", ["h3"], <TextHOne size={17} />, "heading", { level: 3 }),
    listCommand("bullet", "Bullet list", "Create an unordered list", ["ul", "list"], <ListBullets size={17} />, false),
    listCommand("numbered", "Numbered list", "Create an ordered list", ["ol", "ordered"], <ListNumbers size={17} />, true),
    {
      id: "task",
      label: "Task list",
      description: "Create a checkbox item",
      aliases: ["todo", "checkbox", "check"],
      icon: <CheckSquare size={17} />,
      run(view) {
        const list = schema.nodes.bullet_list;
        const listItem = schema.nodes.list_item;

        if (!list || !listItem || !wrapInList(list)(view.state, view.dispatch, view)) {
          return;
        }

        const { $from } = view.state.selection;

        for (let depth = $from.depth; depth > 0; depth -= 1) {
          if ($from.node(depth).type === listItem) {
            const pos = $from.before(depth);
            view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...$from.node(depth).attrs, checked: false }));
            break;
          }
        }
      }
    },
    {
      id: "quote",
      label: "Quote",
      description: "Create a block quote",
      aliases: ["blockquote"],
      icon: <Quotes size={17} />,
      run(view) {
        const type = schema.nodes.blockquote;
        if (type) wrapIn(type)(view.state, view.dispatch, view);
      }
    },
    blockTypeCommand("code", "Code block", "Fenced source code", ["pre", "codeblock"], <Code size={17} />, "code_block", { params: "" }),
    blockTypeCommand("mermaid", "Mermaid", "Diagram source block", ["diagram", "graph"], <BracketsCurly size={17} />, "code_block", { params: "mermaid" }),
    {
      id: "divider",
      label: "Divider",
      description: "Horizontal separator",
      aliases: ["hr", "line"],
      icon: <Minus size={17} />,
      run: insertDivider
    },
    {
      id: "table",
      label: "Table",
      description: "Insert a 3 × 3 table",
      aliases: ["grid"],
      icon: <Table size={17} />,
      run: insertTable
    }
  ];
}

function blockTypeCommand(
  id: string,
  label: string,
  description: string,
  aliases: string[],
  icon: ReactElement,
  nodeName: string,
  attrs?: Record<string, unknown>
): SlashCommandItem {
  return {
    id,
    label,
    description,
    aliases,
    icon,
    run(view) {
      const type = schema.nodes[nodeName];
      if (type) setBlockType(type, attrs)(view.state, view.dispatch, view);
    }
  };
}

function listCommand(
  id: string,
  label: string,
  description: string,
  aliases: string[],
  icon: ReactElement,
  ordered: boolean
): SlashCommandItem {
  return {
    id,
    label,
    description,
    aliases,
    icon,
    run(view) {
      const type = ordered ? schema.nodes.ordered_list : schema.nodes.bullet_list;
      if (type) wrapInList(type)(view.state, view.dispatch, view);
    }
  };
}

function insertDivider(view: EditorView): void {
  const horizontalRule = schema.nodes.horizontal_rule;
  const paragraph = schema.nodes.paragraph;
  const { $from } = view.state.selection;

  if (!horizontalRule || !paragraph || $from.depth < 1) {
    return;
  }

  const from = $from.before(1);
  const to = from + $from.node(1).nodeSize;
  const transaction = view.state.tr.replaceWith(
    from,
    to,
    Fragment.fromArray([horizontalRule.create(), paragraph.create()])
  );
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(from + 2)));
  view.dispatch(transaction);
}

function insertTable(view: EditorView): void {
  const table = schema.nodes.table;
  const row = schema.nodes.table_row;
  const header = schema.nodes.table_header;
  const cell = schema.nodes.table_cell;

  if (!table || !row || !header || !cell) {
    return;
  }

  const rows = Array.from({ length: 3 }, (_, rowIndex) =>
    row.create(
      null,
      Array.from({ length: 3 }, () => (rowIndex === 0 ? header : cell).create())
    )
  );
  view.dispatch(view.state.tr.replaceSelectionWith(table.create(null, rows)).scrollIntoView());
}

function filterSlashCommands(items: SlashCommandItem[], query: string): SlashCommandItem[] {
  const normalized = query.trim().toLocaleLowerCase();

  if (!normalized) {
    return items;
  }

  return items.filter((item) =>
    [item.label, item.id, ...item.aliases].some((value) =>
      value.toLocaleLowerCase().includes(normalized)
    )
  );
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

function selectionToolbarState(view: EditorView): SelectionToolbarState | null {
  const { selection } = view.state;

  if (selection.empty || selection instanceof NodeSelection) {
    return null;
  }

  const start = view.coordsAtPos(selection.from);
  const end = view.coordsAtPos(selection.to);
  return {
    left: (start.left + end.right) / 2,
    top: Math.max(8, Math.min(start.top, end.top) - 44)
  };
}

function blockAtCoordinates(view: EditorView, left: number, top: number): ActiveBlockState | null {
  const found = view.posAtCoords({ left, top });

  if (!found) {
    return null;
  }

  const resolved = view.state.doc.resolve(found.pos);

  if (resolved.depth < 1) {
    return null;
  }

  const pos = resolved.before(1);
  const dom = view.nodeDOM(pos);

  if (!(dom instanceof HTMLElement)) {
    return null;
  }

  const rect = dom.getBoundingClientRect();
  return {
    pos,
    left: rect.left,
    top: rect.top,
    height: rect.height
  };
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

function BlockMenuButton({
  icon,
  label,
  destructive = false,
  onClick
}: {
  icon: ReactElement;
  label: string;
  destructive?: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      className={`flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-muted ${
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
