import {
  Fragment,
  Node as ProseMirrorNode,
  Schema,
  Slice
} from "prosemirror-model"

const BLOCK_WRAPPER_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "DIV",
  "FIGCAPTION",
  "FOOTER",
  "HEADER",
  "MAIN",
  "NAV",
  "P",
  "SECTION"
])

const MERMAID_START = /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|xychart-beta|sankey-beta|block-beta|architecture-beta|packet-beta|kanban)\b/u
const DATABASE_LINE = /^(source|view|filter|sort):\s*(.*)$/u
const GOOGLE_DOCS_ID = /^docs-internal-guid-/u
const CODE_FONT = /(?:roboto mono|source code pro|courier|consolas|menlo|monaco|monospace)/iu
const CODE_BACKGROUNDS = new Set([
  "#f1f3f4",
  "rgb(241,243,244)",
  "#f8f9fa",
  "rgb(248,249,250)"
])

interface FlattenState {
  hasContent: boolean
  lastWasBreak: boolean
}

function removeUnderlineStyle(element: HTMLElement) {
  for (const property of ["text-decoration", "text-decoration-line"]) {
    const value = element.style.getPropertyValue(property)
    if (!/\bunderline\b/iu.test(value)) continue
    const retained = /\bline-through\b/iu.test(value) ? "line-through" : ""
    if (retained) element.style.setProperty(property, retained)
    else element.style.removeProperty(property)
  }
}

function boundaryWhitespace(anchor: HTMLAnchorElement) {
  const walker = anchor.ownerDocument.createTreeWalker(anchor, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof Text) textNodes.push(node)
  }

  let leading = ""
  for (const node of textNodes) {
    const match = /^[\s\u00a0]+/u.exec(node.nodeValue ?? "")
    if (!match) break
    leading += match[0]
    node.nodeValue = (node.nodeValue ?? "").slice(match[0].length)
    if (node.nodeValue) break
  }

  let trailing = ""
  for (const node of [...textNodes].reverse()) {
    const match = /[\s\u00a0]+$/u.exec(node.nodeValue ?? "")
    if (!match) break
    trailing = match[0] + trailing
    node.nodeValue = (node.nodeValue ?? "").slice(0, -match[0].length)
    if (node.nodeValue) break
  }

  return {
    leading: leading.replace(/\u00a0/gu, " "),
    trailing: trailing.replace(/\u00a0/gu, " ")
  }
}

function siblingText(anchor: HTMLAnchorElement, side: "before" | "after"): string {
  const parent = anchor.parentNode
  if (!parent) return ""
  const range = anchor.ownerDocument.createRange()
  range.selectNodeContents(parent)
  if (side === "before") range.setEndBefore(anchor)
  else range.setStartAfter(anchor)
  return range.toString()
}

function normalizeGoogleDocsLinks(root: HTMLElement) {
  root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    removeUnderlineStyle(anchor)
    anchor.querySelectorAll<HTMLElement>("*").forEach(removeUnderlineStyle)
    anchor.querySelectorAll<HTMLElement>("u").forEach((underline) => {
      underline.replaceWith(...Array.from(underline.childNodes))
    })

    const before = siblingText(anchor, "before")
    const after = siblingText(anchor, "after")
    const { leading, trailing } = boundaryWhitespace(anchor)
    if (leading && before.trim()) anchor.before(anchor.ownerDocument.createTextNode(leading))
    if (trailing && after.trim()) anchor.after(anchor.ownerDocument.createTextNode(trailing))

    if (!(anchor.textContent ?? "").trim()) {
      anchor.replaceWith(...Array.from(anchor.childNodes))
    }
  })
}

function cssColorKey(value: string): string {
  return value.toLowerCase().replace(/\s+/gu, "")
}

function hasCodeFont(element: HTMLElement, boundary: HTMLElement): boolean {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (CODE_FONT.test(current.style.fontFamily)) return true
    if (current === boundary) break
  }
  return false
}

function hasCodeBackground(element: HTMLElement, boundary: HTMLElement): boolean {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (CODE_BACKGROUNDS.has(cssColorKey(current.style.backgroundColor))) return true
    if (current === boundary) break
  }
  return false
}

function hasCompleteCodeStyle(element: HTMLElement, boundary: HTMLElement): boolean {
  return hasCodeFont(element, boundary) && hasCodeBackground(element, boundary)
}

