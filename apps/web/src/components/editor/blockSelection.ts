import { Fragment, type Node as ProseMirrorNode } from "prosemirror-model";
import {
  EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction
} from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";

export interface BlockSelectionState {
  selectedBlocks: number[];
  anchorBlock: number | null;
}

export type BlockSelectionMode = "single" | "range" | "toggle";

const emptySelection: BlockSelectionState = {
  selectedBlocks: [],
  anchorBlock: null
};

export const blockSelectionKey = new PluginKey<BlockSelectionState>("rumiBlockSelection");

/**
 * Returns the document units that get a block handle. Lists are structural
 * containers, so their individual list items are returned instead.
 */
export function collectSelectableBlockPositions(doc: ProseMirrorNode): number[] {
  const positions: number[] = [];

  doc.descendants((node, pos, parent) => {
    if (node.type.name === "list_item") {
      positions.push(pos);
    } else if (
      parent === doc &&
      node.type.name !== "bullet_list" &&
      node.type.name !== "ordered_list"
    ) {
      positions.push(pos);
    }

    return true;
  });

  return positions;
}

/** Resolve a pointer/cursor position to the deepest list item or top-level block. */
export function selectableBlockPositionAt(doc: ProseMirrorNode, pos: number): number | null {
  const boundedPos = Math.max(0, Math.min(pos, doc.content.size));
  const directNode = doc.nodeAt(boundedPos);

  if (directNode?.type.name === "list_item") {
    return boundedPos;
  }

  const $pos = doc.resolve(boundedPos);

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "list_item") {
      return $pos.before(depth);
    }
  }

  if ($pos.depth < 1) {
    return null;
  }

  const topLevelPos = $pos.before(1);
  const topLevelNode = doc.nodeAt(topLevelPos);

  if (
    topLevelNode?.type.name === "bullet_list" ||
    topLevelNode?.type.name === "ordered_list"
  ) {
    return null;
  }

  return topLevelNode ? topLevelPos : null;
}

export function normalizeSelectedBlockPositions(
  doc: ProseMirrorNode,
  positions: readonly number[]
): number[] {
  const valid = [...new Set(positions)]
    .filter((pos) => doc.nodeAt(pos) !== null)
    .sort((left, right) => left - right);
  const normalized: number[] = [];

  for (const pos of valid) {
    const insideSelectedParent = normalized.some((parentPos) => {
      const parent = doc.nodeAt(parentPos);
      return parent !== null && pos > parentPos && pos < parentPos + parent.nodeSize;
    });

    if (!insideSelectedParent) {
      normalized.push(pos);
    }
  }

  return normalized;
}

export function getBlockSelection(state: EditorState): BlockSelectionState {
  return blockSelectionKey.getState(state) ?? emptySelection;
}

export function isBlockSelected(state: EditorState, pos: number): boolean {
  return getBlockSelection(state).selectedBlocks.includes(pos);
}

export function setBlockSelection(
  view: EditorView,
  pos: number,
  mode: BlockSelectionMode
): void {
  const selectable = collectSelectableBlockPositions(view.state.doc);

  if (!selectable.includes(pos)) {
    return;
  }

  const current = getBlockSelection(view.state);
  let selectedBlocks: number[];
  let anchorBlock: number | null;

  if (mode === "range") {
    const requestedAnchor = current.anchorBlock ?? current.selectedBlocks.at(-1) ?? pos;
    const anchor = selectable.includes(requestedAnchor) ? requestedAnchor : pos;
    const anchorIndex = selectable.indexOf(anchor);
    const targetIndex = selectable.indexOf(pos);
    const from = Math.min(anchorIndex, targetIndex);
    const to = Math.max(anchorIndex, targetIndex);
    selectedBlocks = selectable.slice(from, to + 1);
    anchorBlock = anchor;
  } else if (mode === "toggle") {
    selectedBlocks = current.selectedBlocks.includes(pos)
      ? current.selectedBlocks.filter((selectedPos) => selectedPos !== pos)
      : [...current.selectedBlocks, pos].sort((left, right) => left - right);
    anchorBlock = selectedBlocks.length > 0 ? pos : null;
  } else {
    selectedBlocks = [pos];
    anchorBlock = pos;
  }

  const transaction = view.state.tr.setMeta(blockSelectionKey, {
    selectedBlocks,
    anchorBlock
  } satisfies BlockSelectionState);

  const nodeSelectionPos = selectedBlocks.includes(pos) ? pos : selectedBlocks.at(-1);

  if (nodeSelectionPos !== undefined) {
    transaction.setSelection(NodeSelection.create(transaction.doc, nodeSelectionPos));
  } else {
    const node = transaction.doc.nodeAt(pos);
    const textPos = pos + (node?.type.name === "list_item" ? 2 : 1);
    transaction.setSelection(
      TextSelection.near(
        transaction.doc.resolve(Math.min(textPos, transaction.doc.content.size))
      )
    );
  }

  view.dispatch(transaction);
}

