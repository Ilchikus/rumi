---
status: done
type: feature
milestone: later
owner_layer: editor
coverage:
  - markdown
  - runtime
  - api
  - ui-smoke
  - docs
created: "2026-07-29"
updated: "2026-07-29"
---
# Inline Text Replacements

## Summary

Turn common ASCII shorthand such as `->` into the intended Unicode character such as `→` while
the user types in the page editor.

The replacement is a real ProseMirror document change, not a visual substitution:

```text
type `->`
  -> live editor immediately contains `→`
  -> editor becomes dirty
  -> normal autosave serializes `→`
  -> the Markdown source file contains literal UTF-8 `→`
```

This preserves the existing editor boundary: ProseMirror is optimistic live state and Markdown is
the durable source of truth.

## Problem

Symbols such as arrows and mathematical relations are useful in prose but inconvenient to enter
from a normal keyboard. Requiring an operating-system character picker interrupts writing, while
rendering an ASCII token as a symbol only in the UI would make the editor disagree with the
canonical Markdown file.

Rumi should make the common cases quick without silently rewriting code, pasted material, old
documents, or text that the user did not just type.

## Goals

- Replace supported shorthand in the live editor as soon as the trigger is completed.
- Persist the literal replacement character through the existing Markdown autosave flow.
- Make each replacement predictable, reversible, and visible.
- Preserve normal Markdown roundtrips and external-editor compatibility.
- Apply the workspace setting to an already-open editor without remounting it or losing selection
  and undo history.
- Keep the first preset small enough that a user can learn and trust it.

## Non-Goals

- General autocorrect, spell correction, text expansion, or snippets.
- Rewriting existing Markdown when a page is opened.
- Transforming pasted or dropped text in the first release.
- Replacing text in code blocks, inline code, Mermaid source, link destinations, filenames, page
  titles, properties, database cells, or settings inputs.
- Locale-aware smart quotes or dash typography.
- User-authored regular expressions or arbitrary replacement scripts.
- Making ASCII and Unicode variants equivalent in workspace search in the first release.

## Recommended First Preset

The first preset favors compact symbols whose meaning is close to the typed token.

| Typed | Stored and shown | Name | Recommendation |
| --- | --- | --- | --- |
| `->` | `→` | rightwards arrow | Ship |
| `<-` | `←` | leftwards arrow | Ship |
| `<->` | `↔` | left-right arrow | Ship with chained longest-match behavior |
| `=>` | `⇒` | rightwards double arrow | Ship |
| `<=>` | `⇔` | left-right double arrow | Ship with chained longest-match behavior |
| `<=` | `≤` | less-than or equal to | Ship |
| `>=` | `≥` | greater-than or equal to | Ship |
| `!=` | `≠` | not equal to | Ship |
| `~=` | `≈` | approximately equal to | Ship |
| `+-` | `±` | plus-minus | Ship |
| `...` | `…` | ellipsis | Ship |
| `(c)` | `©` | copyright sign | Ship; commit on a following token boundary |
| `(r)` | `®` | registered sign | Ship; commit on a following token boundary |
| `(tm)` | `™` | trademark sign | Ship; commit on a following token boundary |

Matching is case-insensitive only for `(c)`, `(r)`, and `(tm)`. Operator-style triggers do not
require surrounding whitespace, so `A -> B` and `A->B` both become `A → B` and `A→B`.
Parenthesized legal-symbol triggers require the opening parenthesis to be at the start of a text
block or preceded by whitespace. They commit when the next typed input is whitespace, punctuation,
or Enter; that boundary is retained. This avoids changing ordinary text such as `function(c)` or
`(c)ategory`.

### Chained Longest Matches

The bidirectional arrows are included in the first preset. They extend shorter triggers that should
still feel immediate:

```text
type `<-`   -> `←`
then `>`    -> `↔`

type `<=`   -> `≤`
then `>`    -> `⇔`
```

The second replacement is allowed only when the preceding `←` or `≤` was just produced by the
inline-replacement plugin, the cursor is still directly after it, and no intervening edit or
selection change occurred. Typing `>` after a literal `←` or `≤` must leave `←>` or `≤>` unchanged.

The complete chain is one logical history event. Undo after `↔` restores `<->`, and undo after `⇔`
restores `<=>`; it must not expose an intermediate `←>` or `≤>` state.

### Good Candidates After The First Preset

| Typed | Replacement | Why it is deferred |
| --- | --- | --- |
| `1/2`, `1/4`, `3/4` | `½`, `¼`, `¾` | Can change search, parsing, and screen-reader behavior more than expected. |
| `^2`, `^3` | `²`, `³` | Often appears in source-like prose where literal characters are intended. |
| `:degree:` | `°` | A named trigger is safe but starts a broader snippets vocabulary. |

