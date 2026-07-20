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
const fileEmbedNode: NodeSpec = {
  group: "block",
  atom: true,
  attrs: { src: { default: "" } },
  parseDOM: [{
    tag: "div[data-rumi-file]",
    getAttrs: (dom) => ({ src: (dom as HTMLElement).getAttribute("data-rumi-file") ?? "" })
  }],
  toDOM: (node) => ["div", { "data-rumi-file": node.attrs.src }]
};
const imageBlockNode: NodeSpec = {
  group: "block",
  atom: true,
  attrs: {
    src: { default: "" },
    alt: { default: "" },
    title: { default: null }
  },
  parseDOM: [{
    tag: "figure[data-rumi-image]",
    getAttrs: (dom) => {
      const image = (dom as HTMLElement).querySelector("img");
      return {
        src: image?.getAttribute("src") ?? "",
        alt: image?.getAttribute("alt") ?? "",
        title: image?.getAttribute("title")
      };
    }
  }],
  toDOM: (node) => [
    "figure",
    { "data-rumi-image": "true" },
    ["img", { src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title }]
  ]
};
const databaseEmbedNode: NodeSpec = {
  group: "block",
  atom: true,
  attrs: {
    source: { default: "" },
    view: { default: "table" },
    filter: { default: "" },
    sort: { default: "" }
  },
  parseDOM: [{ tag: "div[data-rumi-database]" }],
  toDOM: (node) => ["div", { "data-rumi-database": node.attrs.source }]
};
const nodes = commonMarkSchema.spec.nodes
  .update("list_item", taskListItem)
  .append(tableNodeSpecs)
  .addToEnd("file_embed", fileEmbedNode)
  .addToEnd("image_block", imageBlockNode)
  .addToEnd("database_embed", databaseEmbedNode);
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
  "strikethrough",
  "linkify"
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
  highlight: {
    mark: "highlight",
    getAttrs: (token) => ({ color: token.meta?.color ?? "yellow" })
  },
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
    table_cell() {},
    file_embed(state, node) {
      state.write(`![[${String(node.attrs.src ?? "")}]]`);
      state.closeBlock(node);
    },
    image_block(state, node) {
      const alt = String(node.attrs.alt ?? "").replace(/\]/gu, "\\]");
      const src = String(node.attrs.src ?? "").replace(/\)/gu, "\\)");
      const title = node.attrs.title
        ? ` \"${String(node.attrs.title).replace(/"/g, "\\\"")}\"`
        : "";
      state.write(`![${alt}](${src}${title})`);
      state.closeBlock(node);
    },
    database_embed(state, node) {
      state.write("```db\n");
      if (node.attrs.source) state.write(`source: ${String(node.attrs.source)}\n`);
      if (node.attrs.view && node.attrs.view !== "table") state.write(`view: ${String(node.attrs.view)}\n`);
      if (node.attrs.filter) state.write(`filter: ${String(node.attrs.filter)}\n`);
      if (node.attrs.sort) state.write(`sort: ${String(node.attrs.sort)}\n`);
      state.write("```");
      state.closeBlock(node);
    }
  },
  {
    ...defaultMarkdownSerializer.marks,
    strike: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
    underline: { open: "<u>", close: "</u>", mixable: true },
    highlight: {
      open: "==",
      close: "==",
      mixable: true
    }
  }
);

export function parseLightMarkdown(markdown: string): ProseMirrorNode {
  const normalized = markdown
    .replace(/<u>(.*?)<\/u>/gis, "++$1++")
    .replace(/<mark\s+data-color=(?:"[^"]*"|'[^']*')>(.*?)<\/mark>/gis, "==$1==")
    .replace(/<mark>(.*?)<\/mark>/gis, "==$1==");
  return transformSpecialBlocks(addTaskItemAttributes(lightMarkdownParser.parse(normalized || "")));
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

function transformSpecialBlocks(doc: ProseMirrorNode): ProseMirrorNode {
  const transform = (node: ProseMirrorNode): ProseMirrorNode => {
    if (node.isText) return node;

    const children = Array.from({ length: node.childCount }, (_, index) => transform(node.child(index)));

    if (node.type.name === "paragraph" && children.length === 1) {
      const child = children[0]!;

      if (child.type.name === "image") {
        return lightEditorSchema.nodes.image_block!.create({
          src: child.attrs.src,
          alt: child.attrs.alt ?? "",
          title: child.attrs.title ?? null
        });
      }

      if (child.isText) {
        const text = child.textContent.trim();
        const file = /^!\[\[([^\]]+)\]\]$/u.exec(text);
        if (file?.[1]) {
          return lightEditorSchema.nodes.file_embed!.create({ src: file[1].trim() });
        }

      }
    }

    if (node.type.name === "code_block" && String(node.attrs.params ?? "") === "db") {
      const attrs: Record<string, string> = {
        source: "",
        view: "table",
        filter: "",
        sort: ""
      };
      for (const line of node.textContent.split("\n")) {
        const match = /^(source|view|filter|sort):\s*(.*)$/u.exec(line);
        if (match?.[1]) attrs[match[1]] = match[2]?.trim() ?? "";
      }
      return lightEditorSchema.nodes.database_embed!.create(attrs);
    }

    return node.type.create(node.attrs, children, node.marks);
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
      const rawContent = state.src.slice(contentStart, close);
      const legacyHighlight = tokenName === "highlight"
        ? /^[A-Za-z]+::([\s\S]+)$/u.exec(rawContent)
        : null;
      state.push(`${tokenName}_open`, tokenName, 1);
      const text = state.push("text", "", 0);
      text.content = legacyHighlight?.[1] ?? rawContent;
      state.push(`${tokenName}_close`, tokenName, -1);
    }

    state.pos = close + delimiter.length;
    return true;
  });
}
