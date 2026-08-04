import type { Node as ProseMirrorNode } from "prosemirror-model"
import {
  NodeSelection,
  TextSelection,
  type Command,
  type EditorState,
  type Transaction
} from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import {
  chooseAndUploadAsset,
  reportEditorError
} from "../platform"
import { createBlockTypeChangeTransaction } from "./blockTypeConversion"
import type { BlockTypeOption } from "./blockTypePresentation"
import {
  createDeleteBlocksTransaction,
  moveBlocks,
  multiBlockSelectionKey,
  type BlockMoveDirection
} from "./multiBlockSelection"
import { transactionLeavesEditorInactive } from "../inactiveBlockSelection"
import {
  StructuralCaretSelection,
  structuralCaretContext
} from "../structuralCaretSelection"

const IMAGE_FILE_TYPES = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp"
])

export type AdjacentBlockDirection = "before" | "after"

export function toolbarBlockPositions(state: EditorState): number[] {
  const selected = multiBlockSelectionKey.getState(state)?.selectedBlocks ?? []
  const validSelected = [...new Set(selected)]
    .filter((pos) => state.doc.nodeAt(pos) !== null)
    .sort((left, right) => left - right)
  if (validSelected.length > 0) return validSelected

  if (state.selection instanceof StructuralCaretSelection) {
    const context = structuralCaretContext(
      state.selection.$head,
      state.selection.side
    )
    return context ? [context.nodePos] : []
  }

  const { $from } = state.selection
  if ($from.depth > 0) return [$from.before(1)]
  return state.doc.nodeAt(state.selection.from) ? [state.selection.from] : []
}

export function createAdjacentParagraphTransaction(
  state: EditorState,
  direction: AdjacentBlockDirection
): Transaction | null {
  const paragraph = state.schema.nodes.paragraph?.create()
  if (!paragraph) return null
  return createAdjacentNodeTransaction(state, paragraph, direction, true)
}

export function insertAdjacentParagraph(
  view: EditorView,
  direction: AdjacentBlockDirection
): boolean {
  const inserted = insertAdjacentParagraphCommand(direction)(
    view.state,
    view.dispatch
  )
  if (inserted) view.focus()
  return inserted
}

export function insertAdjacentParagraphCommand(
  direction: AdjacentBlockDirection
): Command {
  return (state, dispatch) => {
    const transaction = createAdjacentParagraphTransaction(state, direction)
    if (!transaction) return false
    dispatch?.(transaction)
    return true
  }
}

export function changeToolbarBlockType(
  view: EditorView,
  option: BlockTypeOption
): boolean {
  const transaction = createBlockTypeChangeTransaction(
    view.state,
    toolbarBlockPositions(view.state),
    option
  )
  if (!transaction) return false
  view.dispatch(transaction)
  view.focus()
  return true
}

export function moveToolbarBlocks(
  view: EditorView,
  direction: BlockMoveDirection
): boolean {
  const moved = moveBlocks(direction)(view.state, view.dispatch)
  if (moved) view.focus()
  return moved
}

export function createDeleteToolbarBlocksTransaction(
  state: EditorState
): Transaction | null {
  return createDeleteBlocksTransaction(state, toolbarBlockPositions(state))
}

export function deleteToolbarBlocks(view: EditorView): boolean {
  const transaction = createDeleteToolbarBlocksTransaction(view.state)
  if (!transaction) return false

  const deactivateSelection = transactionLeavesEditorInactive(transaction)
  view.dispatch(transaction)
  if (!deactivateSelection) view.focus()
  return true
}

export function isToolbarBlockTypeActive(
  state: EditorState,
  option: BlockTypeOption
): boolean {
  const positions = toolbarBlockPositions(state)
  return positions.length > 0 && positions.every((pos) => {
    const node = state.doc.nodeAt(pos)
    if (!node || node.type.name !== option.type) return false
    return option.type !== "heading" || node.attrs.level === option.attrs?.level
  })
}

export function allowedMediaAccept(allowedFileTypes: readonly string[]): string {
  return [...new Set(allowedFileTypes.map(normalizeFileType).filter(Boolean))].join(",")
}

export function createUploadedMediaTransaction(
  state: EditorState,
  relativePath: string
): Transaction | null {
  const extension = fileExtension(relativePath)
  const node = IMAGE_FILE_TYPES.has(extension)
    ? state.schema.nodes.image?.create({ src: relativePath })
    : state.schema.nodes.file_embed?.create({ src: relativePath })
  if (!node) return null
  return createAdjacentNodeTransaction(state, node, "after", false)
}

export async function chooseAndInsertToolbarMedia(
  view: EditorView,
  allowedFileTypes: readonly string[]
): Promise<boolean> {
  const accept = allowedMediaAccept(allowedFileTypes)
  if (!accept) return false

  try {
    const relativePath = await chooseAndUploadAsset(accept)
    if (!relativePath) return false
    const transaction = createUploadedMediaTransaction(view.state, relativePath)
    if (!transaction) return false
    view.dispatch(transaction)
    view.focus()
    return true
  } catch (error) {
    reportEditorError(error)
    return false
  }
}

function createAdjacentNodeTransaction(
  state: EditorState,
  node: ProseMirrorNode,
  direction: AdjacentBlockDirection,
  textSelection: boolean
): Transaction | null {
  const positions = toolbarBlockPositions(state)
  if (positions.length === 0) return null

  const boundaryPos = direction === "before" ? positions[0]! : positions.at(-1)!
  const boundaryNode = state.doc.nodeAt(boundaryPos)
  if (!boundaryNode) return null
  const insertPos = direction === "before"
    ? boundaryPos
    : boundaryPos + boundaryNode.nodeSize
  const transaction = state.tr.insert(insertPos, node)
  transaction.setMeta(multiBlockSelectionKey, {
    selectedBlocks: [],
    anchorBlock: null
  })
  transaction.setSelection(
    textSelection
      ? TextSelection.create(transaction.doc, insertPos + 1)
      : NodeSelection.create(transaction.doc, insertPos)
  )
  return transaction.scrollIntoView()
}

function normalizeFileType(fileType: string): string {
  const trimmed = fileType.trim().toLowerCase()
  if (!trimmed) return ""
  const extension = trimmed.startsWith(".") ? trimmed : `.${trimmed}`
  return /^\.[a-z0-9]+$/u.test(extension) ? extension : ""
}

function fileExtension(path: string): string {
  const cleanPath = path.split(/[?#]/u, 1)[0]?.toLowerCase() ?? ""
  const dot = cleanPath.lastIndexOf(".")
  return dot >= 0 ? cleanPath.slice(dot) : ""
}