function isGoogleDocsCodeLine(element: HTMLElement, boundary: HTMLElement): boolean {
  if (element.tagName !== "P" && element.tagName !== "DIV") return false
  if (element.querySelector("p, div, h1, h2, h3, h4, h5, h6, ul, ol, table, pre, blockquote")) {
    return false
  }

  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const textParents: HTMLElement[] = []
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (!(text.nodeValue ?? "").replace(/\u00a0/gu, " ").trim()) continue
    if (text.parentElement) textParents.push(text.parentElement)
  }

  if (textParents.length > 0) {
    return textParents.every((parent) => hasCompleteCodeStyle(parent, boundary))
  }

  return hasCompleteCodeStyle(element, boundary) ||
    Array.from(element.querySelectorAll<HTMLElement>("*")).some((child) => {
      return hasCompleteCodeStyle(child, boundary)
    })
}

function isGoogleDocsCodeSeparator(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) return !(node.nodeValue ?? "").trim()
  if (!(node instanceof HTMLElement)) return false
  return node.tagName === "BR" || !(node.textContent ?? "").trim()
}

function codeLineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? ""
  if (!(node instanceof HTMLElement)) return ""
  if (node.tagName === "BR") return "\n"
  return Array.from(node.childNodes).map(codeLineText).join("")
}

function normalizeGoogleDocsCode(root: HTMLElement) {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>("p, div"))

  for (const first of candidates) {
    if (!root.contains(first) || !isGoogleDocsCodeLine(first, root)) continue

    const lines = [codeLineText(first).replace(/\n$/u, "")]
    const consumed: Node[] = [first]
    let cursor = first.nextSibling

    while (cursor) {
      const separators: Node[] = []
      while (cursor && isGoogleDocsCodeSeparator(cursor)) {
        separators.push(cursor)
        cursor = cursor.nextSibling
      }
      if (!(cursor instanceof HTMLElement) || !isGoogleDocsCodeLine(cursor, root)) {
        consumed.push(...separators)
        break
      }
      consumed.push(...separators, cursor)
      lines.push(codeLineText(cursor).replace(/\n$/u, ""))
      cursor = cursor.nextSibling
    }

    const pre = first.ownerDocument.createElement("pre")
    const code = first.ownerDocument.createElement("code")
    code.textContent = lines.join("\n")
      .replace(/\u00a0/gu, " ")
      .replace(/[\u200b\u200c\u200d\ufeff]/gu, "")
    pre.appendChild(code)
    first.before(pre)
    consumed.forEach((node) => node.parentNode?.removeChild(node))
  }
}

function normalizeGoogleDocs(root: ParentNode) {
  const docsRoots = Array.from(root.querySelectorAll<HTMLElement>("[id]"))
    .filter((element) => GOOGLE_DOCS_ID.test(element.id))
  docsRoots.forEach((docsRoot) => {
    normalizeGoogleDocsLinks(docsRoot)
    normalizeGoogleDocsCode(docsRoot)
  })
}

function isListElement(node: Node): node is HTMLElement {
  return node instanceof HTMLElement && (node.tagName === "UL" || node.tagName === "OL")
}

function appendBreak(target: Node, state: FlattenState, document: Document) {
  if (!state.hasContent || state.lastWasBreak) return
  target.appendChild(document.createElement("br"))
  state.lastWasBreak = true
}

function appendFlattenedInline(
  source: Node,
  target: Node,
  state: FlattenState,
  document: Document
) {
  if (source.nodeType === Node.TEXT_NODE) {
    const value = source.nodeValue ?? ""
    if (/^[\t\r\n ]+$/u.test(value) && /[\t\r\n]/u.test(value)) return
    if (!value) return
    target.appendChild(document.createTextNode(value))
    state.hasContent = true
    state.lastWasBreak = false
    return
  }

  if (!(source instanceof HTMLElement)) return
  if (source.tagName === "BR") {
    appendBreak(target, state, document)
    return
  }
  if (source.tagName === "SCRIPT" || source.tagName === "STYLE") return

  if (BLOCK_WRAPPER_TAGS.has(source.tagName)) {
    appendBreak(target, state, document)
    source.childNodes.forEach((child) => {
      appendFlattenedInline(child, target, state, document)
    })
    return
  }

  const clone = source.cloneNode(false)
  target.appendChild(clone)
  source.childNodes.forEach((child) => {
    appendFlattenedInline(child, clone, state, document)
  })
}

function explicitListLevel(item: HTMLElement): number | null {
  const ariaLevel = Number(item.getAttribute("aria-level"))
  if (Number.isFinite(ariaLevel) && ariaLevel > 0) return ariaLevel - 1

  for (const element of [item, item.parentElement]) {
    if (!element) continue
    for (const className of Array.from(element.classList)) {
      const match = /^(?:lst-kix[_-].+|li-(?:bullet|number))-(\d+)$/u.exec(className)
      if (match) return Number(match[1])
    }
  }

  return null
}

