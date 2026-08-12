export type AppShortcutPlatform = "mac" | "linux";
export type AppShortcutAction =
  | "open-create-menu"
  | "toggle-sidebar"
  | "copy-page-url"
  | "copy-page-relative-path";

interface KeyboardShortcutEvent {
  key: string;
  code?: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
}

interface ModifierEvent {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export function appShortcutPlatform(platform = navigator.platform): AppShortcutPlatform {
  return /Mac|iP(hone|ad|od)/i.test(platform) ? "mac" : "linux";
}

export function appShortcutAction(
  event: KeyboardShortcutEvent,
  platform: AppShortcutPlatform
): AppShortcutAction | null {
  if (event.repeat || event.isComposing) return null;

  const isN = event.code === "KeyN" || event.key.toLocaleLowerCase() === "n";
  const isS = event.code === "KeyS" || event.key.toLocaleLowerCase() === "s";
  const isC = event.code === "KeyC" || event.key.toLocaleLowerCase() === "c";
  const isP = event.code === "KeyP" || event.key.toLocaleLowerCase() === "p";
  const hasPrimaryModifier = platform === "mac"
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;

  if (event.shiftKey && !event.altKey && hasPrimaryModifier) {
    if (isC) return "copy-page-url";
    if (isP) return "copy-page-relative-path";
  }

  if (event.shiftKey) return null;

  if (
    isN &&
    (
      platform === "mac"
        ? event.ctrlKey && !event.metaKey && !event.altKey
        : event.altKey && !event.ctrlKey && !event.metaKey
    )
  ) {
    return "open-create-menu";
  }

  if (
    isS &&
    !event.altKey &&
    (
      platform === "mac"
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey
    )
  ) {
    return "toggle-sidebar";
  }

  return null;
}

export function createMenuIndexForKey(event: KeyboardShortcutEvent): number | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;

  const digit = event.code?.match(/^Digit([1-3])$/)?.[1] ?? event.key.match(/^[1-3]$/)?.[0];
  return digit ? Number(digit) - 1 : null;
}

export function hasPrimaryModifier(
  event: ModifierEvent,
  platform: AppShortcutPlatform
): boolean {
  if (event.altKey || event.shiftKey) return false;

  return platform === "mac"
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}

export function shortcutLabels(platform: AppShortcutPlatform): {
  create: string;
  sidebar: string;
  immediate: string;
  copyUrl: string;
  copyRelativePath: string;
} {
  return platform === "mac"
    ? {
        create: "⌃N",
        sidebar: "⌘S",
        immediate: "⌘↵",
        copyUrl: "⇧⌘C",
        copyRelativePath: "⇧⌘P"
      }
    : {
        create: "Alt+N",
        sidebar: "Ctrl+S",
        immediate: "Ctrl+Enter",
        copyUrl: "Ctrl+Shift+C",
        copyRelativePath: "Ctrl+Shift+P"
      };
}
