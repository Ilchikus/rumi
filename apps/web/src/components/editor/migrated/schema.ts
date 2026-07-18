// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Schema, NodeSpec, MarkSpec } from "prosemirror-model"

const nodes: { [key: string]: NodeSpec } = {
  doc: {
    content: "block+"
  },

  paragraph: {
    content: "inline*",
    group: "block",
    parseDOM: [{ tag: "p" }],
    toDOM() {
      return ["p", 0]
    }
  },

  heading: {
    attrs: { level: { default: 1 } },
    content: "inline*",
    group: "block",
    defining: true,
    parseDOM: [
      { tag: "h1", attrs: { level: 1 } },
      { tag: "h2", attrs: { level: 2 } },
      { tag: "h3", attrs: { level: 3 } }
    ],
    toDOM(node) {
      return ["h" + node.attrs.level, 0]
    }
  },

  blockquote: {
    content: "block+",
    group: "block",
    defining: true,
    parseDOM: [{ tag: "blockquote" }],
    toDOM() {
      return ["blockquote", 0]
    }
  },

  code_block: {
    content: "text*",
    marks: "",
    group: "block",
    code: true,
    defining: true,
    attrs: { language: { default: null } },
    parseDOM: [{ tag: "pre", preserveWhitespace: "full", getAttrs(dom: HTMLElement) {
      const code = dom.querySelector("code")
      if (code) {
        const cls = code.className
        const match = cls.match(/language-(\S+)/)
        if (match) return { language: match[1] }
      }
      return { language: null }
    }}],
    toDOM(node) {
      const lang = node.attrs.language
      return ["pre", ["code", lang ? { class: `language-${lang}` } : {}, 0]]
    }
  },

  // Flat list items - each is a top-level block, not nested in a container
  bullet_item: {
    attrs: { indent: { default: 0 } },
    content: "inline*",
    group: "block",
    parseDOM: [{
      tag: "div.bullet-item",
      getAttrs(dom: HTMLElement) {
        return { indent: parseInt(dom.getAttribute("data-indent") || "0") }
      }
    }],
    toDOM(node) {
      return ["div", { class: "bullet-item", "data-indent": node.attrs.indent }, 0]
    },
    defining: true
  },

  numbered_item: {
    attrs: { indent: { default: 0 } },
    content: "inline*",
    group: "block",
    parseDOM: [{
      tag: "div.numbered-item",
      getAttrs(dom: HTMLElement) {
        return { indent: parseInt(dom.getAttribute("data-indent") || "0") }
      }
    }],
    toDOM(node) {
      return ["div", { class: "numbered-item", "data-indent": node.attrs.indent }, 0]
    },
    defining: true
  },

  task_item: {
    attrs: {
      indent: { default: 0 },
      checked: { default: false }
    },
    content: "inline*",
    group: "block",
    parseDOM: [{
      tag: "div.task-item",
      getAttrs(dom: HTMLElement) {
        const checkbox = dom.querySelector("input[type=checkbox]")
        return {
          indent: parseInt(dom.getAttribute("data-indent") || "0"),
          checked: checkbox ? (checkbox as HTMLInputElement).checked : false
        }
      }
    }],
    toDOM(node) {
      return [
        "div",
        { class: "task-item", "data-indent": node.attrs.indent },
        [
          "label",
          { contenteditable: "false", class: "task-checkbox" },
          ["input", { type: "checkbox", checked: node.attrs.checked ? "checked" : null }]
        ],
        ["span", { class: "task-content" }, 0]
      ]
    },
    defining: true
  },

  table: {
    content: "table_row+",
    group: "block",
    tableRole: "table",
    isolating: true,
    parseDOM: [{ tag: "table" }],
    toDOM() {
      return ["table", ["tbody", 0]]
    }
  },

  table_row: {
    content: "(table_cell | table_header)+",
    tableRole: "row",
    parseDOM: [{ tag: "tr" }],
    toDOM() {
      return ["tr", 0]
    }
  },

  table_cell: {
    content: "inline*",
    tableRole: "cell",
    attrs: { colspan: { default: 1 }, rowspan: { default: 1 } },
    isolating: true,
    parseDOM: [{ tag: "td", getAttrs(dom: HTMLElement) {
      return {
        colspan: Number(dom.getAttribute("colspan") || 1),
        rowspan: Number(dom.getAttribute("rowspan") || 1)
      }
    }}],
    toDOM(node) {
      const attrs: Record<string, string> = {}
      if (node.attrs.colspan !== 1) attrs.colspan = String(node.attrs.colspan)
      if (node.attrs.rowspan !== 1) attrs.rowspan = String(node.attrs.rowspan)
      return ["td", attrs, 0]
    }
  },

  table_header: {
    content: "inline*",
    tableRole: "header_cell",
    attrs: { colspan: { default: 1 }, rowspan: { default: 1 } },
    isolating: true,
    parseDOM: [{ tag: "th", getAttrs(dom: HTMLElement) {
      return {
        colspan: Number(dom.getAttribute("colspan") || 1),
        rowspan: Number(dom.getAttribute("rowspan") || 1)
      }
    }}],
    toDOM(node) {
      const attrs: Record<string, string> = {}
      if (node.attrs.colspan !== 1) attrs.colspan = String(node.attrs.colspan)
      if (node.attrs.rowspan !== 1) attrs.rowspan = String(node.attrs.rowspan)
      return ["th", attrs, 0]
    }
  },

  bookmark: {
    group: "block",
    atom: true,
    attrs: {
      url: { default: "" },
      title: { default: null },
      description: { default: null },
      favicon: { default: null }
    },
    parseDOM: [{ tag: "div.bookmark-block", getAttrs(dom: HTMLElement) {
      return {
        url: dom.getAttribute("data-url") || "",
        title: dom.getAttribute("data-title") || null,
        description: dom.getAttribute("data-description") || null,
        favicon: dom.getAttribute("data-favicon") || null
      }
    }}],
    toDOM(node) {
      return ["div", {
        class: "bookmark-block",
        "data-url": node.attrs.url,
        "data-title": node.attrs.title || "",
        "data-description": node.attrs.description || "",
        "data-favicon": node.attrs.favicon || ""
      }]
    }
  },

  horizontal_rule: {
    group: "block",
    parseDOM: [{ tag: "hr" }],
    toDOM() {
      return ["hr"]
    }
  },

  mermaid: {
    group: "block",
    atom: true,
    attrs: {
      code: { default: "" },
      mode: { default: "split" } // view, edit, split
    },
    parseDOM: [{
      tag: "div.mermaid-block",
      getAttrs(dom: HTMLElement) {
        return {
          code: dom.getAttribute("data-code") || "",
          mode: dom.getAttribute("data-mode") || "split"
        }
      }
    }],
    toDOM(node) {
      return ["div", {
        class: "mermaid-block",
        "data-code": node.attrs.code,
        "data-mode": node.attrs.mode
      }]
    }
  },

  database_embed: {
    group: "block",
    atom: true,
    attrs: {
      source: { default: "" },
      viewType: { default: "table" },
      filter: { default: "" },
      sort: { default: "" },
    },
    parseDOM: [{
      tag: "div.database-embed-block",
      getAttrs(dom: HTMLElement) {
        return {
          source: dom.getAttribute("data-source") || "",
          viewType: dom.getAttribute("data-view-type") || "table",
          filter: dom.getAttribute("data-filter") || "",
          sort: dom.getAttribute("data-sort") || "",
        }
      }
    }],
    toDOM(node) {
      return ["div", {
        class: "database-embed-block",
        "data-source": node.attrs.source,
        "data-view-type": node.attrs.viewType,
        "data-filter": node.attrs.filter,
        "data-sort": node.attrs.sort,
      }]
    }
  },

  file_embed: {
    group: "block",
    atom: true,
    attrs: {
      src: { default: "" },
    },
    parseDOM: [{
      tag: "figure.file-block",
      getAttrs(dom: HTMLElement) {
        return {
          src: dom.getAttribute("data-src") || "",
        }
      }
    }],
    toDOM(node) {
      return ["figure", {
        class: "file-block",
        "data-src": node.attrs.src,
      }]
    }
  },

  image: {
    group: "block",
    atom: true,
    attrs: {
      src: { default: "" },
      alt: { default: "" },
      title: { default: null },
      alignment: { default: "center" }, // left, center, full
      caption: { default: "" }
    },
    parseDOM: [{
      tag: "figure.image-block",
      getAttrs(dom: HTMLElement) {
        const img = dom.querySelector("img")
        const caption = dom.querySelector("figcaption")
        return {
          src: img?.getAttribute("src") || "",
          alt: img?.getAttribute("alt") || "",
          title: img?.getAttribute("title") || null,
          alignment: dom.getAttribute("data-alignment") || "center",
          caption: caption?.textContent || ""
        }
      }
    }, {
      tag: "img[src]",
      getAttrs(dom: HTMLElement) {
        return {
          src: dom.getAttribute("src") || "",
          alt: dom.getAttribute("alt") || "",
          title: dom.getAttribute("title") || null,
          alignment: "center",
          caption: ""
        }
      }
    }],
    toDOM(node) {
      return ["figure", {
        class: "image-block",
        "data-alignment": node.attrs.alignment
      }, [
        "img", {
          src: node.attrs.src,
          alt: node.attrs.alt,
          title: node.attrs.title
        }
      ], node.attrs.caption ? ["figcaption", node.attrs.caption] : ""]
    }
  },

  text: {
    group: "inline"
  },

  hard_break: {
    inline: true,
    group: "inline",
    selectable: false,
    parseDOM: [{ tag: "br" }],
    toDOM() {
      return ["br"]
    }
  }
}

