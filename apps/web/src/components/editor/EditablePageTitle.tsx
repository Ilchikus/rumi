import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, ReactElement } from "react";

export interface EditablePageTitleProps {
  title: string;
  editable: boolean;
  renaming?: boolean;
  emptyTitle?: string;
  editRequest?: { id: number; caretOffset?: number };
  onRename: (title: string) => Promise<boolean>;
  onSplit?: (
    title: string,
    leadingContent: string,
    context: EditableTitleSplitContext
  ) => Promise<boolean>;
}

export interface EditableTitleSplit {
  title: string;
  leadingContent: string;
}

export interface EditableTitleSplitContext {
  previousTitle: string;
  splitOffset: number;
}

const TITLE_CLASS = "break-words text-4xl font-bold leading-tight tracking-tight sm:text-[2.75rem]";
const TITLE_TEXT_CLASS = "inline cursor-text whitespace-pre-wrap break-words text-inherit outline-none ring-0 [font:inherit] focus:outline-none focus:ring-0";

export function splitEditableTitle(
  value: string,
  offset: number,
  emptyTitle: string
): EditableTitleSplit {
  const splitOffset = Math.max(0, Math.min(offset, value.length));
  const title = value.slice(0, splitOffset).trim() || emptyTitle;
  const leadingContent = value.slice(splitOffset).trim();
  return { title, leadingContent };
}

export function EditablePageTitle({
  title,
  editable,
  renaming = false,
  emptyTitle = "New Page",
  editRequest,
  onRename,
  onSplit
}: EditablePageTitleProps): ReactElement {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const titleRowRef = useRef<HTMLHeadingElement | null>(null);
  const editableRef = useRef<HTMLSpanElement | null>(null);
  const draftRef = useRef(title);
  const activationOffsetRef = useRef<number | null>(null);
  const cancelRef = useRef(false);
  const committingRef = useRef(false);
  const handledEditRequestRef = useRef<number | null>(null);

  useEffect(() => {
    if (editing) return;
    draftRef.current = title;
    setDraft(title);
  }, [editing, title]);

  useEffect(() => {
    if (!editing) return;
    const editableTitle = editableRef.current;
    if (!editableTitle) return;

    editableTitle.focus({ preventScroll: true });
    setTextCaretOffset(
      editableTitle,
      activationOffsetRef.current ?? editableTitle.textContent?.length ?? 0
    );
    activationOffsetRef.current = null;
  }, [editing]);

  useEffect(() => {
    if (
      !editRequest ||
      handledEditRequestRef.current === editRequest.id ||
      !editable ||
      renaming
    ) return;

    handledEditRequestRef.current = editRequest.id;
    activationOffsetRef.current = editRequest.caretOffset ?? title.length;
    draftRef.current = title;
    setDraft(title);
    setEditing(true);
  }, [editRequest, editable, renaming, title]);

  useEffect(() => {
    if (!editing) return;

    const blurOnOutsidePointer = (event: PointerEvent) => {
      const editableTitle = editableRef.current;
      if (
        editableTitle &&
        event.target instanceof Node &&
        !editableTitle.contains(event.target)
      ) {
        if (titleRowRef.current?.contains(event.target)) {
          event.preventDefault();
          editableTitle.focus({ preventScroll: true });
          setTextCaretOffset(editableTitle, editableTitle.textContent?.length ?? 0);
          return;
        }
        editableTitle.blur();
      }
    };

    document.addEventListener("pointerdown", blurOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", blurOnOutsidePointer, true);
  }, [editing]);

  const resetDraft = () => {
    draftRef.current = title;
    setDraft(title);
  };

  const finishEditing = () => {
    if (committingRef.current) return;
    setEditing(false);

    if (cancelRef.current) {
      cancelRef.current = false;
      resetDraft();
      return;
    }

    const nextTitle = (editableRef.current?.textContent ?? draftRef.current).trim() || emptyTitle;
    draftRef.current = nextTitle;
    setDraft(nextTitle);
    if (nextTitle === title) return;

    void onRename(nextTitle).then((renamed) => {
      if (!renamed) resetDraft();
    });
  };

  const splitIntoContent = async () => {
    const editableTitle = editableRef.current;
    if (!editableTitle || committingRef.current) return;

    const value = editableTitle.textContent ?? draftRef.current;
    const splitOffset = textCaretOffset(editableTitle);
    const split = splitEditableTitle(value, splitOffset, emptyTitle);
    committingRef.current = true;
    editableTitle.blur();
    draftRef.current = split.title;
    setDraft(split.title);
    setEditing(false);

    const completed = onSplit
      ? await onSplit(split.title, split.leadingContent, {
          previousTitle: value.trim() || title,
          splitOffset
        })
      : await onRename(split.title);
    committingRef.current = false;

    if (!completed) resetDraft();
  };

  const startEditing = () => {
    draftRef.current = title;
    setDraft(title);
    setEditing(true);
  };

  const rememberPointerCaret = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    activationOffsetRef.current = textOffsetAtPoint(
      event.currentTarget,
      event.clientX,
      event.clientY
    );
  };

  if (!editable || renaming) {
    return <h1 className={TITLE_CLASS}>{title}</h1>;
  }

  if (editing) {
    return (
      <h1 ref={titleRowRef} className={TITLE_CLASS}>
        <span
          ref={editableRef}
          role="textbox"
          aria-label="Rename page"
          aria-multiline="false"
          className={TITLE_TEXT_CLASS}
          contentEditable
          suppressContentEditableWarning
          onInput={(event) => {
            draftRef.current = event.currentTarget.textContent ?? "";
          }}
          onBeforeInput={(event) => {
            if ((event.nativeEvent as InputEvent).inputType === "insertParagraph") {
              event.preventDefault();
            }
          }}
          onBlur={finishEditing}
          onKeyDown={(event: KeyboardEvent<HTMLSpanElement>) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter") {
              event.preventDefault();
              void splitIntoContent();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              cancelRef.current = true;
              event.currentTarget.blur();
            }
          }}
        >
          {draft}
        </span>
      </h1>
    );
  }

  return (
    <h1
      ref={titleRowRef}
      className={`${TITLE_CLASS} cursor-text`}
      onPointerDown={(event) => {
        if (event.button !== 0 || event.target !== event.currentTarget) return;
        activationOffsetRef.current = title.length;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) startEditing();
      }}
    >
      <span
        role="button"
        tabIndex={0}
        aria-label="Rename page"
        className={TITLE_TEXT_CLASS}
        onPointerDown={rememberPointerCaret}
        onClick={startEditing}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activationOffsetRef.current = title.length;
            startEditing();
          }
        }}
      >
        {title}
      </span>
    </h1>
  );
}

