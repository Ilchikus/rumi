// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { Plugin, PluginKey } from "prosemirror-state"
import { Schema } from "prosemirror-model"

export const taskListPluginKey = new PluginKey("taskList")

export function taskListPlugin(schema: Schema) {
  return new Plugin({
    key: taskListPluginKey,

    props: {
      handleClickOn(view, pos, node, nodePos, event) {
        if (node.type.name !== "task_item") return false

        const target = event.target as HTMLElement
        if (target.tagName !== "INPUT" || target.getAttribute("type") !== "checkbox") {
          return false
        }

        // Toggle the checked state
        const tr = view.state.tr.setNodeMarkup(nodePos, undefined, {
          ...node.attrs,
          checked: !node.attrs.checked
        })
        view.dispatch(tr)

        return true
      }
    }
  })
}
