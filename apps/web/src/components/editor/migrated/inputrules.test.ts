import { EditorState, TextSelection, type Plugin, type Transaction } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import { history } from "prosemirror-history"
import { describe, expect, it } from "vitest"
import {
  buildInputRules,
  inlineCodeInputSessionKey,
  inlineCodeInputSessionPlugin
} from "./inputrules"
import { buildKeymap } from "./keymap"
import { parseMarkdown, serializeMarkdown } from "./markdown"
import { schema } from "./schema"

function createTypingHarness(
  doc = schema.nodes.doc!.create(null, schema.nodes.paragraph!.create())
) {
  const plugins = [
    inlineCodeInputSessionPlugin(schema),
    buildInputRules(schema),
    buildKeymap(schema),
    history()
  ]
  let state = EditorState.create({
    doc,
    plugins
  })
  const view = {
    get state() {
      return state
    },
    composing: false,
    dispatch(transaction: Transaction) {
      state = state.apply(transaction)
    }
  } as unknown as EditorView

  function type(text: string) {
    for (const character of text) {
      const { from, to } = state.selection
      let handled = false
      for (const plugin of plugins) {
        const handleTextInput = plugin.props.handleTextInput
        if (!handleTextInput) continue
        handled = Boolean(handleTextInput.call(
          plugin,
          view,
          from,
          to,
          character,
          () => state.tr.insertText(character, from, to)
        ))
        if (handled) break
      }
      if (!handled) view.dispatch(state.tr.insertText(character, from, to))
    }
  }

  function replaceText(from: number, to: number, text: string) {
    let handled = false
    for (const plugin of plugins) {
      const handleTextInput = plugin.props.handleTextInput
      if (!handleTextInput) continue
      handled = Boolean(handleTextInput.call(
        plugin,
        view,
        from,
        to,
        text,
        () => state.tr.insertText(text, from, to)
      ))
      if (handled) break
    }
    if (!handled) view.dispatch(state.tr.insertText(text, from, to))
  }

  return {
    get state() { return state },
    plugins,
    type,
    replaceText,
    dispatch(transaction: Transaction) { view.dispatch(transaction) },
    blur() {
      const sessionPlugin = plugins[0] as Plugin
      sessionPlugin.props.handleDOMEvents?.blur?.call(
        sessionPlugin,
        view,
        new Event("blur") as FocusEvent
      )
    },
    key(key: string) {
      const event = {
        key,
        code: key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault() {},
        stopPropagation() {}
      } as KeyboardEvent
      for (const plugin of plugins) {
        const handled = plugin.props.handleKeyDown?.call(plugin, view, event) ?? false
        if (handled) return true
      }
      return false
    },
    undoShortcut() {
      const keymapPlugin = plugins[2]!
      return keymapPlugin.props.handleKeyDown?.call(
        keymapPlugin,
        view,
        {
          key: "z",
          code: "KeyZ",
          ctrlKey: true,
          metaKey: false,
          altKey: false,
          shiftKey: false,
          preventDefault() {},
          stopPropagation() {}
        } as KeyboardEvent
      ) ?? false
    }
  }
}

function typeText(text: string): EditorState {
  const harness = createTypingHarness()
  harness.type(text)
  return harness.state
}

