// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { EditorState } from "prosemirror-state"
import { schema } from "../schema"
import { codeHighlightPlugin, parseHljsResult } from "./codeHighlight"
import { hljs } from "./codeLanguages"
import { CODE_LANGUAGE_OPTIONS } from "./CodeLanguagePicker"

const samples: Record<string, string> = {
  javascript: 'const x = "hello";', typescript: 'const x: string = "hello";',
  python: 'def greet():\n  return "hello"', css: '.car { color: red; }',
  html: '<div title="a & b">Text &amp; &#39; 😃</div>', json: '{"key": true}',
  bash: 'echo "$HOME"', markdown: '# Heading\n**bold**', sql: 'SELECT * FROM cars;',
  go: 'package main\nfunc main() {}', rust: 'fn main() { let x = 1; }',
  java: 'public class Car { int speed = 3; }', cpp: 'int main() { return 0; }',
  ruby: 'def greet\n  puts "hello"\nend', php: '<?php echo "hello"; ?>',
  yaml: 'key: true', xml: '<root attr="value">text</root>'
}

describe("code highlight offsets", () => {
  it.each(CODE_LANGUAGE_OPTIONS.filter((option) => option.value).map((option) => option.value))("highlights %s without changing text offsets", (language) => {
    const text = samples[language]!
    expect(hljs.getLanguage(language)).toBeTruthy()
    const tokens = parseHljsResult(hljs.highlight(text, { language }).value)
    expect(tokens.map((token) => token.text).join("")).toBe(text)
    const plugin = codeHighlightPlugin()
    const state = EditorState.create({ doc: schema.nodes.doc!.create(null, schema.nodes.code_block!.create({ language }, schema.text(text))), plugins: [plugin] })
    const decorations = plugin.props.decorations!.call(plugin, state)!
    const found = (decorations as any).find()
    expect(found.length).toBeGreaterThan(0)
    for (const decoration of found) {
      expect(decoration.from).toBeGreaterThanOrEqual(1)
      expect(decoration.to).toBeLessThanOrEqual(text.length + 1)
    }
  })
  it("decodes entities once and retains the innermost nested scope", () => {
    const tokens = parseHljsResult('<span class="hljs-tag">&lt;<span class="hljs-name">div</span> <span class="hljs-attr">x</span>=<span class="hljs-string">&#x27;&amp;amp;&#39;</span>&gt;</span>')
    expect(tokens.map((token) => token.text).join("")).toBe("<div x='&amp;'>")
    expect(tokens.find((token) => token.text === "div")?.cls).toBe("hljs-name")
  })
})

it("highlights code inside columns as well as top-level code", () => {
  const code = schema.nodes.code_block!.create({ language: "html" }, schema.text('<div x="value">text</div>'))
  const column = schema.nodes.column!.create(null, code)
  const doc = schema.nodes.doc!.create(null, schema.nodes.columns!.create(null, [column, column]))
  const plugin = codeHighlightPlugin()
  const state = EditorState.create({ doc, plugins: [plugin] })
  const decorations = plugin.props.decorations!.call(plugin, state)! as any
  expect(decorations.find().length).toBeGreaterThan(4)
})
