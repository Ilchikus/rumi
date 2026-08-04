import { redo, undo } from "prosemirror-history"

// Toolbar buttons and the editor keymap share these exact commands so their
// history behavior cannot drift.
export const undoEditorChange = undo
export const redoEditorChange = redo
