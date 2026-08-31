// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import {
  inputRules,
  wrappingInputRule,
  textblockTypeInputRule,
  InputRule
} from "prosemirror-inputrules"
import { NodeType, MarkType, Schema } from "prosemirror-model"
import { Plugin, PluginKey, TextSelection } from "prosemirror-state"
import { Decoration, DecorationSet } from "prosemirror-view"

interface InlineCodeInputSession {
  openerPos: number
  cursorPos: number
}

type InlineCodeInputSessionMeta =
  | { type: "start"; openerPos: number }
  | { type: "continue" }
  | { type: "cancel" }

export const inlineCodeInputSessionKey =
  new PluginKey<InlineCodeInputSession | null>("inlineCodeInputSession")

function validInlineCodeInputSession(
  state: import("prosemirror-state").EditorState,
  session: InlineCodeInputSession
): boolean {
  const { selection } = state
  if (
    !(selection instanceof TextSelection) ||
    !selection.empty ||
    selection.from !== session.cursorPos ||
    session.openerPos < 0 ||
    session.openerPos >= selection.from ||
    state.doc.textBetween(session.openerPos, session.openerPos + 1) !== "`"
  ) return false

  return state.doc.resolve(session.openerPos).parent === selection.$from.parent
}

function transactionChangesOnlyPendingInlineCode(
  transaction: import("prosemirror-state").Transaction,
  session: InlineCodeInputSession
): boolean {
  if (transaction.steps.length !== 1) return false

  let changed = false
  let staysWithinSession = true
  transaction.steps[0]!.getMap().forEach((oldStart, oldEnd) => {
    changed = true
    if (
      oldStart < session.openerPos + 1 ||
      oldEnd > session.cursorPos
    ) staysWithinSession = false
  })

  return changed && staysWithinSession
}

export function inlineCodeInputSessionPlugin(schema: Schema): Plugin {
  return new Plugin<InlineCodeInputSession | null>({
    key: inlineCodeInputSessionKey,
    state: {
      init: () => null,
      apply(transaction, session, oldState, newState) {
        const meta = transaction.getMeta(inlineCodeInputSessionKey) as
          InlineCodeInputSessionMeta | undefined

        if (meta?.type === "cancel") return null
        if (meta?.type === "start") {
          const next = {
            openerPos: transaction.mapping.map(meta.openerPos, -1),
            cursorPos: newState.selection.from
          }
          return validInlineCodeInputSession(newState, next) ? next : null
        }
        if (!session) return null

        const next = {
          openerPos: transaction.mapping.map(session.openerPos, -1),
          cursorPos: newState.selection.from
        }
        if (meta?.type === "continue") {
          return validInlineCodeInputSession(newState, next) ? next : null
        }
        if (!transaction.docChanged) {
          return transaction.selectionSet ? null : session
        }

        const uiEvent = transaction.getMeta("uiEvent")
        const likelyDeletion =
          newState.doc.content.size < oldState.doc.content.size &&
          newState.selection.from <= session.cursorPos
        const localizedBrowserReplacement =
          transactionChangesOnlyPendingInlineCode(transaction, session) &&
          newState.selection.from === transaction.mapping.map(session.cursorPos, 1)
        return uiEvent !== "paste" &&
          uiEvent !== "cut" &&
          (likelyDeletion || localizedBrowserReplacement) &&
          validInlineCodeInputSession(newState, next)
          ? next
          : null
      }
    },
    props: {
      decorations(state) {
        const session = inlineCodeInputSessionKey.getState(state)
        if (!session || session.cursorPos <= session.openerPos + 1) return null
        return DecorationSet.create(state.doc, [
          Decoration.inline(session.openerPos + 1, session.cursorPos, {
            class: "rumi-inline-code-pending"
          })
        ])
      },
      handleTextInput(view, from, to, text) {
        const { state } = view
        const session = inlineCodeInputSessionKey.getState(state)
        const code = schema.marks.code
        if (!code || state.selection.$from.parent.type.spec.code) return false

        if (text === "`") {
          if (session) {
            if (from > session.openerPos + 1 && from === to) return false
            view.dispatch(
              state.tr
                .insertText(text, from, to)
                .setMeta(inlineCodeInputSessionKey, { type: "cancel" })
            )
            return true
          }
          const startsTripleFence =
            from === to &&
            state.selection instanceof TextSelection &&
            state.selection.$from.parent.type === schema.nodes.paragraph &&
            state.selection.$from.parentOffset === 2 &&
            state.selection.$from.parent.textBetween(0, 2) === "``"
          if (startsTripleFence) return false
          if (
            code.isInSet(state.storedMarks ?? state.selection.$from.marks()) ||
            !(state.selection instanceof TextSelection)
          ) return false

          view.dispatch(
            state.tr
              .insertText(text, from, to)
              .setMeta(inlineCodeInputSessionKey, { type: "start", openerPos: from })
          )
          return true
        }

        if (!session) return false
        if (
          from < session.openerPos + 1 ||
          from > to ||
          to > session.cursorPos ||
          /[\r\n]/u.test(text)
        ) {
          view.dispatch(
            state.tr.setMeta(inlineCodeInputSessionKey, { type: "cancel" })
          )
          return false
        }

        view.dispatch(
          state.tr
            .insertText(text, from, to)
            .setMeta(inlineCodeInputSessionKey, { type: "continue" })
        )
        return true
      },
      handleKeyDown(view, event) {
        if (!inlineCodeInputSessionKey.getState(view.state)) return false

        const breaksSession =
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          [
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "ArrowUp",
            "End",
            "Enter",
            "Escape",
            "Home",
            "PageDown",
            "PageUp",
            "Tab"
          ].includes(event.key)
        if (!breaksSession) return false

        view.dispatch(
          view.state.tr.setMeta(inlineCodeInputSessionKey, { type: "cancel" })
        )
        return false
      },
      handleDOMEvents: {
        blur(view) {
          if (!inlineCodeInputSessionKey.getState(view.state)) return false
          view.dispatch(
            view.state.tr.setMeta(inlineCodeInputSessionKey, { type: "cancel" })
          )
          return false
        }
      }
    }
  })
}

