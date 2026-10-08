import { useState, type ReactElement } from "react";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { Button } from "../ui/button";
import { MANUAL_UPDATE_COMMAND, type AppUpdateController } from "../../lib/appUpdate";

export function AppVersionSetting({ info, state, update }: AppUpdateController): ReactElement | null {
  const [copied, setCopied] = useState(false);

  if (!info) return null;

  const busy = state.status === "updating" || state.status === "restarting";
  const manualCommand = state.status === "error"
    ? state.installFailed ? state.command ?? MANUAL_UPDATE_COMMAND : undefined
    : info.updateAvailable && info.update.mode === "manual"
      ? info.update.command
      : undefined;
  const copyCommand = (command: string) => {
    void navigator.clipboard?.writeText(command).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    }, () => undefined);
  };

  let description: string;
  if (state.status === "updating") {
    description = `Installing Rumi ${info.latestVersion ?? ""}…`;
  } else if (state.status === "restarting") {
    description = `Rumi ${state.version} is installed. Restarting and reloading this page…`;
  } else if (state.status === "error") {
    description = state.installFailed
      ? `${state.message} You can update from a terminal instead:`
      : state.message;
  } else if (!info.version) {
    description = "Development build. Updates are managed by the source checkout.";
  } else if (info.updateAvailable && info.update.mode === "self") {
    description = `Rumi ${info.latestVersion} is available. Updating restarts the server and reloads this page.`;
  } else if (info.updateAvailable && info.update.mode === "manual") {
    description = `Rumi ${info.latestVersion} is available. Run this command, then restart Rumi:`;
  } else if (info.update.mode === "disabled") {
    description = "Update checks are turned off for this server.";
  } else if (info.latestVersion) {
    description = "Rumi is up to date.";
  } else {
    description = "Rumi could not check npm for a newer version.";
  }

  return (
    <div className="space-y-1.5" data-app-version="">
      <div className="flex items-center justify-between gap-6">
        <span className="text-sm font-medium">Version</span>
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums text-muted-foreground">{info.version ?? "dev"}</span>
          {info.updateAvailable && info.update.mode === "self" ? (
            <Button type="button" variant="outline" disabled={busy} onClick={update}>
              {state.status === "updating"
                ? "Updating…"
                : state.status === "restarting"
                  ? "Restarting…"
                  : state.status === "error"
                    ? "Try again"
                    : `Update to ${info.latestVersion}`}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs leading-5 text-muted-foreground" role={state.status === "error" ? "alert" : undefined}>
        {description}
      </p>
      {manualCommand ? (
        <div className="flex items-center gap-2 pt-1">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 font-mono text-xs">
            {manualCommand}
          </code>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            aria-label="Copy update command"
            onClick={() => copyCommand(manualCommand)}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
