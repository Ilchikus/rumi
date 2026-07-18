import type { ReactElement } from "react";
import { BracketsCurly } from "@phosphor-icons/react/dist/csr/BracketsCurly";
import { CheckSquare } from "@phosphor-icons/react/dist/csr/CheckSquare";
import { Code } from "@phosphor-icons/react/dist/csr/Code";
import { FilePdf } from "@phosphor-icons/react/dist/csr/FilePdf";
import { Image } from "@phosphor-icons/react/dist/csr/Image";
import { ListBullets } from "@phosphor-icons/react/dist/csr/ListBullets";
import { ListNumbers } from "@phosphor-icons/react/dist/csr/ListNumbers";
import { Minus } from "@phosphor-icons/react/dist/csr/Minus";
import { Quotes } from "@phosphor-icons/react/dist/csr/Quotes";
import { Table } from "@phosphor-icons/react/dist/csr/Table";
import { TextHOne } from "@phosphor-icons/react/dist/csr/TextHOne";
import { setBlockType, wrapIn } from "prosemirror-commands";
import { Fragment, type Node as ProseMirrorNode } from "prosemirror-model";
import { NodeSelection, TextSelection } from "prosemirror-state";
import { liftListItem, wrapInList } from "prosemirror-schema-list";
import type { EditorView } from "prosemirror-view";
import { selectableBlockPositionAt } from "./blockSelection";
import { lightEditorSchema as schema } from "./lightProseMirrorMarkdown";

export interface SlashCommandItem {
  id: string;
  label: string;
  description: string;
  aliases: string[];
  icon: ReactElement;
  run: (view: EditorView) => void;
}

export type BlockConversionType =
  | "paragraph"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "bullet"
  | "numbered"
  | "task"
  | "quote"
  | "code"
  | "divider";

export const BLOCK_CONVERSION_OPTIONS: Array<{
  type: BlockConversionType;
  label: string;
  icon: ReactElement;
}> = [
  { type: "paragraph", label: "Text", icon: <BracketsCurly size={15} /> },
  { type: "heading-1", label: "Heading 1", icon: <TextHOne size={15} /> },
  { type: "heading-2", label: "Heading 2", icon: <TextHOne size={15} /> },
  { type: "heading-3", label: "Heading 3", icon: <TextHOne size={15} /> },
  { type: "bullet", label: "Bullet list", icon: <ListBullets size={15} /> },
  { type: "numbered", label: "Numbered list", icon: <ListNumbers size={15} /> },
  { type: "task", label: "Task", icon: <CheckSquare size={15} /> },
  { type: "quote", label: "Quote", icon: <Quotes size={15} /> },
  { type: "code", label: "Code block", icon: <Code size={15} /> },
  { type: "divider", label: "Divider", icon: <Minus size={15} /> }
];

export function slashCommandItems(
  uploadAsset?: (file: File) => Promise<string>
): SlashCommandItem[] {
  const items: SlashCommandItem[] = [
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
        if (!list || !listItem || !wrapInList(list)(view.state, view.dispatch, view)) return;

        const { $from } = view.state.selection;
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          if ($from.node(depth).type !== listItem) continue;
          const pos = $from.before(depth);
          view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, {
            ...$from.node(depth).attrs,
            checked: false
          }));
          break;
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

  if (schema.nodes.database_embed) {
    items.push({
      id: "database",
      label: "Database view",
      description: "Reference a Rumi database",
      aliases: ["db", "embed"],
      icon: <Table size={17} />,
      run(view) {
        insertAtomicBlock(view, schema.nodes.database_embed!.create({ source: "", view: "table" }));
      }
    });
  }

  if (uploadAsset && schema.nodes.image_block) {
    items.push(uploadSlashCommand(
      "image",
      "Image",
      "Upload an image to this workspace",
      ["photo", "picture", "asset"],
      <Image size={17} />,
      "image/*",
      uploadAsset,
      (path, file) => schema.nodes.image_block!.create({ src: path, alt: file.name })
    ));
  }

  if (uploadAsset && schema.nodes.file_embed) {
    items.push(uploadSlashCommand(
      "file",
      "PDF file",
      "Upload and embed a PDF",
      ["pdf", "attachment", "document"],
      <FilePdf size={17} />,
      "application/pdf,.pdf",
      uploadAsset,
      (path) => schema.nodes.file_embed!.create({ src: path })
    ));
  }

  return items;
}

export function filterSlashCommands(
  items: readonly SlashCommandItem[],
  query: string
): SlashCommandItem[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...items];

  return items.filter((item) =>
    [item.label, item.id, ...item.aliases].some((value) =>
      value.toLocaleLowerCase().includes(normalized)
    )
  );
}

