import { EditorState, type Transaction } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
import { describe, expect, it } from "vitest"
import { parseMarkdown, serializeMarkdown } from "../markdown"
import { schema } from "../schema"
import { taskListPlugin } from "./taskList"

describe("task checkbox interaction", () => {
  it("persists the actual checked value for the first document block", () => {
    const plugin = taskListPlugin(schema)
    let state = EditorState.create({
      doc: schema.nodes.doc!.create(null, [
        schema.nodes.task_item!.create(
          { indent: 0, checked: false },
          schema.text("First task")
        ),
        schema.nodes.task_item!.create(
          { indent: 0, checked: true },
          schema.text("Second task")
        )
      ]),
      plugins: [plugin]
    })
    const taskElement = {}
    const view = {
      get state() {
        return state
      },
      dom: {
        contains(element: unknown) {
          return element === taskElement
        },
        querySelectorAll: () => []
      },
      editable: true,
      posAtDOM: () => 1,
      dispatch(transaction: Transaction) {
        state = state.apply(transaction)
      }
    } as unknown as EditorView
    const checkbox = {
      tagName: "INPUT",
      checked: true,
      getAttribute(name: string) {
        return name === "type" ? "checkbox" : null
      },
      closest(selector: string) {
        return selector === ".task-item" ? taskElement : null
      }
    }

    const handled = plugin.props.handleDOMEvents?.change?.call(
      plugin,
      view,
      { target: checkbox } as unknown as Event
    )

    expect(handled).toBe(true)
    expect(state.doc.firstChild?.attrs.checked).toBe(true)
    expect(state.doc.child(1).attrs.checked).toBe(true)
    const markdown = serializeMarkdown(state.doc)
    expect(markdown).toBe("- [x] First task\n- [x] Second task\n")
    expect(parseMarkdown(markdown, schema).toJSON()).toEqual(state.doc.toJSON())
  })

  it("restores the source value without dispatching in a read-only editor", () => {
    const plugin = taskListPlugin(schema)
    const state = EditorState.create({
      doc: schema.nodes.doc!.create(
        null,
        schema.nodes.task_item!.create({ indent: 0, checked: false }, schema.text("Task"))
      ),
      plugins: [plugin]
    })
    const taskElement = {}
    let dispatchCount = 0
    const view = {
      state,
      editable: false,
      dom: {
        contains: (element: unknown) => element === taskElement,
        querySelectorAll: () => []
      },
      posAtDOM: () => 1,
      dispatch: () => {
        dispatchCount += 1
      }
    } as unknown as EditorView
    const checkbox = {
      tagName: "INPUT",
      checked: true,
      getAttribute: (name: string) => name === "type" ? "checkbox" : null,
      closest: (selector: string) => selector === ".task-item" ? taskElement : null
    }

    expect(plugin.props.handleDOMEvents?.change?.call(
      plugin,
      view,
      { target: checkbox } as unknown as Event
    )).toBe(true)
    expect(checkbox.checked).toBe(false)
    expect(dispatchCount).toBe(0)
  })

  it("disables task inputs when the editor becomes read-only", () => {
    const plugin = taskListPlugin(schema)
    const checkbox = { disabled: false }
    const view = {
      editable: false,
      dom: { querySelectorAll: () => [checkbox] }
    } as unknown as EditorView

    const pluginView = plugin.spec.view?.(view)
    expect(checkbox.disabled).toBe(true)

    Object.assign(view, { editable: true })
    pluginView?.update?.(view, null as never)
    expect(checkbox.disabled).toBe(false)
  })

  it("ignores changes outside a task checkbox", () => {
    const plugin = taskListPlugin(schema)
    const state = EditorState.create({
      doc: schema.nodes.doc!.create(null, schema.nodes.paragraph!.create()),
      plugins: [plugin]
    })
    const view = {
      state,
      editable: true,
      dom: { contains: () => false, querySelectorAll: () => [] }
    } as unknown as EditorView

    expect(plugin.props.handleDOMEvents?.change?.call(
      plugin,
      view,
      {
        target: {
          tagName: "INPUT",
          getAttribute: () => "text"
        }
      } as unknown as Event
    )).toBe(false)
  })
})