describe("live editor code-block input rules", () => {
  it("keeps a bare fence literal until Enter, then creates a plain code block", () => {
    const harness = createTypingHarness()

    harness.type("```")

    expect(harness.state.doc.firstChild?.type).toBe(schema.nodes.paragraph)
    expect(harness.state.doc.firstChild?.textContent).toBe("```")
    expect(harness.key("Enter")).toBe(true)
    expect(harness.state.doc.firstChild?.type).toBe(schema.nodes.code_block)
    expect(harness.state.doc.firstChild?.attrs.language).toBeNull()
    expect(harness.state.doc.firstChild?.textContent).toBe("")

    harness.type("const answer = 42")
    expect(harness.state.doc.firstChild?.textContent).toBe("const answer = 42")
    expect(serializeMarkdown(harness.state.doc)).toBe(
      "```\nconst answer = 42\n```\n"
    )
  })

  it("applies a typed language when Enter commits the fence", () => {
    const harness = createTypingHarness()

    harness.type("```php")

    expect(harness.state.doc.firstChild?.type).toBe(schema.nodes.paragraph)
    expect(harness.key("Enter")).toBe(true)
    expect(harness.state.doc.firstChild?.type).toBe(schema.nodes.code_block)
    expect(harness.state.doc.firstChild?.attrs.language).toBe("php")

    harness.type("<?php echo 'Rumi';")
    expect(serializeMarkdown(harness.state.doc)).toBe(
      "```php\n<?php echo 'Rumi';\n```\n"
    )
  })

  it("creates editable Mermaid source when Enter commits a Mermaid fence", () => {
    const harness = createTypingHarness()

    harness.type("```mermaid")

    expect(harness.key("Enter")).toBe(true)
    expect(harness.state.doc.firstChild?.type).toBe(schema.nodes.mermaid)
    expect(harness.state.doc.firstChild?.attrs.mode).toBe("edit")

    harness.type("flowchart TD")
    expect(serializeMarkdown(harness.state.doc)).toBe(
      "```mermaid\nflowchart TD\n```\n"
    )
  })

  it("keeps three backticks literal away from paragraph start", () => {
    const state = typeText("value```")

    expect(state.doc.firstChild?.type).toBe(schema.nodes.paragraph)
    expect(state.doc.firstChild?.textContent).toBe("value```")
  })

  it("keeps three backticks literal inside an existing code block", () => {
    const harness = createTypingHarness(
      schema.nodes.doc!.create(null, schema.nodes.code_block!.create())
    )

    harness.type("```")

    expect(harness.state.doc.firstChild?.type).toBe(schema.nodes.code_block)
    expect(harness.state.doc.firstChild?.textContent).toBe("```")
  })

  it("undoes the Enter conversion back to the complete literal fence", () => {
    const harness = createTypingHarness()
    harness.type("```php")
    harness.key("Enter")

    expect(harness.state.doc.firstChild?.type).toBe(schema.nodes.code_block)
    expect(harness.undoShortcut()).toBe(true)
    expect(harness.state.doc.firstChild?.type).toBe(schema.nodes.paragraph)
    expect(harness.state.doc.firstChild?.textContent).toBe("```php")
  })
})

