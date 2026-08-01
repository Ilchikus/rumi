import { Slice } from "prosemirror-model"
import { EditorState, NodeSelection, TextSelection, type Transaction } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import { describe, expect, it } from "vitest"
import { parseMarkdown, serializeMarkdown } from "./markdown"
import { schema } from "./schema"
import {
  RUMI_SLICE_MIME,
  parseRumiClipboardSlice,
  serializeRumiClipboardSlice
} from "./clipboardSerialization"
import {
  multiBlockSelectionKey,
  multiBlockSelectionPlugin,
  selectAllBlocksInStages
} from "./plugins/multiBlockSelection"
import {
  createPlainTextPasteSlice,
  createCodeTextPasteTransaction,
  createUrlPasteTransaction,
  normalizePastedTables,
  pasteHandlerPlugin
} from "./plugins/pasteHandler"

function stateWithSelection(markdown: string, from: number, to = from): EditorState {
  const doc = parseMarkdown(markdown, schema)
  const state = EditorState.create({ doc })
  return state.apply(state.tr.setSelection(TextSelection.create(doc, from, to)))
}

describe("live editor URL paste", () => {
  it("pastes a URL into an empty paragraph as an inline link", () => {
    const state = stateWithSelection("", 1)
    const transaction = createUrlPasteTransaction(state, "https://rumi.md", schema)

    expect(transaction).not.toBeNull()
    expect(transaction!.doc.firstChild?.type.name).toBe("paragraph")
    expect(serializeMarkdown(transaction!.doc)).toBe("[https://rumi.md](https://rumi.md)\n")
  })

  it("uses selected text as the pasted link label", () => {
    const state = stateWithSelection("Rumi docs", 1, 10)
    const transaction = createUrlPasteTransaction(state, "https://rumi.md", schema)

    expect(transaction).not.toBeNull()
    expect(serializeMarkdown(transaction!.doc)).toBe("[Rumi docs](https://rumi.md)\n")
  })

  it("leaves URL text untouched inside code blocks", () => {
    const state = stateWithSelection("```ts\nconst url = \"\"\n```", 2)

    expect(createUrlPasteTransaction(state, "https://rumi.md", schema)).toBeNull()
  })
})

describe("live editor plain-text paste", () => {
  it("keeps single line breaks inside one paragraph and blank lines between paragraphs", () => {
    const slice = createPlainTextPasteSlice("first\nsecond\n\nthird", schema)

    expect(slice.content.childCount).toBe(2)
    expect(slice.content.firstChild?.content.content.map(node => node.type.name)).toEqual([
      "text",
      "soft_break",
      "text"
    ])
    expect(slice.content.lastChild?.textContent).toBe("third")
  })

  it("keeps Markdown punctuation literal instead of adding formatting", () => {
    const slice = createPlainTextPasteSlice(
      "# literal heading\n**literal bold**\n\n- literal list item",
      schema
    )

    expect(slice.content.childCount).toBe(2)
    expect(slice.content.firstChild?.type).toBe(schema.nodes.paragraph)
    expect(slice.content.firstChild?.textContent).toBe("# literal heading\n**literal bold**")
    expect(slice.content.firstChild?.content.content.every(node => node.marks.length === 0)).toBe(true)
    expect(slice.content.lastChild?.type).toBe(schema.nodes.paragraph)
    expect(slice.content.lastChild?.textContent).toBe("- literal list item")

    const doc = schema.nodes.doc!.create(null, slice.content)
    expect(parseMarkdown(serializeMarkdown(doc), schema).toJSON()).toEqual(doc.toJSON())
  })

  it("preserves code-indenting prose whitespace without reopening it as code", () => {
    const slice = createPlainTextPasteSlice("\tfirst\n    second", schema)
    const doc = schema.nodes.doc!.create(null, slice.content)
    const markdown = serializeMarkdown(doc)

    expect(markdown).toBe("&#9;first\n&#32;&#32;&#32;&#32;second\n")
    expect(parseMarkdown(markdown, schema).toJSON()).toEqual(doc.toJSON())
  })

  it("ignores rich and private clipboard flavors for paste-as-plain-text", () => {
    const plugin = pasteHandlerPlugin(schema)
    const plainSlice = createPlainTextPasteSlice("first\nsecond", schema)
    const exactSlice = new Slice(parseMarkdown("- [x] Exact\n", schema).content, 0, 0)
    let state = stateWithSelection("", 1)
    let dispatched = false
    const view = {
      get state() { return state },
      dispatch(transaction: Transaction) {
        dispatched = true
        state = state.apply(transaction)
      }
    } as unknown as EditorView
    const parsedPlain = plugin.props.clipboardTextParser?.call(
      plugin,
      "first\nsecond",
      state.selection.$from,
      true,
      view
    )
    const transformed = plugin.props.transformPasted?.call(plugin, parsedPlain ?? plainSlice, view, true)
    const event = {
      clipboardData: {
        files: [],
        getData(type: string) {
          if (type === "text/html") return "<table><tr><td>Rich</td></tr></table>"
          if (type === "text/plain") return "first\nsecond"
          if (type === RUMI_SLICE_MIME) return serializeRumiClipboardSlice(exactSlice)
          return ""
        }
      },
      preventDefault() {}
    } as unknown as ClipboardEvent

    const handled = plugin.props.handlePaste?.call(plugin, view, event, transformed!)

    expect(handled).toBe(false)
    expect(dispatched).toBe(false)
    expect(transformed?.content.firstChild?.content.content.map(node => node.type.name)).toEqual([
      "text",
      "soft_break",
      "text"
    ])
  })
})