function cssLengthInPixels(value: string): number | null {
  const match = /^(-?\d+(?:\.\d+)?)(px|pt|em|rem|in|cm|mm)?$/u.exec(value.trim())
  if (!match) return null
  const amount = Number(match[1])
  switch (match[2] ?? "px") {
    case "pt": return amount * (4 / 3)
    case "em":
    case "rem": return amount * 16
    case "in": return amount * 96
    case "cm": return amount * (96 / 2.54)
    case "mm": return amount * (96 / 25.4)
    default: return amount
  }
}

function listItemMargin(item: HTMLElement): number {
  const list = item.parentElement
  return cssLengthInPixels(item.style.marginLeft) ??
    cssLengthInPixels(list?.style.marginLeft ?? "") ??
    0
}

function marginLevelMap(root: ParentNode): Map<number, number> {
  const margins = Array.from(root.querySelectorAll("li"))
    .map((item) => listItemMargin(item as HTMLElement))
  const levels = [...new Set(margins)].sort((left, right) => left - right)
  return new Map(levels.map((margin, index) => [margin, index]))
}

function checkboxState(item: HTMLElement): { checked: boolean } | null {
  const checkbox = item.querySelector<HTMLInputElement>('input[type="checkbox"]')
  if (checkbox) {
    return {
      checked: checkbox.checked || checkbox.hasAttribute("checked") ||
        checkbox.getAttribute("aria-checked") === "true"
    }
  }

  const text = item.textContent?.trimStart() ?? ""
  if (/^[☑☒✅]/u.test(text)) return { checked: true }
  if (/^[☐□]/u.test(text)) return { checked: false }
  return null
}

function removeTaskPrefix(element: HTMLElement) {
  element.querySelectorAll('input[type="checkbox"]').forEach((input) => input.remove())
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const firstText = walker.nextNode()
  if (firstText) {
    firstText.nodeValue = (firstText.nodeValue ?? "").replace(/^[\s☐□☑☒✅]+/u, "")
  }
}

function flattenList(
  list: HTMLElement,
  structuralDepth: number,
  output: DocumentFragment,
  margins: Map<number, number>
) {
  const family = list.tagName === "OL" ? "numbered-item" : "bullet-item"
  const items = Array.from(list.children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName === "LI")

  for (const item of items) {
    const explicitLevel = explicitListLevel(item)
    const marginLevel = margins.get(listItemMargin(item)) ?? 0
    const indent = Math.max(structuralDepth, explicitLevel ?? 0, marginLevel)
    const task = checkboxState(item)
    const flat = item.ownerDocument.createElement("div")
    flat.className = task ? "task-item" : family
    flat.dataset.indent = String(indent)

    const state: FlattenState = { hasContent: false, lastWasBreak: false }
    const childLists: HTMLElement[] = []
    item.childNodes.forEach((child) => {
      if (isListElement(child)) {
        childLists.push(child)
      } else {
        appendFlattenedInline(child, flat, state, item.ownerDocument)
      }
    })
    if (task) {
      flat.dataset.checked = String(task.checked)
      removeTaskPrefix(flat)
      const checkbox = item.ownerDocument.createElement("input")
      checkbox.type = "checkbox"
      checkbox.checked = task.checked
      if (task.checked) checkbox.setAttribute("checked", "")
      flat.prepend(checkbox)
    }

    output.appendChild(flat)
    childLists.forEach((childList) => {
      flattenList(childList, indent + 1, output, margins)
    })
  }
}

function normalizeLists(root: ParentNode) {
  const margins = marginLevelMap(root)
  const roots = Array.from(root.querySelectorAll("ul, ol"))
    .filter((list): list is HTMLElement => {
      return list instanceof HTMLElement && !list.parentElement?.closest("ul, ol")
    })

  roots.forEach((list) => {
    const output = list.ownerDocument.createDocumentFragment()
    flattenList(list, 0, output, margins)
    list.replaceWith(output)
  })
}

function normalizeTableCells(root: ParentNode) {
  root.querySelectorAll("td, th").forEach((cell) => {
    const state: FlattenState = { hasContent: false, lastWasBreak: false }
    const content = cell.ownerDocument.createDocumentFragment()
    cell.childNodes.forEach((child) => {
      appendFlattenedInline(child, content, state, cell.ownerDocument)
    })
    cell.replaceChildren(content)
  })
}

export function normalizeExternalClipboardHtml(html: string): string {
  if (!html || typeof document === "undefined") return html

  const template = document.createElement("template")
  template.innerHTML = html
  normalizeGoogleDocs(template.content)
  normalizeLists(template.content)
  normalizeTableCells(template.content)
  return template.innerHTML
}

