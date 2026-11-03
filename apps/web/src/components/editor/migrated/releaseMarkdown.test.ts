import { describe, expect, it } from "vitest"
import { parseMarkdown, serializeMarkdown } from "./markdown"
import { schema } from "./schema"

function stable(markdown: string) {
  const doc = parseMarkdown(markdown, schema)
  const saved = serializeMarkdown(doc)
  const reopened = parseMarkdown(saved, schema)
  expect(reopened.toJSON()).toEqual(doc.toJSON())
  expect(serializeMarkdown(reopened)).toBe(saved)
  return { doc, saved }
}

describe("readable literal Markdown", () => {
  it.each(["a_b_c", "snake_case", "~/notes/file_name.md", "about ~10 items", "_unmatched", "one ~ two", "100% done"])('keeps harmless prose readable: %s', (text) => {
    const doc = schema.nodes.doc!.create(null, schema.nodes.paragraph!.create(null, schema.text(text)))
    const saved = serializeMarkdown(doc)
    expect(saved).toBe(`${text}\n`)
    expect(stable(saved).doc.toJSON()).toEqual(doc.toJSON())
  })
  it.each(["_literal_", "__literal__", "~literal~", "~~literal~~", "___", "a_b_ x_y_"])('protects literal formatting syntax: %s', (text) => {
    const doc = schema.nodes.doc!.create(null, schema.nodes.paragraph!.create(null, schema.text(text)))
    expect(stable(serializeMarkdown(doc)).doc.toJSON()).toEqual(doc.toJSON())
  })
})

describe("image galleries", () => {
  it("retains adjacent images and surrounding prose after save and reopen", () => {
    const { doc } = stable('Before ![first](<.assets/front (1).png>)\n![second](.assets/back.png) after\n')
    expect(doc.content.content.map((node) => node.type.name)).toEqual(["paragraph", "image", "image", "paragraph"])
    expect(doc.child(1).attrs.src).toBe(".assets/front (1).png")
    expect(doc.child(2).attrs.src).toBe(".assets/back.png")
    expect(doc.textContent).toContain("Before")
    expect(doc.textContent).toContain("after")
  })
  it("preserves a linked image instead of dropping its contents", () => {
    const { doc } = stable('[![Car](.assets/car.png)](https://example.com)')
    expect(doc.firstChild?.type.name).toBe("image")
    expect(doc.firstChild?.attrs.src).toBe(".assets/car.png")
  })
  it("accepts an external image path with spaces", () => {
    expect(stable('![](https://example.com/car photo.png)').doc.firstChild?.attrs.src).toBe("https://example.com/car photo.png")
  })
})

describe("two-column Markdown", () => {
  it("roundtrips rich columns including nested code, headings, lists and images", () => {
    const { doc, saved } = stable('````columns\n## Left\n\n```html\n<p>hello</p>\n```\n\n|||\n\n- Right\n\n![](.assets/car.png)\n````\n')
    expect(doc.firstChild?.type.name).toBe("columns")
    expect(doc.firstChild?.childCount).toBe(2)
    expect(saved).toContain("````columns")
    expect(doc.firstChild?.firstChild?.child(1).type.name).toBe("code_block")
    doc.check()
  })
  it("keeps ordinary pipes as prose and malformed columns as code", () => {
    expect(stable("x | y\n\na  |  b").doc.firstChild?.type.name).toBe("paragraph")
    expect(stable("```columns\nleft\nright\n```").doc.firstChild?.type.name).toBe("code_block")
    expect(stable("```columns\na\n|||\nb\n|||\nc\n```").doc.firstChild?.type.name).toBe("code_block")
  })
  it("roundtrips empty columns", () => {
    const { doc } = stable("```columns\n|||\n```")
    expect(doc.firstChild?.childCount).toBe(2)
  })
})

it("grows code fences around literal backticks inside a column", () => {
  const source = '`````columns\n````text\n```\n````\n\n|||\n\nright\n`````'
  const { doc } = stable(source)
  expect(doc.firstChild?.firstChild?.firstChild?.textContent).toBe("```")
})

it.each(["_", "~"])("does not create formatting across differently marked text spans: %s", (delimiter) => {
  const doc = schema.nodes.doc!.create(null, schema.nodes.paragraph!.create(null, [
    schema.text(`${delimiter}before`),
    schema.text("middle", [schema.marks.bold!.create()]),
    schema.text(`after${delimiter}`)
  ]))
  expect(stable(serializeMarkdown(doc)).doc.toJSON()).toEqual(doc.toJSON())
})
