import type { Node as ProseMirrorNode } from "prosemirror-model";
import { Plugin, PluginKey, type EditorState } from "prosemirror-state";
import { Decoration, DecorationSet, type EditorView, type NodeView } from "prosemirror-view";

interface CollapsibleHeadingState {
  collapsed: Set<number>;
}

export const collapsibleHeadingKey = new PluginKey<CollapsibleHeadingState>(
  "rumiCollapsibleHeadings"
);

export function collapsibleHeadingPlugin(): Plugin<CollapsibleHeadingState> {
  return new Plugin<CollapsibleHeadingState>({
    key: collapsibleHeadingKey,
    state: {
      init: () => ({ collapsed: new Set() }),
      apply(transaction, previous) {
        const explicit = transaction.getMeta(collapsibleHeadingKey) as
          | CollapsibleHeadingState
          | undefined;
        if (explicit) return explicit;
        if (!transaction.docChanged || previous.collapsed.size === 0) return previous;

        const collapsed = new Set<number>();
        for (const pos of previous.collapsed) {
          const mapped = transaction.mapping.mapResult(pos, 1);
          if (!mapped.deleted && transaction.doc.nodeAt(mapped.pos)?.type.name === "heading") {
            collapsed.add(mapped.pos);
          }
        }
        return { collapsed };
      }
    },
    props: {
      decorations(state) {
        const collapsed = collapsibleHeadingKey.getState(state)?.collapsed;
        if (!collapsed?.size) return DecorationSet.empty;

        const decorations: Decoration[] = [];
        for (const headingPos of collapsed) {
          const heading = state.doc.nodeAt(headingPos);
          if (!heading || heading.type.name !== "heading") continue;

          decorations.push(
            Decoration.node(
              headingPos,
              headingPos + heading.nodeSize,
              { class: "rumi-heading-collapsed" },
              { collapsedHeading: true }
            )
          );

          const sectionEnd = findHeadingSectionEnd(
            state.doc,
            headingPos,
            Number(heading.attrs.level ?? 1)
          );
          let pos = headingPos + heading.nodeSize;

          while (pos < sectionEnd) {
            const node = state.doc.nodeAt(pos);
            if (!node) break;
            decorations.push(
              Decoration.node(pos, pos + node.nodeSize, { class: "rumi-section-collapsed" })
            );
            pos += node.nodeSize;
          }
        }

        return DecorationSet.create(state.doc, decorations);
      }
    }
  });
}

export function findHeadingSectionEnd(
  doc: ProseMirrorNode,
  headingPos: number,
  headingLevel: number
): number {
  const heading = doc.nodeAt(headingPos);
  if (!heading) return doc.content.size;

  let pos = headingPos + heading.nodeSize;
  while (pos < doc.content.size) {
    const node = doc.nodeAt(pos);
    if (!node) break;
    if (node.type.name === "heading" && Number(node.attrs.level) <= headingLevel) return pos;
    pos += node.nodeSize;
  }
  return doc.content.size;
}

export function isHeadingCollapsed(state: EditorState, pos: number): boolean {
  return collapsibleHeadingKey.getState(state)?.collapsed.has(pos) ?? false;
}

export function headingNodeView(
  initialNode: ProseMirrorNode,
  view: EditorView,
  getPos: () => number | undefined
): NodeView {
  let node = initialNode;
  const dom = document.createElement("div");
  dom.className = "rumi-heading-block";
  const caret = document.createElement("button");
  caret.type = "button";
  caret.contentEditable = "false";
  caret.className = "rumi-heading-caret";
  caret.title = "Collapse section";
  caret.setAttribute("aria-label", "Collapse section");
  caret.textContent = "⌄";
  let contentDOM = document.createElement(`h${node.attrs.level}`);
  dom.append(caret, contentDOM);

  const render = () => {
    const pos = getPos();
    const collapsed = typeof pos === "number" && isHeadingCollapsed(view.state, pos);
    dom.classList.toggle("is-collapsed", collapsed);
    caret.setAttribute("aria-expanded", String(!collapsed));
    caret.title = collapsed ? "Expand section" : "Collapse section";
  };

  caret.addEventListener("mousedown", (event) => event.preventDefault());
  caret.addEventListener("click", () => {
    const pos = getPos();
    if (typeof pos !== "number") return;

    const previous = collapsibleHeadingKey.getState(view.state)?.collapsed ?? new Set<number>();
    const collapsed = new Set(previous);
    if (collapsed.has(pos)) collapsed.delete(pos);
    else collapsed.add(pos);
    view.dispatch(view.state.tr.setMeta(collapsibleHeadingKey, { collapsed }));
    render();
    view.focus();
  });

  render();
  return {
    dom,
    contentDOM,
    update(nextNode) {
      if (nextNode.type !== node.type || nextNode.attrs.level !== node.attrs.level) return false;
      node = nextNode;
      render();
      return true;
    },
    stopEvent(event) {
      return caret.contains(event.target as Node);
    },
    ignoreMutation(mutation) {
      return caret.contains(mutation.target);
    }
  };
}

