// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Node as ProseMirrorNode, Schema, Fragment } from "prosemirror-model"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import type {
  Root,
  RootContent,
  Paragraph,
  Heading,
  Text,
  Strong,
  Emphasis,
  Delete,
  InlineCode,
  List,
  ListItem,
  Blockquote,
  Code,
  ThematicBreak,
  Link,
  Image,
  Table,
  TableRow,
  TableCell,
  PhrasingContent as MdastPhrasingContent
} from "mdast"

// Parse markdown string to ProseMirror document
export function parseMarkdown(markdown: string, schema: Schema): ProseMirrorNode {
  // Pre-process custom syntax before remark parsing
  const preprocessed = preprocessCustomSyntax(markdown)

  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(preprocessed) as Root

  const blocks: ProseMirrorNode[] = []

  for (const node of tree.children) {
    const block = convertBlock(node, schema)
    if (block) {
      if (Array.isArray(block)) {
        blocks.push(...block)
      } else {
        blocks.push(block)
      }
    }
  }

  // Ensure at least one paragraph
  if (blocks.length === 0) {
    blocks.push(schema.nodes.paragraph.create())
  }

  return schema.nodes.doc.create(null, blocks)
}

// Pre-process custom markdown syntax into HTML that can be parsed
function preprocessCustomSyntax(markdown: string): string {
  const lines = markdown.split("\n")
  let activeFence: { character: "`" | "~"; length: number } | null = null

  return lines.map((line) => {
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})/)

    if (activeFence) {
      if (fence && fence[1][0] === activeFence.character && fence[1].length >= activeFence.length) {
        activeFence = null
      }
      return line
    }

    if (fence) {
      activeFence = {
        character: fence[1][0] as "`" | "~",
        length: fence[1].length
      }
      return line
    }

    // Four-space and tab indentation are Markdown code blocks. Nested list
    // markers remain eligible for Rumi inline formatting.
    if (/^(?: {4}|\t)(?![-+*]\s|\d+[.)]\s)/.test(line)) return line

    return preprocessOutsideCodeSpans(line)
  }).join("\n")
}

function preprocessOutsideCodeSpans(line: string): string {
  let result = ""
  let plainTextStart = 0
  let cursor = 0

  while (cursor < line.length) {
    if (line[cursor] !== "`") {
      cursor++
      continue
    }

    const openingStart = cursor
    while (cursor < line.length && line[cursor] === "`") cursor++
    const openingLength = cursor - openingStart
    const closingStart = findMatchingBacktickRun(line, cursor, openingLength)

    if (closingStart < 0) {
      cursor = openingStart + openingLength
      continue
    }

    result += preprocessPlainCustomSyntax(line.slice(plainTextStart, openingStart))
    result += line.slice(openingStart, closingStart + openingLength)
    cursor = closingStart + openingLength
    plainTextStart = cursor
  }

  return result + preprocessPlainCustomSyntax(line.slice(plainTextStart))
}

function findMatchingBacktickRun(line: string, from: number, expectedLength: number): number {
  let cursor = from

  while (cursor < line.length) {
    const runStart = line.indexOf("`", cursor)
    if (runStart < 0) return -1

    cursor = runStart
    while (cursor < line.length && line[cursor] === "`") cursor++
    if (cursor - runStart === expectedLength) return runStart
  }

  return -1
}

function preprocessPlainCustomSyntax(markdown: string): string {
  let result = normalizeWorkspaceLinkDestinations(markdown)

  // Underline: __text__ -> <u>text</u> (but not at word boundaries for bold)
  // We need to be careful not to match GFM bold which also uses __
  // Our rule: __ at start of word followed by text and __ at end
  result = result.replace(/(?<!\w)__(?!\s)([^_]+?)__(?!\w)/g, '<u>$1</u>')

  // Strikethrough alternative: --text-- -> <s>text</s>.
  // Do not treat runs of three or more dashes as markup: those are used by
  // horizontal rules and GFM table alignment delimiters.
  result = result.replace(/(?<![\w-])--(?![\s-])([^\n]*?)(?<![\s-])--(?![\w-])/g, '<s>$1</s>')

  // Legacy colored highlights are imported as the single default highlight.
  result = result.replace(/==\w+::([^=]+)==/g, '<mark>$1</mark>')

  // Highlight default: ==text== -> <mark>text</mark>
  result = result.replace(/==([^=:]+)==/g, '<mark>$1</mark>')

  return result
}

