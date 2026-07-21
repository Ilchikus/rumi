// @ts-nocheck -- functionality-first migration from the proven Rumi editor
/**
 * ProseMirror node view for embedded database views.
 *
 * Renders an inline database table/board inside the editor.
 * The embed config is stored in the node attrs (source path, view type, filter, sort).
 */

import { Node as ProseMirrorNode } from 'prosemirror-model'
import { EditorView, NodeView } from 'prosemirror-view'
import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { CaretDown } from '@phosphor-icons/react/dist/csr/CaretDown'
import { Table } from '@phosphor-icons/react/dist/csr/Table'
import { DatabaseView } from '../../../database/DatabaseView'
import { databaseRefreshRevisionFor } from '../../../database/databaseRefresh'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../../../ui/dropdown-menu'
import {
  migratedEditorPlatform,
  subscribeMigratedEditorPlatform
} from '../platform'
import type { MigratedEditorDocument } from '../platform'

export interface DatabaseSourceOption {
  label: string
  value: string
}

const ignoreDatabaseOpen = () => undefined
const ignoreDatabaseMessage = () => undefined

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
        refreshRevision={databaseRefreshRevisionFor(
          platform.databaseRefreshRevisions,
          source
        )}
        onOpenRecord={platform.openDocument ?? ignoreDatabaseOpen}
        onMessage={platform.onMessage ?? ignoreDatabaseMessage}
        toolbarStart={(
          <DatabaseEmbedSourceControl
            source={source}
            documents={platform.documents}
            onOpen={() => platform.openDocument?.(source)}
            onSelect={selectSource}
          />
        )}
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
  const options = useMemo(() => databaseSourceOptions(documents), [documents])

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <label className="mb-2 block text-xs font-medium text-muted-foreground">
        Select a database to embed
      </label>
      <DatabaseSourceDropdown
        options={options}
        openOnMount={open}
        onSelect={onSelect}
      >
        <button
          type="button"
          aria-label="Database source"
          className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          disabled={options.length === 0}
        >
          <Table size={16} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {options.length === 0 ? 'No databases in this workspace' : 'Choose a database…'}
          </span>
          <CaretDown size={14} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </DatabaseSourceDropdown>
    </div>
  )
}

function DatabaseEmbedSourceControl({
  source,
  documents,
  onOpen,
  onSelect
}: {
  source: string
  documents: readonly MigratedEditorDocument[]
  onOpen: () => void
  onSelect: (source: string) => void
}): ReactElement {
  const options = useMemo(() => databaseSourceOptions(documents), [documents])
  const sourceDocument = documents.find((document) => (
    document.kind === 'database' && document.nodePath === source
  ))

  return (
    <div
      className="flex min-w-0 max-w-full items-center gap-0.5"
      data-database-embed-source="true"
    >
      <button
        type="button"
        className="inline-flex min-w-0 items-center gap-1 text-sm font-semibold text-sky-600 underline decoration-sky-600 underline-offset-[0.18em] hover:text-sky-700"
        onClick={onOpen}
        title={`Open ${sourceDocument?.title ?? source}`}
      >
        <Table size={15} weight="bold" className="shrink-0" aria-hidden="true" />
        <span className="truncate">{sourceDocument?.title ?? source}</span>
      </button>
      <DatabaseSourceDropdown options={options} onSelect={onSelect}>
        <button
          type="button"
          aria-label="Change database source"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-sky-600 outline-none hover:bg-accent hover:text-sky-700 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CaretDown size={13} aria-hidden="true" />
        </button>
      </DatabaseSourceDropdown>
    </div>
  )
}

function DatabaseSourceDropdown({
  options,
  openOnMount = false,
  onSelect,
  children
}: {
  options: readonly DatabaseSourceOption[]
  openOnMount?: boolean
  onSelect: (source: string) => void
  children: ReactElement
}): ReactElement {
  const [menuOpen, setMenuOpen] = useState(openOnMount && options.length > 0)

  useEffect(() => {
    if (openOnMount && options.length > 0) setMenuOpen(true)
  }, [openOnMount, options.length])

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 min-w-[14rem] max-w-[min(28rem,calc(100vw-2rem))] overflow-y-auto"
      >
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onSelect(option.value)}
          >
            <Table size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{option.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