const CODE_LANGUAGES = [
  "",
  "javascript",
  "typescript",
  "python",
  "css",
  "html",
  "json",
  "bash",
  "markdown",
  "sql",
  "go",
  "rust",
  "java",
  "cpp",
  "ruby",
  "yaml",
  "mermaid"
];

let mermaidModule: Promise<typeof import("mermaid")> | null = null;
let mermaidRenderId = 0;

export function codeBlockNodeView(
  initialNode: ProseMirrorNode,
  view: EditorView,
  getPos: () => number | undefined
): NodeView {
  let node = initialNode;
  let mermaidMode: "code" | "split" | "preview" = "split";
  let renderRevision = 0;
  const dom = document.createElement("div");
  dom.className = "rumi-code-block";
  const toolbar = document.createElement("div");
  toolbar.className = "rumi-code-toolbar";
  toolbar.contentEditable = "false";
  const select = document.createElement("select");
  select.className = "rumi-code-language";
  select.setAttribute("aria-label", "Code language");

  for (const language of CODE_LANGUAGES) {
    const option = document.createElement("option");
    option.value = language;
    option.textContent = language || "Plain text";
    select.append(option);
  }

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "rumi-code-copy";
  copy.textContent = "Copy";
  const pre = document.createElement("pre");
  const contentDOM = document.createElement("code");
  const mermaidControls = document.createElement("div");
  mermaidControls.className = "rumi-mermaid-controls";
  const modeButtons = (["code", "split", "preview"] as const).map((mode) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = mode === "code" ? "Code" : mode === "split" ? "Split" : "Preview";
    button.addEventListener("click", () => {
      mermaidMode = mode;
      render();
    });
    mermaidControls.append(button);
    return { mode, button };
  });
  const toolbarActions = document.createElement("div");
  toolbarActions.className = "rumi-code-actions";
  toolbarActions.append(mermaidControls, copy);
  const body = document.createElement("div");
  body.className = "rumi-code-body";
  const preview = document.createElement("div");
  preview.className = "rumi-mermaid-preview";
  pre.append(contentDOM);
  toolbar.append(select, toolbarActions);
  body.append(pre, preview);
  dom.append(toolbar, body);

  const render = () => {
    const params = String(node.attrs.params ?? "");
    select.value = CODE_LANGUAGES.includes(params) ? params : "";
    contentDOM.dataset.language = params;
    const isMermaid = params === "mermaid";
    mermaidControls.hidden = !isMermaid;
    dom.dataset.mermaidMode = isMermaid ? mermaidMode : "code";
    for (const item of modeButtons) {
      item.button.classList.toggle("active", item.mode === mermaidMode);
    }

    if (!isMermaid) {
      preview.replaceChildren();
      return;
    }

    const revision = ++renderRevision;
    preview.textContent = node.textContent.trim() ? "Rendering diagram…" : "Enter Mermaid code to preview it.";
    if (!node.textContent.trim()) return;

    void renderMermaid(node.textContent).then((result) => {
      if (revision !== renderRevision) return;
      if (result.ok) preview.innerHTML = result.svg;
      else preview.textContent = result.message;
    });
  };

  select.addEventListener("change", () => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    view.dispatch(
      view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, params: select.value })
    );
    view.focus();
  });
  copy.addEventListener("click", () => {
    void navigator.clipboard?.writeText(node.textContent);
    copy.textContent = "Copied";
    window.setTimeout(() => {
      copy.textContent = "Copy";
    }, 1200);
  });

  render();
  return {
    dom,
    contentDOM,
    update(nextNode) {
      if (nextNode.type !== node.type) return false;
      node = nextNode;
      render();
      return true;
    },
    stopEvent(event) {
      return toolbar.contains(event.target as Node) || preview.contains(event.target as Node);
    },
    ignoreMutation(mutation) {
      return toolbar.contains(mutation.target) || preview.contains(mutation.target);
    }
  };
}

async function renderMermaid(
  source: string
): Promise<{ ok: true; svg: string } | { ok: false; message: string }> {
  try {
    mermaidModule ??= import("mermaid");
    const { default: mermaid } = await mermaidModule;
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
    const id = `rumi-mermaid-${++mermaidRenderId}`;
    const { svg } = await mermaid.render(id, source);
    return { ok: true, svg };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? `Diagram error: ${error.message}` : "Diagram could not be rendered."
    };
  }
}