// CommonMark requires destinations containing spaces to use angle brackets,
// but workspace paths are frequently authored without them. Accept that
// convenient form on read and let serialization write the portable form.
function normalizeWorkspaceLinkDestinations(markdown: string): string {
  return markdown.replace(/(!?\[[^\]\n]*\])\(([^)\n]+)\)/gu, (match, label, rawDestination) => {
    const { destination, title } = splitLinkDestinationAndTitle(rawDestination)

    if (
      !/\s/u.test(destination)
      || destination.startsWith("<")
      || /^[a-z][a-z\d+.-]*:/iu.test(destination)
      || destination.startsWith("//")
      || /[<>\n\r]/u.test(destination)
    ) {
      return match
    }

    return `${label}(<${destination}>${title})`
  })
}

function splitLinkDestinationAndTitle(value: string): { destination: string; title: string } {
  const trimmed = value.trim()
  const match = trimmed.match(/^(.*?)(\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))$/u)

  return match
    ? { destination: match[1].trim(), title: match[2] }
    : { destination: trimmed, title: "" }
}

function convertBlock(node: RootContent, schema: Schema): ProseMirrorNode | ProseMirrorNode[] | null {
  switch (node.type) {
    case "paragraph":
      return convertParagraph(node, schema)
    case "heading":
      return convertHeading(node, schema)
    case "list":
      return convertList(node, schema)
    case "blockquote":
      return convertBlockquote(node, schema)
    case "code":
      return convertCodeBlock(node, schema)
    case "table":
      return convertTable(node as Table, schema)
    case "thematicBreak":
      return schema.nodes.horizontal_rule?.create() || null
    case "html":
      // Handle HTML blocks (like our preprocessed custom syntax)
      return convertHtmlBlock(node.value, schema)
    default:
      // For unsupported block types, try to convert to paragraph
      if ("children" in node && Array.isArray(node.children)) {
        const inline = convertInlineContent(node.children as MdastPhrasingContent[], schema)
        return schema.nodes.paragraph.create(null, inline)
      }
      return null
  }
}

function convertHtmlBlock(html: string, schema: Schema): ProseMirrorNode | null {
  // Simple HTML block handling - convert to paragraph with inline content
  const inline = parseInlineHtml(html, schema)
  if (inline.length > 0) {
    return schema.nodes.paragraph.create(null, inline)
  }
  return null
}

const OBSIDIAN_EMBED_REGEX = /^!\[\[([^[\]]+)\]\]$/

function convertParagraph(node: Paragraph, schema: Schema): ProseMirrorNode | ProseMirrorNode[] {
  if (node.children.length === 1 && node.children[0].type === "text" && schema.nodes.file_embed) {
    const text = (node.children[0] as Text).value.trim()
    const match = text.match(OBSIDIAN_EMBED_REGEX)
    if (match) {
      return schema.nodes.file_embed.create({ src: match[1].trim() })
    }
  }

  // Check if paragraph contains only an image (make it a block image)
  if (node.children.length === 1 && node.children[0].type === "image" && schema.nodes.image) {
    const imgNode = node.children[0] as Image
    return schema.nodes.image.create({
      src: imgNode.url,
      alt: imgNode.alt || "",
      title: imgNode.title || null
    })
  }

  const inline = convertInlineContent(node.children, schema)
  return schema.nodes.paragraph.create(null, inline)
}

function convertHeading(node: Heading, schema: Schema): ProseMirrorNode {
  const level = Math.min(node.depth, 3) // Cap at h3
  const inline = convertInlineContent(node.children, schema)
  return schema.nodes.heading.create({ level }, inline)
}

