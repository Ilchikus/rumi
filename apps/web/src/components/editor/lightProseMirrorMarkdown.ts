import type { Node as ProseMirrorNode } from "prosemirror-model";
import { defaultMarkdownParser, defaultMarkdownSerializer, MarkdownSerializer, schema } from "prosemirror-markdown";

export const lightEditorSchema = schema;
const lightMarkdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    bullet_list(state, node) {
      state.renderList(node, "  ", () => "- ");
    }
  },
  defaultMarkdownSerializer.marks
);

export function parseLightMarkdown(markdown: string): ProseMirrorNode {
  return defaultMarkdownParser.parse(markdown || "");
}

export function serializeLightMarkdown(doc: ProseMirrorNode): string {
  return lightMarkdownSerializer.serialize(doc);
}
