import { describe, expect, it, vi } from "vitest";
import {
  EMOJI_CATALOG,
  EMOJI_CATALOG_METADATA,
  RUMI_EMOJI_ALIASES,
  normalizeEmojiQuery,
  searchEmoji
} from "./emojiCatalog";
import {
  computeEmojiPickerPlacement,
  preserveEmojiPickerEditorFocus,
  scrollEmojiPickerOptionIntoView,
  selectEmojiPickerItem
} from "./EmojiPicker";

describe("emoji catalog search", () => {
  it("focuses the reviewed exact alias before broader keyword matches", () => {
    const results = searchEmoji("smile");

    expect(results[0]).toMatchObject({
      emoji: "😄",
      name: "grinning face with smiling eyes"
    });
  });

  it.each([
    ["slight_smile", "🙂"],
    ["joy", "😂"],
    ["+1", "👍"],
    ["red-heart", "❤️"],
    ["party", "🎉"]
  ])("matches %s to %s", (query, emoji) => {
    expect(searchEmoji(query)[0]?.emoji).toBe(emoji);
  });

  it("normalizes separators and can restrict the reusable picker catalog", () => {
    expect(normalizeEmojiQuery(":red_heart")).toBe("red heart");
    expect(searchEmoji("heart", {
      allowedEmoji: new Set(["💙", "🔥"])
    }).map((result) => result.emoji)).toEqual(["💙"]);
  });

  it("ships a pinned offline catalog with accessible names", () => {
    expect(EMOJI_CATALOG_METADATA).toMatchObject({
      unicodeVersion: "17.0.0",
      cldrVersion: "48.0.0",
      license: "Unicode-3.0"
    });
    expect(EMOJI_CATALOG.length).toBeGreaterThan(1_500);
    expect(EMOJI_CATALOG.every((emoji) => emoji.name.length > 0)).toBe(true);
    expect(new Set(EMOJI_CATALOG.map((emoji) => emoji.emoji)).size)
      .toBe(EMOJI_CATALOG.length);
    expect(EMOJI_CATALOG.every((emoji, index) => (
      emoji.order === index && !emoji.emoji.includes("\ufffd")
    ))).toBe(true);
    expect(Object.keys(RUMI_EMOJI_ALIASES).length)
      .toBe(new Set(Object.keys(RUMI_EMOJI_ALIASES)).size);
  });
});

describe("emoji picker placement", () => {
  it("opens below the caret and flips above near the viewport bottom", () => {
    expect(computeEmojiPickerPlacement({
      anchor: { left: 120, top: 100, bottom: 120 },
      pickerWidth: 320,
      pickerHeight: 300,
      viewportWidth: 900,
      viewportHeight: 700
    }).side).toBe("below");

    expect(computeEmojiPickerPlacement({
      anchor: { left: 120, top: 650, bottom: 670 },
      pickerWidth: 320,
      pickerHeight: 300,
      viewportWidth: 900,
      viewportHeight: 700
    }).side).toBe("above");
  });

  it("supports centered and inline presentations for future icon selectors", () => {
    expect(computeEmojiPickerPlacement({
      pickerWidth: 320,
      pickerHeight: 300,
      viewportWidth: 900,
      viewportHeight: 700,
      presentation: "dialog"
    }).side).toBe("center");
    expect(computeEmojiPickerPlacement({
      pickerWidth: 320,
      pickerHeight: 300,
      viewportWidth: 900,
      viewportHeight: 700,
      presentation: "inline"
    }).side).toBe("inline");
  });

  it("preserves mouse focus, allows touch scrolling, and selects on click", () => {
    const mouse = {
      pointerType: "mouse" as const,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    };
    const touch = {
      pointerType: "touch" as const,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    };
    preserveEmojiPickerEditorFocus(mouse);
    preserveEmojiPickerEditorFocus(touch);

    expect(mouse.preventDefault).toHaveBeenCalledOnce();
    expect(touch.preventDefault).not.toHaveBeenCalled();
    expect(mouse.stopPropagation).toHaveBeenCalledOnce();
    expect(touch.stopPropagation).toHaveBeenCalledOnce();

    const item = searchEmoji("smile")[0]!;
    const onSelect = vi.fn();
    const click = { stopPropagation: vi.fn() };
    selectEmojiPickerItem(click, item, onSelect);
    expect(click.stopPropagation).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(item);
  });

  it("keeps the keyboard-focused option inside the scrolling viewport", () => {
    const scrollIntoView = vi.fn();
    scrollEmojiPickerOptionIntoView({ scrollIntoView });

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });
});