const highlightColors: Record<string, string> = {
  yellow: "#fef08a",
  green: "#bbf7d0",
  blue: "#bfdbfe",
  purple: "#ddd6fe",
  pink: "#fbcfe8",
  red: "#fecaca",
  orange: "#fed7aa",
  gray: "#e5e7eb"
}

const marks: { [key: string]: MarkSpec } = {
  bold: {
    parseDOM: [
      { tag: "strong" },
      { tag: "b", getAttrs: (node: HTMLElement) => node.style.fontWeight !== "normal" && null },
      { style: "font-weight=400", clearMark: m => m.type.name === "bold" },
      { style: "font-weight", getAttrs: (value: string) => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null }
    ],
    toDOM() {
      return ["strong", 0]
    }
  },

  italic: {
    parseDOM: [
      { tag: "i" },
      { tag: "em" },
      { style: "font-style=italic" }
    ],
    toDOM() {
      return ["em", 0]
    }
  },

  underline: {
    parseDOM: [
      { tag: "u" },
      { style: "text-decoration=underline" }
    ],
    toDOM() {
      return ["u", 0]
    }
  },

  strikethrough: {
    parseDOM: [
      { tag: "s" },
      { tag: "strike" },
      { tag: "del" },
      { style: "text-decoration=line-through" }
    ],
    toDOM() {
      return ["s", 0]
    }
  },

  code: {
    parseDOM: [{ tag: "code" }],
    toDOM() {
      return ["code", 0]
    }
  },

  highlight: {
    attrs: {
      color: { default: "yellow" }
    },
    parseDOM: [{
      tag: "mark",
      getAttrs(dom: HTMLElement) {
        const bg = dom.style.backgroundColor
        for (const [name, hex] of Object.entries(highlightColors)) {
          if (bg === hex) return { color: name }
        }
        return { color: "yellow" }
      }
    }],
    toDOM(node) {
      const color = node.attrs.color || "yellow"
      const bgColor = highlightColors[color] || highlightColors.yellow
      return ["mark", { style: `background-color: ${bgColor}` }, 0]
    }
  },

  link: {
    attrs: {
      href: {},
      title: { default: null }
    },
    inclusive: false,
    parseDOM: [{
      tag: "a[href]",
      getAttrs(dom: HTMLElement) {
        return { href: dom.getAttribute("href"), title: dom.getAttribute("title") }
      }
    }],
    toDOM(node) {
      return ["a", { href: node.attrs.href, title: node.attrs.title }, 0]
    }
  }
}

export { highlightColors }
export const schema = new Schema({ nodes, marks })
