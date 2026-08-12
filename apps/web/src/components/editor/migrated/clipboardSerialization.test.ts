import { Slice } from "prosemirror-model"
import { EditorState, TextSelection } from "prosemirror-state"
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
    expect(html).toContain(
      '<pre style="background-color:#f1f3f4;border-radius:4px;font-family:&quot;Roboto Mono&quot;,monospace;white-space:pre-wrap">' +
      '<code class="language-ts" style="background-color:#f1f3f4;font-family:&quot;Roboto Mono&quot;,monospace;white-space:pre-wrap">' +
      "const ready = true</code></pre>"
    )
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

  it("exports adjacent paragraph blocks as adjacent rows without blank lines", () => {
    const slice = completeSlice("First paragraph\n\nSecond paragraph\n\nThird paragraph\n")

    expect(serializeClipboardText(slice)).toBe([
      "First paragraph",
      "Second paragraph",
      "Third paragraph"
    ].join("\n"))
    expect(serializeClipboardHtml(slice)).toBe([
      "<div>First paragraph</div>",
      "<div>Second paragraph</div>",
      "<div>Third paragraph</div>"
    ].join(""))
  })

  it("copies a native task-item text selection without block syntax", () => {
    const doc = parseMarkdown("- [ ] Copy only this\n", schema)
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, 6, 10)
    })
    const slice = state.selection.content()

    expect(serializeClipboardText(slice, { includeBlockSyntax: false })).toBe("only")
    expect(serializeClipboardHtml(slice, { includeBlockSyntax: false })).toBe("only")
    expect(serializeClipboardText(slice)).toBe("- [ ] only")
    expect(serializeClipboardHtml(slice)).toContain('type="checkbox"')
  })

  it("round-trips the exact private Rumi slice", () => {
    const slice = completeSlice("- [x] Exact task\n\n![[.assets/spec.pdf]]\n")
    const encoded = serializeRumiClipboardSlice(slice)
    const decoded = parseRumiClipboardSlice(encoded, schema)

    expect(RUMI_SLICE_MIME).toContain("rumi")
    expect(decoded?.toJSON()).toEqual(slice.toJSON())
  })
})
