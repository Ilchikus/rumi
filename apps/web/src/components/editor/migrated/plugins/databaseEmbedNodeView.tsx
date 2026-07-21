// @ts-nocheck -- functionality-first migration from the proven Rumi editor
/**
 * ProseMirror node view for embedded database views.
 *
 * Renders an inline database table/board inside the editor.
 * The embed config is stored in the node attrs (source path, view type, filter, sort).
 */

import { Node as ProseMirrorNode } from 'prosemirror-model'
import { EditorView, NodeView } from 'prosemirror-view'
import { useEffect, useMemo, useRef } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { DatabaseView } from '../../../database/DatabaseView'
import {
  migratedEditorPlatform,
  subscribeMigratedEditorPlatform
} from '../platform'
import type { MigratedEditorDocument } from '../platform'

export interface DatabaseSourceOption {
  label: string
  value: string
}

export function databaseSourceOptions(
  documents: readonly MigratedEditorDocument[]
): DatabaseSourceOption[] {
  return documents
    .filter((document) => document.kind === 'database')
    .map((document) => ({
      value: document.nodePath,
      label: document.title === document.nodePath
        ? document.title
        : `${document.title} — ${document.nodePath}`
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
}

export function databaseEmbedNodeView(
  node: ProseMirrorNode,
  view: EditorView,
  getPos: (() => number | undefined) | boolean
): NodeView {
  const dom = document.createElement('div')
  dom.className = 'database-embed-block my-2 w-full min-w-0 max-w-full'
  dom.dataset.databaseEmbed = 'true'
  dom.setAttribute('contenteditable', 'false')

  let root: Root | null = null
  let currentNode = node

  function selectSource(source: string) {
    const position = typeof getPos === 'function' ? getPos() : undefined
    if (typeof position !== 'number') return
    view.dispatch(view.state.tr.setNodeMarkup(position, undefined, {
      ...currentNode.attrs,
      source,
      selectingSource: false
    }))
    view.focus()
  }

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
    ) : !source ? (
      <DatabaseSourcePicker
        documents={platform.documents}
        open={Boolean(currentNode.attrs.selectingSource)}
        onSelect={selectSource}
      />
    ) : (
      <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
        Database embed is unavailable
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

function DatabaseSourcePicker({
  documents,
  open,
  onSelect
}: {
  documents: readonly MigratedEditorDocument[]
  open: boolean
  onSelect: (source: string) => void
}) {
  const selectRef = useRef<HTMLSelectElement | null>(null)
  const options = useMemo(() => databaseSourceOptions(documents), [documents])

  useEffect(() => {
    if (!open || options.length === 0) return
    const select = selectRef.current
    if (!select) return
    select.focus()
    try {
      select.showPicker?.()
    } catch {
      // Browsers may require transient pointer activation; focused native selection still works.
    }
  }, [open, options.length])

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <label className="mb-2 block text-xs font-medium text-muted-foreground">
        Select a database to embed
      </label>
      <select
        ref={selectRef}
        aria-label="Database source"
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        value=""
        disabled={options.length === 0}
        onChange={(event) => {
          if (event.currentTarget.value) onSelect(event.currentTarget.value)
        }}
      >
        <option value="" disabled>
          {options.length === 0 ? 'No databases in this workspace' : 'Choose a database…'}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  )
}
