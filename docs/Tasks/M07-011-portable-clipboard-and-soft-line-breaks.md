---
status: verify
type: feature
milestone: M07
owner_layer: editor
coverage:
  - markdown
  - ui-smoke
  - docs
created: "2026-08-01"
updated: "2026-08-01"
---
# M07-011 Portable Clipboard And Soft Line Breaks

## Goal

Make multiline prose and clipboard interchange predictable, durable in Markdown, convenient in
Obsidian, and useful when content moves between Rumi and rich-text applications.

## Product Definition

Rumi follows Obsidian's convenient non-strict line-break presentation while retaining normal
Markdown paragraph boundaries:

```markdown
first paragraph
second line

new paragraph
```

- A single LF is a visible soft line break inside one paragraph.
- A blank line separates paragraph blocks.
- Existing Markdown hard breaks (`two spaces + LF`, `backslash + LF`, and HTML `<br>`) remain
  readable and retain hard-break semantics.
- The live ProseMirror document represents soft breaks as schema nodes. Literal LF characters must
  not remain embedded in ordinary prose text nodes where a later browser edit can normalize them to
  spaces.

Clipboard behavior depends on the paste intent:

| Origin and action | Expected result |
| --- | --- |
| Google Sheets or another rich source with normal paste | Use supported clipboard HTML; a sheet range becomes a table and common inline formatting remains semantic. |
| Any source with paste-as-plain-text | Ignore clipboard HTML, insert the plain-text flavor literally without interpreting Markdown punctuation, preserve single line breaks as soft breaks, and preserve blank lines as paragraph boundaries. |
| Rumi with normal paste | Prefer Rumi's exact structural clipboard flavor, then supported rich HTML, then plain text. |
| Rumi copied into Google Docs, Slack, or another rich target | Provide portable semantic HTML for common blocks and marks. |
| Rumi copied into a plain-text target | Provide readable text with line, paragraph, list, task, table, code, and embed boundaries intact. |

Normal browser copy therefore supplies both `text/html` and `text/plain`; rich destinations choose
HTML and plain destinations retain a useful fallback. Rumi may also supply a private structural
flavor for exact Rumi-to-Rumi round trips.

## Scope

- Add a stable soft-break representation to the active ProseMirror schema.
- Parse single Markdown LFs inside paragraphs into soft-break nodes and serialize them back to one
  LF without trailing spaces.
- Keep hard breaks distinct and serialize them in portable Markdown form.
- Route normal paste through supported rich HTML and paste-as-plain-text through the clipboard's
  text flavor.
- Stop converting every HTML paste through a lossy HTML-to-Markdown round trip.
- Preserve exact Rumi block structure on internal copy/paste.
- Export portable semantic clipboard HTML for paragraphs, headings, lists, tasks, quotes, tables,
  code, links, inline marks, images, files, Mermaid, database embeds, and dividers.
- Export a readable plain-text clipboard fallback.
- When one multiline paragraph is converted to a bullet, numbered, or task list, create one list
  item per visible line while preserving the marks on each line.
- Keep code-block paste literal.

## Out Of Scope

- A user-facing strict-line-break setting.
- Making every third-party HTML/CSS construct round-trip exactly.
- Preserving spreadsheet formulas, merged-cell geometry, or proprietary Google Sheets styling.
- Replacing Markdown as the canonical editor boundary.
- Changing runtime or API save contracts.
- Redesigning asynchronous asset-upload placement; that remains a separate clipboard follow-up.

## Owner Layer

editor, with Markdown serialization and web clipboard integration at the existing editor boundary.

## Required Coverage

- [x] Markdown roundtrip: soft breaks remain single LF nodes/source and paragraph boundaries remain
      blank lines.
- [x] Markdown compatibility: existing hard breaks remain distinct and round-trip.
- [x] Editor transaction: plain multiline paste creates stable soft breaks and blank-line-separated
      paragraphs.
- [x] Editor transaction: rich paste uses the parsed HTML slice, including a table fixture.
- [x] Editor transaction: paste-as-plain-text ignores a rich clipboard flavor.
- [x] Editor transaction: Rumi's private clipboard flavor round-trips structured blocks.
- [x] Editor transaction: multiline paragraph conversion creates one bullet, numbered, or task item
      per line and retains inline marks.
- [x] Clipboard serialization: portable HTML contains semantic common-format elements.
- [x] Clipboard serialization: plain text retains hard/soft line breaks and list/task markers.
- [ ] UI smoke: copy rich content to a rich target and paste Google Sheets content with both paste
      shortcuts in a real browser.
- [x] Full typecheck, test, and production build.

## Implementation Notes

- Use a dedicated inline `soft_break` node rather than raw newline text. Mark it as ProseMirror's
  line-break replacement so DOM reparsing cannot silently collapse it.
- Keep `hard_break` for explicit Markdown hard breaks. Both render as `<br>` in the editor, but only
  the soft break serializes to one LF.
- Use ProseMirror's modifier-aware clipboard parsing hooks. The parsed `Slice` already distinguishes
  rich paste from paste-as-plain-text; do not reread and prefer HTML after that decision.
- Paste-as-plain-text treats Markdown markers as literal characters. It only assigns the agreed
  line/paragraph structure; normal paste remains the route for source formatting.
- Clipboard HTML is an interchange format, not the editor DOM. Use real semantic list/table/code
  elements and retain an exact private Rumi slice for internal paste.
- Treat the first spreadsheet row as the Markdown table header when a pasted range has no explicit
  header, because the canonical GFM table format requires one.
- Plain spreadsheet TSV remains text rather than a table. Preserve row LFs and tabs; encode leading
  whitespace safely in Markdown source so save and reopen cannot turn prose into an indented code
  block.

## Done When

- Pasted single LFs never change into spaces after an edit.
- Rumi writes one LF inside a multiline paragraph and a blank line between paragraph blocks.
- Normal Google Sheets paste creates a table; paste-as-plain-text creates stable multiline prose.
- Converting multiline prose to any list type creates one item per line.
- Normal copy provides useful semantic HTML to rich destinations and readable plain text elsewhere.
- Exact Rumi-to-Rumi copy/paste does not lose supported block types or attributes.
- Required automated checks pass and the browser clipboard smoke cases are recorded.

## Verification

- `corepack pnpm typecheck`
- `corepack pnpm test` (56 files, 419 tests)
- `corepack pnpm build`
- Release candidate version: `@rumi-md/server@0.1.12`.
- `corepack pnpm check:server-package` built, packed, clean-installed, and exercised the `0.1.12`
  release candidate.
- Browser clipboard smoke remains before changing this task from `verify` to `done`.
