import MarkdownIt from "markdown-it";
import { Schema, type MarkSpec, type Node as ProseMirrorNode, type NodeSpec } from "prosemirror-model";
import {
  MarkdownParser,
  MarkdownSerializer,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  schema as commonMarkSchema
} from "prosemirror-markdown";
import { tableNodes } from "prosemirror-tables";

const commonListItem = commonMarkSchema.spec.nodes.get("list_item") as NodeSpec;
const taskListItem: NodeSpec = {
  ...commonListItem,
  attrs: {
    checked: { default: null }
  },
  parseDOM: [
    {
      tag: "li",
      getAttrs: (dom) => {
        const value = (dom as HTMLElement).getAttribute("data-checked");
        return { checked: value === null ? null : value === "true" };
      }
    }
  ],
  toDOM(node) {
    return [
      "li",
      node.attrs.checked === null ? {} : { "data-checked": String(node.attrs.checked), class: "rumi-task-item" },
      0
    ];
  }
};
const tableNodeSpecs = tableNodes({ tableGroup: "block", cellContent: "inline*", cellAttributes: {} });
const nodes = commonMarkSchema.spec.nodes.update("list_item", taskListItem).append(tableNodeSpecs);
const marks = commonMarkSchema.spec.marks
  .addToEnd("strike", {
    parseDOM: [{ tag: "s" }, { tag: "del" }, { style: "text-decoration=line-through" }],
    toDOM: () => ["s", 0]
  } satisfies MarkSpec)
  .addToEnd("underline", {
    parseDOM: [{ tag: "u" }, { style: "text-decoration=underline" }],
    toDOM: () => ["u", 0]
  } satisfies MarkSpec)
  .addToEnd("highlight", {
    parseDOM: [{ tag: "mark" }],
    toDOM: () => ["mark", 0]
  } satisfies MarkSpec);

export const lightEditorSchema = new Schema({ nodes, marks });

const markdownIt = MarkdownIt("commonmark", { html: false, linkify: true }).enable([
  "table",
  "strikethrough"
]);
installDelimitedMark(markdownIt, "highlight", "==");
installDelimitedMark(markdownIt, "underline", "++");

const lightMarkdownParser = new MarkdownParser(lightEditorSchema, markdownIt, {
  ...defaultMarkdownParser.tokens,
  table: { block: "table" },
  thead: { ignore: true },
  tbody: { ignore: true },
  tr: { block: "table_row" },
  th: { block: "table_header" },
  td: { block: "table_cell" },
  s: { mark: "strike" },
  highlight: { mark: "highlight" },
  underline: { mark: "underline" }
});

const lightMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    bullet_list(state, node) {
      state.renderList(node, "  ", (index) => {
        const checked = node.child(index).attrs.checked;
        return checked === null ? "- " : checked ? "- [x] " : "- [ ] ";
      });
    },
    table(state, node) {
      const columnCount = Math.max(1, ...Array.from({ length: node.childCount }, (_, index) => node.child(index).childCount));

      for (let rowIndex = 0; rowIndex < node.childCount; rowIndex += 1) {
        const row = node.child(rowIndex);
        state.write("|");

        for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
          state.write(" ");
          const cell = row.maybeChild(columnIndex);
          if (cell) {
            state.renderInline(cell);
          }

          state.write(" |");
        }

        state.write("\n");

        if (rowIndex === 0) {
          state.write(`|${" --- |".repeat(columnCount)}\n`);
        }
      }

      state.closeBlock(node);
    },
    table_row() {},
    table_header() {},
    table_cell() {}
  },
  {
    ...defaultMarkdownSerializer.marks,
    strike: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
    underline: { open: "<u>", close: "</u>", mixable: true },
    highlight: { open: "<mark>", close: "</mark>", mixable: true }
  }
);

export function parseLightMarkdown(markdown: string): ProseMirrorNode {
  const normalized = markdown
    .replace(/<u>(.*?)<\/u>/gis, "++$1++")
    .replace(/<mark(?:\s+data-color=(?:"[^"]*"|'[^']*'))?>(.*?)<\/mark>/gis, "==$1==");
  return addTaskItemAttributes(lightMarkdownParser.parse(normalized || ""));
}

export function serializeLightMarkdown(doc: ProseMirrorNode): string {
  return lightMarkdownSerializer.serialize(doc);
}

function addTaskItemAttributes(doc: ProseMirrorNode): ProseMirrorNode {
  const transform = (node: ProseMirrorNode): ProseMirrorNode => {
    if (node.isText) {
      return node;
    }

    const children: ProseMirrorNode[] = [];

    for (let index = 0; index < node.childCount; index += 1) {
      children.push(transform(node.child(index)));
    }

    if (node.type.name !== "list_item") {
      return node.type.create(node.attrs, children, node.marks);
    }

    const firstBlock = children[0];
    const firstText = firstBlock?.firstChild;
    const match = firstText?.isText ? /^\[([ xX])\]\s?/.exec(firstText.text ?? "") : null;

    if (!match || !firstBlock || !firstText) {
      return node.type.create({ ...node.attrs, checked: null }, children, node.marks);
    }

    const remainingText = (firstText.text ?? "").slice(match[0].length);
    const paragraphChildren: ProseMirrorNode[] = [];

    if (remainingText) {
      paragraphChildren.push(lightEditorSchema.text(remainingText, firstText.marks));
    }

    for (let index = 1; index < firstBlock.childCount; index += 1) {
      paragraphChildren.push(firstBlock.child(index));
    }

    const nextFirstBlock = firstBlock.type.create(firstBlock.attrs, paragraphChildren, firstBlock.marks);
    return node.type.create(
      { ...node.attrs, checked: match[1]?.toLowerCase() === "x" },
      [nextFirstBlock, ...children.slice(1)],
      node.marks
    );
  };

  return transform(doc);
}

function installDelimitedMark(markdown: MarkdownIt, tokenName: string, delimiter: string): void {
  markdown.inline.ruler.before("emphasis", `rumi_${tokenName}`, (state, silent) => {
    if (!state.src.startsWith(delimiter, state.pos)) {
      return false;
    }

    const contentStart = state.pos + delimiter.length;
    const close = state.src.indexOf(delimiter, contentStart);

    if (close <= contentStart) {
      return false;
    }

    if (!silent) {
      state.push(`${tokenName}_open`, tokenName, 1);
      const text = state.push("text", "", 0);
      text.content = state.src.slice(contentStart, close);
      state.push(`${tokenName}_close`, tokenName, -1);
    }

    state.pos = close + delimiter.length;
    return true;
  });
}
