import type { AppShortcutPlatform } from "./appShortcuts";

interface SelectAllEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
}

export function isSelectAllShortcut(
  event: SelectAllEvent,
  platform: AppShortcutPlatform
): boolean {
  if (
    event.repeat ||
    event.isComposing ||
    event.altKey ||
    event.shiftKey ||
    event.key.toLocaleLowerCase() !== "a"
  ) return false;

  return platform === "mac"
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}

export function hasTextEditingFocus(target: Element | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const contentEditable = target.closest<HTMLElement>("[contenteditable]");
  if (
    target.isContentEditable ||
    target.contentEditable === "true" ||
    (contentEditable && contentEditable.getAttribute("contenteditable") !== "false")
  ) return true;
  if (target instanceof HTMLTextAreaElement) return !target.disabled;
  if (!(target instanceof HTMLInputElement) || target.disabled) return false;

  return ![
    "button",
    "checkbox",
    "color",
    "file",
    "hidden",
    "image",
    "radio",
    "range",
    "reset",
    "submit"
  ].includes(target.type);
}

export function isSecondaryContextGesture(
  event: MouseEvent,
  platform: AppShortcutPlatform
): boolean {
  return event.button === 2 || (
    platform === "mac" &&
    event.button === 0 &&
    event.ctrlKey
  );
}
