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
  return node.type.name === "mermaid"
    ? String(node.attrs.code ?? "")
    : node.textContent
}

function sourceInlineContent(node: PmNode, schema: Schema): Fragment | null {
  if (node.isTextblock) {
    return node.content.size > 0 ? node.content : null
  }

  const text = sourceText(node)
  return text ? Fragment.from(schema.text(text)) : null
}

function createBlockNodeForType(
  schema: Schema,
  sourceNode: PmNode,
  option: BlockTypeOption
): PmNode | null {
  const targetType = schema.nodes[option.type]
  if (!targetType) return null

  const inlineContent = sourceInlineContent(sourceNode, schema)
  const text = sourceText(sourceNode)

  switch (option.type) {
    case "paragraph":
      return targetType.create(null, inlineContent)
    case "heading":
      return targetType.create(option.attrs, inlineContent)
    case "code_block":
      return targetType.create(
        null,
        text ? schema.text(text) : null
      )
    case "blockquote": {
      const paragraph = schema.nodes.paragraph
      if (!paragraph) return null
      return targetType.create(null, paragraph.create(null, inlineContent))
    }
    case "bullet_item":
      return targetType.create({ indent: 0 }, inlineContent)
    case "numbered_item":
      return targetType.create({ indent: 0 }, inlineContent)
    case "task_item":
      return targetType.create(
        { indent: 0, checked: false },
        inlineContent
      )
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
      return targetType.create(
        null,
        [headerRow, dataRow, dataRow.copy(dataRow.content)]
      )
    }
    case "mermaid":
      return targetType.create({
        code: DEFAULT_MERMAID_CODE,
        mode: "split"
      })
    case "horizontal_rule":
      return targetType.create()
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

  for (const originalPos of descendingPositions) {
    const blockPos = transaction.mapping.map(originalPos)
    const sourceNode = transaction.doc.nodeAt(blockPos)
    if (!sourceNode || blockAlreadyHasMenuType(sourceNode, option)) continue

    const replacement = createBlockNodeForType(
      state.schema,
      sourceNode,
      option
    )
    if (!replacement) continue

    transaction = transaction.replaceWith(
      blockPos,
      blockPos + sourceNode.nodeSize,
      replacement
    )
  }

  const finalOriginalPos = Math.max(...validPositions)
  const finalBlockPos = transaction.mapping.map(finalOriginalPos)
  return finishBlockTypeChangeTransaction(transaction, finalBlockPos)
}
