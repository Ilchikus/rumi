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
| Rumi copied into Google Docs, Slack, or another rich target | Provide portable semantic HTML for common blocks and marks. Code remains semantic `<pre><code>` and carries an explicit neutral code presentation for rich editors that otherwise flatten the element. |
| Google Docs or another rich editor copied back into Rumi | Normalize semantic lists and block-wrapped table cells into Rumi's schema before parsing. Recover Mermaid and database embeds when their textual grammars remain recognizable after the intermediary strips Rumi metadata. Recover a flattened Google Docs code run only when every line retains both the portable code font and background; treat Docs' visual link underline as part of the link rather than a separate underline mark. |
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
- Export every block in Rumi's explicit block selection, in document order, even though the native
  ProseMirror selection represents only its first block or remains an empty text selection.
- Normalize external semantic lists into Rumi's flat list blocks with their available indentation,
  and flatten paragraph wrappers inside table cells without moving cell content outside the table.
- Promote recognizable Mermaid and database configuration text runs back to their semantic blocks.
- Give portable code HTML an explicit neutral monospace presentation and recover Google Docs runs
  carrying that complete presentation without classifying ordinary monospace paragraphs as code.
- Remove Google Docs' default visual underline from pasted link descendants while retaining the link
  itself and explicit underline outside links.
- When one multiline paragraph is converted to a bullet, numbered, or task list, create one list
  item per visible line while preserving the marks on each line.
- Keep code-block paste literal.

## Out Of Scope

- A user-facing strict-line-break setting.
- Making every third-party HTML/CSS construct round-trip exactly.
- Preserving spreadsheet formulas, merged-cell geometry, or proprietary Google Sheets styling.
- Exact recovery of task checked state, code language, Mermaid mode, database fields, or other
  metadata that an intermediary removes from both HTML and text.
- Guessing that arbitrary styled or monospaced paragraphs are code when neither semantic `<pre>` nor
  the complete Google Docs code-presentation signature survives.
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
- [x] Live editor copy: handle, marquee, and staged whole-document block selections export every
      selected block through HTML, plain text, and Rumi's private flavor.
- [x] Live editor cut: every explicitly selected block is exported and removed together.
- [x] External rich paste: native and Google Docs-style lists retain family and available nesting.
- [x] External rich paste: paragraph-wrapped table cells remain in one rectangular table with
      inline marks and line boundaries.
- [x] External rich paste: recognizable Mermaid and database text is promoted while ordinary
      semantic code remains code.
- [x] External rich paste: a complete Google Docs code-presentation run becomes one code block,
      while ordinary monospace prose remains prose.
- [x] External rich paste: Docs' default link decoration does not become an explicit underline mark,
      while non-link underline remains semantic.
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
- Flatten native external list containers into Rumi's existing flat list nodes before ProseMirror
  parses the HTML. Prefer explicit Google Docs list levels and ARIA metadata, then structural or
  margin nesting.
- Flatten only block wrappers inside table cells; retain the table, row/cell attributes, inline
  marks, and visible boundaries between multiple cell paragraphs.
- Treat Mermaid starters and database `source`/`view`/`filter`/`sort` runs as recovery signatures,
  including unlabeled preformatted blocks. Do not infer arbitrary styled paragraphs as code.
- Google Docs supports native code-block building blocks on eligible Workspace tiers, but normal
  external HTML paste does not expose a documented portable building-block type. Keep `<pre><code>`
  semantic for other targets and add explicit neutral code font/background styling. On Docs paste
  back, require both signals across the complete run before reconstructing code; language remains
  unavailable when Docs removes it.
- Google Docs represents its ordinary link appearance as an underline style inside the anchor.
  Strip that redundant style only for Docs-origin HTML so Markdown does not gain an explicit
  underline mark merely from traversing Docs.

## Done When

- Pasted single LFs never change into spaces after an edit.
- Rumi writes one LF inside a multiline paragraph and a blank line between paragraph blocks.
- Normal Google Sheets paste creates a table; paste-as-plain-text creates stable multiline prose.
- Converting multiline prose to any list type creates one item per line.
- Normal copy provides useful semantic HTML to rich destinations and readable plain text elsewhere.
- Copying an explicit block selection never truncates the portable payload to its first native
  `NodeSelection` block.
- Google Docs round-trips keep supported list and table structure, and restore Mermaid/database
  blocks whenever their surviving text is unambiguous.
- Google Docs round-trips keep code as one block when its complete portable presentation survives,
  and default links return as links without an added underline mark.
- Exact Rumi-to-Rumi copy/paste does not lose supported block types or attributes.
- Required automated checks pass and the browser clipboard smoke cases are recorded.

## Verification

- `corepack pnpm typecheck`
- `corepack pnpm test` (56 files, 431 tests)
- `corepack pnpm build`
- Release candidate version: `@rumi-md/server@0.1.12`.
- `corepack pnpm check:server-package` built, packed, clean-installed, and exercised the `0.1.12`
  release candidate.
- Browser clipboard smoke remains before changing this task from `verify` to `done`.
