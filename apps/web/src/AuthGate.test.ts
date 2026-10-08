// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "./AuthGate";
import {
  authSessionSnapshot,
  markAuthSessionExpired,
  resetAuthSessionForTests
} from "./lib/authSession";

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
  resetAuthSessionForTests();
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

describe("expired session", () => {
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" }
    });
  }

  async function renderSignedInWorkspace(fetchMock: ReturnType<typeof vi.fn>) {
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(createElement(
        AuthGate,
        null,
        createElement("textarea", { id: "draft", defaultValue: "" })
      ));
    });
  }

  it("covers the still-mounted workspace with sign-in and restores it in place", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/login")) {
        return jsonResponse({ mode: "password", authenticated: true, user: { username: "owner" } });
      }
      return jsonResponse({ mode: "password", authenticated: true, user: { username: "owner" } });
    });
    await renderSignedInWorkspace(fetchMock);

    const draft = container!.querySelector<HTMLTextAreaElement>("#draft")!;
    draft.value = "unsaved words";

    await act(async () => markAuthSessionExpired());

    const overlay = container!.querySelector("[data-auth-session-expired]");
    expect(overlay?.textContent).toContain("Your session has ended");
    expect(container!.querySelector("#draft")).toBe(draft);
    expect(draft.closest("[inert]")).not.toBeNull();
    expect(container!.querySelector<HTMLInputElement>("#rumi-username")?.value).toBe("owner");

    const password = container!.querySelector<HTMLInputElement>("#rumi-password")!;
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setValue.call(password, "secret");
      password.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      container!.querySelector("form")!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });

    expect(container!.querySelector("[data-auth-session-expired]")).toBeNull();
    expect(container!.querySelector("#draft")).toBe(draft);
    expect(draft.value).toBe("unsaved words");
    expect(draft.closest("[inert]")).toBeNull();
    expect(authSessionSnapshot()).toEqual({ expired: false, restoredCount: 1 });
  });

  it("shows sign-in when a returning tab finds its session gone", async () => {
    let authenticated = true;
    const fetchMock = vi.fn(async () => jsonResponse({ mode: "password", authenticated }));
    await renderSignedInWorkspace(fetchMock);

    authenticated = false;
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(authSessionSnapshot().expired).toBe(true);
    expect(container!.querySelector("[data-auth-session-expired]")).not.toBeNull();
  });
});
