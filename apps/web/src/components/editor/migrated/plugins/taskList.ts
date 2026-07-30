// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Plugin, PluginKey } from "prosemirror-state"
import { Schema } from "prosemirror-model"

export const taskListPluginKey = new PluginKey("taskList")

export function taskListPlugin(schema: Schema) {
  return new Plugin({
    key: taskListPluginKey,

    props: {
      handleDOMEvents: {
        change(view, event) {
          const target = event.target as HTMLInputElement | null
          if (!target) return false
          if (target.tagName !== "INPUT" || target.getAttribute("type") !== "checkbox") {
            return false
          }

          const taskElement = target.closest(".task-item")
          if (!taskElement || !view.dom.contains(taskElement)) return false

          const task = findTaskItemForElement(view, schema, taskElement)
          if (!task) return false
          const { node, pos: nodePos } = task
          if (!view.editable) {
            target.checked = Boolean(node.attrs.checked)
            return true
          }
          if (node.attrs.checked === target.checked) return true

          const tr = view.state.tr.setNodeMarkup(nodePos, undefined, {
            ...node.attrs,
            checked: target.checked
          })
          view.dispatch(tr)

          return true
        }
      }
    },

    view(view) {
      let editable: boolean | null = null
      const syncReadOnlyState = () => {
        if (view.editable === editable) return
        editable = view.editable
        for (const checkbox of view.dom.querySelectorAll<HTMLInputElement>(
          ".task-item input[type=checkbox]"
        )) {
          checkbox.disabled = !editable
        }
      }

      syncReadOnlyState()
      return { update: syncReadOnlyState }
    }
  })
}

function findTaskItemForElement(
  view: import("prosemirror-view").EditorView,
  schema: Schema,
  taskElement: Element
) {
  let domPosition: number
  try {
    domPosition = view.posAtDOM(taskElement, 0)
  } catch {
    return null
  }

  const $position = view.state.doc.resolve(domPosition)
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    const node = $position.node(depth)
    if (node.type === schema.nodes.task_item) {
      return { node, pos: $position.before(depth) }
    }
  }

  const nodeAfter = $position.nodeAfter
  return nodeAfter?.type === schema.nodes.task_item
    ? { node: nodeAfter, pos: $position.pos }
    : null
}
