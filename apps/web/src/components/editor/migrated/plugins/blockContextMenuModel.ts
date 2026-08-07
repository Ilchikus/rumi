import {
  BLOCK_TYPE_OPTIONS,
  type BlockTypeOption
} from "./blockTypePresentation"

export const BLOCK_CONTEXT_MENU_INTENT_META = "rumiBlockContextMenuIntent"

export type BlockContextMenuIntent = "close" | "toggle"

export type BlockContextMenuAnchor =
  | { kind: "pointer"; x: number; y: number }
  | { kind: "selection"; contentStart: number; top: number }

type BlockMenuShortcutEvent = Pick<
  KeyboardEvent,
  "ctrlKey" | "key" | "metaKey"
>

type BlockMenuTypingEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "isComposing" | "key" | "metaKey"
>

type BlockHandleSelectionEvent = Pick<
  MouseEvent,
  "ctrlKey" | "metaKey" | "shiftKey"
>

export type BlockHandleSelectionMode = "preserve" | "shift" | "toggle" | "single"

export function blockHandleSelectionMode(
  selectedBlocks: readonly number[],
  blockPos: number,
  event: BlockHandleSelectionEvent
): BlockHandleSelectionMode {
  if (event.shiftKey) return "shift"
  if (event.metaKey || event.ctrlKey) return "toggle"
  return selectedBlocks.includes(blockPos) ? "preserve" : "single"
}

export function blockSelectionForHandleContextMenu(
  selectedBlocks: readonly number[],
  blockPos: number
): number[] {
  return selectedBlocks.includes(blockPos)
    ? [...selectedBlocks]
    : [blockPos]
}

export function shouldToggleBlockContextMenuFromMenu(
  openedFromSelection: boolean,
  selectionShortcutReady: boolean,
  event: BlockMenuShortcutEvent
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
      const matches = [option.label, ...option.aliases]
        .map((value) => {
          const candidate = value.toLowerCase()
          const matchIndex = candidate.indexOf(normalizedQuery)
          const rank = candidate === normalizedQuery
            ? 0
            : matchIndex === 0
              ? 1
              : 2
          return { matchIndex, rank }
        })
        .filter((match) => match.matchIndex >= 0)
        .sort((left, right) => left.rank - right.rank || left.matchIndex - right.matchIndex)
      return { option, index, match: matches[0] }
    })
    .filter((entry) => entry.match)
    .sort((left, right) =>
      left.match!.rank - right.match!.rank ||
      left.match!.matchIndex - right.match!.matchIndex ||
      left.index - right.index
    )
    .map((entry) => entry.option)
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
