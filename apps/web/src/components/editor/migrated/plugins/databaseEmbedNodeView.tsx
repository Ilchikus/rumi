// @ts-nocheck -- functionality-first migration from the proven Rumi editor
/**
 * ProseMirror node view for embedded database views.
 *
 * Renders an inline database table/board inside the editor.
 * The embed config is stored in the node attrs (source path, view type, filter, sort).
 */

import { Node as ProseMirrorNode } from 'prosemirror-model'
import { EditorView, NodeView } from 'prosemirror-view'
import { createRoot, Root } from 'react-dom/client'
import { DatabaseView } from '../../../database/DatabaseView'
import { migratedEditorPlatform, subscribeMigratedEditorPlatform } from '../platform'

export function databaseEmbedNodeView(
  node: ProseMirrorNode,
  view: EditorView,
  getPos: (() => number | undefined) | boolean
): NodeView {
  const dom = document.createElement('div')
  dom.className = 'database-embed-block my-2'
  dom.setAttribute('contenteditable', 'false')

  let root: Root | null = null
  let currentNode = node

  function render(currentNode: ProseMirrorNode) {
    if (!root) {
      root = createRoot(dom)
    }
    const platform = migratedEditorPlatform()
    const source = String(currentNode.attrs.source || '')
    root.render(source && platform.api ? (
      <DatabaseView
        key={source}
        api={platform.api}
        databasePath={source}
        refreshRevision={platform.databaseRefreshRevision}
        onOpenRecord={(path) => platform.openDocument?.(path)}
        onMessage={(message) => platform.onMessage?.(message)}
      />
    ) : (
      <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        Database embed — no source specified
      </div>
    ))
  }

  render(node)
  const unsubscribePlatform = subscribeMigratedEditorPlatform(() => render(currentNode))

  return {
    dom,
    update(updatedNode: ProseMirrorNode) {
      if (updatedNode.type !== node.type) return false
      currentNode = updatedNode
      render(updatedNode)
      return true
    },
    destroy() {
      unsubscribePlatform()
      if (root) {
        // Defer unmount to avoid React render-in-render issues
        setTimeout(() => root?.unmount(), 0)
        root = null
      }
    },
    ignoreMutation() {
      return true
    },
    stopEvent() {
      return true
    },
  }
}
