import type { Transaction } from "prosemirror-state";

export const SUGGESTION_MENU_META = "rumiSuggestionMenu";

export type SuggestionMenuOwner = "slash" | "mention" | "emoji";

export function claimSuggestionMenu(
  transaction: Transaction,
  owner: SuggestionMenuOwner
): Transaction {
  return transaction.setMeta(SUGGESTION_MENU_META, owner);
}

export function suggestionMenuClaim(
  transaction: Transaction
): SuggestionMenuOwner | undefined {
  return transaction.getMeta(SUGGESTION_MENU_META) as SuggestionMenuOwner | undefined;
}