function textOffsetAtPoint(root: HTMLElement, clientX: number, clientY: number): number {
  const caretDocument = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => CaretPosition | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const position = caretDocument.caretPositionFromPoint?.(clientX, clientY);
  const range = position
    ? rangeAt(position.offsetNode, position.offset)
    : caretDocument.caretRangeFromPoint?.(clientX, clientY) ?? null;

  if (range && root.contains(range.startContainer)) {
    const prefix = document.createRange();
    prefix.selectNodeContents(root);
    prefix.setEnd(range.startContainer, range.startOffset);
    return prefix.toString().length;
  }

  const bounds = root.getBoundingClientRect();
  return clientX <= bounds.left ? 0 : root.textContent?.length ?? 0;
}

function rangeAt(node: Node, offset: number): Range {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  return range;
}

function textCaretOffset(root: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection?.anchorNode || !root.contains(selection.anchorNode)) {
    return root.textContent?.length ?? 0;
  }

  const prefix = document.createRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(selection.anchorNode, selection.anchorOffset);
  return prefix.toString().length;
}

function setTextCaretOffset(root: HTMLElement, requestedOffset: number): void {
  const selection = window.getSelection();
  if (!selection) return;

  const offset = Math.max(0, Math.min(requestedOffset, root.textContent?.length ?? 0));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let textNode = walker.nextNode();

  while (textNode) {
    const length = textNode.textContent?.length ?? 0;
    if (remaining <= length) {
      const range = rangeAt(textNode, remaining);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= length;
    textNode = walker.nextNode();
  }

  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
