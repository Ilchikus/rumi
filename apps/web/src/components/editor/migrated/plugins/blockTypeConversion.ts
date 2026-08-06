import { Fragment, type Node as PmNode, type Schema } from "prosemirror-model"
import { TextSelection, type EditorState, type Transaction } from "prosemirror-state"
import { multiBlockSelectionKey } from "./multiBlockSelection"
import type { BlockTypeOption } from "./blockTypePresentation"

const DEFAULT_MERMAID_CODE = `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Result 1]
    B -->|No| D[Result 2]`

function blockAlreadyHasMenuType(
  node: PmNode,
  option: BlockTypeOption
): boolean {
  if (node.type.name !== option.type) return false
  if (option.type !== "heading") return true
  return node.attrs.level === option.attrs?.level
}

function sourceText(node: PmNode): string {
  return node.textContent
}

function sourceInlineContent(node: PmNode, schema: Schema): Fragment | null {
  if (node.isTextblock) {
    return node.content.size > 0 ? node.content : null
  }

  const text = sourceText(node)
  return text ? Fragment.from(schema.text(text)) : null
}

function singleColumnTableRows(node: PmNode): Array<Fragment | null> | null {
  if (node.type.name !== "table") return null

  const rows: Array<Fragment | null> = []
  let isSingleColumn = true
  node.forEach((row) => {
    const cell = row.firstChild
    if (row.childCount !== 1 || Number(cell?.attrs.colspan ?? 1) !== 1) {
      isSingleColumn = false
      return
    }

    rows.push(cell && cell.content.size > 0 ? cell.content : null)
  })

  return isSingleColumn ? rows : null
}

function splitInlineContentIntoLines(node: PmNode, schema: Schema): Array<Fragment | null> {
  const tableRows = singleColumnTableRows(node)
  if (tableRows) return tableRows

  if (!node.isTextblock) {
    return [sourceInlineContent(node, schema)]
  }

  const lines: PmNode[][] = [[]]

  node.forEach((child) => {
    if (child.type.name === "soft_break" || child.type.name === "hard_break") {
      lines.push([])
      return
    }

    if (child.isText && child.text?.includes("\n")) {
      const parts = child.text.split("\n")
      parts.forEach((part, index) => {
        if (part) lines.at(-1)!.push(schema.text(part, child.marks))
        if (index < parts.length - 1) lines.push([])
      })
      return
    }

    lines.at(-1)!.push(child)
  })

  return lines.map((line) => line.length > 0 ? Fragment.fromArray(line) : null)
}

function createBlockNodeForType(
  schema: Schema,
  sourceNode: PmNode,
  option: BlockTypeOption
): PmNode[] | null {
  const targetType = schema.nodes[option.type]
  if (!targetType) return null

  const inlineContent = sourceInlineContent(sourceNode, schema)
  const text = sourceText(sourceNode)

  switch (option.type) {
    case "paragraph":
      return [targetType.create(null, inlineContent)]
    case "heading":
      return [targetType.create(option.attrs, inlineContent)]
    case "code_block":
      return [targetType.create(
        null,
        text ? schema.text(text) : null
      )]
    case "blockquote": {
      const paragraph = schema.nodes.paragraph
      if (!paragraph) return null
      return [targetType.create(null, paragraph.create(null, inlineContent))]
    }
    case "bullet_item":
      return splitInlineContentIntoLines(sourceNode, schema)
        .map((line) => targetType.create({ indent: 0 }, line))
    case "numbered_item":
      return splitInlineContentIntoLines(sourceNode, schema)
        .map((line) => targetType.create({ indent: 0 }, line))
    case "task_item":
      return splitInlineContentIntoLines(sourceNode, schema)
        .map((line) => targetType.create({ indent: 0, checked: false }, line))
    case "table": {
      const tableHeader = schema.nodes.table_header
      const tableCell = schema.nodes.table_cell
      const tableRow = schema.nodes.table_row
      if (!tableHeader || !tableCell || !tableRow) return null

      const content = text ? schema.text(text) : schema.text(" ")
      const headerCell = tableHeader.create(null, content)
      const emptyHeader = tableHeader.create(null, schema.text(" "))
      const emptyCell = tableCell.create(null, schema.text(" "))
      const headerRow = tableRow.create(
        null,
        [headerCell, emptyHeader, emptyHeader.copy(emptyHeader.content)]
      )
      const dataRow = tableRow.create(
        null,
        [emptyCell, emptyCell.copy(emptyCell.content), emptyCell.copy(emptyCell.content)]
      )
      return [targetType.create(
        null,
        [headerRow, dataRow, dataRow.copy(dataRow.content)]
      )]
    }
    case "mermaid":
      return [targetType.create(
        { mode: "view" },
        schema.text(DEFAULT_MERMAID_CODE)
      )]
    case "horizontal_rule":
      return [targetType.create()]
    default:
      return null
  }
}

function finishBlockTypeChangeTransaction(
  transaction: Transaction,
  blockPos: number
): Transaction {
  const node = transaction.doc.nodeAt(blockPos)
  transaction.setMeta(multiBlockSelectionKey, {
    selectedBlocks: [],
    anchorBlock: null
  })

  if (node) {
    transaction.setSelection(
      TextSelection.near(
        transaction.doc.resolve(blockPos + node.nodeSize - 1),
        -1
      )
    )
  }

  return transaction.scrollIntoView()
}

export function createBlockTypeChangeTransaction(
  state: EditorState,
  positions: readonly number[],
  option: BlockTypeOption
): Transaction | null {
  const validPositions = [...new Set(positions)]
    .filter(position => state.doc.nodeAt(position) !== null)
  if (validPositions.length === 0) return null

  let transaction = state.tr
  const descendingPositions = [...validPositions].sort((left, right) => right - left)
  const finalOriginalPos = Math.max(...validPositions)
  let finalReplacementNodes: readonly PmNode[] | null = null

  for (const originalPos of descendingPositions) {
    const blockPos = transaction.mapping.map(originalPos)
    const sourceNode = transaction.doc.nodeAt(blockPos)
    if (!sourceNode || blockAlreadyHasMenuType(sourceNode, option)) continue

    const replacements = createBlockNodeForType(
      state.schema,
      sourceNode,
      option
    )
    if (!replacements) continue

    transaction = transaction.replaceWith(
      blockPos,
      blockPos + sourceNode.nodeSize,
      replacements
    )
    if (originalPos === finalOriginalPos) finalReplacementNodes = replacements
  }

  let finalBlockPos = transaction.mapping.map(finalOriginalPos, -1)
  if (finalReplacementNodes && finalReplacementNodes.length > 1) {
    finalBlockPos += finalReplacementNodes
      .slice(0, -1)
      .reduce((size, node) => size + node.nodeSize, 0)
  }
  return finishBlockTypeChangeTransaction(transaction, finalBlockPos)
}