// Convert list to flat blocks (bullet_item, numbered_item, or task_item)
function convertList(node: List, schema: Schema, indent: number = 0): ProseMirrorNode[] {
  const isTaskList = node.children.some(item => typeof item.checked === "boolean")
  const blocks: ProseMirrorNode[] = []

  for (const item of node.children) {
    const itemBlocks = convertListItemFlat(item, schema, node.ordered, isTaskList, indent)
    blocks.push(...itemBlocks)
  }

  return blocks
}

// Convert a single list item to flat blocks
function convertListItemFlat(
  node: ListItem,
  schema: Schema,
  isOrdered: boolean,
  isTask: boolean,
  indent: number
): ProseMirrorNode[] {
  const blocks: ProseMirrorNode[] = []

  // Determine the node type
  let nodeType: typeof schema.nodes[string] | undefined
  const attrs: Record<string, unknown> = { indent }

  if (isTask && typeof node.checked === "boolean") {
    nodeType = schema.nodes.task_item
    attrs.checked = node.checked
  } else if (isOrdered) {
    nodeType = schema.nodes.numbered_item
  } else {
    nodeType = schema.nodes.bullet_item
  }

  if (!nodeType) return blocks

  // Process children - first paragraph becomes the item content,
  // nested lists become deeper items
  let firstParagraphProcessed = false

  for (const child of node.children) {
    if (child.type === "paragraph" && !firstParagraphProcessed) {
      // Convert paragraph content to inline content for the list item
      const inline = convertInlineContent((child as Paragraph).children, schema)
      blocks.push(nodeType.create(attrs, inline))
      firstParagraphProcessed = true
    } else if (child.type === "list") {
      // Nested list - recurse with increased indent
      const nestedBlocks = convertList(child as List, schema, indent + 1)
      blocks.push(...nestedBlocks)
    }
    // Other block types after the first paragraph are skipped in flat model
  }

  // If no paragraph was found, create an empty item
  if (!firstParagraphProcessed) {
    blocks.push(nodeType.create(attrs))
  }

  return blocks
}

function convertBlockquote(node: Blockquote, schema: Schema): ProseMirrorNode | null {
  if (!schema.nodes.blockquote) return null

  const content: ProseMirrorNode[] = []
  for (const child of node.children) {
    const block = convertBlock(child as RootContent, schema)
    if (block) {
      if (Array.isArray(block)) {
        content.push(...block)
      } else {
        content.push(block)
      }
    }
  }

  return schema.nodes.blockquote.create(null, content)
}

function convertTable(node: Table, schema: Schema): ProseMirrorNode | null {
  if (!schema.nodes.table || !schema.nodes.table_row || !schema.nodes.table_cell || !schema.nodes.table_header) return null

  const rows: ProseMirrorNode[] = []
  node.children.forEach((row, rowIndex) => {
    const cells: ProseMirrorNode[] = []
    row.children.forEach((cell, columnIndex) => {
      const cellContent = convertInlineContent(cell.children, schema)
      const cellType = rowIndex === 0 ? schema.nodes.table_header : schema.nodes.table_cell
      cells.push(cellType.create(
        { alignment: node.align?.[columnIndex] ?? null },
        cellContent.length > 0 ? cellContent : null
      ))
    })
    rows.push(schema.nodes.table_row.create(null, cells))
  })

  return schema.nodes.table.create(null, rows)
}

function convertCodeBlock(node: Code, schema: Schema): ProseMirrorNode | null {
  // Check if it's a mermaid diagram
  if (node.lang === "mermaid" && schema.nodes.mermaid) {
    return schema.nodes.mermaid.create({
      code: node.value || "",
      mode: "split"
    })
  }

  // Check if it's a database embed
  if (node.lang === "db" && schema.nodes.database_embed) {
    const attrs: Record<string, string> = { source: "", viewType: "table", filter: "", sort: "" }
    const lines = (node.value || "").split("\n")
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.*)$/)
      if (match) {
        const [, key, value] = match
        if (key === "source") attrs.source = value.trim()
        else if (key === "view") attrs.viewType = value.trim()
        else if (key === "filter") attrs.filter = value.trim()
        else if (key === "sort") attrs.sort = value.trim()
      }
    }
    return schema.nodes.database_embed.create(attrs)
  }

  if (!schema.nodes.code_block) return null
  return schema.nodes.code_block.create(
    { language: node.lang || null },
    node.value ? schema.text(node.value) : null
  )
}

