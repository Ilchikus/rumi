import { Slice, type Schema } from "prosemirror-model";
import { Plugin, TextSelection, type EditorState, type Transaction } from "prosemirror-state";
import { parseLightMarkdown } from "./lightProseMirrorMarkdown";
import { createBookmarkTransaction } from "./editorActions";

const WEB_URL = /^(?:https?:\/\/|www\.)[^\s<>]+$/iu;
const MARKDOWN_SIGNAL = /(?:^|\n)(?:#{1,6}\s|>\s|[-+*]\s|\d+\.\s|```|---\s*$)|\[[^\]]+\]\([^)]+\)|!\[[^\]]*\]\([^)]+\)|\*\*[^*]+\*\*|~~[^~]+~~/mu;

export function rumiPastePlugin(
  schema: Schema,
  uploadAsset?: (file: File) => Promise<string>
): Plugin {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const clipboard = event.clipboardData;
        if (!clipboard) return false;

        const file = supportedAssetFile(Array.from(clipboard.files));
        if (file && uploadAsset) {
          const capturedDoc = view.state.doc;
          void uploadAsset(file)
            .then((path) => insertUploadedAsset(view, schema, file, path, capturedDoc))
            .catch((error) => console.error("Pasted asset upload failed", error));
          return true;
        }

        if (clipboard.files.length > 0) return false;

        const text = clipboard.getData("text/plain");
        if (!text) return false;

        const transaction = createPlainTextPasteTransaction(view.state, text, schema);
        if (!transaction) return false;

        event.preventDefault();
        view.dispatch(transaction.scrollIntoView());
        return true;
      },
      handleDrop(view, event, _slice, moved) {
        if (moved || !uploadAsset) return false;
        const file = supportedAssetFile(Array.from(event.dataTransfer?.files ?? []));
        if (!file) return false;

        event.preventDefault();
        const capturedDoc = view.state.doc;
        void uploadAsset(file)
          .then((path) => insertUploadedAsset(view, schema, file, path, capturedDoc))
          .catch((error) => console.error("Dropped asset upload failed", error));
        return true;
      }
    }
  });
}

function supportedAssetFile(files: readonly File[]): File | null {
  return files.find((file) => {
    const lowerName = file.name.toLocaleLowerCase();
    return (
      (file.type.startsWith("image/") && file.type !== "image/svg+xml" && !lowerName.endsWith(".svg")) ||
      file.type === "application/pdf" ||
      lowerName.endsWith(".pdf")
    );
  }) ?? null;
}

function insertUploadedAsset(
  view: import("prosemirror-view").EditorView,
  schema: Schema,
  file: File,
  path: string,
  capturedDoc: import("prosemirror-model").Node
): void {
  if (view.isDestroyed) return;
  const isPdf = file.type === "application/pdf" || file.name.toLocaleLowerCase().endsWith(".pdf");
  const node = isPdf
    ? schema.nodes.file_embed?.create({ src: path })
    : schema.nodes.image_block?.create({ src: path, alt: file.name });
  const paragraph = schema.nodes.paragraph;
  if (!node || !paragraph) return;

  const { $from } = view.state.selection;
  const blockStart = $from.depth >= 1 ? $from.before(1) : view.state.doc.content.size;
  const block = view.state.doc.nodeAt(blockStart);
  const canReplace = view.state.doc.eq(capturedDoc) && block?.type === paragraph && block.content.size === 0;
  const transaction = canReplace
    ? view.state.tr.replaceWith(blockStart, blockStart + block.nodeSize, [node, paragraph.create()])
    : view.state.tr.insert($from.depth >= 1 ? $from.after(1) : view.state.doc.content.size, node);
  view.dispatch(transaction.scrollIntoView());
}

export function createPlainTextPasteTransaction(
  state: EditorState,
  text: string,
  schema: Schema = state.schema
): Transaction | null {
  if (state.selection.$from.parent.type === schema.nodes.code_block) return null;

  const trimmed = text.trim();
  const link = schema.marks.link;

  if (link && isWebUrl(trimmed)) {
    const href = normalizeWebUrl(trimmed);

    if (state.selection.empty && state.selection.$from.parent.content.size === 0) {
      const bookmark = createBookmarkTransaction(state, href);
      if (bookmark) return bookmark;
    }

    if (!state.selection.empty) {
      const transaction = state.tr.addMark(
        state.selection.from,
        state.selection.to,
        link.create({ href })
      );
      return transaction.setSelection(TextSelection.create(transaction.doc, state.selection.to));
    }

    return state.tr.replaceSelectionWith(schema.text(trimmed, [link.create({ href })]), false);
  }

  if (!text.includes("\n") && !MARKDOWN_SIGNAL.test(text)) return null;

  const parsed = parseLightMarkdown(text);
  return state.tr.replaceSelection(new Slice(parsed.content, 0, 0));
}

export function isWebUrl(value: string): boolean {
  return WEB_URL.test(value.trim());
}

export function normalizeWebUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed.toLocaleLowerCase().startsWith("www.") ? `https://${trimmed}` : trimmed;
}
