// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "./AuthGate";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

describe("authentication gate", () => {
  it("toggles password visibility by click while keeping the control out of the tab order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ mode: "password", authenticated: false }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
    );

    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(AuthGate, null, createElement("p", null, "Workspace")));
    });

    const password = container.querySelector<HTMLInputElement>("#rumi-password");
    const showPassword = container.querySelector<HTMLButtonElement>('button[aria-label="Show password"]');

    expect(password?.type).toBe("password");
    expect(showPassword?.tabIndex).toBe(-1);

    const mouseDown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    showPassword?.dispatchEvent(mouseDown);
    expect(mouseDown.defaultPrevented).toBe(true);
    expect(password?.type).toBe("password");

    await act(async () => {
      showPassword?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(password?.type).toBe("text");
    const hidePassword = container.querySelector<HTMLButtonElement>('button[aria-label="Hide password"]');
    expect(hidePassword?.getAttribute("aria-pressed")).toBe("true");
    expect(hidePassword?.tabIndex).toBe(-1);

    await act(async () => {
      hidePassword?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(password?.type).toBe("password");
  });
});
