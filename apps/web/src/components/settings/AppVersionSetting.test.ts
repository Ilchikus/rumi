// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppInfoResult } from "@rumi/contracts";
import { AppVersionSetting } from "./AppVersionSetting";
import { waitForAppVersion, type AppUpdateState } from "../../lib/appUpdate";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render(info: AppInfoResult, state: AppUpdateState = { status: "idle" }, update = vi.fn()) {
  container ??= document.body.appendChild(document.createElement("div"));
  root ??= createRoot(container);
  act(() => root?.render(createElement(AppVersionSetting, { info, state, update })));
  return {
    text: container.textContent ?? "",
    button: container.querySelector<HTMLButtonElement>("button:not([aria-label])"),
    command: container.querySelector("code")?.textContent ?? null,
    update
  };
}

const base: AppInfoResult = {
  version: "0.1.17",
  latestVersion: "0.1.17",
  updateAvailable: false,
  update: { mode: "self" }
};
const available: AppInfoResult = { ...base, latestVersion: "0.1.18", updateAvailable: true };

describe("app version setting", () => {
  it("shows the running version and that it is current", () => {
    const view = render(base);

    expect(view.text).toContain("0.1.17");
    expect(view.text).toContain("Rumi is up to date.");
    expect(view.button).toBeNull();
  });

  it("offers a one-click update and reflects install and restart progress", () => {
    const view = render(available);
    expect(view.button?.textContent).toBe("Update to 0.1.18");
    act(() => view.button?.click());
    expect(view.update).toHaveBeenCalledTimes(1);

    expect(render(available, { status: "updating" }).button?.disabled).toBe(true);
    const restarting = render(available, { status: "restarting", version: "0.1.18" });
    expect(restarting.button?.textContent).toBe("Restarting…");
    expect(restarting.text).toContain("Restarting and reloading this page");
  });

  it("shows the manual command when the server cannot update itself or the install fails", () => {
    const manual = render({
      ...available,
      update: { mode: "manual", command: "npx @rumi-md/server@latest serve" }
    });
    expect(manual.button).toBeNull();
    expect(manual.command).toBe("npx @rumi-md/server@latest serve");

    const failed = render(available, {
      status: "error",
      message: "npm could not install @rumi-md/server@0.1.18: EACCES",
      installFailed: true
    });
    expect(failed.text).toContain("EACCES");
    expect(failed.command).toBe("npm install --global @rumi-md/server@latest");
    expect(failed.button?.textContent).toBe("Try again");

    const refused = render(available, {
      status: "error",
      message: "This Rumi installation cannot update itself.",
      installFailed: true,
      command: "npx @rumi-md/server@latest serve"
    });
    expect(refused.command).toBe("npx @rumi-md/server@latest serve");

    const timedOut = render(available, {
      status: "error",
      message: "Rumi 0.1.18 was installed but did not come back.",
      installFailed: false
    });
    expect(timedOut.command).toBeNull();
  });

  it("explains disabled checks and development builds", () => {
    expect(render({ ...base, update: { mode: "disabled" } }).text)
      .toContain("Update checks are turned off");
    expect(render({ ...base, version: null, update: { mode: "disabled" } }).text)
      .toContain("Development build");
  });
});

describe("waiting for the restarted server", () => {
  it("polls through restart failures until the new version answers", async () => {
    const answers: Array<AppInfoResult | Error> = [
      new Error("Request failed with status 502"),
      { ...base },
      { ...base, version: "0.1.18" }
    ];
    const api = {
      getAppInfo: vi.fn(async () => {
        const answer = answers.shift()!;
        if (answer instanceof Error) throw answer;
        return answer;
      })
    };

    await waitForAppVersion(api, "0.1.18", { sleep: async () => undefined });

    expect(api.getAppInfo).toHaveBeenCalledTimes(3);
  });

  it("gives up with guidance when the server never reports the new version", async () => {
    const api = { getAppInfo: vi.fn(async () => base) };

    await expect(waitForAppVersion(api, "0.1.18", {
      intervalMs: 1,
      timeoutMs: 3,
      sleep: async () => undefined
    })).rejects.toThrow("did not come back");
  });
});