function normalizePastedNode(node: ProseMirrorNode, schema: Schema): ProseMirrorNode {
  const tableHeader = schema.nodes.table_header
  if (node.type === schema.nodes.table && tableHeader) {
    const rows: ProseMirrorNode[] = []
    node.forEach((row, _offset, rowIndex) => {
      if (rowIndex !== 0) {
        rows.push(normalizePastedNode(row, schema))
        return
      }

      const cells: ProseMirrorNode[] = []
      row.forEach((cell) => {
        cells.push(
          cell.type === tableHeader
            ? cell
            : tableHeader.create(cell.attrs, cell.content)
        )
      })
      rows.push(row.copy(Fragment.fromArray(cells)))
    })
    return node.copy(Fragment.fromArray(rows))
  }

  if (node.isLeaf) return node
  const children: ProseMirrorNode[] = []
  node.forEach((child) => children.push(normalizePastedNode(child, schema)))
  return node.copy(Fragment.fromArray(children))
}

export function normalizePastedTables(slice: Slice, schema: Schema): Slice {
  const children: ProseMirrorNode[] = []
  slice.content.forEach((node) => children.push(normalizePastedNode(node, schema)))
  return new Slice(Fragment.fromArray(children), slice.openStart, slice.openEnd)
}

function externalText(node: ProseMirrorNode): string {
  return node
    .textBetween(0, node.content.size, "\n", "\n")
    .replace(/\u00a0/gu, " ")
    .replace(/[\u200b\u200c\u200d\ufeff]/gu, "")
}

function isMermaidStart(value: string): boolean {
  const lines = value.trimStart().split("\n")
  const firstSyntaxLine = lines.find((line) => !line.trimStart().startsWith("%%{")) ?? ""
  return MERMAID_START.test(firstSyntaxLine.trimStart())
}

function databaseAttrs(value: string): Record<string, unknown> | null {
  const attrs: Record<string, unknown> = {
    source: "",
    viewType: "",
    filter: "",
    sort: "",
    selectingSource: false
  }
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return null

  for (const line of lines) {
    const match = DATABASE_LINE.exec(line)
    if (!match) return null
    const key = match[1] as "source" | "view" | "filter" | "sort"
    const value = match[2] ?? ""
    if (key === "view") attrs.viewType = value
    else attrs[key] = value
  }

  return attrs.source ? attrs : null
}

function fragmentNodes(fragment: Fragment): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = []
  fragment.forEach((node) => nodes.push(node))
  return nodes
}

export function normalizeExternalRichSlice(slice: Slice, schema: Schema): Slice {
  const tableNormalized = normalizePastedTables(slice, schema)
  const source = fragmentNodes(tableNormalized.content)
  const output: ProseMirrorNode[] = []

  for (let index = 0; index < source.length;) {
    const node = source[index]!
    if (node.type === schema.nodes.code_block) {
      const language = String(node.attrs.language ?? "").toLowerCase()
      const text = externalText(node)
      if ((language === "mermaid" || isMermaidStart(text)) && schema.nodes.mermaid) {
        output.push(schema.nodes.mermaid.create({ code: text, mode: "split" }))
      } else if ((language === "db" || databaseAttrs(text)) && schema.nodes.database_embed) {
        const attrs = databaseAttrs(text)
        output.push(attrs ? schema.nodes.database_embed.create(attrs) : node)
      } else {
        output.push(node)
      }
      index += 1
      continue
    }

    if (node.type === schema.nodes.paragraph) {
      const text = externalText(node)
      if (isMermaidStart(text) && schema.nodes.mermaid) {
        const lines = [text]
        let nextIndex = index + 1
        while (nextIndex < source.length && source[nextIndex]?.type === schema.nodes.paragraph) {
          const nextText = externalText(source[nextIndex]!)
          if (DATABASE_LINE.test(nextText.trim())) break
          lines.push(nextText)
          nextIndex += 1
        }
        output.push(schema.nodes.mermaid.create({
          code: lines.join("\n").replace(/\n+$/u, ""),
          mode: "split"
        }))
        index = nextIndex
        continue
      }

      if (DATABASE_LINE.test(text.trim()) && schema.nodes.database_embed) {
        const lines = [text]
        let nextIndex = index + 1
        while (nextIndex < source.length && source[nextIndex]?.type === schema.nodes.paragraph) {
          const nextText = externalText(source[nextIndex]!)
          if (!DATABASE_LINE.test(nextText.trim())) break
          lines.push(nextText)
          nextIndex += 1
        }
        const attrs = databaseAttrs(lines.join("\n"))
        if (attrs) {
          output.push(schema.nodes.database_embed.create(attrs))
          index = nextIndex
          continue
        }
      }
    }

    output.push(node)
    index += 1
  }

  return Slice.maxOpen(Fragment.fromArray(output), true)
}
