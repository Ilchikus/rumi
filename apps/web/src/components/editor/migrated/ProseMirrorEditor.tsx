// @ts-nocheck -- functionality-first migration from the proven Rumi editor
import { forwardRef, useEffect, useRef, useCallback, useImperativeHandle, MouseEvent } from "react"
import type { RumiApiClient } from "@rumi/api-client"
import { cn } from "../../../lib/utils"
import type { Node as ProseMirrorNode } from "prosemirror-model"
import { EditorState, TextSelection } from "prosemirror-state"
import { EditorView } from "prosemirror-view"
import "prosemirror-view/style/prosemirror.css"
import "prosemirror-tables/style/tables.css"
import "./editor.css"
import { history } from "prosemirror-history"
import { baseKeymap } from "prosemirror-commands"
import { keymap } from "prosemirror-keymap"
import { schema } from "./schema"
import { buildKeymap } from "./keymap"
import { buildInputRules } from "./inputrules"
import { parseMarkdown, serializeMarkdown } from "./markdown"
import { taskListPlugin } from "./plugins/taskList"
import { slashCommandsPlugin } from "./plugins/slashCommands"
import { selectionToolbarPlugin } from "./plugins/selectionToolbar"
import { linkPlugin } from "./plugins/linkPlugin"
import { atMentionPlugin, FileItem } from "./plugins/atMention"
import { blockDragHandlePlugin } from "./plugins/blockDragHandle"
import { multiBlockSelectionPlugin } from "./plugins/multiBlockSelection"
import { tableEditing, columnResizing } from "prosemirror-tables"
import { tableControlsPlugin } from "./plugins/tableControls"
import { codeBlockNodeView } from "./plugins/codeBlockView"
import { codeHighlightPlugin } from "./plugins/codeHighlight"
import { fileNodeView } from "./plugins/fileNodeView"
import { imageNodeView } from "./plugins/imageNodeView"
import { mermaidNodeView } from "./plugins/mermaidNodeView"
import { databaseEmbedNodeView } from "./plugins/databaseEmbedNodeView"
import { pasteHandlerPlugin } from "./plugins/pasteHandler"
import { collapsibleHeadingsPlugin, headingNodeView } from "./plugins/collapsibleHeadings"
import { setMigratedEditorPlatform } from "./platform"

export interface RumiBlockEditorHandle {
  focus: () => void
  getMarkdown: () => string
  markClean: (markdown: string) => void
  activeDocumentKey: () => string | null
  documentRevision: () => number
  prependTitleContent: (text: string, expectedDocumentKey: string) => boolean
  canUndoTitleContent: (text: string, expectedDocumentKey: string) => boolean
  undoTitleContent: (text: string, expectedDocumentKey: string) => boolean
}

export interface RumiDocumentLink {
  path: string
  title: string
}

export interface RumiBlockEditorProps {
  api?: RumiApiClient
  documentKey: string
  markdown: string
  documents?: readonly RumiDocumentLink[]
  onOpenDocument?: (path: string) => void
  onUploadAsset?: (file: File) => Promise<string>
  onMessage?: (message: string) => void
  onDirty: () => void
}

