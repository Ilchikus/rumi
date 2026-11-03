import { Fragment, type Node as PmNode } from "prosemirror-model"
import { Plugin } from "prosemirror-state"

export function tableWidthStorageKey(workspace: string, page: string): string {
  return `rumi:table-widths:${JSON.stringify([workspace, page])}`
}

type SavedWidths = Record<string, (number[] | null)[][]>

function tableKeys(doc: PmNode): Map<number, string> {
  const keys = new Map<number, string>()
  const counts = new Map<string, number>()
  doc.descendants((node, pos) => {
    if (node.type.name !== "table") return
    const signature = JSON.stringify(Array.from({ length: node.firstChild!.childCount }, (_, i) => node.firstChild!.child(i).textContent))
    const occurrence = counts.get(signature) ?? 0
    counts.set(signature, occurrence + 1)
    keys.set(pos, `${signature}:${occurrence}`)
    return false
  })
  return keys
}

export function readTableWidths(doc: PmNode): SavedWidths {
  const result: SavedWidths = {}
  for (const [pos, key] of tableKeys(doc)) {
    const table = doc.nodeAt(pos)!
    const rows: (number[] | null)[][] = []
    table.forEach((row) => {
      const cells: (number[] | null)[] = []
      row.forEach((cell) => cells.push(cell.attrs.colwidth))
      rows.push(cells)
    })
    if (rows.some((row) => row.some(Boolean))) result[key] = rows
  }
  return result
}

export function restoreTableWidths(doc: PmNode, key: string): PmNode {
  let saved: SavedWidths
  try { saved = JSON.parse(localStorage.getItem(key) ?? "{}") } catch { return doc }
  if (!saved || typeof saved !== "object") return doc
  const keys = tableKeys(doc)
  const map = (node: PmNode, pos: number): PmNode => {
    if (node.isText) return node
    if (node.type.name === "table") {
      const widths = saved[keys.get(pos)!]
      if (!Array.isArray(widths)) return node
      const rows: PmNode[] = []
      node.forEach((row, _, r) => {
        const cells: PmNode[] = []
        row.forEach((cell, _, c) => {
          const value = widths[r]?.[c]
          const colwidth = Array.isArray(value) && value.length === cell.attrs.colspan && value.every((n) => Number.isSafeInteger(n) && n >= 25 && n <= 10000) ? value : null
          cells.push(cell.type.create({ ...cell.attrs, colwidth }, cell.content, cell.marks))
        })
        rows.push(row.copy(Fragment.fromArray(cells)))
      })
      return node.copy(Fragment.fromArray(rows))
    }
    const children: PmNode[] = []
    node.forEach((child, offset) => children.push(map(child, pos + (node.type.name === "doc" ? 0 : 1) + offset)))
    return node.copy(Fragment.fromArray(children))
  }
  return map(doc, 0)
}

export function tableWidthMemoryPlugin(key: string): Plugin {
  let previous = ""
  const save = (doc: PmNode) => {
    const value = JSON.stringify(readTableWidths(doc))
    if (value === previous) return
    previous = value
    try {
      if (value === "{}") localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch { /* Browser storage can be disabled; resizing still works. */ }
  }
  return new Plugin({
    view(view) {
      save(view.state.doc)
      return { update(next, old) { if (!next.state.doc.eq(old.doc)) save(next.state.doc) } }
    }
  })
}
