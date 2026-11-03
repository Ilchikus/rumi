// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { EditorState } from "prosemirror-state"
import { schema } from "./schema"
import { parseMarkdown, serializeMarkdown } from "./markdown"
import { readTableWidths, restoreTableWidths, tableWidthStorageKey } from "./tableWidthMemory"

beforeEach(() => localStorage.clear())
it("retains resize attributes and restores layout without changing source", () => {
  const doc = parseMarkdown("| A | B |\n| - | - |\n| x | y |", schema)
  const state = EditorState.create({ doc })
  const tr = state.tr
  doc.descendants((node, pos) => {
    if (node.type.name === "table_cell" || node.type.name === "table_header") tr.setNodeMarkup(pos, undefined, { ...node.attrs, colwidth: [240] })
  })
  const resized = tr.doc
  expect(resized.firstChild?.firstChild?.firstChild?.attrs.colwidth).toEqual([240])
  expect(serializeMarkdown(resized)).toBe(serializeMarkdown(doc))
  const key = tableWidthStorageKey("workspace", "Page.md")
  localStorage.setItem(key, JSON.stringify(readTableWidths(resized)))
  expect(restoreTableWidths(doc, key).toJSON()).toEqual(resized.toJSON())
  expect(restoreTableWidths(doc, tableWidthStorageKey("workspace", "Other.md")).toJSON()).toEqual(doc.toJSON())
})
it("ignores corrupt or unsafe saved widths", () => {
  const doc = parseMarkdown("| A |\n| - |\n| x |", schema)
  const key = "table-test"
  localStorage.setItem(key, "not json")
  expect(restoreTableWidths(doc, key)).toBe(doc)
  localStorage.setItem(key, '{"[\\"A\\"]:0":[[[9999999]]]}')
  expect(restoreTableWidths(doc, key).toJSON()).toEqual(doc.toJSON())
})
