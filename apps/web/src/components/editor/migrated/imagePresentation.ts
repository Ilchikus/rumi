import type { PagePresentation } from "@rumi/contracts";
import { Fragment, type Node as ProseMirrorNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";

export const IMAGE_PRESENTATION_TRANSACTION_META = "rumi:image-presentation";

export function applyImagePresentationToDocument(
  document: ProseMirrorNode,
  presentation: PagePresentation | undefined
): ProseMirrorNode {
  return mapNode(document, presentation?.images ?? {});
}

export function applyImagePresentationToView(
  view: EditorView,
  presentation: PagePresentation | undefined
): void {
  const images = presentation?.images ?? {};
  let transaction = view.state.tr;
  let changed = false;

  view.state.doc.descendants((node, position) => {
    if (node.type.name !== "image") return;
    const image = images[String(node.attrs.src ?? "")];
    const widthPx = image?.widthPx ?? null;
    const alignment = image?.alignment ?? "left";
    if (node.attrs.widthPx === widthPx && node.attrs.alignment === alignment) return;
    transaction = transaction.setNodeMarkup(position, undefined, {
      ...node.attrs,
      widthPx,
      alignment
    });
    changed = true;
  });

  if (!changed) return;
  view.dispatch(
    transaction
      .setMeta(IMAGE_PRESENTATION_TRANSACTION_META, true)
      .setMeta("addToHistory", false)
  );
}

function mapNode(
  node: ProseMirrorNode,
  images: PagePresentation["images"]
): ProseMirrorNode {
  if (node.isText) return node;

  const children = Array.from(
    { length: node.childCount },
    (_, index) => mapNode(node.child(index), images)
  );
  const attrs = node.type.name === "image"
    ? {
        ...node.attrs,
        widthPx: images[String(node.attrs.src ?? "")]?.widthPx ?? null,
        alignment: images[String(node.attrs.src ?? "")]?.alignment ?? "left"
      }
    : node.attrs;
  return node.type.create(attrs, Fragment.fromArray(children), node.marks);
}
