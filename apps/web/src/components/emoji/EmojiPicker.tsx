import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement
} from "react";
import type { EmojiSearchResult } from "./emojiCatalog";
import "./emojiPicker.css";

export interface EmojiPickerAnchor {
  left: number;
  top: number;
  bottom: number;
}

export type EmojiPickerPresentation = "popover" | "dialog" | "inline";

export interface EmojiPickerProps {
  id: string;
  open: boolean;
  query: string;
  items: readonly EmojiSearchResult[];
  focusedIndex: number;
  anchor?: EmojiPickerAnchor;
  presentation?: EmojiPickerPresentation;
  columns?: number;
  label?: string;
  emptyLabel?: string;
  className?: string;
  onFocusedIndexChange: (index: number) => void;
  onSelect: (emoji: EmojiSearchResult) => void;
}

export interface EmojiPickerPlacement {
  left: number;
  top: number;
  maxHeight: number;
  side: "above" | "below" | "center" | "inline";
}

const PICKER_WIDTH = 320;
const PICKER_MAX_HEIGHT = 320;
const PICKER_GAP = 8;
const VIEWPORT_MARGIN = 8;

export function EmojiPicker({
  id,
  open,
  query,
  items,
  focusedIndex,
  anchor,
  presentation = "popover",
  columns = 8,
  label = "Choose an emoji",
  emptyLabel = "No emoji found",
  className,
  onFocusedIndexChange,
  onSelect
}: EmojiPickerProps): ReactElement | null {
  const pickerRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [placement, setPlacement] = useState<EmojiPickerPlacement | null>(null);

  useLayoutEffect(() => {
    if (!open || presentation === "inline") return;

    const updatePlacement = () => {
      const measured = pickerRef.current?.getBoundingClientRect();
      setPlacement(computeEmojiPickerPlacement({
        ...(anchor ? { anchor } : {}),
        pickerWidth: measured?.width ?? PICKER_WIDTH,
        pickerHeight: measured?.height ?? PICKER_MAX_HEIGHT,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        presentation
      }));
    };

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [anchor, items.length, open, presentation, query]);

  useLayoutEffect(() => {
    if (!open) return;
    scrollEmojiPickerOptionIntoView(optionRefs.current[focusedIndex] ?? null);
  }, [focusedIndex, items, open]);

  if (!open) return null;

  const focused = items[focusedIndex] ?? items[0];
  const style = {
    "--emoji-picker-columns": columns,
    ...(presentation === "inline"
      ? {}
      : {
          left: placement?.left ?? VIEWPORT_MARGIN,
          top: placement?.top ?? VIEWPORT_MARGIN,
          maxHeight: placement?.maxHeight ?? PICKER_MAX_HEIGHT
        })
  } as CSSProperties;

  return (
    <div
      ref={pickerRef}
      id={id}
      className={[
        "rumi-emoji-picker",
        `rumi-emoji-picker-${presentation}`,
        className
      ].filter(Boolean).join(" ")}
      style={style}
      data-side={placement?.side}
      aria-label={label}
    >
      <div className="rumi-emoji-picker-search" aria-hidden="true">
        <span className="rumi-emoji-picker-search-prefix">:</span>
        <span className="rumi-emoji-picker-query">
          {query || <span className="rumi-emoji-picker-placeholder">Search emoji</span>}
        </span>
        <span className="rumi-emoji-picker-caret" />
      </div>

      {items.length ? (
        <div
          className="rumi-emoji-picker-grid"
          role="listbox"
          aria-label="Emoji results"
          aria-activedescendant={focused ? emojiOptionId(id, focusedIndex) : undefined}
        >
          {items.map((item, index) => (
            <button
              key={`${item.emoji}-${item.order}`}
              id={emojiOptionId(id, index)}
              type="button"
              role="option"
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              tabIndex={-1}
              aria-label={item.name}
              aria-selected={index === focusedIndex}
              className={[
                "rumi-emoji-picker-option",
                index === focusedIndex ? "is-focused" : ""
              ].join(" ")}
              onMouseEnter={() => onFocusedIndexChange(index)}
              onPointerDown={preserveEmojiPickerEditorFocus}
              onClick={(event) => selectEmojiPickerItem(event, item, onSelect)}
            >
              <span aria-hidden="true">{item.emoji}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rumi-emoji-picker-empty">{emptyLabel}</div>
      )}

      <div className="rumi-emoji-picker-footer" aria-live="polite">
        {focused ? (
          <>
            <span className="rumi-emoji-picker-footer-emoji" aria-hidden="true">
              {focused.emoji}
            </span>
            <span>{focused.name}</span>
          </>
        ) : (
          <span>{emptyLabel}</span>
        )}
      </div>
    </div>
  );
}

export function preserveEmojiPickerEditorFocus(
  event: Pick<ReactPointerEvent<HTMLButtonElement>, "pointerType" | "preventDefault" | "stopPropagation">
): void {
  if (event.pointerType === "mouse") event.preventDefault();
  event.stopPropagation();
}

export function selectEmojiPickerItem(
  event: Pick<ReactMouseEvent<HTMLButtonElement>, "stopPropagation">,
  item: EmojiSearchResult,
  onSelect: (emoji: EmojiSearchResult) => void
): void {
  event.stopPropagation();
  onSelect(item);
}

export function scrollEmojiPickerOptionIntoView(
  option: Pick<HTMLButtonElement, "scrollIntoView"> | null
): void {
  option?.scrollIntoView({ block: "nearest" });
}

export function emojiOptionId(pickerId: string, index: number): string {
  return `${pickerId}-option-${index}`;
}

export function computeEmojiPickerPlacement({
  anchor,
  pickerWidth,
  pickerHeight,
  viewportWidth,
  viewportHeight,
  presentation = "popover"
}: {
  anchor?: EmojiPickerAnchor;
  pickerWidth: number;
  pickerHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  presentation?: EmojiPickerPresentation;
}): EmojiPickerPlacement {
  const maxHeight = Math.min(
    PICKER_MAX_HEIGHT,
    Math.max(0, viewportHeight - VIEWPORT_MARGIN * 2)
  );
  const renderedWidth = Math.min(
    pickerWidth,
    Math.max(0, viewportWidth - VIEWPORT_MARGIN * 2)
  );
  const renderedHeight = Math.min(pickerHeight, maxHeight);

  if (presentation === "inline") {
    return { left: 0, top: 0, maxHeight, side: "inline" };
  }
  if (presentation === "dialog" || !anchor) {
    return {
      left: Math.max(VIEWPORT_MARGIN, (viewportWidth - renderedWidth) / 2),
      top: Math.max(VIEWPORT_MARGIN, (viewportHeight - renderedHeight) / 2),
      maxHeight,
      side: "center"
    };
  }

  const left = Math.min(
    Math.max(VIEWPORT_MARGIN, anchor.left),
    Math.max(VIEWPORT_MARGIN, viewportWidth - VIEWPORT_MARGIN - renderedWidth)
  );
  const belowTop = anchor.bottom + PICKER_GAP;
  const aboveBottom = anchor.top - PICKER_GAP;
  const belowSpace = Math.max(0, viewportHeight - VIEWPORT_MARGIN - belowTop);
  const aboveSpace = Math.max(0, aboveBottom - VIEWPORT_MARGIN);
  const side = belowSpace >= renderedHeight || belowSpace >= aboveSpace ? "below" : "above";
  const availableHeight = side === "below" ? belowSpace : aboveSpace;
  const constrainedHeight = Math.min(maxHeight, availableHeight);

  return {
    left,
    top: side === "below"
      ? belowTop
      : Math.max(VIEWPORT_MARGIN, aboveBottom - Math.min(renderedHeight, constrainedHeight)),
    maxHeight: constrainedHeight,
    side
  };
}
