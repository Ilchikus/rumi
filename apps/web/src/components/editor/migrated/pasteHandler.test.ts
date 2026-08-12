// @vitest-environment jsdom
import { DOMParser as ProseMirrorDOMParser, Slice } from "prosemirror-model"
import { EditorState, NodeSelection, TextSelection, type Transaction } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import { describe, expect, it } from "vitest"
import { parseMarkdown, serializeMarkdown } from "./markdown"
import { setMigratedEditorPlatform } from "./platform"
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
  createInlineCodePasteTransaction,
  createUrlPasteTransaction,
  normalizePastedTables,
  pasteHandlerPlugin
} from "./plugins/pasteHandler"

function stateWithSelection(markdown: string, from: number, to = from): EditorState {
  const doc = parseMarkdown(markdown, schema)
  const state = EditorState.create({ doc })
  return state.apply(state.tr.setSelection(TextSelection.create(doc, from, to)))
}

function parseExternalRichHtml(html: string): Slice {
  const plugin = pasteHandlerPlugin(schema)
  const state = stateWithSelection("", 1)
  const view = { state } as unknown as EditorView
  const normalizedHtml = plugin.props.transformPastedHTML?.call(
    plugin,
    html,
    view
  ) ?? html
  const container = document.createElement("div")
  container.innerHTML = normalizedHtml
  const parsed = ProseMirrorDOMParser.fromSchema(schema).parseSlice(container)
  return plugin.props.transformPasted?.call(plugin, parsed, view, false) ?? parsed
}

function pasteSliceIntoBlankDocument(slice: Slice) {
  const state = stateWithSelection("", 1)
  return state.apply(state.tr.replaceSelection(slice)).doc
}