describe("live editor task input rules", () => {
  it.each([
    ["bare unchecked", "[] ", false, "- [ ]\n"],
    ["spaced-dash unchecked", "- [] ", false, "- [ ]\n"],
    ["compact-dash unchecked", "-[] ", false, "- [ ]\n"],
    ["bare checked", "[x] ", true, "- [x]\n"],
    ["spaced-dash checked", "- [x] ", true, "- [x]\n"],
    ["compact-dash checked", "-[x] ", true, "- [x]\n"]
  ])("turns the %s shortcut into a task item after Space", (_name, shortcut, checked, markdown) => {
    const state = typeText(shortcut)

    expect(state.doc.childCount).toBe(1)
    expect(state.doc.firstChild?.type.name).toBe("task_item")
    expect(state.doc.firstChild?.attrs.checked).toBe(checked)
    expect(state.doc.firstChild?.textContent).toBe("")
    expect(serializeMarkdown(state.doc)).toBe(markdown)
  })

  it.each([
    ["[]", "paragraph", "[]"],
    ["- []", "bullet_item", "[]"],
    ["-[]", "paragraph", "-[]"],
    ["[x]", "paragraph", "[x]"],
    ["- [x]", "bullet_item", "[x]"],
    ["-[x]", "paragraph", "-[x]"]
  ])("keeps %s literal until the trailing Space", (text, blockType, content) => {
    const state = typeText(text)

    expect(state.doc.firstChild?.type.name).toBe(blockType)
    expect(state.doc.firstChild?.textContent).toBe(content)
  })

  it("also accepts the spaced GFM unchecked marker", () => {
    const state = typeText("- [ ] ")

    expect(state.doc.firstChild?.type.name).toBe("task_item")
    expect(state.doc.firstChild?.attrs.checked).toBe(false)
    expect(serializeMarkdown(state.doc)).toBe("- [ ]\n")
  })

  it.each([
    ["bare unchecked", "[] ", false],
    ["bare checked", "[x] ", true],
    ["compact-dash unchecked", "-[] ", false],
    ["compact-dash checked", "-[x] ", true],
    ["spaced-dash unchecked", "- [] ", false],
    ["spaced-dash checked", "- [x] ", true],
    ["GFM unchecked", "- [ ] ", false]
  ])("preserves existing content after the %s marker", (_name, shortcut, checked) => {
    const suffix = "keep this 👍🏽"
    const harness = createTypingHarness(
      schema.nodes.doc!.create(null, schema.nodes.paragraph!.create(null, schema.text(suffix)))
    )

    harness.type(shortcut)

    expect(harness.state.doc.firstChild?.type).toBe(schema.nodes.task_item)
    expect(harness.state.doc.firstChild?.attrs.checked).toBe(checked)
    expect(harness.state.doc.firstChild?.textContent).toBe(suffix)
    expect(harness.state.selection.from).toBe(1)
  })

  it("preserves marked, linked, and line-break content through Markdown roundtrip", () => {
    const original = parseMarkdown(
      "**Marked** [Rumi](https://rumi.md) ❤️\nsoft break  \nhard break\n",
      schema
    )
    const originalContent = original.firstChild!.content
    const harness = createTypingHarness(original)

    harness.type("-[] ")

    const task = harness.state.doc.firstChild!
    expect(task.type).toBe(schema.nodes.task_item)
    expect(task.content.eq(originalContent)).toBe(true)
    expect(task.content.content.map((node) => node.type.name)).toContain("soft_break")
    expect(task.content.content.map((node) => node.type.name)).toContain("hard_break")
    expect(task.content.content.some((node) => node.marks.some((mark) => mark.type === schema.marks.bold))).toBe(true)
    expect(task.content.content.some((node) => node.marks.some((mark) => mark.type === schema.marks.link))).toBe(true)

    const markdown = serializeMarkdown(harness.state.doc)
    expect(markdown).toBe(
      "- [ ] **Marked** [Rumi](https://rumi.md) ❤️\nsoft break  \nhard break\n"
    )
    expect(parseMarkdown(markdown, schema).toJSON()).toEqual(harness.state.doc.toJSON())
  })

  it("keeps the source bullet indentation when upgrading it to a task", () => {
    const suffix = schema.text("nested content")
    const harness = createTypingHarness(
      schema.nodes.doc!.create(
        null,
        schema.nodes.bullet_item!.create({ indent: 2 }, suffix)
      )
    )

    harness.type("[x] ")

    expect(harness.state.doc.firstChild?.type).toBe(schema.nodes.task_item)
    expect(harness.state.doc.firstChild?.attrs).toMatchObject({ checked: true, indent: 2 })
    expect(harness.state.doc.firstChild?.textContent).toBe("nested content")
    expect(harness.state.selection.from).toBe(1)
  })

  it("preserves content through the spaced marker's intermediate bullet item", () => {
    const harness = createTypingHarness(
      schema.nodes.doc!.create(null, schema.nodes.paragraph!.create(null, schema.text("existing")))
    )

    harness.type("- ")
    expect(harness.state.doc.firstChild?.type).toBe(schema.nodes.bullet_item)
    expect(harness.state.doc.firstChild?.textContent).toBe("existing")
    expect(harness.state.selection.from).toBe(1)

    harness.type("[x] ")
    expect(harness.state.doc.firstChild?.type).toBe(schema.nodes.task_item)
    expect(harness.state.doc.firstChild?.attrs).toMatchObject({ checked: true, indent: 0 })
    expect(harness.state.doc.firstChild?.textContent).toBe("existing")
    expect(harness.state.selection.from).toBe(1)
  })

  it("places immediate subsequent typing before the preserved content", () => {
    const harness = createTypingHarness(
      schema.nodes.doc!.create(null, schema.nodes.paragraph!.create(null, schema.text("existing")))
    )

    harness.type("-[] ")
    harness.type("new ")

    expect(harness.state.doc.firstChild?.textContent).toBe("new existing")
    expect(serializeMarkdown(harness.state.doc)).toBe("- [ ] new existing\n")
  })

  it("undoes the conversion to the complete literal marker and untouched suffix", () => {
    const original = parseMarkdown("**Keep** this content\n", schema)
    const originalContent = original.firstChild!.content
    const harness = createTypingHarness(original)

    harness.type("-[] ")
    expect(harness.state.doc.firstChild?.type).toBe(schema.nodes.task_item)
    expect(harness.undoShortcut()).toBe(true)

    const paragraph = harness.state.doc.firstChild!
    expect(paragraph.type).toBe(schema.nodes.paragraph)
    expect(paragraph.textContent).toBe("-[] Keep this content")
    expect(paragraph.content.cut("-[] ".length).eq(originalContent)).toBe(true)

    expect(harness.undoShortcut()).toBe(true)
    expect(harness.state.doc.firstChild?.type).toBe(schema.nodes.paragraph)
    expect(harness.state.doc.firstChild?.content.eq(originalContent)).toBe(true)
  })

  it("keeps task-like text literal away from the start of a paragraph", () => {
    const state = typeText("before -[] ")

    expect(state.doc.firstChild?.type).toBe(schema.nodes.paragraph)
    expect(state.doc.firstChild?.textContent).toBe("before -[] ")
  })
})

