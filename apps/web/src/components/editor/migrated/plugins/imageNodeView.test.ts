// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { applyImagePresentationToDocument } from "../imagePresentation";
import { parseMarkdown, serializeMarkdown } from "../markdown";
import { schema } from "../schema";
import { imageNodeView } from "./imageNodeView";

let mountedView: EditorView | null = null;

afterEach(() => {
  mountedView?.destroy();
  mountedView = null;
  document.body.replaceChildren();
});

describe("shared image presentation", () => {
  it("defaults images left and applies stored presentation without changing Markdown", () => {
    const markdown = "![Diagram](.assets/diagram.png)";
    const defaultDocument = applyImagePresentationToDocument(parseMarkdown(markdown, schema), undefined);
    const pmDocument = applyImagePresentationToDocument(parseMarkdown(markdown, schema), {
      images: { ".assets/diagram.png": { widthPx: 420, alignment: "center" } }
    });

    expect(defaultDocument.firstChild?.attrs.alignment).toBe("left");
    expect(pmDocument.firstChild?.attrs.widthPx).toBe(420);
    expect(pmDocument.firstChild?.attrs.alignment).toBe("center");
    expect(serializeMarkdown(pmDocument)).toBe(`${markdown}\n`);
  });

  it("persists final width and alignment without serializing either", () => {
    const onResize = vi.fn();
    const onAlignmentChange = vi.fn();
    const pmDocument = applyImagePresentationToDocument(
      parseMarkdown("![](.assets/diagram.png)", schema),
      { images: { ".assets/diagram.png": { widthPx: 400, alignment: "center" } } }
    );
    const host = documentElement("div");
    document.body.append(host);
    const state = EditorState.create({ doc: pmDocument });
    let view: EditorView;
    view = new EditorView(host, {
      state,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction));
      },
      nodeViews: {
        image: (node, editorView, getPos) => imageNodeView(node, editorView, getPos, {
          resizable: true,
          onResize,
          onAlignmentChange
        })
      }
    });
    mountedView = view;
    const figure = host.querySelector<HTMLElement>("figure.image-block")!;
    const wrapper = figure.querySelector<HTMLElement>(".image-wrapper")!;
    const handle = figure.querySelector<HTMLButtonElement>(".image-resize-handle")!;
    Object.defineProperty(figure.parentElement, "clientWidth", { configurable: true, value: 800 });
    wrapper.getBoundingClientRect = () => ({
      width: 400,
      height: 300,
      x: 0,
      y: 0,
      top: 0,
      right: 400,
      bottom: 300,
      left: 0,
      toJSON: () => ({})
    });

    handle.dispatchEvent(pointerEvent("pointerdown", 400));
    window.dispatchEvent(pointerEvent("pointermove", 450));
    expect(wrapper.style.width).toBe("500px");
    expect(onResize).not.toHaveBeenCalled();
    window.dispatchEvent(pointerEvent("pointerup", 450));

    expect(onResize).toHaveBeenCalledOnce();
    expect(onResize).toHaveBeenCalledWith(".assets/diagram.png", 500);
    expect(view.state.doc.firstChild?.attrs.widthPx).toBe(500);

    figure.querySelector<HTMLButtonElement>('[title="Align left"]')!.click();
    expect(onAlignmentChange).toHaveBeenCalledOnce();
    expect(onAlignmentChange).toHaveBeenCalledWith(".assets/diagram.png", "left");
    expect(view.state.doc.firstChild?.attrs.alignment).toBe("left");
    expect(serializeMarkdown(view.state.doc)).toBe("![](.assets/diagram.png)\n");
  });
});

function pointerEvent(type: string, clientX: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
}

function documentElement<K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] {
  return window.document.createElement(tag);
}
