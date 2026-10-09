import type { Node as ProseMirrorNode } from "prosemirror-model"

// Collapsed headings are remembered per browser, like pins and recent pages,
// so the Markdown file never changes when a section is folded.
const STORAGE_PREFIX = "rumi-new-collapsed-headings:v1"

export function collapsedHeadingsStorageKey(workspaceKey: string, documentKey: string): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(workspaceKey)}:${encodeURIComponent(documentKey)}`
}

// A heading's identity across reloads: its level and text, and which
// occurrence it is among identical headings.
function headingIdentities(doc: ProseMirrorNode): Map<number, string> {
  const occurrences = new Map<string, number>()
  const identities = new Map<number, string>()
  doc.forEach((node, offset) => {
    if (node.type.name !== "heading") return
    const heading = `${node.attrs.level}:${node.textContent}`
    const occurrence = occurrences.get(heading) ?? 0
    occurrences.set(heading, occurrence + 1)
    identities.set(offset, `${occurrence}:${heading}`)
  })
  return identities
}

export function collapsedHeadingIdentities(doc: ProseMirrorNode, collapsed: ReadonlySet<number>): string[] {
  const identities = headingIdentities(doc)
  return [...collapsed].sort((a, b) => a - b).flatMap((pos) => identities.get(pos) ?? [])
}

export function collapsedHeadingPositions(doc: ProseMirrorNode, identities: readonly string[]): Set<number> {
  const remembered = new Set(identities)
  const positions = new Set<number>()
  for (const [pos, identity] of headingIdentities(doc)) {
    if (remembered.has(identity)) positions.add(pos)
  }
  return positions
}

export function readCollapsedHeadings(storageKey: string): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]")
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

export function writeCollapsedHeadings(storageKey: string, identities: readonly string[]): void {
  try {
    if (identities.length > 0) window.localStorage.setItem(storageKey, JSON.stringify(identities))
    else window.localStorage.removeItem(storageKey)
  } catch {
    // Remembering folds is a convenience; blocked storage must not affect editing.
  }
}