function inlineCodeInputSessionRule(schema: Schema): InputRule {
  return new InputRule(/`$/, (state) => {
    const session = inlineCodeInputSessionKey.getState(state)
    const code = schema.marks.code
    if (!session || !code || !validInlineCodeInputSession(state, session)) return null

    const contentFrom = session.openerPos + 1
    const contentTo = state.selection.from
    if (contentTo <= contentFrom) return null

    const transaction = state.tr.delete(session.openerPos, contentFrom)
    transaction.addMark(session.openerPos, contentTo - 1, code.create())
    transaction.setSelection(TextSelection.create(transaction.doc, contentTo - 1))
    transaction.removeStoredMark(code)
    transaction.setMeta(inlineCodeInputSessionKey, { type: "cancel" })
    return transaction
  })
}

// Heading input rules: # , ## , ###
function headingRule(nodeType: NodeType, maxLevel: number) {
  return textblockTypeInputRule(
    new RegExp("^(#{1," + maxLevel + "})\\s$"),
    nodeType,
    match => ({ level: match[1].length })
  )
}

// Mark input rule helper - wraps text with a mark
function markInputRule(regexp: RegExp, markType: MarkType, getAttrs?: (match: RegExpMatchArray) => Record<string, unknown> | null) {
  return new InputRule(regexp, (state, match, start, end) => {
    const attrs = getAttrs ? getAttrs(match) : {}
    const tr = state.tr
    if (match[1]) {
      const textStart = start + match[0].indexOf(match[1])
      const textEnd = textStart + match[1].length
      if (textEnd < end) tr.delete(textEnd, end)
      if (textStart > start) tr.delete(start, textStart)
      end = start + match[1].length
    }
    tr.addMark(start, end, markType.create(attrs))
    tr.removeStoredMark(markType)
    return tr
  })
}

function replaceInlineBlockPreservingSuffix(
  state: import("prosemirror-state").EditorState,
  nodeType: NodeType,
  attrs: Record<string, unknown>
) {
  const $from = state.selection.$from
  const blockStart = $from.before()
  // The final trigger character is not in the handler state, so the cursor
  // separates the recognized marker from the pre-existing inline content.
  const suffix = $from.parent.content.cut($from.parentOffset)
  const replacement = nodeType.create(attrs, suffix)
  const tr = state.tr.replaceWith(blockStart, $from.after(), replacement)
  tr.setSelection(TextSelection.create(tr.doc, blockStart + 1))
  return tr
}

export function buildInputRules(schema: Schema) {
  const rules: InputRule[] = []

  // Heading rules
  if (schema.nodes.heading) {
    rules.push(headingRule(schema.nodes.heading, 3))
  }

  // Blockquote: > at start of line
  if (schema.nodes.blockquote) {
    rules.push(wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote))
  }

  // Flat bullet item: - or * at start of line
  if (schema.nodes.bullet_item) {
    rules.push(new InputRule(/^\s*([-*])\s$/, (state, match, start, end) => {
      const $from = state.selection.$from
      // Only in paragraph
      if ($from.parent.type !== schema.nodes.paragraph) return null

      return replaceInlineBlockPreservingSuffix(
        state,
        schema.nodes.bullet_item,
        { indent: 0 }
      )
    }))
  }

  // Flat numbered item: 1. at start of line
  if (schema.nodes.numbered_item) {
    rules.push(new InputRule(/^\s*(\d+)\.\s$/, (state, match, start, end) => {
      const $from = state.selection.$from
      // Only in paragraph
      if ($from.parent.type !== schema.nodes.paragraph) return null

      const numberedItem = schema.nodes.numbered_item.create({ indent: 0 })
      const tr = state.tr.replaceWith($from.before(), $from.after(), numberedItem)
      tr.setSelection(TextSelection.create(tr.doc, $from.before() + 1))
      return tr
    }))
  }

  // Flat task item: [], [x], and their dashed/GFM-spaced forms at the
  // start of a line, completed by a trailing Space. A typed "- " is
  // already a bullet item by then, so bullet items must be upgradable too.
  if (schema.nodes.task_item) {
    rules.push(new InputRule(/^\s*(?:-\s*)?\[( |[xX])?\]\s$/, (state, match, start, end) => {
      const $from = state.selection.$from
      const parent = $from.parent
      if (
        parent.type !== schema.nodes.paragraph &&
        parent.type !== schema.nodes.bullet_item
      ) return null

      return replaceInlineBlockPreservingSuffix(
        state,
        schema.nodes.task_item,
        {
          indent: parent.type === schema.nodes.bullet_item ? parent.attrs.indent || 0 : 0,
          checked: match[1]?.toLowerCase() === "x"
        }
      )
    }))
  }

  // Horizontal rule: --- or ***
  if (schema.nodes.horizontal_rule && schema.nodes.paragraph) {
    rules.push(new InputRule(/^(---|___|\*\*\*)$/, (state, match, start, end) => {
      const hr = schema.nodes.horizontal_rule.create()
      const hrStart = start - 1
      // Check if there's already a block after the current paragraph
      const $from = state.selection.$from
      const afterParEnd = $from.after()
      const hasNextBlock = afterParEnd < state.doc.content.size
      if (hasNextBlock) {
        // Just insert HR and move cursor to start of next block
        const tr = state.tr.replaceWith(hrStart, end, hr)
        tr.setSelection(TextSelection.create(tr.doc, hrStart + hr.nodeSize + 1))
        return tr
      } else {
        // Insert HR + new paragraph and place cursor in paragraph
        const paragraph = schema.nodes.paragraph.create()
        const tr = state.tr.replaceWith(hrStart, end, [hr, paragraph])
        tr.setSelection(TextSelection.create(tr.doc, hrStart + hr.nodeSize + 1))
        return tr
      }
    }))
  }

  // Bold: **text**
  if (schema.marks.bold) {
    rules.push(markInputRule(/\*\*([^*]+)\*\*$/, schema.marks.bold))
  }

  // Italic: *text* or _text_ (single underscore)
  if (schema.marks.italic) {
    rules.push(markInputRule(/(?<!\*)\*([^*]+)\*(?!\*)$/, schema.marks.italic))
    rules.push(markInputRule(/(?<!_)_([^_]+)_(?!_)$/, schema.marks.italic))
  }

  // Underline: __text__ (double underscore - our custom syntax)
  if (schema.marks.underline) {
    rules.push(markInputRule(/__([^_]+)__$/, schema.marks.underline))
  }

  // Strikethrough: GFM ~~text~~
  if (schema.marks.strikethrough) {
    rules.push(markInputRule(/~~([^~]+)~~$/, schema.marks.strikethrough))
  }

  // Inline code: `text`
  if (schema.marks.code) {
    rules.push(inlineCodeInputSessionRule(schema))
  }

  // Highlight: ==text==
  if (schema.marks.highlight) {
    rules.push(markInputRule(/==([^=]+)==$/, schema.marks.highlight))
  }

  // Link: [text](url)
  if (schema.marks.link) {
    rules.push(new InputRule(
      /\[([^\]]+)\]\(([^)]+)\)$/,
      (state, match, start, end) => {
        const text = match[1]
        const href = match[2]
        const tr = state.tr.delete(start, end)
        const linkMark = schema.marks.link.create({ href })
        tr.insert(start, schema.text(text, [linkMark]))
        return tr
      }
    ))
  }

  return inputRules({ rules })
}
