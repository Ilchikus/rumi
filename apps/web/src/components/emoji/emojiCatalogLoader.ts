import { lazyResource, useLazyResource } from "../../lib/lazyResource";

export type EmojiCatalogModule = typeof import("./emojiCatalog");

/** The emoji catalog is a separate chunk, loaded when a picker or suggestion needs it. */
const emojiCatalog = lazyResource(() => import("./emojiCatalog"));

export const loadEmojiCatalog = emojiCatalog.load;
export const peekEmojiCatalog = emojiCatalog.peek;

export function useEmojiCatalog(enabled = true): EmojiCatalogModule | null {
  return useLazyResource(emojiCatalog, enabled);
}