describe("live editor URL paste", () => {
  it("pastes a URL into an empty paragraph as an inline link", () => {
    const state = stateWithSelection("", 1)
    const transaction = createUrlPasteTransaction(state, "https://rumi.md", schema)

    expect(transaction).not.toBeNull()
    expect(transaction!.doc.firstChild?.type.name).toBe("paragraph")
    expect(serializeMarkdown(transaction!.doc)).toBe("[https://rumi.md](https://rumi.md)\n")
  })

  it.each([
    "www.rumi.md",
    "example.com",
    "docs.example.com.ua/guide?ready=true#start"
  ])("pastes the scheme-less web destination %s as an inline link", (destination) => {
    const state = stateWithSelection("", 1)
    const transaction = createUrlPasteTransaction(state, destination, schema)

    expect(transaction).not.toBeNull()
    expect(transaction!.doc.firstChild?.textContent).toBe(destination)
    expect(transaction!.doc.firstChild?.firstChild?.marks[0]?.attrs.href).toBe(destination)
    expect(serializeMarkdown(transaction!.doc)).toBe(`[${destination}](${destination})\n`)
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

  it("turns a pasted workspace path into a link only for highlighted text", () => {
    const selected = stateWithSelection("Open notes", 1, 11)
    const caret = stateWithSelection("Open notes", 1)

    const transaction = createUrlPasteTransaction(selected, "Notes/Today.md", schema)
    expect(transaction).not.toBeNull()
    expect(serializeMarkdown(transaction!.doc))
      .toBe("[Open notes](Notes/Today.md)\n")
    expect(createUrlPasteTransaction(caret, "Notes/Today.md", schema)).toBeNull()
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

  it("keeps URL and domain text literal for paste-as-plain-text", () => {
    const plugin = pasteHandlerPlugin(schema)
    let state = stateWithSelection("Replace me", 1, 11)
    const view = {
      get state() { return state },
      dispatch(transaction: Transaction) { state = state.apply(transaction) }
    } as unknown as EditorView
    const parsedPlain = plugin.props.clipboardTextParser?.call(
      plugin,
      "example.com",
      state.selection.$from,
      true,
      view
    ) ?? createPlainTextPasteSlice("example.com", schema)
    const transformed = plugin.props.transformPasted?.call(plugin, parsedPlain, view, true) ?? parsedPlain
    const event = {
      clipboardData: {
        files: [],
        getData(type: string) { return type === "text/plain" ? "example.com" : "" }
      },
      preventDefault() {}
    } as unknown as ClipboardEvent

    expect(plugin.props.handlePaste?.call(plugin, view, event, transformed)).toBe(false)
    expect(state.doc.firstChild?.textContent).toBe("Replace me")

    const pasted = state.apply(state.tr.replaceSelection(transformed))
    expect(serializeMarkdown(pasted.doc)).toBe("example.com\n")
    expect(parseMarkdown(serializeMarkdown(pasted.doc), schema).firstChild?.firstChild?.marks)
      .toHaveLength(0)
  })
})

describe("live editor inline-code paste", () => {
  it("preserves inline code when normal paste replaces the complete marked range", () => {
    const state = stateWithSelection("`before` after", 1, 7)
    const transaction = createInlineCodePasteTransaction(state, "replacement", schema)

    expect(transaction).not.toBeNull()
    expect(serializeMarkdown(transaction!.doc)).toBe("`replacement` after\n")
  })

  it("does not claim a partial inline-code selection", () => {
    const state = stateWithSelection("`before` after", 2, 7)

    expect(createInlineCodePasteTransaction(state, "replacement", schema)).toBeNull()
  })

  it("routes a normal clipboard paste through inline-code preservation", () => {
    const plugin = pasteHandlerPlugin(schema)
    let state = stateWithSelection("`before` after", 1, 7)
    const view = {
      get state() { return state },
      dispatch(transaction: Transaction) { state = state.apply(transaction) }
    } as unknown as EditorView
    const slice = createPlainTextPasteSlice("replacement", schema)
    const event = {
      clipboardData: {
        files: [],
        getData(type: string) { return type === "text/plain" ? "replacement" : "" }
      },
      preventDefault() {}
    } as unknown as ClipboardEvent

    expect(plugin.props.handlePaste?.call(plugin, view, event, slice)).toBe(true)
    expect(serializeMarkdown(state.doc)).toBe("`replacement` after\n")
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

  it("replaces every explicitly selected block and clears block selection after paste", () => {
    const doc = parseMarkdown("One\n\nTwo\n\nThree\n", schema)
    const positions: number[] = []
    doc.forEach((_node, pos) => positions.push(pos))
    let state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, positions[0]!),
      plugins: [multiBlockSelectionPlugin(schema)]
    })
    state = state.apply(state.tr
      .setMeta(multiBlockSelectionKey, {
        selectedBlocks: positions,
        anchorBlock: positions[0]
      })
      .setMeta("multiBlockKeep", true))

    const replacement = new Slice(schema.nodes.doc!.create(null, [
      schema.nodes.paragraph!.create(null, schema.text("Replacement one")),
      schema.nodes.paragraph!.create(null, schema.text("Replacement two"))
    ]).content, 0, 0)
    const plugin = pasteHandlerPlugin(schema)
    const view = {
      get state() { return state },
      dispatch(transaction: Transaction) { state = state.apply(transaction) }
    } as unknown as EditorView
    let prevented = false
    const event = {
      clipboardData: {
        files: [],
        getData(type: string) {
          if (type === "text/html") return "<p>Replacement one</p><p>Replacement two</p>"
          if (type === "text/plain") return "Replacement one\n\nReplacement two"
          return ""
        }
      },
      preventDefault() { prevented = true }
    } as unknown as ClipboardEvent

    expect(plugin.props.handlePaste?.call(plugin, view, event, replacement)).toBe(true)
    expect(prevented).toBe(true)
    expect(state.doc.content.content.map(node => node.textContent)).toEqual([
      "Replacement one",
      "Replacement two"
    ])
    expect(multiBlockSelectionKey.getState(state)?.selectedBlocks).toEqual([])
    expect(state.selection).toBeInstanceOf(TextSelection)
  })

  it("moves a paste-created node selection back to a text cursor", () => {
    const pastePlugin = pasteHandlerPlugin(schema)
    let state = EditorState.create({
      doc: parseMarkdown("", schema),
      plugins: [multiBlockSelectionPlugin(schema), pastePlugin]
    })
    const replacement = new Slice(schema.nodes.doc!.create(null, [
      schema.nodes.paragraph!.create(null, schema.text("Content")),
      schema.nodes.horizontal_rule!.create()
    ]).content, 0, 0)
    let transaction = state.tr
      .replaceSelection(replacement)
      .setMeta("uiEvent", "paste")
    const dividerPos = transaction.doc.child(0).nodeSize
    transaction = transaction.setSelection(NodeSelection.create(transaction.doc, dividerPos))

    state = state.applyTransaction(transaction).state

    expect(state.selection).toBeInstanceOf(TextSelection)
    expect(state.selection.$from.parent.textContent).toBe("Content")
    expect(multiBlockSelectionKey.getState(state)?.selectedBlocks).toEqual([])
  })
})

describe("live editor external rich paste normalization", () => {
  it("turns semantic and Google Docs-style lists into ordered flat list blocks with indentation", () => {
    const slice = parseExternalRichHtml([
      '<ul class="lst-kix_demo-0"><li class="li-bullet-0">Memory</li>',
      '<li class="li-bullet-0">Mini PC chassis</li></ul>',
      '<ul class="lst-kix_demo-1"><li class="li-bullet-1">SODIMM</li>',
      '<li class="li-bullet-1">DDR5</li></ul>',
      '<ol><li aria-level="1">Install memory</li>',
      '<li aria-level="2">Install storage</li></ol>',
      '<ul><li><input type="checkbox" checked>Choose a CPU</li></ul>'
    ].join(""))
    const pastedDoc = pasteSliceIntoBlankDocument(slice)

    expect(pastedDoc.content.content.map(node => ({
      type: node.type.name,
      indent: node.attrs.indent,
      checked: node.attrs.checked,
      text: node.textContent
    }))).toEqual([
      { type: "bullet_item", indent: 0, checked: undefined, text: "Memory" },
      { type: "bullet_item", indent: 0, checked: undefined, text: "Mini PC chassis" },
      { type: "bullet_item", indent: 1, checked: undefined, text: "SODIMM" },
      { type: "bullet_item", indent: 1, checked: undefined, text: "DDR5" },
      { type: "numbered_item", indent: 0, checked: undefined, text: "Install memory" },
      { type: "numbered_item", indent: 1, checked: undefined, text: "Install storage" },
      { type: "task_item", indent: 0, checked: true, text: "Choose a CPU" }
    ])
  })

  it("keeps block-wrapped Google Docs table content inside one rectangular table", () => {
    const slice = parseExternalRichHtml([
      "<table><tbody>",
      "<tr>",
      "<td><p><strong>Model</strong></p></td>",
      "<td><p>CPU</p></td>",
      "</tr>",
      "<tr>",
      "<td><p>Beelink EQ12</p></td>",
      "<td><p>Intel N100</p><p>efficient</p></td>",
      "</tr>",
      "</tbody></table>"
    ].join(""))
    const pastedDoc = pasteSliceIntoBlankDocument(slice)
    const tables = pastedDoc.content.content.filter(node => node.type === schema.nodes.table)
    const table = tables[0]

    expect(tables).toHaveLength(1)
    expect(pastedDoc.content.content.filter(node => node.type !== schema.nodes.table)
      .every(node => node.type === schema.nodes.paragraph && node.content.size === 0)).toBe(true)
    expect(table?.type).toBe(schema.nodes.table)
    expect(table?.childCount).toBe(2)
    expect(table?.child(0).childCount).toBe(2)
    expect(table?.child(1).childCount).toBe(2)
    expect(table?.child(0).child(0).type).toBe(schema.nodes.table_header)
    expect(table?.child(0).child(0).firstChild?.marks.map(mark => mark.type.name))
      .toContain("bold")
    expect(table?.child(1).child(1).content.content.map(node => node.type.name)).toEqual([
      "text",
      "hard_break",
      "text"
    ])
    expect(table?.child(1).child(1).textContent).toBe("Intel N100efficient")
  })

  it("recovers recognizable Mermaid and database runs while retaining ordinary code", () => {
    const slice = parseExternalRichHtml([
      "<p>flowchart LR</p>",
      "<p>&nbsp;&nbsp;Client[Client] --&gt; Server[Server]</p>",
      "<p>source: Tasks</p>",
      "<p>filter: status = doing</p>",
      "<p>sort: updated desc</p>",
      "<h2>Code block</h2>",
      '<pre><code class="language-javascript">const ready = true</code></pre>',
      "<hr>",
      "<p>source: Tasks</p>"
    ].join(""))
    const nodes = pasteSliceIntoBlankDocument(slice).content.content

    expect(nodes.map(node => node.type.name)).toEqual([
      "mermaid",
      "database_embed",
      "heading",
      "code_block",
      "horizontal_rule",
      "database_embed"
    ])
    expect(nodes[0]?.textContent).toBe([
      "flowchart LR",
      "  Client[Client] --> Server[Server]"
    ].join("\n"))
    expect(nodes[1]?.attrs).toMatchObject({
      source: "Tasks",
      filter: "status = doing",
      sort: "updated desc"
    })
    expect(nodes[3]?.attrs.language).toBe("javascript")
    expect(nodes[3]?.textContent).toBe("const ready = true")
    expect(nodes[5]?.attrs.source).toBe("Tasks")
  })

  it("recovers semantic blocks from unlabeled preformatted text without guessing ordinary code", () => {
    const slice = parseExternalRichHtml([
      "<pre><code>graph TD\n  A --&gt; B</code></pre>",
      "<pre><code>source: Tasks\nview: table</code></pre>",
      "<pre><code>const ready = true</code></pre>"
    ].join(""))
    const nodes = pasteSliceIntoBlankDocument(slice).content.content

    expect(nodes.map(node => node.type.name)).toEqual([
      "mermaid",
      "database_embed",
      "code_block"
    ])
    expect(nodes[0]?.textContent).toBe("graph TD\n  A --> B")
    expect(nodes[1]?.attrs).toMatchObject({ source: "Tasks", viewType: "table" })
    expect(nodes[2]?.textContent).toBe("const ready = true")
  })

  it("does not classify ordinary graph prose as Mermaid", () => {
    const slice = parseExternalRichHtml([
      "<p>graph theory remains ordinary prose</p>",
      "<p>The following paragraph stays separate.</p>"
    ].join(""))
    const nodes = pasteSliceIntoBlankDocument(slice).content.content

    expect(nodes.map(node => node.type.name)).toEqual(["paragraph", "paragraph"])
    expect(nodes.map(node => node.textContent)).toEqual([
      "graph theory remains ordinary prose",
      "The following paragraph stays separate."
    ])
  })

  it("recovers a fully code-styled Google Docs paragraph run without guessing normal monospace text", () => {
    const codeStyle = [
      "font-family:'Roboto Mono',monospace",
      "background-color:rgb(241,243,244)",
      "white-space:pre-wrap"
    ].join(";")
    const slice = parseExternalRichHtml([
      '<b id="docs-internal-guid-12345678-1234-1234-1234-1234567890ab" style="font-weight:normal">',
      `<p><span style="${codeStyle}">const candidate = {</span></p><br>`,
      `<p><span style="${codeStyle}">&nbsp;&nbsp;ready: true</span></p><br>`,
      `<p><span style="${codeStyle}">}</span></p><br>`,
      '<p><span style="font-family:Roboto Mono">ordinary monospace prose</span></p>',
      "</b>"
    ].join(""))
    const nodes = pasteSliceIntoBlankDocument(slice).content.content
      .filter(node => node.type !== schema.nodes.paragraph || node.content.size > 0)

    expect(nodes.map(node => node.type.name)).toEqual(["code_block", "paragraph"])
    expect(nodes[0]?.attrs.language).toBeNull()
    expect(nodes[0]?.textContent).toBe([
      "const candidate = {",
      "  ready: true",
      "}"
    ].join("\n"))
    expect(nodes[1]?.textContent).toBe("ordinary monospace prose")
  })

  it("removes Google Docs' default link underline while retaining explicit non-link underline", () => {
    const slice = parseExternalRichHtml([
      '<b id="docs-internal-guid-12345678-1234-1234-1234-1234567890ab" style="font-weight:normal">',
      "<p><span>Open</span><span>",
      '<a href="https://example.com" style="text-decoration:none">',
      '<span style="color:#1155cc;text-decoration:underline"> Example </span></a>',
      "</span><span>next</span>",
      "</p>",
      '<p><span style="text-decoration:underline">Explicit underline</span></p>',
      "</b>"
    ].join(""))
    const nodes = pasteSliceIntoBlankDocument(slice).content.content
      .filter(node => node.type !== schema.nodes.paragraph || node.content.size > 0)
    const linkParagraph = nodes[0]!
    const linkText = linkParagraph.content.content.find(node => node.text === "Example")
    const explicitText = nodes[1]?.firstChild

    expect(linkParagraph.textContent).toBe("Open Example next")
    expect(linkText?.marks.map(mark => mark.type.name)).toEqual(["link"])
    expect(explicitText?.marks.map(mark => mark.type.name)).toContain("underline")
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
      "<h1>Heading</h1><div>Body with <strong>bold</strong></div>" +
      '<ul><li><input type="checkbox" checked disabled>Done</li></ul>'
    )
    expect(data.get("text/plain")).toBe(
      "Heading\n\nBody with bold\n\n- [x] Done"
    )
    expect(parseRumiClipboardSlice(data.get(RUMI_SLICE_MIME) ?? "", schema)
      ?.content.childCount).toBe(3)
  })

  it("copies selected task text without its checkbox block syntax", () => {
    const doc = parseMarkdown("- [ ] Copy only this\n", schema)
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 6, 10)
    })
    const view = {
      get state() { return state },
      dispatch(transaction: Transaction) { state = state.apply(transaction) }
    } as unknown as EditorView
    const { data, event } = clipboardEvent()
    const plugin = pasteHandlerPlugin(schema)

    expect(plugin.props.handleDOMEvents?.copy?.call(plugin, view, event)).toBe(true)
    expect(data.get("text/plain")).toBe("only")
    expect(data.get("text/html")).toBe("only")
    expect(data.get("text/html")).not.toContain("checkbox")
    expect(parseRumiClipboardSlice(data.get(RUMI_SLICE_MIME) ?? "", schema)
      ?.content.firstChild?.textContent).toBe("only")
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
    expect(data.get("text/html")).toBe("<div>One</div><div>Three</div>")
    expect(data.get("text/plain")).toBe("One\nThree")
    expect(data.get("text/html")).not.toContain("Two")
  })

  it("cuts every explicitly selected block completely after exporting the same payload", () => {
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
    expect(data.get("text/html")).toBe("<div>One</div><div>Three</div>")
    expect(Array.from(
      { length: state.doc.childCount },
      (_, index) => state.doc.child(index).textContent
    )).toEqual(["Two"])
    expect(multiBlockSelectionKey.getState(state)?.selectedBlocks).toEqual([])
  })
})