function convertInlineContent(
  children: MdastPhrasingContent[],
  schema: Schema,
  inheritedMarks: Array<{ name: MarkName; attrs?: MarkAttrs }> = []
): ProseMirrorNode[] {
  const result: ProseMirrorNode[] = []
  let activeMarks = [...inheritedMarks]

  for (const child of children) {
    if (child.type === "html") {
      const customMarkTag = parseCustomMarkTag(child.value)
      if (customMarkTag) {
        if (customMarkTag.closing) {
          const markIndex = activeMarks.map((mark) => mark.name).lastIndexOf(customMarkTag.mark.name)
          if (markIndex >= 0) activeMarks.splice(markIndex, 1)
        } else {
          activeMarks.push(customMarkTag.mark)
        }
        continue
      }
    }

    const nodes = convertInline(child, schema, activeMarks)
    result.push(...nodes)
  }

  return result
}

type MarkName = "bold" | "italic" | "underline" | "strikethrough" | "code" | "link" | "highlight"
type MarkAttrs = { href?: string; title?: string | null; mention?: boolean }

function parseCustomMarkTag(html: string): {
  closing: boolean
  mark: { name: MarkName; attrs?: MarkAttrs }
} | null {
  const tag = html.trim()

  if (/^<u>$/i.test(tag)) return { closing: false, mark: { name: "underline" } }
  if (/^<\/u>$/i.test(tag)) return { closing: true, mark: { name: "underline" } }
  if (/^<s>$/i.test(tag)) return { closing: false, mark: { name: "strikethrough" } }
  if (/^<\/s>$/i.test(tag)) return { closing: true, mark: { name: "strikethrough" } }
  if (/^<\/mark>$/i.test(tag)) return { closing: true, mark: { name: "highlight" } }

  const highlight = tag.match(/^<mark(?:\s+data-color="\w+")?>$/i)
  if (highlight) {
    return {
      closing: false,
      mark: { name: "highlight" }
    }
  }

  return null
}

function convertInline(node: MdastPhrasingContent, schema: Schema, marks: Array<{ name: MarkName; attrs?: MarkAttrs }>): ProseMirrorNode[] {
  switch (node.type) {
    case "text":
      return [createTextWithMarks(node.value, marks, schema)]

    case "strong":
      return convertInlineContent(node.children, schema, [...marks, { name: "bold" }])

    case "emphasis":
      return convertInlineContent(node.children, schema, [...marks, { name: "italic" }])

    case "delete":
      return convertInlineContent(node.children, schema, [...marks, { name: "strikethrough" }])

    case "inlineCode":
      return [createTextWithMarks(node.value, [...marks, { name: "code" }], schema)]

    case "link":
      return convertInlineContent(node.children, schema, [
        ...marks,
        {
          name: "link",
          attrs: {
            href: node.url,
            title: node.title,
            mention: inlineMarkdownText(node.children).startsWith("@")
          }
        }
      ])

    case "html":
      // Handle inline HTML (our custom syntax)
      return parseInlineHtml(node.value, schema, marks)

    case "break":
      return [schema.nodes.hard_break.create()]

    default:
      // For other inline types, try to get text content
      if ("value" in node && typeof node.value === "string") {
        return [createTextWithMarks(node.value, marks, schema)]
      }
      if ("children" in node && Array.isArray(node.children)) {
        return flatMap(node.children as MdastPhrasingContent[], (child) =>
          convertInline(child, schema, marks)
        )
      }
      return []
  }
}