describe("live editor strikethrough input rules", () => {
  it("uses GFM double tildes and keeps double hyphens literal", () => {
    const strikethrough = typeText("~~struck through~~")
    const plainHyphens = typeText("--plain hyphens--")

    expect(strikethrough.doc.firstChild?.firstChild?.marks
      .map((mark) => mark.type.name)).toEqual(["strikethrough"])
    expect(serializeMarkdown(strikethrough.doc)).toBe("~~struck through~~\n")
    expect(plainHyphens.doc.firstChild?.firstChild?.marks).toEqual([])
    expect(serializeMarkdown(plainHyphens.doc)).toBe("--plain hyphens--\n")
  })
})

describe("live editor inline-code input rules", () => {
  it("places subsequent typing outside a completed backtick shortcut", () => {
    let state = typeText("`value`")

    expect(schema.marks.code!.spec.inclusive).toBe(false)
    expect(state.selection.$from.marks().map((mark) => mark.type.name)).not.toContain("code")
    state = state.apply(state.tr.insertText(" after"))
    expect(serializeMarkdown(state.doc)).toBe("`value` after\n")
  })

  it("keeps a pending opener action-scoped without a character limit", () => {
    const harness = createTypingHarness()
    const content = "x".repeat(600)

    harness.type(`\`${content}\``)

    expect(harness.state.doc.textContent).toBe(content)
    expect(harness.state.doc.firstChild?.firstChild?.marks
      .map((mark) => mark.type.name)).toContain("code")
    expect(inlineCodeInputSessionKey.getState(harness.state)).toBeNull()
  })

  it("keeps pending inline code through a browser-normalized double space", () => {
    const harness = createTypingHarness()
    harness.type("`value ")
    const cursor = harness.state.selection.from

    harness.replaceText(cursor - 1, cursor, ". ")
    expect(inlineCodeInputSessionKey.getState(harness.state)).not.toBeNull()
    harness.type("`")

    expect(serializeMarkdown(harness.state.doc)).toBe("`value. `\n")
  })

  it("keeps pending inline code when macOS inserts punctuation before its space", () => {
    const harness = createTypingHarness()
    harness.type("`value ")
    const cursor = harness.state.selection.from

    harness.dispatch(harness.state.tr.insertText(".", cursor - 1, cursor - 1))
    expect(inlineCodeInputSessionKey.getState(harness.state)).not.toBeNull()
    harness.type("`")

    expect(serializeMarkdown(harness.state.doc)).toBe("`value. `\n")
  })

  it("leaves interrupted backticks literal after caret movement", () => {
    const harness = createTypingHarness()
    harness.type("`old")
    const end = harness.state.selection.from

    harness.dispatch(harness.state.tr.setSelection(TextSelection.create(harness.state.doc, 2)))
    harness.dispatch(harness.state.tr.setSelection(TextSelection.create(harness.state.doc, end)))
    harness.type("`")

    expect(harness.state.doc.textContent).toBe("`old`")
    expect(harness.state.doc.firstChild?.firstChild?.marks).toHaveLength(0)
    expect(serializeMarkdown(harness.state.doc)).toBe("\\`old\\`\n")
  })

  it("leaves interrupted backticks literal after blur", () => {
    const harness = createTypingHarness()
    harness.type("`old")
    harness.blur()
    harness.type("`")

    expect(harness.state.doc.textContent).toBe("`old`")
    expect(serializeMarkdown(harness.state.doc)).toBe("\\`old\\`\n")
  })

  it("cancels on navigation actions but continues through text deletion", () => {
    const deleted = createTypingHarness()
    deleted.type("`abc")
    const cursor = deleted.state.selection.from
    deleted.dispatch(deleted.state.tr.delete(cursor - 1, cursor))
    expect(inlineCodeInputSessionKey.getState(deleted.state)).not.toBeNull()
    deleted.type("`")
    expect(serializeMarkdown(deleted.state.doc)).toBe("`ab`\n")

    const navigated = createTypingHarness()
    navigated.type("`old")
    expect(navigated.key("ArrowLeft")).toBe(false)
    expect(inlineCodeInputSessionKey.getState(navigated.state)).toBeNull()
    navigated.type("`")
    expect(serializeMarkdown(navigated.state.doc)).toBe("\\`old\\`\n")
  })

  it("undoes completed inline-code formatting back to escaped literal ticks", () => {
    const harness = createTypingHarness()
    harness.type("`value`")

    expect(serializeMarkdown(harness.state.doc)).toBe("`value`\n")
    expect(harness.undoShortcut()).toBe(true)
    expect(harness.state.doc.textContent).toBe("`value`")
    expect(harness.state.doc.firstChild?.firstChild?.marks).toHaveLength(0)
    expect(serializeMarkdown(harness.state.doc)).toBe("\\`value\\`\n")
  })
})
