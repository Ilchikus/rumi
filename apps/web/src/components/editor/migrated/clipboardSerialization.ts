import {
  Fragment,
  Node as ProseMirrorNode,
  Schema,
  Slice
} from "prosemirror-model"

export const RUMI_SLICE_MIME = "application/x-rumi-prosemirror-slice+json"

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function htmlAttribute(name: string, value: unknown): string {
  return value === null || value === undefined || value === ""
    ? ""
    : ` ${name}="${escapeHtml(String(value))}"`
}

function fragmentChildren(fragment: Fragment): ProseMirrorNode[] {
  const children: ProseMirrorNode[] = []
  fragment.forEach((node) => children.push(node))
  return children
}

function serializeInlineHtml(parent: ProseMirrorNode): string {
  let html = ""

  parent.forEach((node) => {
    if (node.isText) {
      let content = escapeHtml(node.text ?? "")

      for (const mark of node.marks) {
        switch (mark.type.name) {
          case "bold":
            content = `<strong>${content}</strong>`
            break
          case "italic":
            content = `<em>${content}</em>`
            break
          case "underline":
            content = `<u>${content}</u>`
            break
          case "strikethrough":
            content = `<s>${content}</s>`
            break
          case "code":
            content = `<code>${content}</code>`
            break
          case "highlight":
            content = `<mark>${content}</mark>`
            break
          case "link":
            content = `<a${htmlAttribute("href", mark.attrs.href)}${htmlAttribute("title", mark.attrs.title)}>${content}</a>`
            break
        }
      }

      html += content
      return
    }

    if (node.type.name === "soft_break" || node.type.name === "hard_break") {
      html += "<br>"
    }
  })

  return html
}

function listFamily(node: ProseMirrorNode): "ol" | "ul" {
  return node.type.name === "numbered_item" ? "ol" : "ul"
}

interface ClipboardListEntry {
  node: ProseMirrorNode
  children: ClipboardListEntry[]
}

function listEntries(nodes: readonly ProseMirrorNode[]): ClipboardListEntry[] {
  const roots: ClipboardListEntry[] = []
  const stack: Array<{ indent: number; entry: ClipboardListEntry }> = []

  for (const node of nodes) {
    const indent = Math.max(0, Number(node.attrs.indent) || 0)
    const entry: ClipboardListEntry = { node, children: [] }

    while (stack.length > 0 && stack.at(-1)!.indent >= indent) {
      stack.pop()
    }

    const parent = stack.at(-1)?.entry
    if (parent) parent.children.push(entry)
    else roots.push(entry)

    stack.push({ indent, entry })
  }

  return roots
}

function serializeListEntriesHtml(entries: readonly ClipboardListEntry[]): string {
  let html = ""
  let index = 0

  while (index < entries.length) {
    const firstEntry = entries[index]
    if (!firstEntry) break
    const family = listFamily(firstEntry.node)
    const siblings: ClipboardListEntry[] = []
    while (index < entries.length) {
      const entry = entries[index]
      if (!entry || listFamily(entry.node) !== family) break
      siblings.push(entry)
      index += 1
    }

    html += `<${family}>`
    for (const entry of siblings) {
      const { node } = entry
      const checkbox = node.type.name === "task_item"
        ? `<input type="checkbox"${node.attrs.checked ? " checked" : ""} disabled>`
        : ""
      html += `<li>${checkbox}${serializeInlineHtml(node)}${serializeListEntriesHtml(entry.children)}</li>`
    }
    html += `</${family}>`
  }

  return html
}

function tableCellHtml(cell: ProseMirrorNode, header: boolean): string {
  const tag = header ? "th" : "td"
  const alignment = cell.attrs.alignment
  const style = alignment ? `text-align: ${alignment}` : null
  return `<${tag}${htmlAttribute("colspan", cell.attrs.colspan === 1 ? null : cell.attrs.colspan)}${htmlAttribute("rowspan", cell.attrs.rowspan === 1 ? null : cell.attrs.rowspan)}${htmlAttribute("style", style)}>${serializeInlineHtml(cell)}</${tag}>`
}

function serializeTableHtml(table: ProseMirrorNode): string {
  const rows: ProseMirrorNode[] = []
  table.forEach((row) => rows.push(row))
  if (rows.length === 0) return "<table></table>"

  const rowHtml = (row: ProseMirrorNode, header: boolean) => {
    let cells = ""
    row.forEach((cell) => { cells += tableCellHtml(cell, header) })
    return `<tr>${cells}</tr>`
  }

  const head = `<thead>${rowHtml(rows[0]!, true)}</thead>`
  const body = rows.length > 1
    ? `<tbody>${rows.slice(1).map((row) => rowHtml(row, false)).join("")}</tbody>`
    : ""
  return `<table>${head}${body}</table>`
}

