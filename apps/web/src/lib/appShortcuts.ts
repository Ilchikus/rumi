export type AppShortcutPlatform = "mac" | "linux";
export type AppShortcutAction = "open-create-menu" | "toggle-sidebar";

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
  if (event.repeat || event.isComposing || event.shiftKey) return null;

  const isN = event.code === "KeyN" || event.key.toLocaleLowerCase() === "n";
  const isBackquote = event.code === "Backquote" || event.key === "`";

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
    isBackquote &&
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
} {
  return platform === "mac"
    ? { create: "⌃N", sidebar: "⌘`", immediate: "⌘↵" }
    : { create: "Alt+N", sidebar: "Ctrl+`", immediate: "Ctrl+Enter" };
}
