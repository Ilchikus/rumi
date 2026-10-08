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

  it("keeps escaped backticks literal and code ending in a backslash durable", () => {
    const literals = parseMarkdown("\\` first \\` second\n", schema)
    const trailingBackslash = parseMarkdown("`path\\`\n", schema)

    expect(literals.firstChild?.textContent).toBe("` first ` second")
    expect(literals.firstChild?.content.content.every(node => node.marks.length === 0)).toBe(true)
    expect(serializeMarkdown(literals)).toBe("\\` first \\` second\n")
    expect(trailingBackslash.firstChild?.firstChild?.text).toBe("path\\")
    expect(trailingBackslash.firstChild?.firstChild?.marks.map(mark => mark.type.name))
      .toContain("code")
    expect(serializeMarkdown(trailingBackslash)).toBe("`path\\`\n")
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

    expect(parsed.firstChild?.firstChild?.type.name).toBe("link_marker")
    expect(parsed.firstChild?.firstChild?.attrs.href).toBe("https://www.rumi.md")
    expect(parsed.firstChild?.firstChild?.attrs.linkType).toBe("external")
    expect(parsed.firstChild?.child(1).marks.map((mark) => mark.type.name)).toContain("link")
    expect(serializeMarkdown(parsed)).toBe("[Rumi](www.rumi.md)\n")
  })

  it("renders workspace links whose file paths contain unescaped spaces", () => {
    const markdown = "An internal document link points to the [inner](test folder/inner/inner.index.md)\n"
    const parsed = parseMarkdown(markdown, schema)
    const inlineNodes = parsed.firstChild?.content.content ?? []
    const linkedTextIndex = inlineNodes.findIndex((node) => node.text === "inner")
    const linkedText = inlineNodes[linkedTextIndex]

    expect(linkedText?.marks.find((mark) => mark.type.name === "link")?.attrs.href)
      .toBe("test folder/inner/inner.index.md")
    expect(parsed.firstChild?.content.content.some(
      (node) => node.type.name === "link_marker" && node.attrs.linkType === "external"
    )).toBe(false)
    expect(inlineNodes[linkedTextIndex - 1]?.type.name).toBe("link_marker")
    expect(inlineNodes[linkedTextIndex - 1]?.attrs).toMatchObject({
      href: "test folder/inner/inner.index.md",
      linkType: "internal",
      mentionKind: "folder"
    })
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
    const mentionMarker = parsed.firstChild?.content.content.find(
      (node) => node.type.name === "link_marker"
    )
    expect(mentionMarker?.attrs).toMatchObject({
      href: "test folder/inner.index.md",
      linkType: "internal",
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

describe("blank lines between blocks", () => {
  const types = (markdown: string) => {
    const doc = parseMarkdown(markdown, schema)
    return Array.from({ length: doc.childCount }, (_, index) => {
      const node = doc.child(index)
      return node.type.name === "paragraph" && node.content.size === 0 ? "empty" : node.type.name
    })
  }

  const paragraph = (text?: string) =>
    schema.nodes.paragraph!.create(null, text ? schema.text(text) : null)
  const bullet = (text: string, indent = 0) =>
    schema.nodes.bullet_item!.create({ indent }, schema.text(text))

  it.each([
    ["one empty paragraph", "A\n\n\nB\n", ["paragraph", "empty", "paragraph"]],
    ["several empty paragraphs", "A\n\n\n\n\nB\n", ["paragraph", "empty", "empty", "empty", "paragraph"]],
    ["after a heading", "# Title\n\n\nBody\n", ["heading", "empty", "paragraph"]],
    ["between list items", "- a\n\n\n- b\n", ["bullet_item", "empty", "bullet_item"]],
    ["from a list to a paragraph", "- a\n\n\nB\n", ["bullet_item", "empty", "paragraph"]],
    ["from a paragraph to a list", "A\n\n\n- b\n", ["paragraph", "empty", "bullet_item"]],
    ["before a nested item", "- a\n\n\n    - b\n", ["bullet_item", "empty", "bullet_item"]],
    ["around a code block", "A\n\n\n```\ncode\n```\n\n\nB\n", ["paragraph", "empty", "code_block", "empty", "paragraph"]]
  ])("round-trips %s", (_name, markdown, expected) => {
    expect(types(markdown)).toEqual(expected)
    expect(serializeMarkdown(parseMarkdown(markdown, schema))).toBe(markdown)
  })

  it("keeps normal separators and loose lists free of empty paragraphs", () => {
    expect(types("A\n\nB\n")).toEqual(["paragraph", "paragraph"])
    expect(types("- a\n\n- b\n\n- c\n")).toEqual(["bullet_item", "bullet_item", "bullet_item"])
    expect(types("- a\n\n  continued\n\n- b\n")).toEqual(["bullet_item", "bullet_item"])
  })

  it("does not store leading or trailing empty paragraphs", () => {
    const doc = schema.nodes.doc!.create(null, [
      paragraph(),
      paragraph("Body"),
      paragraph(),
      paragraph()
    ])

    expect(serializeMarkdown(doc)).toBe("Body\n")
    expect(types("\n\nBody\n\n\n")).toEqual(["paragraph"])
  })

  it("writes one extra blank line per empty paragraph typed in the editor", () => {
    const doc = schema.nodes.doc!.create(null, [
      bullet("a"),
      paragraph(),
      paragraph(),
      bullet("b"),
      paragraph("After")
    ])
    const markdown = serializeMarkdown(doc)

    expect(markdown).toBe("- a\n\n\n\n- b\n\nAfter\n")
    expect(parseMarkdown(markdown, schema).toJSON()).toEqual(doc.toJSON())
  })

  it("ends a document whose last list is followed by empty paragraphs with one newline", () => {
    const doc = schema.nodes.doc!.create(null, [bullet("a"), bullet("b"), paragraph(), paragraph()])

    expect(serializeMarkdown(doc)).toBe("- a\n- b\n")
  })

  it("keeps ordered-list numbering across empty paragraphs", () => {
    const markdown = "1. first\n\n\n2. second\n"

    expect(types(markdown)).toEqual(["numbered_item", "empty", "numbered_item"])
    expect(serializeMarkdown(parseMarkdown(markdown, schema))).toBe(markdown)
    expect(serializeMarkdown(parseMarkdown("1. a\n\nText\n\n1. b\n", schema))).toBe("1. a\n\nText\n\n1. b\n")
  })

  it("keeps empty paragraphs right after a blockquote", () => {
    const doc = schema.nodes.doc!.create(null, [
      schema.nodes.blockquote!.create(null, [paragraph("quoted")]),
      paragraph(),
      paragraph("after")
    ])
    const markdown = serializeMarkdown(doc)

    expect(markdown).toBe("> quoted\n\n\nafter\n")
    expect(parseMarkdown(markdown, schema).toJSON()).toEqual(doc.toJSON())
    expect(serializeMarkdown(parseMarkdown("> Quote\n\nNext\n", schema))).toBe("> Quote\n\nNext\n")
  })

  it("keeps empty paragraphs inside a blockquote", () => {
    const quote = schema.nodes.blockquote!.create(null, [
      paragraph("first"),
      paragraph(),
      paragraph("second")
    ])
    const doc = schema.nodes.doc!.create(null, [quote])

    expect(parseMarkdown(serializeMarkdown(doc), schema).toJSON()).toEqual(doc.toJSON())
  })

  it("does not add empty paragraphs after paragraphs that follow a list", () => {
    const doc = schema.nodes.doc!.create(null, [
      bullet("a"),
      paragraph("one"),
      paragraph("two")
    ])

    expect(serializeMarkdown(doc)).toBe("- a\n\none\n\ntwo\n")
  })
})