export const ProseMirrorEditor = forwardRef<RumiBlockEditorHandle, RumiBlockEditorProps>(
function ProseMirrorEditor(
  {
    api,
    documentKey,
    markdown,
    documents = [],
    onOpenDocument,
    onUploadAsset,
    onMessage,
    onDirty
  },
  ref
) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const activeDocumentKeyRef = useRef<string | null>(null)
  const documentRevisionRef = useRef(0)
  const titleContentUndoRef = useRef<{
    documentKey: string
    text: string
    originalDoc: ProseMirrorNode
    doc: ProseMirrorNode
  } | null>(null)
  const contentRef = useRef(markdown)
  const onDirtyRef = useRef(onDirty)
  onDirtyRef.current = onDirty
  // RAF handle for deferred serializeMarkdown — avoids blocking the synchronous keystroke path
  const serializeRafRef = useRef<number | null>(null)
  const filesRef = useRef<FileItem[]>([])

  useEffect(() => {
    filesRef.current = documents.map((document) => ({
      name: document.title || document.path.split("/").at(-1) || document.path,
      path: document.path
    }))
  }, [documents])

  setMigratedEditorPlatform({
    api,
    documentKey,
    documents,
    openDocument: onOpenDocument,
    uploadAsset: onUploadAsset,
    onMessage
  })

  // Callback to get files (stable reference for plugin)
  const getFiles = useCallback(() => filesRef.current, [])

  // Initialize editor
  useEffect(() => {
    if (!editorRef.current) return

    const doc = parseMarkdown(markdown, schema)

    const state = EditorState.create({
      doc,
      plugins: [
        collapsibleHeadingsPlugin(),
        buildInputRules(schema),
        multiBlockSelectionPlugin(schema),
        buildKeymap(schema),
        keymap(baseKeymap),
        history(),
        pasteHandlerPlugin(schema),
        taskListPlugin(schema),
        blockDragHandlePlugin(schema),
        slashCommandsPlugin(schema),
        selectionToolbarPlugin(schema),
        linkPlugin(schema),
        atMentionPlugin(schema, getFiles),
        columnResizing(),
        tableEditing(),
        tableControlsPlugin(),
        codeHighlightPlugin(),
      ]
    })

    const view = new EditorView(editorRef.current, {
      state,
      nodeViews: {
        heading: (node, view, getPos) => headingNodeView(node, view, getPos),
        code_block: (node, view, getPos) => codeBlockNodeView(node, view, getPos),
        file_embed: (node, view, getPos) => fileNodeView(node, view, getPos),
        image: (node, view, getPos) => imageNodeView(node, view, getPos),
        mermaid: (node, view, getPos) => mermaidNodeView(node, view, getPos),
        database_embed: (node, view, getPos) => databaseEmbedNodeView(node, view, getPos),
      },
      dispatchTransaction(transaction) {
        const newState = view.state.apply(transaction)
        view.updateState(newState)

        if (transaction.docChanged) {
          documentRevisionRef.current += 1
          if (serializeRafRef.current !== null) cancelAnimationFrame(serializeRafRef.current)
          serializeRafRef.current = requestAnimationFrame(() => {
            serializeRafRef.current = null
            const markdown = serializeMarkdown(view.state.doc)
            contentRef.current = markdown
            onDirtyRef.current()
          })
        }
      }
    })

    viewRef.current = view
    activeDocumentKeyRef.current = documentKey
    titleContentUndoRef.current = null

    // Focus editor and place cursor at start of first block
    view.focus()
    const $pos = view.state.doc.resolve(1)
    view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)))

    return () => {
      if (serializeRafRef.current !== null) cancelAnimationFrame(serializeRafRef.current)
      view.destroy()
      viewRef.current = null
      if (activeDocumentKeyRef.current === documentKey) {
        activeDocumentKeyRef.current = null
      }
      titleContentUndoRef.current = null
    }
  }, [documentKey, getFiles])

  useImperativeHandle(ref, () => ({
    focus() {
      viewRef.current?.focus()
    },
    getMarkdown() {
      return viewRef.current ? serializeMarkdown(viewRef.current.state.doc) : contentRef.current
    },
    markClean(nextMarkdown: string) {
      contentRef.current = nextMarkdown
    },
    activeDocumentKey() {
      return activeDocumentKeyRef.current
    },
    documentRevision() {
      return documentRevisionRef.current
    },
    prependTitleContent(text: string, expectedDocumentKey: string) {
      const view = viewRef.current
      if (!view || activeDocumentKeyRef.current !== expectedDocumentKey) return false

      const paragraph = schema.nodes.paragraph.create(
        null,
        text ? schema.text(text) : undefined
      )
      const onlyEmptyParagraph =
        view.state.doc.childCount === 1 &&
        view.state.doc.firstChild?.type === schema.nodes.paragraph &&
        view.state.doc.firstChild.content.size === 0
      const originalDoc = view.state.doc
      let transaction = onlyEmptyParagraph
        ? view.state.tr.replaceWith(0, view.state.doc.content.size, paragraph)
        : view.state.tr.insert(0, paragraph)
      transaction = transaction.setSelection(TextSelection.create(transaction.doc, 1))
      transaction = transaction.setMeta("addToHistory", false)
      view.dispatch(transaction.scrollIntoView())
      titleContentUndoRef.current = {
        documentKey: expectedDocumentKey,
        text,
        originalDoc,
        doc: view.state.doc
      }
      view.focus()
      return true
    },
    canUndoTitleContent(text: string, expectedDocumentKey: string) {
      const view = viewRef.current
      const first = view?.state.doc.firstChild
      const titleUndo = titleContentUndoRef.current
      return Boolean(
        view &&
        activeDocumentKeyRef.current === expectedDocumentKey &&
        titleUndo?.documentKey === expectedDocumentKey &&
        titleUndo.text === text &&
        view.state.doc.eq(titleUndo.doc) &&
        first?.type === schema.nodes.paragraph &&
        first.textContent === text
      )
    },
    undoTitleContent(text: string, expectedDocumentKey: string) {
      const view = viewRef.current
      const first = view?.state.doc.firstChild
      const titleUndo = titleContentUndoRef.current
      if (
        !view ||
        activeDocumentKeyRef.current !== expectedDocumentKey ||
        titleUndo?.documentKey !== expectedDocumentKey ||
        titleUndo.text !== text ||
        !view.state.doc.eq(titleUndo.doc) ||
        first?.type !== schema.nodes.paragraph ||
        first.textContent !== text
      ) return false

      let transaction = view.state.tr.replaceWith(
        0,
        view.state.doc.content.size,
        titleUndo.originalDoc.content
      )
      transaction = transaction
        .setSelection(TextSelection.near(transaction.doc.resolve(1)))
        .setMeta("addToHistory", false)
      titleContentUndoRef.current = null
      view.dispatch(transaction.scrollIntoView())
      view.focus()
      return true
    }
  }), [])

  // Handle external content changes (e.g., file changed outside app)
  useEffect(() => {
    if (!viewRef.current) return

    // Only update if content actually changed from external source
    if (markdown !== contentRef.current) {
      contentRef.current = markdown
      const doc = parseMarkdown(markdown, schema)
      const newState = EditorState.create({
        doc,
        plugins: viewRef.current.state.plugins
      })
      viewRef.current.updateState(newState)
    }
  }, [markdown])

  // Handle click on bottom padding area - focus or create last paragraph
  const handlePaddingClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const view = viewRef.current
    if (!view) return

    // Only handle clicks directly on the padding div, not bubbled from editor
    if (e.target !== e.currentTarget) return

    const { doc } = view.state
    const lastNode = doc.lastChild
    const lastNodePos = doc.content.size - (lastNode?.nodeSize || 0)

    // Check if last node is an empty paragraph
    const isLastNodeEmptyParagraph = lastNode &&
      lastNode.type.name === "paragraph" &&
      lastNode.content.size === 0

    if (isLastNodeEmptyParagraph) {
      // Focus the existing empty paragraph
      const tr = view.state.tr.setSelection(
        TextSelection.create(doc, lastNodePos + 1)
      )
      view.dispatch(tr)
      view.focus()
    } else {
      // Create new paragraph at the end and focus it
      const newParagraph = schema.nodes.paragraph.create()
      const insertPos = doc.content.size
      let tr = view.state.tr.insert(insertPos, newParagraph)
      tr = tr.setSelection(TextSelection.create(tr.doc, insertPos + 1))
      view.dispatch(tr)
      view.focus()
    }
  }, [])

  return (
    <div
      className={cn("prosemirror-editor-wrapper")}
      onClick={handlePaddingClick}
    >
      <div
        ref={editorRef}
        className={cn("prosemirror-editor")}
      />
    </div>
  )
})