### Do Not Enable By Default

| Typed | Possible replacement | Reason |
| --- | --- | --- |
| `--` or `---` | `–` or `—` | Conflicts with CLI flags, Markdown dividers, prose conventions, and locale. |
| Straight quotes | Curly quotes | Requires language- and context-aware pairing and complicates copy/paste. |
| `x` or `*` | `×` | Too common as ordinary text or Markdown syntax. |
| `(1)`, `(2)`, and so on | Circled numbers | Common list notation should remain portable text. |
| ASCII emoticons | Emoji | Tone and preferred rendering are personal rather than workspace semantics. |
| Words such as `(done)` | Symbols or emoji | This is text expansion, not punctuation replacement. |

## Product Behavior

### Triggering

- A replacement runs only for direct text input into an eligible rich-text position.
- Operator-style rules change the UI in the same input handling cycle that completes the trigger.
  Boundary-sensitive rules change it in the cycle that commits the boundary. Neither waits for
  serialization, debounce, a server response, or a successful save.
- Matching uses the text immediately before the cursor and selects the longest registered match.
- When a longer trigger extends the immediately preceding plugin-produced replacement, chained
  matching upgrades that replacement as described above.
- A non-empty selection is replaced using ordinary typing behavior first; a shorthand is recognized
  only from the resulting text immediately before the collapsed cursor.
- IME composition is left entirely to the browser. Matching runs only after composition commits.
- Moving the cursor or selection does not scan or rewrite surrounding text.

### Eligible Content

Replacement is allowed in prose text for:

- paragraphs;
- headings;
- blockquotes;
- bullet, numbered, and task items;
- link labels.

Replacement is suppressed when:

- the editor is read-only;
- the cursor is in a code block or Mermaid source;
- the text at the match has an inline-code mark;
- the input belongs to a NodeView control, link destination, title, property, database cell, search
  field, or any control outside the page body editor;
- the browser is in an active composition session;
- the content entered through paste, drop, page load, reconciliation, or programmatic insertion.

Markdown structural input rules keep their current priority. Inline replacement must not consume a
sequence that the editor recognizes as a block or mark shortcut.

### Undo And Literal Input

- One immediate `Cmd/Ctrl+Z` restores the exact ASCII token that produced the replacement.
- Redo restores the Unicode replacement.
- Undo and redo keep the caret at the expected side of the restored text.
- After undo, Rumi must not immediately reapply the replacement without new matching text input.
- Turning Inline replacements off lets users type every trigger literally.
- A future per-occurrence escape mechanism may be added if usage shows that the workspace toggle
  and undo are insufficient; a bespoke escape syntax is not required initially.

### Paste, Copy, And Existing Content

- Pasting `A -> B` keeps `A -> B` in the first release.
- Copying transformed text copies `A → B`, because that is the actual document content.
- Opening existing source containing `->` leaves it unchanged.
- Opening existing source containing `→` shows `→` and roundtrips it unchanged.
- External edits remain authoritative under the existing versioned save and reconciliation
  contract.

## Settings

Add one workspace-level Settings row:

```text
Inline replacements                                  [on]
Replace typed shorthand such as -> with symbols such as →.
```

Recommended contract:

```json
{
  "editor": {
    "highlightMisspellings": false,
    "inlineReplacements": true
  }
}
```

- The setting defaults to `true` when omitted.
- The setting enables or disables the entire built-in preset.
- Saving the setting updates every subsequently typed character in the open client immediately.
- Updating it must not remount the editor, alter the document, or clear undo history.
- The fixed preset lives in editor code and tests, not in every document.
- Custom mappings and per-mapping switches are deferred until there is evidence that users need
  them. If added, they belong in workspace or personal configuration rather than page Markdown.

## Source-File And Encoding Decision

Store the literal replacement character in Markdown. Do not store an HTML entity such as
`&rarr;`, a private Rumi token, or a UI-only decoration.

This is viable because:

- Rumi already reads and writes page and revision Markdown explicitly as UTF-8.
- JavaScript strings, JSON transport, ProseMirror text nodes, and Markdown all carry these Unicode
  characters without a special schema extension.
- The proposed output symbols are ordinary, stable Unicode code points and do not require
  combining sequences or variation selectors.
- Literal characters keep source, editor, copy/paste, exports, revision diffs, and external
  Markdown readers aligned.