export function clearBlockSelection(view: EditorView): void {
  const transaction = view.state.tr.setMeta(blockSelectionKey, emptySelection);

  if (view.state.selection instanceof NodeSelection) {
    const pos = view.state.selection.from;
    const node = transaction.doc.nodeAt(pos);
    const textPos = Math.min(
      pos + (node?.type.name === "list_item" ? 2 : 1),
      transaction.doc.content.size
    );
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(textPos)));
  }

  view.dispatch(transaction);
}

export function replaceBlockSelection(view: EditorView, positions: readonly number[]): void {
  const selectable = new Set(collectSelectableBlockPositions(view.state.doc));
  const selectedBlocks = [...new Set(positions)]
    .filter((pos) => selectable.has(pos))
    .sort((left, right) => left - right);
  const transaction = view.state.tr.setMeta(blockSelectionKey, {
    selectedBlocks,
    anchorBlock: selectedBlocks[0] ?? null
  } satisfies BlockSelectionState);

  if (selectedBlocks[0] !== undefined) {
    transaction.setSelection(NodeSelection.create(transaction.doc, selectedBlocks[0]));
  }

  view.dispatch(transaction);
}

export function createDeleteSelectedBlocksTransaction(
  state: EditorState,
  positions: readonly number[]
): Transaction | null {
  const selected = deletionPositions(state.doc, positions);

  if (selected.length === 0) {
    return null;
  }

  const transaction = state.tr;

  for (const pos of [...selected].reverse()) {
    const node = transaction.doc.nodeAt(pos);

    if (node) {
      transaction.delete(pos, pos + node.nodeSize);
    }
  }

  if (!transaction.docChanged) {
    return null;
  }

  transaction.setMeta(blockSelectionKey, emptySelection);
  return transaction.scrollIntoView();
}

export function createDuplicateSelectedBlocksTransaction(
  state: EditorState,
  positions: readonly number[]
): Transaction | null {
  const selected = normalizeSelectedBlockPositions(state.doc, positions);

  if (selected.length === 0) {
    return null;
  }

  const contexts = selected.map((pos) => blockContext(state.doc, pos));
  const firstContext = contexts[0];
  const transaction = state.tr;

  if (
    firstContext &&
    contexts.every(
      (context) =>
        context?.parentDepth === firstContext.parentDepth &&
        context.parentStart === firstContext.parentStart
    )
  ) {
    const nodes = contexts.map((context) => context!.node);
    const lastContext = contexts.at(-1)!;
    const insertPos = lastContext.pos + lastContext.node.nodeSize;
    transaction.insert(insertPos, Fragment.fromArray(nodes));
    const duplicatedPositions: number[] = [];
    let nextPos = insertPos;

    for (const node of nodes) {
      duplicatedPositions.push(nextPos);
      nextPos += node.nodeSize;
    }

    transaction.setMeta(blockSelectionKey, {
      selectedBlocks: duplicatedPositions,
      anchorBlock: duplicatedPositions[0] ?? null
    } satisfies BlockSelectionState);
    transaction.setSelection(NodeSelection.create(transaction.doc, duplicatedPositions[0]!));
    return transaction.scrollIntoView();
  }

  for (const pos of [...selected].reverse()) {
    const originalNode = state.doc.nodeAt(pos);

    if (!originalNode) {
      continue;
    }

    const insertPos = transaction.mapping.map(pos + originalNode.nodeSize, 1);
    transaction.insert(insertPos, originalNode.copy(originalNode.content));
  }

  if (!transaction.docChanged) {
    return null;
  }

  const duplicatedPositions = selected.map((pos) => {
    const original = state.doc.nodeAt(pos)!;
    return transaction.mapping.map(pos, -1) + original.nodeSize;
  });
  transaction.setMeta(blockSelectionKey, {
    selectedBlocks: duplicatedPositions,
    anchorBlock: duplicatedPositions[0] ?? null
  } satisfies BlockSelectionState);
  transaction.setSelection(NodeSelection.create(transaction.doc, duplicatedPositions[0]!));
  return transaction.scrollIntoView();
}

export function createMoveSelectedBlocksTransaction(
  state: EditorState,
  positions: readonly number[],
  targetPos: number,
  insertAfterTarget: boolean
): Transaction | null {
  const selected = normalizeSelectedBlockPositions(state.doc, positions);
  const target = blockContext(state.doc, targetPos);
  const sources = selected.map((pos) => blockContext(state.doc, pos));

  if (!target || !canMoveSelectedBlocks(state.doc, positions, targetPos)) {
    return null;
  }

  const nodes = sources.map((source) => source!.node);
  const targetBoundary = targetPos + (insertAfterTarget ? target.node.nodeSize : 0);
  const transaction = state.tr;

  for (const source of [...sources].reverse()) {
    if (source) {
      transaction.delete(source.pos, source.pos + source.node.nodeSize);
    }
  }

  const insertPos = transaction.mapping.map(targetBoundary, insertAfterTarget ? 1 : -1);
  transaction.insert(insertPos, Fragment.fromArray(nodes));

  if (transaction.doc.eq(state.doc)) {
    return null;
  }

  const movedPositions: number[] = [];
  let nextPos = insertPos;

  for (const node of nodes) {
    movedPositions.push(nextPos);
    nextPos += node.nodeSize;
  }

  transaction.setMeta(blockSelectionKey, {
    selectedBlocks: movedPositions,
    anchorBlock: movedPositions[0] ?? null
  } satisfies BlockSelectionState);

  if (movedPositions[0] !== undefined) {
    transaction.setSelection(NodeSelection.create(transaction.doc, movedPositions[0]));
  }

  return transaction.scrollIntoView();
}