describe("live editor rich paste", () => {
  it("uses the already-parsed rich table slice and promotes its first row to headers", () => {
    const text = (value: string) => schema.text(value)
    const cell = (value: string) => schema.nodes.table_cell!.create(null, text(value))
    const row = (...values: string[]) => schema.nodes.table_row!.create(null, values.map(cell))
    const table = schema.nodes.table!.create(null, [row("Name", "State"), row("Rumi", "Ready")])
    const richSlice = new Slice(schema.nodes.doc!.create(null, table).content, 0, 0)
    const normalized = normalizePastedTables(richSlice, schema)

    expect(normalized.content.firstChild?.type).toBe(schema.nodes.table)
    expect(normalized.content.firstChild?.firstChild?.firstChild?.type).toBe(schema.nodes.table_header)

    const plugin = pasteHandlerPlugin(schema)
    let state = stateWithSelection("", 1)
    let dispatched = false
    const view = {
      get state() { return state },
      dispatch(transaction: Transaction) {
        dispatched = true
        state = state.apply(transaction)
      }
    } as unknown as EditorView
    const transformed = plugin.props.transformPasted?.call(plugin, richSlice, view, false)
    const event = {
      clipboardData: {
        files: [],
        getData(type: string) {
          if (type === "text/html") return "<table><tr><td>Name</td><td>State</td></tr></table>"
          if (type === "text/plain") return "Name\tState"
          return ""
        }
      },
      preventDefault() {}
    } as unknown as ClipboardEvent

    const handled = plugin.props.handlePaste?.call(plugin, view, event, transformed!)
    expect(handled).toBe(false)
    expect(dispatched).toBe(false)
    expect(transformed?.content.firstChild?.firstChild?.firstChild?.type).toBe(schema.nodes.table_header)
  })

  it("prefers an exact Rumi slice for a normal paste", () => {
    const exactSlice = new Slice(parseMarkdown("- [x] Exact task\n", schema).content, 0, 0)
    const plugin = pasteHandlerPlugin(schema)
    let state = stateWithSelection("", 1)
    const view = {
      get state() { return state },
      dispatch(transaction: Transaction) { state = state.apply(transaction) }
    } as unknown as EditorView
    const fallback = createPlainTextPasteSlice("Fallback", schema)
    plugin.props.transformPasted?.call(plugin, fallback, view, false)
    let prevented = false
    const event = {
      clipboardData: {
        files: [],
        getData(type: string) {
          if (type === RUMI_SLICE_MIME) return serializeRumiClipboardSlice(exactSlice)
          if (type === "text/html") return "<p>Fallback</p>"
          if (type === "text/plain") return "Fallback"
          return ""
        }
      },
      preventDefault() { prevented = true }
    } as unknown as ClipboardEvent

    const handled = plugin.props.handlePaste?.call(plugin, view, event, fallback)

    expect(handled).toBe(true)
    expect(prevented).toBe(true)
    expect(state.doc.firstChild?.type).toBe(schema.nodes.task_item)
    expect(state.doc.firstChild?.attrs.checked).toBe(true)
    expect(state.doc.firstChild?.textContent).toBe("Exact task")
  })

  it("still prefers the exact flavor when a normal paste has no HTML flavor", () => {
    const exactSlice = new Slice(parseMarkdown("- [x] Exact task\n", schema).content, 0, 0)
    const plugin = pasteHandlerPlugin(schema)
    let state = stateWithSelection("", 1)
    const view = {
      get state() { return state },
      dispatch(transaction: Transaction) { state = state.apply(transaction) }
    } as unknown as EditorView
    const parsedText = plugin.props.clipboardTextParser?.call(
      plugin,
      "Fallback",
      state.selection.$from,
      false,
      view
    ) ?? createPlainTextPasteSlice("Fallback", schema)
    const transformed = plugin.props.transformPasted?.call(plugin, parsedText, view, true) ?? parsedText
    const event = {
      clipboardData: {
        files: [],
        getData(type: string) {
          if (type === RUMI_SLICE_MIME) return serializeRumiClipboardSlice(exactSlice)
          if (type === "text/plain") return "Fallback"
          return ""
        }
      },
      preventDefault() {}
    } as unknown as ClipboardEvent

    expect(plugin.props.handlePaste?.call(plugin, view, event, transformed)).toBe(true)
    expect(state.doc.firstChild?.type).toBe(schema.nodes.task_item)
  })
})

