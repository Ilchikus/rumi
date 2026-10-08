import { useCallback, useEffect, useState } from "react";
import { RumiApiError, type RumiApiClient } from "@rumi/api-client";
import type { AppInfoResult } from "@rumi/contracts";

/** Fallback when a failed request carries no install-specific command from the server. */
export const MANUAL_UPDATE_COMMAND = "npm install --global @rumi-md/server@latest";

export type AppUpdateState =
  | { status: "idle" }
  | { status: "updating" }
  | { status: "restarting"; version: string }
  | { status: "error"; message: string; installFailed: boolean; command?: string };

export interface AppUpdateController {
  info: AppInfoResult | null;
  state: AppUpdateState;
  update: () => void;
}

interface WaitOptions {
  intervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Loads the running and latest Rumi versions and drives an in-app update:
 * flush pending work, install, wait for the restarted server to report the
 * new version, then reload so the new web client is used.
 */
export function useAppUpdate(
  api: RumiApiClient,
  beforeUpdate: () => Promise<boolean>
): AppUpdateController {
  const [info, setInfo] = useState<AppInfoResult | null>(null);
  const [state, setState] = useState<AppUpdateState>({ status: "idle" });

  useEffect(() => {
    let active = true;
    api.getAppInfo().then(
      (nextInfo) => {
        if (active) setInfo(nextInfo);
      },
      () => undefined
    );
    return () => {
      active = false;
    };
  }, [api]);

  const update = useCallback(() => {
    void (async () => {
      setState({ status: "updating" });

      try {
        if (!(await beforeUpdate())) {
          setState({
            status: "error",
            message: "Rumi could not save the open page, so the update did not start.",
            installFailed: false
          });
          return;
        }
      } catch (error) {
        setState({ status: "error", message: errorMessage(error), installFailed: false });
        return;
      }

      let version: string;
      try {
        version = (await api.updateApp()).version;
      } catch (error) {
        const command = error instanceof RumiApiError ? error.details?.command : undefined;
        setState({
          status: "error",
          message: errorMessage(error),
          installFailed: true,
          ...(typeof command === "string" ? { command } : {})
        });
        return;
      }

      setState({ status: "restarting", version });
      try {
        await waitForAppVersion(api, version);
        window.location.reload();
      } catch (error) {
        setState({ status: "error", message: errorMessage(error), installFailed: false });
      }
    })();
  }, [api, beforeUpdate]);

  return { info, state, update };
}

export async function waitForAppVersion(
  api: Pick<RumiApiClient, "getAppInfo">,
  version: string,
  { intervalMs = 1_000, timeoutMs = 90_000, sleep = delay }: WaitOptions = {}
): Promise<void> {
  for (let waited = 0; waited < timeoutMs; waited += intervalMs) {
    await sleep(intervalMs);

    try {
      if ((await api.getAppInfo()).version === version) return;
    } catch {
      // The server is unavailable while it restarts.
    }
  }

  throw new Error(
    `Rumi ${version} was installed but did not come back. Check the server, then reload this page.`
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