function inlineMarkdownText(nodes: MdastPhrasingContent[]): string {
  return nodes.map((node) => {
    if ("value" in node && typeof node.value === "string") return node.value
    if ("children" in node && Array.isArray(node.children)) {
      return inlineMarkdownText(node.children as MdastPhrasingContent[])
    }
    return ""
  }).join("")
}

function parseInlineHtml(html: string, schema: Schema, existingMarks: Array<{ name: MarkName; attrs?: MarkAttrs }> = []): ProseMirrorNode[] {
  const results: ProseMirrorNode[] = []

  // Parse <u>text</u>
  const underlineMatch = html.match(/<u>([^<]+)<\/u>/)
  if (underlineMatch) {
    results.push(createTextWithMarks(underlineMatch[1], [...existingMarks, { name: "underline" }], schema))
    return results
  }

  // Parse <s>text</s>
  const strikeMatch = html.match(/<s>([^<]+)<\/s>/)
  if (strikeMatch) {
    results.push(createTextWithMarks(strikeMatch[1], [...existingMarks, { name: "strikethrough" }], schema))
    return results
  }

  // Legacy colored mark HTML is imported as the single default highlight.
  const markColorMatch = html.match(/<mark data-color="\w+">([^<]+)<\/mark>/)
  if (markColorMatch) {
    results.push(createTextWithMarks(markColorMatch[1], [...existingMarks, { name: "highlight" }], schema))
    return results
  }

  // Parse <mark>text</mark>
  const markMatch = html.match(/<mark>([^<]+)<\/mark>/)
  if (markMatch) {
    results.push(createTextWithMarks(markMatch[1], [...existingMarks, { name: "highlight" }], schema))
    return results
  }

  // If no match, return as plain text
  const textContent = html.replace(/<[^>]+>/g, '')
  if (textContent) {
    results.push(createTextWithMarks(textContent, existingMarks, schema))
  }

  return results
}

function createTextWithMarks(text: string, marks: Array<{ name: MarkName; attrs?: MarkAttrs }>, schema: Schema): ProseMirrorNode {
  if (!text) return schema.text(" ")

  const pmMarks = marks
    .filter((m) => schema.marks[m.name])
    .map((m) => schema.marks[m.name].create(m.attrs || {}))

  return schema.text(text, pmMarks)
}

function flatMap<T, U>(arr: T[], fn: (item: T) => U[]): U[] {
  return arr.reduce<U[]>((acc, item) => acc.concat(fn(item)), [])
}

// Serialize ProseMirror document to markdown string
export function serializeMarkdown(doc: ProseMirrorNode): string {
  const lines: string[] = []
  serializeBlocks(doc, lines, "")
  // Remove trailing empty lines but keep one newline at end
  let result = lines.join("\n")
  result = result.replace(/\n+$/, "\n")
  return result
}

// Track state for serializing consecutive list items
interface SerializeState {
  numberedCounters: number[] // Counter per indent level for numbered items
  prevNodeType: string | null
  prevIndent: number
}

function serializeBlocks(parent: ProseMirrorNode, lines: string[], indent: string): void {
  const state: SerializeState = {
    numberedCounters: [0, 0, 0, 0, 0],
    prevNodeType: null,
    prevIndent: -1
  }

  const listItemTypes = ["bullet_item", "numbered_item", "task_item"]
  let lastIndex = -1
  parent.forEach(() => lastIndex++)

  parent.forEach((node, _, index) => {
    const typeName = node.type.name
    const isListItem = listItemTypes.includes(typeName)
    const wasListItem = state.prevNodeType && listItemTypes.includes(state.prevNodeType)

    // Add empty line when transitioning from list items to non-list or at end of doc
    if (wasListItem && !isListItem) {
      lines.push("")
    }

    serializeBlock(node, lines, indent, index, state)

    // Add empty line after last list item at end of document
    if (isListItem && index === lastIndex) {
      lines.push("")
    }
  })
}