export function canMoveSelectedBlocks(
  doc: ProseMirrorNode,
  positions: readonly number[],
  targetPos: number
): boolean {
  const selected = normalizeSelectedBlockPositions(doc, positions);
  const target = blockContext(doc, targetPos);
  const sources = selected.map((pos) => blockContext(doc, pos));

  return Boolean(
    selected.length > 0 &&
    target &&
    sources.every(
      (source) =>
        source !== null &&
        source.parentDepth === target.parentDepth &&
        source.parentStart === target.parentStart
    ) &&
    selected.every((pos) => {
      const node = doc.nodeAt(pos);
      return node !== null && !(targetPos >= pos && targetPos < pos + node.nodeSize);
    })
  );
}

export function blockSelectionPlugin(): Plugin<BlockSelectionState> {
  return new Plugin<BlockSelectionState>({
    key: blockSelectionKey,
    state: {
      init: () => emptySelection,
      apply(transaction, previous) {
        const explicit = transaction.getMeta(blockSelectionKey) as BlockSelectionState | undefined;

        if (explicit) {
          return explicit;
        }

        if (transaction.selectionSet) {
          return emptySelection;
        }

        if (!transaction.docChanged || previous.selectedBlocks.length === 0) {
          return previous;
        }

        const selectable = new Set(collectSelectableBlockPositions(transaction.doc));
        const selectedBlocks = previous.selectedBlocks
          .map((pos) => transaction.mapping.mapResult(pos, 1))
          .filter((result) => !result.deleted && selectable.has(result.pos))
          .map((result) => result.pos);
        const anchorResult = previous.anchorBlock === null
          ? null
          : transaction.mapping.mapResult(previous.anchorBlock, 1);

        return {
          selectedBlocks,
          anchorBlock:
            anchorResult && !anchorResult.deleted && selectable.has(anchorResult.pos)
              ? anchorResult.pos
              : selectedBlocks[0] ?? null
        };
      }
    },
    props: {
      decorations(state) {
        const selection = getBlockSelection(state);
        const decorations = selection.selectedBlocks.flatMap((pos) => {
          const node = state.doc.nodeAt(pos);
          return node
            ? [Decoration.node(pos, pos + node.nodeSize, { class: "rumi-multi-block-selected" })]
            : [];
        });

        return DecorationSet.create(state.doc, decorations);
      },
      handleKeyDown(view, event) {
        const selection = getBlockSelection(view.state);

        if (selection.selectedBlocks.length === 0) {
          return false;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          clearBlockSelection(view);
          return true;
        }

        if (event.key === "Backspace" || event.key === "Delete") {
          const transaction = createDeleteSelectedBlocksTransaction(
            view.state,
            selection.selectedBlocks
          );

          if (transaction) {
            event.preventDefault();
            view.dispatch(transaction);
            return true;
          }
        }

        return false;
      }
    }
  });
}

function blockContext(doc: ProseMirrorNode, pos: number): {
  pos: number;
  node: ProseMirrorNode;
  parentDepth: number;
  parentStart: number;
} | null {
  const node = doc.nodeAt(pos);

  if (!node) {
    return null;
  }

  const $pos = doc.resolve(pos);
  return {
    pos,
    node,
    parentDepth: $pos.depth,
    parentStart: $pos.start($pos.depth)
  };
}

function deletionPositions(doc: ProseMirrorNode, positions: readonly number[]): number[] {
  const selected = new Set(normalizeSelectedBlockPositions(doc, positions));
  const lists: Array<{ pos: number; depth: number; childPositions: number[] }> = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "bullet_list" && node.type.name !== "ordered_list") {
      return true;
    }

    const childPositions: number[] = [];
    node.forEach((_child, offset) => childPositions.push(pos + 1 + offset));
    lists.push({ pos, depth: doc.resolve(pos).depth, childPositions });
    return true;
  });

  for (const list of lists.sort((left, right) => right.depth - left.depth)) {
    if (
      list.childPositions.length > 0 &&
      list.childPositions.every((childPos) => selected.has(childPos))
    ) {
      for (const childPos of list.childPositions) selected.delete(childPos);
      selected.add(list.pos);
    }
  }

  return normalizeSelectedBlockPositions(doc, [...selected]);
}
