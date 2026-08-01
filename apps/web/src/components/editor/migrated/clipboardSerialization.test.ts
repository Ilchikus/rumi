import { Slice } from "prosemirror-model"
import { describe, expect, it } from "vitest"
import { parseMarkdown } from "./markdown"
import { schema } from "./schema"
import {
  RUMI_SLICE_MIME,
  parseRumiClipboardSlice,
  serializeClipboardHtml,
  serializeClipboardText,
  serializeRumiClipboardSlice
} from "./clipboardSerialization"

function completeSlice(markdown: string): Slice {
  return new Slice(parseMarkdown(markdown, schema).content, 0, 0)
}

describe("portable editor clipboard serialization", () => {
  it("exports common formatting as semantic HTML", () => {
    const slice = completeSlice([
      "# Heading",
      "",
      "First",
      "second with **bold** and [link](https://example.com)",
      "",
      "- Bullet",
      "- [x] Task",
      "",
      "| Name | State |",
      "| --- | --- |",
      "| Rumi | Ready |",
      "",
      "```ts",
      "const ready = true",
      "```",
      ""
    ].join("\n"))

    const html = serializeClipboardHtml(slice)

    expect(html).toContain("<h1>Heading</h1>")
    expect(html).toContain("First<br>")
    expect(html).toContain("<strong>bold</strong>")
    expect(html).toContain('<a href="https://example.com">link</a>')
    expect(html).toContain("<ul>")
    expect(html).toContain("<li>Bullet</li>")
    expect(html).toContain('type="checkbox" checked')
    expect(html).toContain("<table>")
    expect(html).toContain("<th>Name</th>")
    expect(html).toContain('<code class="language-ts">const ready = true</code>')
  })

  it("exports readable plain text with line and list semantics", () => {
    const slice = completeSlice([
      "First",
      "second",
      "",
      "- Bullet",
      "- [x] Task",
      ""
    ].join("\n"))

    expect(serializeClipboardText(slice)).toBe([
      "First",
      "second",
      "",
      "- Bullet",
      "- [x] Task"
    ].join("\n"))
  })

  it("round-trips the exact private Rumi slice", () => {
    const slice = completeSlice("- [x] Exact task\n\n![[.assets/spec.pdf]]\n")
    const encoded = serializeRumiClipboardSlice(slice)
    const decoded = parseRumiClipboardSlice(encoded, schema)

    expect(RUMI_SLICE_MIME).toContain("rumi")
    expect(decoded?.toJSON()).toEqual(slice.toJSON())
  })
})