function serializeBlock(node: ProseMirrorNode, lines: string[], indent: string, index: number, state?: SerializeState): void {
  // Initialize state if not provided (for recursive calls)
  if (!state) {
    state = { numberedCounters: [0, 0, 0, 0, 0], prevNodeType: null, prevIndent: -1 }
  }

  const typeName = node.type.name
  const isListItem = typeName === "bullet_item" || typeName === "numbered_item" || typeName === "task_item"

  // Reset numbered counters when transitioning from list to non-list
  if (!isListItem && state.prevNodeType && ["bullet_item", "numbered_item", "task_item"].includes(state.prevNodeType)) {
    state.numberedCounters = [0, 0, 0, 0, 0]
  }

  switch (typeName) {
    case "paragraph":
      lines.push(indent + serializeInline(node))
      lines.push("")
      break

    case "heading":
      const hashes = "#".repeat(node.attrs.level)
      lines.push(indent + hashes + " " + serializeInline(node))
      lines.push("")
      break

    case "bullet_item": {
      const itemIndent = node.attrs.indent || 0
      const indentStr = "    ".repeat(itemIndent)
      lines.push(indent + indentStr + "- " + serializeInline(node))
      state.prevNodeType = typeName
      state.prevIndent = itemIndent
      break
    }

    case "numbered_item": {
      const itemIndent = node.attrs.indent || 0
      if (state.prevNodeType !== "numbered_item") {
        state.numberedCounters.fill(0)
      } else if (itemIndent > state.prevIndent) {
        for (let i = itemIndent; i < state.numberedCounters.length; i++) {
          state.numberedCounters[i] = 0
        }
      } else if (itemIndent < state.prevIndent) {
        // Keep the existing counter at the level we return to, but reset every
        // deeper level so a later nested list begins at one again.
        for (let i = itemIndent + 1; i < state.numberedCounters.length; i++) {
          state.numberedCounters[i] = 0
        }
      }
      state.numberedCounters[itemIndent]++
      const num = state.numberedCounters[itemIndent]
      const indentStr = "    ".repeat(itemIndent)
      lines.push(indent + indentStr + `${num}. ` + serializeInline(node))
      state.prevNodeType = typeName
      state.prevIndent = itemIndent
      break
    }

    case "task_item": {
      const itemIndent = node.attrs.indent || 0
      const checkbox = node.attrs.checked ? "[x]" : "[ ]"
      const indentStr = "    ".repeat(itemIndent)
      lines.push(indent + indentStr + `- ${checkbox} ` + serializeInline(node))
      state.prevNodeType = typeName
      state.prevIndent = itemIndent
      break
    }

    case "blockquote":
      const quoteLines: string[] = []
      serializeBlocks(node, quoteLines, "")
      quoteLines.forEach((line) => {
        lines.push(indent + "> " + line)
      })
      break

    case "code_block":
      lines.push(indent + "```" + (node.attrs.language || ""))
      lines.push(indent + node.textContent)
      lines.push(indent + "```")
      lines.push("")
      break

    case "mermaid":
      lines.push(indent + "```mermaid")
      const code = node.attrs.code || ""
      code.split("\n").forEach((line: string) => {
        lines.push(indent + line)
      })
      lines.push(indent + "```")
      lines.push("")
      break

    case "database_embed":
      lines.push(indent + "```db")
      if (node.attrs.source) lines.push(indent + "source: " + node.attrs.source)
      if (node.attrs.viewType && node.attrs.viewType !== "table") lines.push(indent + "view: " + node.attrs.viewType)
      if (node.attrs.filter) lines.push(indent + "filter: " + node.attrs.filter)
      if (node.attrs.sort) lines.push(indent + "sort: " + node.attrs.sort)
      lines.push(indent + "```")
      lines.push("")
      break

    case "file_embed":
      lines.push(indent + `![[${node.attrs.src || ""}]]`)
      lines.push("")
      break

    case "table":
      serializeTable(node, lines, indent)
      break

    case "image":
      const alt = node.attrs.alt || ""
      const src = node.attrs.src || ""
      const title = node.attrs.title ? ` "${node.attrs.title}"` : ""
      // Store alignment and caption as HTML comment if present
      const hasExtras = node.attrs.alignment !== "center" || node.attrs.caption
      if (hasExtras) {
        const extras: string[] = []
        if (node.attrs.alignment && node.attrs.alignment !== "center") {
          extras.push(`align="${node.attrs.alignment}"`)
        }
        if (node.attrs.caption) {
          extras.push(`caption="${node.attrs.caption.replace(/"/g, '&quot;')}"`)
        }
        lines.push(indent + `<!-- ${extras.join(" ")} -->`)
      }
      lines.push(indent + `![${alt}](${src}${title})`)
      lines.push("")
      break

    case "horizontal_rule":
      lines.push(indent + "---")
      lines.push("")
      break

    default:
      // Fallback: serialize as paragraph
      lines.push(indent + serializeInline(node))
      lines.push("")
  }
}

