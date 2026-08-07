import { describe, expect, it } from "vitest"
import { parseMarkdown, serializeMarkdown } from "./markdown"
import { schema } from "./schema"

describe("markdown file embeds", () => {
  it("parses Obsidian file embeds into file_embed blocks", () => {
    const doc = parseMarkdown("![[.assets/spec-sheet.pdf]]", schema)
    expect(doc.firstChild?.type.name).toBe("file_embed")
    expect(doc.firstChild?.attrs.src).toBe(".assets/spec-sheet.pdf")
  })

  it("serializes file_embed blocks back to Obsidian embeds", () => {
    const doc = schema.nodes.doc!.create(null, [
      schema.nodes.file_embed!.create({ src: ".assets/spec-sheet.pdf" }),
    ])

    expect(serializeMarkdown(doc)).toContain("![[.assets/spec-sheet.pdf]]")
  })
})

describe("live editor Markdown round trips", () => {
  it("stores visible soft line breaks as nodes and blank lines as paragraph boundaries", () => {
    const markdown = "first paragraph\nsecond line\n\nnew paragraph\n"
    const parsed = parseMarkdown(markdown, schema)

    expect(parsed.childCount).toBe(2)
    expect(parsed.firstChild?.content.content.map((node) => node.type.name)).toEqual([
      "text",
      "soft_break",
      "text"
    ])
    parsed.descendants((node) => {
      if (node.isText) {
        expect(node.text).not.toContain("\n")
      }
    })
    expect(serializeMarkdown(parsed)).toBe(markdown)
    expect(parseMarkdown(serializeMarkdown(parsed), schema).toJSON()).toEqual(parsed.toJSON())
  })

  it.each([
    ["two-space hard break", "first  \nsecond\n"],
    ["backslash hard break", "first\\\nsecond\n"],
    ["HTML hard break", "first<br>\nsecond\n"]
  ])("keeps %s distinct from a soft line break", (_name, markdown) => {
    const parsed = parseMarkdown(markdown, schema)

    expect(parsed.firstChild?.content.content.map((node) => node.type.name)).toEqual([
      "text",
      "hard_break",
      "text"
    ])
    expect(serializeMarkdown(parsed)).toBe("first  \nsecond\n")
  })

  it("preserves replacement symbols and multi-code-point emoji as literal UTF-8 text", () => {
    const markdown = "→ ← ↔ ⇒ ⇔ ≤ ≥ ≠ ≈ ± … © ® ™ ❤️ 👩‍💻 👍🏽\n"
    const parsed = parseMarkdown(markdown, schema)

    expect(serializeMarkdown(parsed)).toBe(markdown)
    expect(parseMarkdown(serializeMarkdown(parsed), schema).toJSON()).toEqual(parsed.toJSON())
  })

  it("distinguishes no selected database view from a stable view ID named table", () => {
    const implicit = parseMarkdown([
      "```db",
      "source: Tasks",
      "```",
      ""
    ].join("\n"), schema)
    const explicit = parseMarkdown([
      "```db",
      "source: Tasks",
      "view: table",
      "```",
      ""
    ].join("\n"), schema)

    expect(implicit.firstChild?.attrs.viewType).toBe("")
    expect(serializeMarkdown(implicit)).not.toContain("view:")
    expect(explicit.firstChild?.attrs.viewType).toBe("table")
    expect(serializeMarkdown(explicit)).toContain("view: table")
    expect(parseMarkdown(serializeMarkdown(explicit), schema).toJSON()).toEqual(explicit.toJSON())
  })

  it.each([
    "https://rumi.md",
    "www.rumi.md",
    "example.com"
  ])("keeps an implicit source destination as plain text: %s", (destination) => {
    const parsed = parseMarkdown(`${destination}\n`, schema)

    expect(schema.nodes.bookmark).toBeUndefined()
    expect(parsed.firstChild?.type.name).toBe("paragraph")
    expect(parsed.firstChild?.firstChild?.marks).toHaveLength(0)
    expect(serializeMarkdown(parsed)).toBe(`${destination}\n`)
  })

  it("uses explicit Markdown source syntax as the durable link state", () => {
    const parsed = parseMarkdown("[Rumi](www.rumi.md)\n", schema)

    expect(parsed.firstChild?.firstChild?.marks.map((mark) => mark.type.name)).toContain("link")
    expect(serializeMarkdown(parsed)).toBe("[Rumi](www.rumi.md)\n")
  })

  it("renders workspace links whose file paths contain unescaped spaces", () => {
    const markdown = "An internal document link points to the [inner](test folder/inner/inner.index.md)\n"
    const parsed = parseMarkdown(markdown, schema)
    const linkedText = parsed.firstChild?.content.content.find((node) => node.text === "inner")

    expect(linkedText?.marks.find((mark) => mark.type.name === "link")?.attrs.href)
      .toBe("test folder/inner/inner.index.md")
    expect(serializeMarkdown(parsed)).toBe(
      "An internal document link points to the [inner](<test folder/inner/inner.index.md>)\n"
    )
    expect(parseMarkdown(serializeMarkdown(parsed), schema).toJSON()).toEqual(parsed.toJSON())
  })

  it("preserves the source at-sign while rendering a typed mention label", () => {
    const markdown = "Ask [@Inner notes](<test folder/inner.index.md>) for context.\n"
    const parsed = parseMarkdown(markdown, schema)
    const linkedText = parsed.firstChild?.content.content.find((node) => node.text === "Inner notes")
    const link = linkedText?.marks.find((mark) => mark.type.name === "link")

    expect(link?.attrs).toMatchObject({
      href: "test folder/inner.index.md",
      mention: true,
      mentionKind: "folder"
    })
    expect(serializeMarkdown(parsed)).toBe(markdown)
    expect(parseMarkdown(serializeMarkdown(parsed), schema).toJSON()).toEqual(parsed.toJSON())
  })

  it("preserves underline and the canonical highlight mark", () => {
    const markdown = [
      "Before __underlined__, ==highlighted text==, ~~struck through~~, and --plain hyphens-- after.",
      ""
    ].join("\n")

    const parsed = parseMarkdown(markdown, schema)
    const reparsed = parseMarkdown(serializeMarkdown(parsed), schema)
    const markedText = reparsed.firstChild?.content.content ?? []

    expect(markedText.map((node) => [node.text, node.marks.map((mark) => mark.type.name)])).toEqual([
      ["Before ", []],
      ["underlined", ["underline"]],
      [", ", []],
      ["highlighted text", ["highlight"]],
      [", ", []],
      ["struck through", ["strikethrough"]],
      [", and --plain hyphens-- after.", []]
    ])
    expect(serializeMarkdown(parsed)).toContain("==highlighted text==")
    expect(serializeMarkdown(parsed)).toContain("~~struck through~~")
    expect(serializeMarkdown(parsed)).toContain("--plain hyphens--")
    expect(markedText.filter((node) => node.marks.some((mark) => mark.type.name === "highlight"))
      .every((node) => Object.keys(node.marks.find((mark) => mark.type.name === "highlight")?.attrs ?? {}).length === 0))
      .toBe(true)
    expect(reparsed.toJSON()).toEqual(parsed.toJSON())
  })

  it("renders Markdown highlights with the semantic mark element", () => {
    const parsed = parseMarkdown("Before ==highlighted== after.\n", schema)
    const highlightedText = parsed.firstChild?.content.content
      .find((node) => node.text === "highlighted")
    const highlight = highlightedText?.marks
      .find((mark) => mark.type.name === "highlight")

    expect(highlight).toBeDefined()
    expect(highlight?.type.spec.parseDOM).toEqual([{ tag: "mark" }])
    expect(highlight?.type.spec.toDOM?.(highlight, true)).toEqual(["mark", 0])
  })

  it("does not preprocess custom marks inside code", () => {
    const markdown = [
      "`__inline__ ==highlight== ~~strike~~`",
      "",
      "~~~~txt",
      "__fenced__ ==highlight== ~~strike~~",
      "~~~~",
      "",
      "    __indented__ ==highlight== ~~strike~~",
      ""
    ].join("\n")

    const parsed = parseMarkdown(markdown, schema)
    const serialized = serializeMarkdown(parsed)
    const reparsed = parseMarkdown(serialized, schema)

    expect(parsed.firstChild?.textContent).toBe("__inline__ ==highlight== ~~strike~~")
    expect(parsed.child(1).textContent).toBe("__fenced__ ==highlight== ~~strike~~")
    expect(parsed.child(2).textContent).toBe("__indented__ ==highlight== ~~strike~~")
    expect(reparsed.toJSON()).toEqual(parsed.toJSON())
  })

  it("preserves nested ordered-list levels and numbering", () => {
    const markdown = [
      "1. Parent",
      "   1. Child",
      "      1. Grandchild",
      "2. Sibling",
      ""
    ].join("\n")

    const parsed = parseMarkdown(markdown, schema)
    const serialized = serializeMarkdown(parsed)
    const reparsed = parseMarkdown(serialized, schema)

    expect(serialized).toBe([
      "1. Parent",
      "    1. Child",
      "        1. Grandchild",
      "2. Sibling",
      ""
    ].join("\n"))
    expect(reparsed.toJSON()).toEqual(parsed.toJSON())
  })

  it("accepts legacy compact task markers and writes canonical GFM markers", () => {
    const markdown = [
      "- [ ] Standard unchecked",
      "- [] Compact unchecked",
      "- [x] Checked",
      ""
    ].join("\n")
    const parsed = parseMarkdown(markdown, schema)
    const serialized = serializeMarkdown(parsed)

    expect(parsed.content.content.map((node) => [
      node.type.name,
      node.attrs.checked,
      node.textContent
    ])).toEqual([
      ["task_item", false, "Standard unchecked"],
      ["task_item", false, "Compact unchecked"],
      ["task_item", true, "Checked"]
    ])
    expect(serialized).toBe([
      "- [ ] Standard unchecked",
      "- [ ] Compact unchecked",
      "- [x] Checked",
      ""
    ].join("\n"))
    expect(parseMarkdown(serialized, schema).toJSON()).toEqual(parsed.toJSON())
  })

  it("does not leave trailing spaces on empty task-item source lines", () => {
    const doc = schema.nodes.doc!.create(null, [
      schema.nodes.task_item!.create({ indent: 0, checked: false }),
      schema.nodes.task_item!.create({ indent: 0, checked: true })
    ])
    const serialized = serializeMarkdown(doc)

    expect(serialized).toBe("- [ ]\n- [x]\n")
    expect(parseMarkdown(serialized, schema).toJSON()).toEqual(doc.toJSON())
  })

  it("canonicalizes compact unchecked task markers inside blockquotes", () => {
    const parsed = parseMarkdown("> - [ ] Quoted task\n", schema)
    const serialized = serializeMarkdown(parsed)

    expect(serialized).toContain("> - [ ] Quoted task")
    expect(parseMarkdown(serialized, schema).toJSON()).toEqual(parsed.toJSON())
  })

  it("recovers deeply nested legacy compact tasks and preserves every checked state", () => {
    const legacyMarkdown = [
      "- [] Root",
      "    - [x] Child",
      "        - [] Grandchild",
      "            - [x] Great-grandchild",
      ""
    ].join("\n")
    const parsed = parseMarkdown(legacyMarkdown, schema)
    const serialized = serializeMarkdown(parsed)

    expect(parsed.content.content.map((node) => [
      node.type.name,
      node.attrs.indent,
      node.attrs.checked
    ])).toEqual([
      ["task_item", 0, false],
      ["task_item", 1, true],
      ["task_item", 2, false],
      ["task_item", 3, true]
    ])
    expect(serialized).toBe([
      "- [ ] Root",
      "    - [x] Child",
      "        - [ ] Grandchild",
      "            - [x] Great-grandchild",
      ""
    ].join("\n"))
    expect(parseMarkdown(serialized, schema).toJSON()).toEqual(parsed.toJSON())
  })

  it("roundtrips every checked-state combination across all supported task depths", () => {
    for (let mask = 0; mask < 16; mask += 1) {
      const taskItems = Array.from({ length: 4 }, (_, indent) =>
        schema.nodes.task_item!.create(
          { indent, checked: Boolean(mask & (1 << indent)) },
          schema.text(`Depth ${indent}`)
        )
      )
      const doc = schema.nodes.doc!.create(null, taskItems)
      const serialized = serializeMarkdown(doc)
      const reparsed = parseMarkdown(serialized, schema)

      expect(serialized).not.toContain("- []")
      expect(reparsed.toJSON(), `checked-state mask ${mask}`).toEqual(doc.toJSON())
    }
  })

  it("roundtrips empty legacy and GFM tasks across all supported depths", () => {
    const legacyMarkdown = [
      "- []",
      "    - [x]",
      "        - [ ]",
      "            - []",
      ""
    ].join("\n")
    const parsed = parseMarkdown(legacyMarkdown, schema)
    const serialized = serializeMarkdown(parsed)

    expect(parsed.content.content.map((node) => [
      node.type.name,
      node.attrs.indent,
      node.attrs.checked,
      node.textContent
    ])).toEqual([
      ["task_item", 0, false, ""],
      ["task_item", 1, true, ""],
      ["task_item", 2, false, ""],
      ["task_item", 3, false, ""]
    ])
    expect(serialized).toBe([
      "- [ ]",
      "    - [x]",
      "        - [ ]",
      "            - [ ]",
      ""
    ].join("\n"))
    expect(parseMarkdown(serialized, schema).toJSON()).toEqual(parsed.toJSON())
  })

  it.each([
    ["unchecked GFM marker", "    - [ ]\n", "- [ ]"],
    ["checked GFM marker", "    - [x]\n", "- [x]"],
    ["deep compact marker", "        - []\n", "    - []"]
  ])("preserves task-looking text in indented code: %s", (_name, markdown, code) => {
    const parsed = parseMarkdown(markdown, schema)

    expect(parsed.firstChild?.type).toBe(schema.nodes.code_block)
    expect(parsed.firstChild?.textContent).toBe(code)
    expect(serializeMarkdown(parsed)).not.toContain("rumi-empty-task")
    expect(parseMarkdown(serializeMarkdown(parsed), schema).toJSON()).toEqual(parsed.toJSON())
  })

  it("keeps aligned GFM tables as tables and preserves column alignment", () => {
    const markdown = [
      "| Left | Center | Right |",
      "| :--- | :---: | ---: |",
      "| a | b | c |",
      ""
    ].join("\n")

    const parsed = parseMarkdown(markdown, schema)
    const serialized = serializeMarkdown(parsed)
    const reparsed = parseMarkdown(serialized, schema)

    expect(parsed.firstChild?.type.name).toBe("table")
    expect(serialized).toContain("| :--- | :---: | ---: |")
    expect(reparsed.toJSON()).toEqual(parsed.toJSON())
  })

  it("reopens a representative document with every live block type unchanged", () => {
    const markdown = [
      "# Complete document",
      "",
      "Plain **bold**, *italic*, __underline__, ~~strike~~, `code`, ==highlight==, and [link](https://example.com).",
      "",
      "- Bullet",
      "    - Nested bullet",
      "",
      "1. Numbered",
      "    1. Nested numbered",
      "",
      "- [x] Complete task",
      "    - [ ] Nested task",
      "",
      "> Quote",
      "",
      "| Name | State |",
      "| :--- | ---: |",
      "| Rumi | Ready |",
      "",
      "```ts",
      "const ready = true",
      "```",
      "",
      "```mermaid",
      "flowchart LR",
      "  Client --> Server",
      "```",
      "",
      "```db",
      "source: Tasks",
      "view: active",
      "filter: status = doing",
      "```",
      "",
      "![Image](.assets/image.png)",
      "",
      "![[.assets/document.pdf]]",
      "",
      "https://example.com",
      "",
      "---",
      ""
    ].join("\n")

    const parsed = parseMarkdown(markdown, schema)
    const reparsed = parseMarkdown(serializeMarkdown(parsed), schema)

    expect(reparsed.toJSON()).toEqual(parsed.toJSON())
  })
})
