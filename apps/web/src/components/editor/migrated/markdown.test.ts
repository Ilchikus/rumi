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