function serializeTable(node: ProseMirrorNode, lines: string[], indent: string): void {
  const rows: string[][] = []
  const alignments: Array<string | null> = []
  node.forEach((row) => {
    const cells: string[] = []
    row.forEach((cell, _, columnIndex) => {
      cells.push(serializeInline(cell).replace(/\|/g, "\\|"))
      if (rows.length === 0) alignments[columnIndex] = cell.attrs.alignment || null
    })
    rows.push(cells)
  })

  if (rows.length === 0) return

  // Compute column widths
  const colCount = Math.max(...rows.map(r => r.length))
  const widths: number[] = Array(colCount).fill(3)
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      widths[i] = Math.max(widths[i], row[i].length)
    }
  }

  // Header row
  const header = rows[0]
  lines.push(indent + "| " + widths.map((w, i) => (header[i] || "").padEnd(w)).join(" | ") + " |")
  // Separator
  lines.push(indent + "| " + widths.map((_, index) => tableAlignmentDelimiter(alignments[index])).join(" | ") + " |")
  // Data rows
  for (let r = 1; r < rows.length; r++) {
    lines.push(indent + "| " + widths.map((w, i) => (rows[r][i] || "").padEnd(w)).join(" | ") + " |")
  }
  lines.push("")
}

function tableAlignmentDelimiter(alignment: string | null | undefined): string {
  switch (alignment) {
    case "left":
      return ":---"
    case "center":
      return ":---:"
    case "right":
      return "---:"
    default:
      return "---"
  }
}

function serializeListItem(node: ProseMirrorNode, lines: string[], indent: string, bullet: string): void {
  let first = true
  node.forEach((child) => {
    if (first) {
      // First child gets the bullet
      if (child.type.name === "paragraph") {
        lines.push(indent + bullet + serializeInline(child))
      } else {
        const subLines: string[] = []
        serializeBlock(child, subLines, "", 0)
        if (subLines.length > 0) {
          lines.push(indent + bullet + subLines[0])
          for (let i = 1; i < subLines.length; i++) {
            lines.push(indent + "  " + subLines[i])
          }
        }
      }
      first = false
    } else {
      // Subsequent children are indented
      serializeBlock(child, lines, indent + "  ", 0)
    }
  })
}

function serializeInline(parent: ProseMirrorNode): string {
  let result = ""

  parent.forEach((node) => {
    if (node.type.name === "text") {
      let text = node.text || ""
      const marks = node.marks

      // Apply marks - order matters for nesting
      for (const mark of marks) {
        switch (mark.type.name) {
          case "bold":
            text = `**${text}**`
            break
          case "italic":
            text = `*${text}*`
            break
          case "underline":
            text = `__${text}__`
            break
          case "strikethrough":
            text = `~~${text}~~`
            break
          case "code":
            text = `\`${text}\``
            break
          case "highlight":
            text = `==${text}==`
            break
          case "link":
            const title = mark.attrs.title ? ` "${mark.attrs.title}"` : ""
            text = `[${text}](${serializeLinkDestination(mark.attrs.href)}${title})`
            break
        }
      }

      result += text
    } else if (node.type.name === "hard_break") {
      result += "  \n"
    }
  })

  return result
}

function serializeLinkDestination(href: string): string {
  return /\s/u.test(href) && !href.startsWith("<")
    ? `<${href}>`
    : href
}