describe("live editor copy", () => {
  function clipboardEvent() {
    const data = new Map<string, string>()
    let prevented = false
    const event = {
      clipboardData: {
        clearData() { data.clear() },
        setData(type: string, value: string) { data.set(type, value) }
      },
      preventDefault() { prevented = true }
    } as unknown as ClipboardEvent
    return { data, event, wasPrevented: () => prevented }
  }

  it("writes every staged document block to portable HTML, readable text, and the Rumi flavor", () => {
    const doc = parseMarkdown(
      "# Heading\n\nBody with **bold**\n\n- [x] Done\n",
      schema
    )
    let state = EditorState.create({
      doc,
      plugins: [multiBlockSelectionPlugin(schema)]
    })
    selectAllBlocksInStages(state, (transaction) => { state = state.apply(transaction) })
    selectAllBlocksInStages(state, (transaction) => { state = state.apply(transaction) })
    expect(state.selection).toBeInstanceOf(NodeSelection)
    expect(state.selection.content().content.childCount).toBe(1)

    const view = {
      get state() { return state },
      dispatch(transaction: Transaction) { state = state.apply(transaction) }
    } as unknown as EditorView
    const { data, event, wasPrevented } = clipboardEvent()
    const plugin = pasteHandlerPlugin(schema)
    const handled = plugin.props.handleDOMEvents?.copy?.call(plugin, view, event)

    expect(handled).toBe(true)
    expect(wasPrevented()).toBe(true)
    expect(data.get("text/html")).toBe(
      "<h1>Heading</h1><p>Body with <strong>bold</strong></p>" +
      '<ul><li><input type="checkbox" checked disabled>Done</li></ul>'
    )
    expect(data.get("text/plain")).toBe(
      "Heading\n\nBody with bold\n\n- [x] Done"
    )
    expect(parseRumiClipboardSlice(data.get(RUMI_SLICE_MIME) ?? "", schema)
      ?.content.childCount).toBe(3)
  })

  it("copies an unordered marquee-style block selection in document order from an empty cursor", () => {
    const doc = parseMarkdown("One\n\nTwo\n\nThree\n", schema)
    const firstPos = 0
    const secondPos = doc.child(0).nodeSize
    const thirdPos = secondPos + doc.child(1).nodeSize
    let state = EditorState.create({
      doc,
      plugins: [multiBlockSelectionPlugin(schema)]
    })
    state = state.apply(state.tr.setMeta(multiBlockSelectionKey, {
      selectedBlocks: [thirdPos, firstPos],
      anchorBlock: thirdPos
    }))
    expect(state.selection.empty).toBe(true)

    const view = {
      get state() { return state },
      dispatch(transaction: Transaction) { state = state.apply(transaction) }
    } as unknown as EditorView
    const { data, event } = clipboardEvent()
    const plugin = pasteHandlerPlugin(schema)

    expect(plugin.props.handleDOMEvents?.copy?.call(plugin, view, event)).toBe(true)
    expect(data.get("text/html")).toBe("<p>One</p><p>Three</p>")
    expect(data.get("text/plain")).toBe("One\n\nThree")
    expect(data.get("text/html")).not.toContain("Two")
  })

  it("cuts every explicitly selected block after exporting the same complete payload", () => {
    const doc = parseMarkdown("One\n\nTwo\n\nThree\n", schema)
    const firstPos = 0
    const thirdPos = doc.child(0).nodeSize + doc.child(1).nodeSize
    let state = EditorState.create({
      doc,
      plugins: [multiBlockSelectionPlugin(schema)]
    })
    state = state.apply(state.tr.setMeta(multiBlockSelectionKey, {
      selectedBlocks: [thirdPos, firstPos],
      anchorBlock: firstPos
    }))

    const view = {
      get state() { return state },
      dispatch(transaction: Transaction) { state = state.apply(transaction) }
    } as unknown as EditorView
    const { data, event } = clipboardEvent()
    const plugin = pasteHandlerPlugin(schema)

    expect(plugin.props.handleDOMEvents?.cut?.call(plugin, view, event)).toBe(true)
    expect(data.get("text/html")).toBe("<p>One</p><p>Three</p>")
    expect(Array.from(
      { length: state.doc.childCount },
      (_, index) => state.doc.child(index).textContent
    )).toEqual(["", "Two"])
    expect(multiBlockSelectionKey.getState(state)?.selectedBlocks).toEqual([])
  })
})