export function fileEmbedNodeView(initialNode: ProseMirrorNode): NodeView {
  let node = initialNode;
  const dom = document.createElement("div");
  dom.className = "rumi-file-card";
  dom.contentEditable = "false";
  const label = document.createElement("div");
  label.className = "rumi-file-content";
  const icon = document.createElement("span");
  icon.className = "rumi-file-icon";
  icon.textContent = "FILE";
  const details = document.createElement("span");
  const name = document.createElement("strong");
  const path = document.createElement("span");
  details.append(name, path);
  label.append(icon, details);
  const open = document.createElement("a");
  open.className = "rumi-embed-button";
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  open.textContent = "Open";
  dom.append(label, open);

  const render = () => {
    const src = String(node.attrs.src ?? "");
    name.textContent = src.split("/").at(-1) || "File";
    path.textContent = src;
    open.href = workspaceAssetUrl(src);
  };

  render();
  return atomNodeView(dom, () => node, (nextNode) => {
    node = nextNode;
    render();
  });
}

export function imageBlockNodeView(initialNode: ProseMirrorNode): NodeView {
  let node = initialNode;
  const dom = document.createElement("figure");
  dom.className = "rumi-image-block";
  dom.contentEditable = "false";
  const image = document.createElement("img");
  const caption = document.createElement("figcaption");
  dom.append(image, caption);

  const render = () => {
    const src = String(node.attrs.src ?? "");
    image.src = workspaceAssetUrl(src);
    image.alt = String(node.attrs.alt ?? "");
    image.title = node.attrs.title ? String(node.attrs.title) : "";
    caption.textContent = image.title || image.alt;
    caption.hidden = !caption.textContent;
  };

  render();
  return atomNodeView(dom, () => node, (nextNode) => {
    node = nextNode;
    render();
  });
}

export function databaseEmbedNodeView(
  initialNode: ProseMirrorNode,
  view: EditorView,
  getPos: () => number | undefined,
  openHref: (href: string) => void
): NodeView {
  let node = initialNode;
  const dom = document.createElement("div");
  dom.className = "rumi-database-embed";
  dom.contentEditable = "false";
  const content = document.createElement("button");
  content.type = "button";
  content.className = "rumi-database-content";
  const title = document.createElement("strong");
  const detail = document.createElement("span");
  const actions = document.createElement("div");
  actions.className = "rumi-embed-actions";
  const edit = embedButton("Edit source");
  actions.append(edit);
  content.append(title, detail);
  dom.append(content, actions);

  const render = () => {
    const source = String(node.attrs.source ?? "");
    title.textContent = source || "Choose a database";
    detail.textContent = [
      node.attrs.view ? `${String(node.attrs.view)} view` : "table view",
      node.attrs.filter ? `filter: ${String(node.attrs.filter)}` : ""
    ].filter(Boolean).join(" · ");
  };
  content.addEventListener("click", () => {
    const source = String(node.attrs.source ?? "");
    if (source) openHref(source);
    else edit.click();
  });
  edit.addEventListener("click", () => {
    const input = document.createElement("input");
    input.className = "rumi-embed-input";
    input.value = String(node.attrs.source ?? "");
    input.placeholder = "Database document path";
    input.setAttribute("aria-label", "Database source path");
    dom.replaceChild(input, content);
    input.focus();
    input.select();

    let finished = false;
    const finish = (save: boolean) => {
      if (finished) return;
      finished = true;
      const pos = getPos();
      const source = input.value.trim();
      if (save && typeof pos === "number") {
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, source }));
      }
      if (input.parentNode === dom) dom.replaceChild(content, input);
      view.focus();
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") finish(true);
      if (event.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true), { once: true });
  });

  render();
  return atomNodeView(dom, () => node, (nextNode) => {
    node = nextNode;
    render();
  });
}

function atomNodeView(
  dom: HTMLElement,
  currentNode: () => ProseMirrorNode,
  updateNode: (node: ProseMirrorNode) => void
): NodeView {
  return {
    dom,
    update(nextNode) {
      if (nextNode.type !== currentNode().type) return false;
      updateNode(nextNode);
      return true;
    },
    stopEvent() {
      return true;
    },
    ignoreMutation() {
      return true;
    }
  };
}

function embedButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "rumi-embed-button";
  button.textContent = label;
  return button;
}

function workspaceAssetUrl(src: string): string {
  if (/^(?:https?:|data:|blob:)/iu.test(src)) return src;
  return `/api/asset?${new URLSearchParams({ path: src }).toString()}`;
}
