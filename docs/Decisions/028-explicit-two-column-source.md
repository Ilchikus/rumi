---
status: accepted
areas:
  - editor
  - files
impact: medium
created: 2026-11-03
updated: 2026-11-03
---
# Two Columns Use An Explicit Markdown Fence

## Decision

A fenced `columns` block holds two Markdown sections separated by one standalone `|||` line. Each
section becomes an independently editable block container. Fences grow longer than any backtick run
in their contents, so code blocks and nested columns roundtrip. The divider is recognized outside
nested code fences only. Malformed containers remain ordinary code rather than losing content.

Ordinary `x | y`, spaced pipes and GFM tables keep their existing meaning. Columns are created from
the slash or Change type menu; converting prose retains its inline marks in the left column.

## Why

Whitespace-dependent inline pipes are ambiguous, invisible in many editors, and cannot reliably
contain multiline rich content. A fence is explicit, readable outside Rumi and consistent with the
existing fenced database extension. Other Markdown viewers display the column source as code.

This release supports exactly two columns; freeform layout, column resizing and mobile editor
interaction changes are outside its scope.