describe("live editor code paste", () => {
  it("keeps a multiline paste and the surrounding source in one code block", () => {
    const code = schema.nodes.code_block!.create(
      { language: "ts" },
      schema.text("alphaBETAgamma")
    )
    const doc = schema.nodes.doc!.create(null, code)
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 6, 10)
    })

    const transaction = createCodeTextPasteTransaction(
      state,
      "beta\ndelta",
      schema
    )

    expect(transaction).not.toBeNull()
    expect(transaction!.doc.childCount).toBe(1)
    expect(transaction!.doc.firstChild?.type).toBe(schema.nodes.code_block)
    expect(transaction!.doc.firstChild?.attrs.language).toBe("ts")
    expect(transaction!.doc.firstChild?.textContent).toBe("alphabeta\ndeltagamma")
    expect(serializeMarkdown(transaction!.doc)).toBe(
      "```ts\nalphabeta\ndeltagamma\n```\n"
    )
  })

  it("preserves whitespace, Markdown punctuation, and URLs literally", () => {
    const code = schema.nodes.code_block!.create({ language: null })
    const doc = schema.nodes.doc!.create(null, code)
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1)
    })
    const pasted = "  # literal\nhttps://rumi.md\n\n\tend  "

    const transaction = createCodeTextPasteTransaction(state, pasted, schema)

    expect(transaction).not.toBeNull()
    expect(transaction!.doc.firstChild?.textContent).toBe(pasted)
    expect(transaction!.doc.firstChild?.type).toBe(schema.nodes.code_block)
  })

  it("does not claim text selections outside code", () => {
    const state = stateWithSelection("Paragraph", 1)
    expect(createCodeTextPasteTransaction(state, "text", schema)).toBeNull()
  })

  it("uses the parsed slice when an HTML clipboard has no plain-text flavor", () => {
    const code = schema.nodes.code_block!.create(
      { language: "ts" },
      schema.text("alphaBETAgamma")
    )
    const doc = schema.nodes.doc!.create(null, code)
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 6, 10)
    })
    const plugin = pasteHandlerPlugin(schema)
    const view = {
      get state() {
        return state
      },
      dispatch(transaction: Transaction) {
        state = state.apply(transaction)
      }
    } as unknown as EditorView
    const pastedContent = schema.nodes.doc!.create(null, [
      schema.nodes.paragraph!.create(null, schema.text("beta")),
      schema.nodes.paragraph!.create(null, schema.text("delta"))
    ]).content
    let prevented = false
    const event = {
      clipboardData: {
        files: [],
        getData(type: string) {
          return type === "text/html"
            ? "<p>beta</p><p>delta</p>"
            : ""
        }
      },
      preventDefault() {
        prevented = true
      }
    } as unknown as ClipboardEvent

    const handled = plugin.props.handlePaste?.call(
      plugin,
      view,
      event,
      new Slice(pastedContent, 0, 0)
    )

    expect(handled).toBe(true)
    expect(prevented).toBe(true)
    expect(state.doc.childCount).toBe(1)
    expect(state.doc.firstChild?.type).toBe(schema.nodes.code_block)
    expect(state.doc.firstChild?.attrs.language).toBe("ts")
    expect(state.doc.firstChild?.textContent).toBe("alphabeta\ndeltagamma")
  })

  it("does not delete selected code for an empty textual clipboard", () => {
    const code = schema.nodes.code_block!.create(
      { language: null },
      schema.text("alphaBETAgamma")
    )
    const doc = schema.nodes.doc!.create(null, code)
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 6, 10)
    })

    expect(createCodeTextPasteTransaction(state, "", schema)).toBeNull()
    expect(state.doc.firstChild?.textContent).toBe("alphaBETAgamma")
  })
})
