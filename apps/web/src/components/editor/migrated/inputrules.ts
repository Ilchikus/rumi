// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import {
  inputRules,
  wrappingInputRule,
  textblockTypeInputRule,
  InputRule
} from "prosemirror-inputrules"
import { NodeType, MarkType, Schema } from "prosemirror-model"
import { TextSelection } from "prosemirror-state"

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

  // Code block: ``` at start of line
  if (schema.nodes.code_block) {
    rules.push(textblockTypeInputRule(/^```$/, schema.nodes.code_block))
  }

  // Flat bullet item: - or * at start of line (but not - [ ] which is task item)
  if (schema.nodes.bullet_item) {
    rules.push(new InputRule(/^\s*([-*])\s$/, (state, match, start, end) => {
      const $from = state.selection.$from
      // Only in paragraph
      if ($from.parent.type !== schema.nodes.paragraph) return null
      // Make sure this isn't going to become a task item
      const fullText = $from.parent.textContent
      if (fullText.match(/^\s*-\s\[[ xX]?\]\s*$/)) return null

      const bulletItem = schema.nodes.bullet_item.create({ indent: 0 })
      const tr = state.tr.replaceWith($from.before(), $from.after(), bulletItem)
      tr.setSelection(TextSelection.create(tr.doc, $from.before() + 1))
      return tr
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

  // Flat task item: - [ ] or - [x] at start of line
  if (schema.nodes.task_item) {
    // Unchecked: - [ ]
    rules.push(new InputRule(/^\s*-\s\[\s?\]\s$/, (state, match, start, end) => {
      const $from = state.selection.$from
      // Only in paragraph
      if ($from.parent.type !== schema.nodes.paragraph) return null

      const taskItem = schema.nodes.task_item.create({ indent: 0, checked: false })
      const tr = state.tr.replaceWith($from.before(), $from.after(), taskItem)
      tr.setSelection(TextSelection.create(tr.doc, $from.before() + 1))
      return tr
    }))
    // Checked: - [x]
    rules.push(new InputRule(/^\s*-\s\[[xX]\]\s$/, (state, match, start, end) => {
      const $from = state.selection.$from
      // Only in paragraph
      if ($from.parent.type !== schema.nodes.paragraph) return null

      const taskItem = schema.nodes.task_item.create({ indent: 0, checked: true })
      const tr = state.tr.replaceWith($from.before(), $from.after(), taskItem)
      tr.setSelection(TextSelection.create(tr.doc, $from.before() + 1))
      return tr
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

  // Strikethrough: ~~text~~ or --text-- (our custom syntax)
  if (schema.marks.strikethrough) {
    rules.push(markInputRule(/~~([^~]+)~~$/, schema.marks.strikethrough))
    rules.push(markInputRule(/--([^-]+)--$/, schema.marks.strikethrough))
  }

  // Inline code: `text`
  if (schema.marks.code) {
    rules.push(markInputRule(/`([^`]+)`$/, schema.marks.code))
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
