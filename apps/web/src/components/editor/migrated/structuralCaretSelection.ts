import { Slice, type Node as ProseMirrorNode, type ResolvedPos } from "prosemirror-model"
import {
  Selection,
  TextSelection,
  type SelectionBookmark
} from "prosemirror-state"
import type { Mappable } from "prosemirror-transform"

export type StructuralCaretSide = "before" | "after"

const STRUCTURAL_CARET_BLOCKS = new Set([
  "database_embed",
  "horizontal_rule"
])

export interface StructuralCaretContext {
  node: ProseMirrorNode
  nodePos: number
  side: StructuralCaretSide
}

export function supportsStructuralCaret(node: ProseMirrorNode | null): boolean {
  return Boolean(node && STRUCTURAL_CARET_BLOCKS.has(node.type.name))
}

export function structuralCaretContext(
  $pos: ResolvedPos,
  side: StructuralCaretSide
): StructuralCaretContext | null {
  if ($pos.depth !== 0) return null
  const node = side === "before" ? $pos.nodeAfter : $pos.nodeBefore
  if (!node || !supportsStructuralCaret(node)) return null
  return {
    node,
    nodePos: side === "before" ? $pos.pos : $pos.pos - node.nodeSize,
    side
  }
}

export class StructuralCaretSelection extends Selection {
  readonly side: StructuralCaretSide

  constructor($pos: ResolvedPos, side: StructuralCaretSide) {
    super($pos, $pos)
    this.side = side
  }

  map(doc: ProseMirrorNode, mapping: Mappable): Selection {
    const mappedPos = mapping.map(this.head, this.side === "before" ? 1 : -1)
    const $pos = doc.resolve(mappedPos)
    return structuralCaretContext($pos, this.side)
      ? new StructuralCaretSelection($pos, this.side)
      : Selection.near($pos, this.side === "before" ? 1 : -1)
  }

  content(): Slice {
    return Slice.empty
  }

  eq(other: Selection): boolean {
    return other instanceof StructuralCaretSelection &&
      other.head === this.head &&
      other.side === this.side
  }

  toJSON(): { type: string; pos: number; side: StructuralCaretSide } {
    return { type: "rumi-structural-caret", pos: this.head, side: this.side }
  }

  getBookmark(): SelectionBookmark {
    return new StructuralCaretBookmark(this.head, this.side)
  }

  static fromJSON(
    doc: ProseMirrorNode,
    json: { pos?: unknown; side?: unknown }
  ): StructuralCaretSelection {
    if (
      typeof json.pos !== "number" ||
      (json.side !== "before" && json.side !== "after")
    ) {
      throw new RangeError("Invalid structural caret selection")
    }
    return new StructuralCaretSelection(doc.resolve(json.pos), json.side)
  }
}

StructuralCaretSelection.prototype.visible = false
Selection.jsonID("rumi-structural-caret", StructuralCaretSelection)

class StructuralCaretBookmark implements SelectionBookmark {
  constructor(
    readonly pos: number,
    readonly side: StructuralCaretSide
  ) {}

  map(mapping: Mappable): StructuralCaretBookmark {
    return new StructuralCaretBookmark(
      mapping.map(this.pos, this.side === "before" ? 1 : -1),
      this.side
    )
  }

  resolve(doc: ProseMirrorNode): Selection {
    const $pos = doc.resolve(this.pos)
    return structuralCaretContext($pos, this.side)
      ? new StructuralCaretSelection($pos, this.side)
      : Selection.near($pos, this.side === "before" ? 1 : -1)
  }
}

export function structuralCaretAtBlock(
  doc: ProseMirrorNode,
  nodePos: number,
  side: StructuralCaretSide
): StructuralCaretSelection {
  const node = doc.nodeAt(nodePos)
  if (!node || !supportsStructuralCaret(node)) {
    throw new RangeError("Structural caret requires a supported block")
  }
  const pos = side === "before" ? nodePos : nodePos + node.nodeSize
  return new StructuralCaretSelection(doc.resolve(pos), side)
}

export function setMermaidEditSelection(
  transaction: import("prosemirror-state").Transaction,
  nodePos: number,
  side: StructuralCaretSide = "before"
): boolean {
  const node = transaction.doc.nodeAt(nodePos)
  if (!node || node.type.name !== "mermaid") return false

  if (node.attrs.mode !== "edit") {
    transaction.setNodeMarkup(nodePos, undefined, {
      ...node.attrs,
      mode: "edit"
    })
  }
  transaction.setSelection(TextSelection.create(
    transaction.doc,
    side === "before" ? nodePos + 1 : nodePos + node.nodeSize - 1
  ))
  return true
}

export function setSelectionBeforeNextSpecialBlock(
  transaction: import("prosemirror-state").Transaction,
  deletedBlockPos: number
): boolean {
  const nextBlockPos = transaction.mapping.map(deletedBlockPos)
  const nextBlock = transaction.doc.nodeAt(nextBlockPos)
  if (!nextBlock) return false
  if (supportsStructuralCaret(nextBlock)) {
    transaction.setSelection(
      structuralCaretAtBlock(transaction.doc, nextBlockPos, "before")
    )
    return true
  }
  if (nextBlock.type.name === "mermaid") {
    return setMermaidEditSelection(transaction, nextBlockPos)
  }
  return false
}
