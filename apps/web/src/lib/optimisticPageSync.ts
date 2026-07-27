import type { PageDocument } from "@rumi/contracts";

export interface DirtyPageParts {
  body: boolean;
  frontmatter: boolean;
}

export function rebasePageDocument(
  latest: PageDocument,
  local: PageDocument,
  localMarkdownBody: string,
  dirty: DirtyPageParts
): PageDocument {
  return {
    ...latest,
    frontmatter: dirty.frontmatter ? local.frontmatter : latest.frontmatter,
    markdownBody: dirty.body ? localMarkdownBody : latest.markdownBody
  };
}