export function changeBlockType(
  view: EditorView,
  requestedPos: number,
  target: BlockConversionType
): void {
  const listItem = schema.nodes.list_item;
  let pos = requestedPos;
  let node = view.state.doc.nodeAt(pos);
  if (!node) return;

  if (node.type === listItem) {
    const $item = view.state.doc.resolve(pos);
    const parentList = $item.parent;
    const targetList = target === "numbered" ? schema.nodes.ordered_list : schema.nodes.bullet_list;
    const staysInCurrentList =
      (target === "numbered" && parentList.type === schema.nodes.ordered_list) ||
      ((target === "bullet" || target === "task") && parentList.type === schema.nodes.bullet_list);

    if (targetList && staysInCurrentList) {
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        checked: target === "task" ? false : null
      }));
      return;
    }

    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos + 2))));
    if (!listItem || !liftListItem(listItem)(view.state, view.dispatch, view)) return;
    const liftedPos = selectableBlockPositionAt(view.state.doc, view.state.selection.from);
    if (liftedPos === null) return;
    pos = liftedPos;
    node = view.state.doc.nodeAt(pos);
    if (!node) return;
  }

  const paragraph = schema.nodes.paragraph;
  const text = blockConversionText(node);
  const inline = node.isTextblock
    ? node.content
    : text && paragraph
      ? Fragment.from(schema.text(text))
      : Fragment.empty;
  let replacement: ProseMirrorNode | null = null;

  if (target === "paragraph" && paragraph) {
    replacement = paragraph.create(null, inline);
  } else if (target.startsWith("heading-") && schema.nodes.heading) {
    replacement = schema.nodes.heading.create({ level: Number(target.slice(-1)) }, inline);
  } else if (target === "code" && schema.nodes.code_block) {
    replacement = schema.nodes.code_block.create({ params: "" }, text ? schema.text(text) : undefined);
  } else if (target === "quote" && schema.nodes.blockquote && paragraph) {
    replacement = schema.nodes.blockquote.create(null, paragraph.create(null, inline));
  } else if (
    (target === "bullet" || target === "numbered" || target === "task") &&
    paragraph &&
    listItem
  ) {
    const list = target === "numbered" ? schema.nodes.ordered_list : schema.nodes.bullet_list;
    if (list) {
      replacement = list.create(
        target === "numbered" ? { order: 1 } : undefined,
        listItem.create(
          { checked: target === "task" ? false : null },
          paragraph.create(null, inline)
        )
      );
    }
  } else if (target === "divider" && schema.nodes.horizontal_rule) {
    replacement = schema.nodes.horizontal_rule.create();
  }

  if (!replacement) return;
  const transaction = view.state.tr.replaceWith(pos, pos + node.nodeSize, replacement);
  if (replacement.isTextblock) {
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(pos + 1)));
  } else if (replacement.type === schema.nodes.horizontal_rule) {
    transaction.setSelection(NodeSelection.create(transaction.doc, pos));
  } else {
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(pos + 3)));
  }
  view.dispatch(transaction.scrollIntoView());
}

function uploadSlashCommand(
  id: string,
  label: string,
  description: string,
  aliases: string[],
  icon: ReactElement,
  accept: string,
  uploadAsset: (file: File) => Promise<string>,
  createNode: (path: string, file: File) => ProseMirrorNode
): SlashCommandItem {
  return {
    id,
    label,
    description,
    aliases,
    icon,
    run(view) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const path = await uploadAsset(file);
          if (!view.isDestroyed) insertAtomicBlock(view, createNode(path, file));
        } catch (error) {
          console.error("Asset upload failed", error);
        }
      }, { once: true });
      input.click();
    }
  };
}

function insertAtomicBlock(view: EditorView, node: ProseMirrorNode): void {
  const paragraph = schema.nodes.paragraph;
  const { $from } = view.state.selection;
  if (!paragraph || $from.depth < 1) return;

  const blockStart = $from.before(1);
  const block = $from.node(1);
  const replacement = block.type === paragraph && block.content.size === 0
    ? Fragment.fromArray([node, paragraph.create()])
    : Fragment.fromArray([block, node, paragraph.create()]);
  const transaction = view.state.tr.replaceWith(blockStart, blockStart + block.nodeSize, replacement);
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(blockStart + replacement.size - 1)));
  view.dispatch(transaction.scrollIntoView());
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
  if (!horizontalRule || !paragraph || $from.depth < 1) return;

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
  if (!table || !row || !header || !cell) return;

  const rows = Array.from({ length: 3 }, (_, rowIndex) =>
    row.create(
      null,
      Array.from({ length: 3 }, () => (rowIndex === 0 ? header : cell).create())
    )
  );
  view.dispatch(view.state.tr.replaceSelectionWith(table.create(null, rows)).scrollIntoView());
}

function blockConversionText(node: ProseMirrorNode): string {
  if (node.textContent) return node.textContent;
  for (const attr of ["url", "src", "source"] as const) {
    if (node.attrs[attr]) return String(node.attrs[attr]);
  }
  return "";
}
