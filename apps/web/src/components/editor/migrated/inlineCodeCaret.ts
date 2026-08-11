// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Plugin, TextSelection } from "prosemirror-state"
import { Schema } from "prosemirror-model"

// The closing edge of an inline-code span has exactly two caret states: outside
// the mark, where typing leaves the code, and inside it, where typing continues
// the code. The code mark is non-inclusive, so ProseMirror already types outside
// by default and a stored code mark is the entire "inside" state. This plugin
// only keeps that stored mark alive while typing, switches it with Left/Right,
// and draws the browser caret on the matching side of the <code> element.

// A closing boundary is an empty caret position with code-marked text before it
// and none after it.
export function inlineCodeClosingBoundary(state, schema: Schema): number | null {
  const code = schema.marks.code
  const { selection } = state
  if (!code || !(selection instanceof TextSelection) || !selection.empty) return null

  const { $from } = selection
  if ($from.parent.type.spec.code) return null
  if (!code.isInSet($from.nodeBefore?.marks ?? [])) return null
  if (code.isInSet($from.nodeAfter?.marks ?? [])) return null
  return selection.from
}

export function inlineCodeCaretIsInside(state, schema: Schema): boolean {
  const code = schema.marks.code
  return Boolean(code && code.isInSet(state.storedMarks ?? []))
}

function enterInlineCode(state, code) {
  return state.tr.addStoredMark(code.create())
}

function exitInlineCode(state, code) {
  // Written with setStoredMarks rather than removeStoredMark so the transaction
  // always reports `storedMarksSet`: that flag is how the rest of the plugin
  // tells a deliberate side change from stored marks that typing dropped.
  return state.tr.setStoredMarks(
    code.removeFromSet(state.storedMarks ?? state.selection.$from.marks())
  )
}

// ArrowRight over the last code character. Browsers treat the position after it
// as equivalent to the one inside the mark and may skip it, so the move is made
// explicitly and lands outside the mark, without an affinity stop of its own.
function finalCodeCharacterExit(state, schema: Schema): number | null {
  const code = schema.marks.code
  const { selection } = state
  if (!code || !(selection instanceof TextSelection) || !selection.empty) return null

  const nodeAfter = selection.$from.nodeAfter
  if (!nodeAfter?.isText || nodeAfter.nodeSize !== 1) return null
  if (!code.isInSet(nodeAfter.marks)) return null

  const target = selection.from + 1
  const $target = state.doc.resolve(target)
  return code.isInSet($target.nodeAfter?.marks ?? []) ? null : target
}

function handleArrowKey(view, schema: Schema, key: string): boolean {
  const code = schema.marks.code
  if (!code) return false

  const boundary = inlineCodeClosingBoundary(view.state, schema)
  const inside = inlineCodeCaretIsInside(view.state, schema)

  if (key === "ArrowLeft") {
    // The first Left picks the code side without moving the caret; a second one
    // is an ordinary move through the code text.
    if (boundary === null || inside) return false
    view.dispatch(enterInlineCode(view.state, code))
    return true
  }

  if (boundary !== null) {
    // Right off the code side stays put and only changes sides; from outside it
    // is an ordinary move.
    if (!inside) return false
    view.dispatch(exitInlineCode(view.state, code))
    return true
  }

  const target = finalCodeCharacterExit(view.state, schema)
  if (target === null) return false
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, target)))
  return true
}

// ProseMirror draws every empty selection with `domAtPos(pos, -1)`, which at a
// closing boundary is the end of the text inside the <code> element. The outside
// state moves the browser caret to the text after the element instead. Only text
// nodes are used as anchors: browsers draw a caret at an element position at the
// full line height, so a code span that ends its block keeps the caret where
// ProseMirror put it rather than growing it.
function syncCaretSide(view, schema: Schema) {
  if (view.composing || !view.hasFocus()) return

  const boundary = inlineCodeClosingBoundary(view.state, schema)
  if (boundary === null) return

  const anchor = view.domAtPos(
    boundary,
    inlineCodeCaretIsInside(view.state, schema) ? -1 : 1
  )
  if (anchor.node.nodeType !== 3) return

  const domSelection = view.dom.ownerDocument?.getSelection()
  if (!domSelection) return
  if (
    domSelection.isCollapsed &&
    domSelection.anchorNode === anchor.node &&
    domSelection.anchorOffset === anchor.offset
  ) return

  domSelection.collapse(anchor.node, anchor.offset)
}

export function inlineCodeCaretPlugin(schema: Schema): Plugin {
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return false
        return handleArrowKey(view, schema, event.key)
      },
      handleDOMEvents: {
        focus(view) {
          // Focus restores a selection without running an update, so the caret
          // side has to be applied here as well.
          syncCaretSide(view, schema)
          return false
        },
        mousedown(view) {
          // A click on the boundary position does not move the selection, so the
          // code side has to be dropped here.
          const code = schema.marks.code
          if (
            !code ||
            inlineCodeClosingBoundary(view.state, schema) === null ||
            !inlineCodeCaretIsInside(view.state, schema)
          ) return false

          view.dispatch(exitInlineCode(view.state, code))
          return false
        }
      }
    },
    // Typing clears the stored marks, so the code side is restored after every
    // change that leaves the caret on the same boundary. Transactions that set
    // stored marks themselves are left alone: those are the deliberate switches.
    appendTransaction(transactions, oldState, newState) {
      const code = schema.marks.code
      if (
        !code ||
        transactions.some((transaction) => transaction.storedMarksSet) ||
        !inlineCodeCaretIsInside(oldState, schema) ||
        inlineCodeClosingBoundary(oldState, schema) === null
      ) return null

      const boundary = inlineCodeClosingBoundary(newState, schema)
      if (boundary === null || inlineCodeCaretIsInside(newState, schema)) return null

      const moved = transactions.reduce(
        (position, transaction) => transaction.mapping.map(position, 1),
        oldState.selection.from
      )
      return moved === boundary ? newState.tr.addStoredMark(code.create()) : null
    },
    view(editorView) {
      const sync = () => syncCaretSide(editorView, schema)
      sync()
      return { update: sync }
    }
  })
}
