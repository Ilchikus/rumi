import generatedCatalog from "./emoji-catalog.generated.json";

export interface EmojiDefinition {
  emoji: string;
  name: string;
  keywords: readonly string[];
  group: string;
  subgroup: string;
  order: number;
}

export interface EmojiSearchResult extends EmojiDefinition {
  aliases: readonly string[];
}

export interface EmojiSearchOptions {
  limit?: number;
  recent?: readonly string[];
  allowedEmoji?: ReadonlySet<string> | ((emoji: EmojiDefinition) => boolean);
}

interface GeneratedEmojiCatalog {
  metadata: {
    unicodeVersion: string;
    cldrVersion: string;
    sources: string[];
    license: string;
  };
  emojis: EmojiDefinition[];
}

const catalog = generatedCatalog as GeneratedEmojiCatalog;

export const EMOJI_CATALOG_METADATA = Object.freeze(catalog.metadata);
export const EMOJI_CATALOG: readonly EmojiDefinition[] = Object.freeze(catalog.emojis);

export const RUMI_EMOJI_ALIASES = Object.freeze({
  smile: "😄",
  slight_smile: "🙂",
  joy: "😂",
  laugh: "😂",
  wink: "😉",
  heart: "❤️",
  thumbsup: "👍",
  "+1": "👍",
  thumbsdown: "👎",
  "-1": "👎",
  fire: "🔥",
  party: "🎉",
  check: "✅",
  eyes: "👀"
} satisfies Record<string, string>);

const COMMON_EMOJI = Object.freeze([
  "😄",
  "🙂",
  "😂",
  "😉",
  "❤️",
  "👍",
  "👎",
  "🔥",
  "🎉",
  "✅",
  "👀",
  "🙏",
  "🚀",
  "💡",
  "✨",
  "🤔",
  "👏",
  "💯"
]);

const aliasesByEmoji = new Map<string, string[]>();
for (const [alias, emoji] of Object.entries(RUMI_EMOJI_ALIASES)) {
  const aliases = aliasesByEmoji.get(emoji) ?? [];
  aliases.push(alias);
  aliasesByEmoji.set(emoji, aliases);
}

const emojiByValue = new Map(EMOJI_CATALOG.map((emoji) => [emoji.emoji, emoji]));

export function searchEmoji(
  query: string,
  options: EmojiSearchOptions = {}
): EmojiSearchResult[] {
  const limit = Math.max(1, options.limit ?? 80);
  const exactQuery = query.trim().toLowerCase().replace(/^:/u, "");
  const normalizedQuery = normalizeEmojiQuery(exactQuery);
  const queryTokens = normalizedQuery ? normalizedQuery.split(" ") : [];
  const allowed = allowedEmojiPredicate(options.allowedEmoji);

  if (!normalizedQuery) {
    const preferred = uniqueStrings([...(options.recent ?? []), ...COMMON_EMOJI]);
    return preferred
      .map((emoji) => emojiByValue.get(emoji))
      .filter((emoji): emoji is EmojiDefinition => Boolean(emoji && allowed(emoji)))
      .slice(0, limit)
      .map(withAliases);
  }

  return EMOJI_CATALOG
    .filter(allowed)
    .map((emoji) => ({
      emoji,
      score: scoreEmoji(emoji, exactQuery, normalizedQuery, queryTokens)
    }))
    .filter((entry) => entry.score !== null)
    .sort((left, right) => (
      (left.score ?? Number.POSITIVE_INFINITY) -
        (right.score ?? Number.POSITIVE_INFINITY) ||
      left.emoji.order - right.emoji.order
    ))
    .slice(0, limit)
    .map(({ emoji }) => withAliases(emoji));
}

export function normalizeEmojiQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/^:/u, "")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ");
}

export function emojiAliases(emoji: string): readonly string[] {
  return aliasesByEmoji.get(emoji) ?? [];
}

function scoreEmoji(
  emoji: EmojiDefinition,
  exactQuery: string,
  normalizedQuery: string,
  queryTokens: readonly string[]
): number | null {
  const aliases = emojiAliases(emoji.emoji);
  if (aliases.some((alias) => alias.toLowerCase() === exactQuery)) return 0;

  const normalizedName = normalizeEmojiQuery(emoji.name);
  if (normalizedName === normalizedQuery) return 1;

  const aliasAndNameTerms = [
    ...aliases.map(normalizeEmojiQuery),
    normalizedName
  ];
  if (aliasAndNameTerms.some((term) => term.split(" ").some(
    (word) => word.startsWith(normalizedQuery)
  ))) {
    return 2;
  }

  const searchableTerms = uniqueStrings([
    ...aliasAndNameTerms,
    ...emoji.keywords.map(normalizeEmojiQuery)
  ]);
  const searchableWords = searchableTerms.flatMap((term) => term.split(" "));

  if (queryTokens.every((token) => searchableWords.some((word) => word.startsWith(token)))) {
    return 3;
  }
  if (queryTokens.every((token) => searchableTerms.some((term) => term.includes(token)))) {
    return 4;
  }
  return null;
}

function withAliases(emoji: EmojiDefinition): EmojiSearchResult {
  return {
    ...emoji,
    aliases: emojiAliases(emoji.emoji)
  };
}

function allowedEmojiPredicate(
  allowed: EmojiSearchOptions["allowedEmoji"]
): (emoji: EmojiDefinition) => boolean {
  if (!allowed) return () => true;
  if (typeof allowed === "function") return allowed;
  return (emoji) => allowed.has(emoji.emoji);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
