import {
  BLOCK_TYPE_OPTIONS,
  type BlockTypeOption
} from "./blockTypePresentation"

export type BlockContextMenuAnchor =
  | { kind: "pointer"; x: number; y: number }
  | { kind: "selection"; contentStart: number; top: number }

type BlockMenuSelectAllEvent = Pick<
  KeyboardEvent,
  "ctrlKey" | "key" | "metaKey"
>

type BlockMenuTypingEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "isComposing" | "key" | "metaKey"
>

export function shouldOpenBlockContextMenuForSelection(
  previousSelectedBlocks: readonly number[],
  selectedBlocks: readonly number[]
): boolean {
  return selectedBlocks.length > 0 && (
    previousSelectedBlocks.length !== selectedBlocks.length ||
    previousSelectedBlocks.some((pos, index) => pos !== selectedBlocks[index])
  )
}

export function shouldAdvanceBlockSelectionFromMenu(
  openedFromSelection: boolean,
  selectionShortcutReady: boolean,
  event: BlockMenuSelectAllEvent
): boolean {
  return openedFromSelection &&
    selectionShortcutReady &&
    event.key === "/" &&
    (event.metaKey || event.ctrlKey)
}

export function shouldDeleteBlockFromMenu(
  openedFromSelection: boolean,
  searchFocused: boolean,
  searchQuery: string,
  key: string
): boolean {
  return key === "Delete" || (
    key === "Backspace" &&
    (!searchFocused || (openedFromSelection && searchQuery.length === 0))
  )
}

export function shouldFocusBlockMenuSearchSynchronously(
  openedFromSelection: boolean,
  selectingFromHandle: boolean
): boolean {
  return openedFromSelection && !selectingFromHandle
}

export function shouldRouteBlockSelectionTypingToSearch(
  openedFromSelection: boolean,
  searchFocused: boolean,
  event: BlockMenuTypingEvent
): boolean {
  return openedFromSelection &&
    !searchFocused &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.isComposing &&
    event.key.length === 1
}

export function shouldShowBlockMenuActionsForQuery(
  openedFromSelection: boolean,
  query: string,
  matchingTypeCount: number
): boolean {
  return !openedFromSelection || query.length === 0 || matchingTypeCount === 0
}

export function matchingBlockTypeOptions(
  query: string
): BlockTypeOption[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return [...BLOCK_TYPE_OPTIONS]

  return BLOCK_TYPE_OPTIONS
    .map((option, index) => {
      const label = option.label.toLowerCase()
      const matchIndex = label.indexOf(normalizedQuery)
      const rank = label === normalizedQuery
        ? 0
        : matchIndex === 0
          ? 1
          : 2
      return { option, index, matchIndex, rank }
    })
    .filter(match => match.matchIndex >= 0)
    .sort((left, right) =>
      left.rank - right.rank ||
      left.matchIndex - right.matchIndex ||
      left.index - right.index
    )
    .map(match => match.option)
}

export function blockContextMenuPosition(
  anchor: BlockContextMenuAnchor,
  menuSize: { width: number; height: number },
  viewport: { width: number; height: number },
  margin = 8
): { left: number; top: number } {
  const desiredLeft = anchor.kind === "selection"
    ? anchor.contentStart - menuSize.width - margin
    : anchor.x
  const desiredTop = anchor.kind === "selection" ? anchor.top - 2 : anchor.y
  const maxLeft = Math.max(margin, viewport.width - menuSize.width - margin)
  const maxTop = Math.max(margin, viewport.height - menuSize.height - margin)

  return {
    left: Math.max(margin, Math.min(desiredLeft, maxLeft)),
    top: Math.max(margin, Math.min(desiredTop, maxTop))
  }
}