describe("live editor asset paste", () => {
  it("keeps image clipboard files on the asynchronous asset-upload path", async () => {
    let uploadedFile: File | null = null
    let resolveDispatch!: () => void
    const dispatched = new Promise<void>((resolve) => { resolveDispatch = resolve })
    setMigratedEditorPlatform({
      databaseRefreshRevisions: {},
      workspaceKey: "test",
      documentKey: "test.md",
      documents: [],
      async uploadAsset(file) {
        uploadedFile = file
        return ".assets/pasted.png"
      }
    })

    try {
      const plugin = pasteHandlerPlugin(schema)
      let state = stateWithSelection("", 1)
      const view = {
        get state() { return state },
        dispatch(transaction: Transaction) {
          state = state.apply(transaction)
          resolveDispatch()
        }
      } as unknown as EditorView
      const file = new File(["image"], "pasted.png", { type: "image/png" })
      const event = {
        clipboardData: {
          files: [file],
          getData() { return "" }
        }
      } as unknown as ClipboardEvent

      expect(plugin.props.handlePaste?.call(
        plugin,
        view,
        event,
        createPlainTextPasteSlice("", schema)
      )).toBe(true)
      await dispatched
      expect(uploadedFile).toBe(file)
      expect(state.doc.firstChild?.type).toBe(schema.nodes.image)
      expect(state.doc.firstChild?.attrs.src).toBe(".assets/pasted.png")
    } finally {
      setMigratedEditorPlatform({
        databaseRefreshRevisions: {},
        workspaceKey: "",
        documentKey: "",
        documents: []
      })
    }
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

  it("treats Mermaid source as ProseMirror code content", () => {
    const mermaid = schema.nodes.mermaid!.create(
      { mode: "edit" },
      schema.text("graph TD; A-->B")
    )
    const doc = schema.nodes.doc!.create(null, mermaid)
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, mermaid.content.size + 1)
    })

    const transaction = createCodeTextPasteTransaction(
      state,
      "\nB-->C",
      schema
    )

    expect(transaction).not.toBeNull()
    expect(transaction!.doc.firstChild?.type).toBe(schema.nodes.mermaid)
    expect(transaction!.doc.firstChild?.textContent).toBe(
      "graph TD; A-->B\nB-->C"
    )
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
