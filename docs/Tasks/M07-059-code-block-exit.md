---
status: done
type: feature
milestone: M07
release: "0.1.20"
owner_layer: editor
coverage:
  - markdown
  - ui-smoke
created: 2026-11-03
updated: 2026-11-03
---
# M07-059 Exit code blocks predictably

## Goal

Exit code blocks predictably.

## Scope

Enter on a trailing empty line exits the code block; Shift+Enter retains a literal newline, Mod+Enter exits immediately.

## Out Of Scope

Mobile work, database block drops, and backlog items below that cutoff.

## Owner Layer

editor

## Dependencies

Existing ProseMirror document, Markdown save boundary and runtime page API.

## Test Coverage

- [x] Code/Mermaid editor commands and undo tests.

## Implementation Notes

Rumi keeps multiline code editing with Enter, adds exit on the final empty line, preserves
Shift+Enter for a literal newline, and retains Mod+Enter for an immediate exit. Removing the final
newline and inserting the paragraph are one undoable transaction, including inside a column.

References considered: [Notion code blocks](https://www.notion.com/help/code-blocks),
[Notion shortcuts](https://www.notion.com/help/keyboard-shortcuts),
[Obsidian editing shortcuts](https://obsidian.md/help/editing-shortcuts), and
[Slack formatting](https://slack.com/help/articles/202288908-Format-your-messages-in-Slack).
Obsidian documents Enter as a newline, while Slack documents Shift+Enter for a message newline.
Rumi's trailing-empty-line exit is the chosen document-editor convention.

## Done When

The scoped behavior works, required coverage passes, and integrated release checks pass.