function serializeBlockHtml(node: ProseMirrorNode): string {
  switch (node.type.name) {
    case "paragraph":
      return `<p>${serializeInlineHtml(node)}</p>`
    case "heading": {
      const level = Math.max(1, Math.min(6, Number(node.attrs.level) || 1))
      return `<h${level}>${serializeInlineHtml(node)}</h${level}>`
    }
    case "blockquote":
      return `<blockquote>${serializeFragmentHtml(node.content)}</blockquote>`
    case "code_block":
      return `<pre><code${htmlAttribute("class", node.attrs.language ? `language-${node.attrs.language}` : null)}>${escapeHtml(node.textContent)}</code></pre>`
    case "table":
      return serializeTableHtml(node)
    case "horizontal_rule":
      return "<hr>"
    case "mermaid":
      return `<pre><code class="language-mermaid">${escapeHtml(String(node.attrs.code ?? ""))}</code></pre>`
    case "database_embed": {
      const lines = [
        node.attrs.source ? `source: ${node.attrs.source}` : "",
        node.attrs.viewType ? `view: ${node.attrs.viewType}` : "",
        node.attrs.filter ? `filter: ${node.attrs.filter}` : "",
        node.attrs.sort ? `sort: ${node.attrs.sort}` : ""
      ].filter(Boolean).join("\n")
      return `<pre><code class="language-db">${escapeHtml(lines)}</code></pre>`
    }
    case "file_embed": {
      const src = String(node.attrs.src ?? "")
      return `<p><a${htmlAttribute("href", src)}>${escapeHtml(src)}</a></p>`
    }
    case "image": {
      const image = `<img${htmlAttribute("src", node.attrs.src)}${htmlAttribute("alt", node.attrs.alt)}${htmlAttribute("title", node.attrs.title)}>`
      const caption = node.attrs.caption ? `<figcaption>${escapeHtml(String(node.attrs.caption))}</figcaption>` : ""
      return `<figure>${image}${caption}</figure>`
    }
    default:
      return node.isTextblock
        ? `<p>${serializeInlineHtml(node)}</p>`
        : `<div>${escapeHtml(node.textContent)}</div>`
  }
}

function serializeFragmentHtml(fragment: Fragment): string {
  const nodes = fragmentChildren(fragment)
  let html = ""

  for (let index = 0; index < nodes.length;) {
    const node = nodes[index]
    if (!node) break
    if (["bullet_item", "numbered_item", "task_item"].includes(node.type.name)) {
      const listNodes: ProseMirrorNode[] = []
      while (index < nodes.length) {
        const listNode = nodes[index]
        if (!listNode || !["bullet_item", "numbered_item", "task_item"].includes(listNode.type.name)) break
        listNodes.push(listNode)
        index += 1
      }
      html += serializeListEntriesHtml(listEntries(listNodes))
      continue
    }

    html += serializeBlockHtml(node)
    index += 1
  }

  return html
}

function serializeInlineText(parent: ProseMirrorNode): string {
  let text = ""
  parent.forEach((node) => {
    if (node.isText) text += node.text ?? ""
    else if (node.type.name === "soft_break" || node.type.name === "hard_break") text += "\n"
  })
  return text
}

function serializeBlockText(node: ProseMirrorNode): string {
  switch (node.type.name) {
    case "paragraph":
    case "heading":
      return serializeInlineText(node)
    case "bullet_item":
      return `${"    ".repeat(Number(node.attrs.indent) || 0)}- ${serializeInlineText(node)}`
    case "numbered_item":
      return `${"    ".repeat(Number(node.attrs.indent) || 0)}1. ${serializeInlineText(node)}`
    case "task_item":
      return `${"    ".repeat(Number(node.attrs.indent) || 0)}- [${node.attrs.checked ? "x" : " "}] ${serializeInlineText(node)}`
    case "blockquote":
      return serializeClipboardText(new Slice(node.content, 0, 0))
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")
    case "code_block":
      return node.textContent
    case "table": {
      const rows: string[] = []
      node.forEach((row) => {
        const cells: string[] = []
        row.forEach((cell) => cells.push(serializeInlineText(cell)))
        rows.push(cells.join("\t"))
      })
      return rows.join("\n")
    }
    case "horizontal_rule":
      return "---"
    case "mermaid":
      return String(node.attrs.code ?? "")
    case "database_embed":
      return [
        node.attrs.source ? `source: ${node.attrs.source}` : "",
        node.attrs.viewType ? `view: ${node.attrs.viewType}` : "",
        node.attrs.filter ? `filter: ${node.attrs.filter}` : "",
        node.attrs.sort ? `sort: ${node.attrs.sort}` : ""
      ].filter(Boolean).join("\n")
    case "file_embed":
      return String(node.attrs.src ?? "")
    case "image":
      return String(node.attrs.alt || node.attrs.src || "")
    default:
      return node.textContent
  }
}

function isListNode(node: ProseMirrorNode): boolean {
  return ["bullet_item", "numbered_item", "task_item"].includes(node.type.name)
}

export function serializeClipboardHtml(slice: Slice): string {
  return serializeFragmentHtml(slice.content)
}

export function serializeClipboardText(slice: Slice): string {
  const nodes = fragmentChildren(slice.content)
  let text = ""

  nodes.forEach((node, index) => {
    if (index > 0) {
      text += isListNode(nodes[index - 1]!) && isListNode(node) ? "\n" : "\n\n"
    }
    text += serializeBlockText(node)
  })

  return text.replace(/\n+$/u, "")
}

export function serializeRumiClipboardSlice(slice: Slice): string {
  return JSON.stringify({ version: 1, slice: slice.toJSON() })
}

export function parseRumiClipboardSlice(value: string, schema: Schema): Slice | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as { version?: unknown; slice?: unknown }
    if (parsed.version !== 1 || !parsed.slice) return null
    return Slice.fromJSON(schema, parsed.slice)
  } catch {
    return null
  }
}