The implementation emits the exact code point listed in the preset and does not normalize the
whole document. Whole-document Unicode normalization could modify unrelated user text and is not
part of this feature.

The compatibility limitation is legacy non-UTF-8 tooling. An editor forced to ASCII or an old
single-byte encoding cannot represent arrows and several other symbols, but Rumi workspaces
already assume UTF-8. This is an external-tool configuration issue rather than a file-format
conflict. No byte-order mark is needed.

## Search And Portability Consequences

- The source changes intentionally, so Git and Rumi revisions show `->` becoming `→`.
- Plain search for `->` will not match `→`, and search for `→` will not match unconverted `->`.
  Optional search folding can be considered separately; it must not obscure exact-search behavior.
- Fonts without a symbol glyph may show fallback rendering, but the stored character remains valid.
- Exporters and external Markdown editors should see the same literal symbol as Rumi.
- A user who needs ASCII-only documents can disable the workspace setting before typing.

## Technical Direction

Extend the existing ProseMirror input-rule layer with a dedicated inline-replacement rule set.
Each successful match should return one normal document transaction that replaces the ASCII range,
places the caret after the Unicode character, participates in editor history, and marks the
document dirty.

Do not:

- mutate the DOM independently of ProseMirror;
- run a second filesystem write path;
- serialize Markdown in the input handler;
- wait for autosave before updating the editor;
- rewrite the serialized Markdown with a global string replacement.

The normal flow already supplies the required optimistic behavior:

```text
input rule transaction
  -> ProseMirror view updates
  -> dirty notification
  -> requestAnimationFrame Markdown serialization
  -> existing autosave and version-conflict handling
  -> UTF-8 file write and index update
```

The settings-aware plugin should remain installed and receive an enabled-state update, or consult
live editor configuration, so toggling the setting does not recreate the editor.

## Acceptance Criteria

- Typing every first-preset trigger in eligible prose immediately shows the specified symbol.
- `getMarkdown()` returns the literal symbol after the replacement.
- Autosave writes that literal symbol to the page's `.md` source.
- Reloading the page preserves the symbol.
- Code blocks, inline code, Mermaid source, and non-body controls keep triggers literal.
- Paste, page load, external reconciliation, and programmatic insertion do not invoke replacements.
- Legal-symbol rules respect their standalone-token boundary.
- A single undo restores the exact ASCII trigger; redo restores the symbol.
- Disabling and re-enabling the setting affects an open editor without remounting it or losing
  content, selection, or undo history.
- Existing documents are never migrated or rewritten merely by opening them or changing the
  setting.
- UTF-8 Markdown roundtrip coverage includes every output symbol in the preset.

## Required Coverage

- [x] Editor input-rule tests cover every mapping, adjacent prose, marks, selection, caret
  placement, composition commit, and setting changes.
- [x] Chained-match tests cover `<-` to `←` to `↔`, `<=` to `≤` to `⇔`, invalidation after an
  intervening edit or selection change, literal-Unicode false positives, and exact one-step undo.
- [x] Negative editor tests cover code blocks, inline code, Mermaid, paste, load, programmatic
  insertion, and legal-symbol boundary false positives.
- [x] History tests prove exact one-step undo and redo without immediate reapplication.
- [x] Markdown roundtrip tests cover literal Unicode output and an unchanged ASCII source.
- [x] Runtime/API tests cover the new normalized workspace setting, default, validation,
  persistence, and preservation of unrelated configuration.
- [x] UI smoke proves same-cycle replacement, a source save and reload, and live Settings toggling
  without an editor remount.
- [x] File-format and editor-interaction contracts document the setting and persistence behavior.

## Product Questions To Validate

The recommended first release makes decisions above, but these observations should be collected
before expanding it:

- Do users disable the whole preset mainly because of one unwanted mapping?
- Do users expect pasted shorthand to transform?
- Do users expect ASCII and Unicode variants to match in workspace and page search?
- Should the feature eventually become a personal preference instead of a workspace preference?

## Related Work

- [Colon Emoji Selector](xxx-colon-emoji-selector.md)

## Delivered

The editor now applies the complete first preset through a dedicated settings-aware ProseMirror
plugin. Short arrows upgrade to bidirectional arrows only when the preceding glyph was produced by
that plugin, and custom undo/redo restores the exact ASCII source without exposing an intermediate
state. Direct input is separated from paste, load, reconciliation, and programmatic transactions.

Verified on 2026-07-29 with focused editor/runtime/API tests, the complete repository test suite,
typecheck, production builds, and a real Chrome smoke that confirmed immediate rendering, literal
UTF-8 autosave, reload, and live Settings disablement.
