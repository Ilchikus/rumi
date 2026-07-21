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
  it("keeps standalone URLs as portable inline links", () => {
    const parsed = parseMarkdown("https://rumi.md\n", schema)

    expect(schema.nodes.bookmark).toBeUndefined()
    expect(parsed.firstChild?.type.name).toBe("paragraph")
    expect(parsed.firstChild?.firstChild?.marks.map((mark) => mark.type.name)).toContain("link")
    expect(serializeMarkdown(parsed)).toBe("[https://rumi.md](https://rumi.md)\n")
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

  it("preserves the at-sign and mention identity across Markdown round trips", () => {
    const markdown = "Ask [@Inner notes](<test folder/inner.index.md>) for context.\n"
    const parsed = parseMarkdown(markdown, schema)
    const linkedText = parsed.firstChild?.content.content.find((node) => node.text === "@Inner notes")
    const link = linkedText?.marks.find((mark) => mark.type.name === "link")

    expect(link?.attrs).toMatchObject({
      href: "test folder/inner.index.md",
      mention: true
    })
    expect(serializeMarkdown(parsed)).toBe(markdown)
    expect(parseMarkdown(serializeMarkdown(parsed), schema).toJSON()).toEqual(parsed.toJSON())
  })

  it("preserves underline and one canonical yellow highlight mark", () => {
    const markdown = [
      "Before __underlined__ ==highlighted== ==green::green highlight== and --legacy strike-- after.",
      ""
    ].join("\n")

    const parsed = parseMarkdown(markdown, schema)
    const reparsed = parseMarkdown(serializeMarkdown(parsed), schema)
    const markedText = reparsed.firstChild?.content.content ?? []

    expect(markedText.map((node) => [node.text, node.marks.map((mark) => mark.type.name)])).toEqual([
      ["Before ", []],
      ["underlined", ["underline"]],
      [" ", []],
      ["highlighted", ["highlight"]],
      [" ", []],
      ["green highlight", ["highlight"]],
      [" and ", []],
      ["legacy strike", ["strikethrough"]],
      [" after.", []]
    ])
    expect(serializeMarkdown(parsed)).toContain("==highlighted== ==green highlight==")
    expect(serializeMarkdown(parsed)).not.toContain("==green::")
    expect(markedText.filter((node) => node.marks.some((mark) => mark.type.name === "highlight"))
      .every((node) => Object.keys(node.marks.find((mark) => mark.type.name === "highlight")?.attrs ?? {}).length === 0))
      .toBe(true)
    expect(reparsed.toJSON()).toEqual(parsed.toJSON())
  })

  it("does not preprocess custom marks inside code", () => {
    const markdown = [
      "`__inline__ ==highlight== --strike--`",
      "",
      "~~~~txt",
      "__fenced__ ==highlight== --strike--",
      "~~~~",
      "",
      "    __indented__ ==highlight== --strike--",
      ""
    ].join("\n")

    const parsed = parseMarkdown(markdown, schema)
    const serialized = serializeMarkdown(parsed)
    const reparsed = parseMarkdown(serialized, schema)

    expect(parsed.firstChild?.textContent).toBe("__inline__ ==highlight== --strike--")
    expect(parsed.child(1).textContent).toBe("__fenced__ ==highlight== --strike--")
    expect(parsed.child(2).textContent).toBe("__indented__ ==highlight== --strike--")
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
