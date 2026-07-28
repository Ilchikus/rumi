import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, ReactElement } from "react";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { FloppyDisk } from "@phosphor-icons/react/dist/csr/FloppyDisk";
import type { WorkspaceSettings, WorkspaceSettingsResult } from "@rumi/contracts";
import { EditorPageLayout } from "../layout/EditorPageLayout";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";

type SettingsLoadState = "idle" | "loading" | "error";

export interface WorkspaceSettingsViewProps {
  result: WorkspaceSettingsResult | null;
  loadState: SettingsLoadState;
  onReload: () => void;
  onSave: (settings: WorkspaceSettings) => Promise<boolean>;
}

export function WorkspaceSettingsView({
  result,
  loadState,
  onReload,
  onSave
}: WorkspaceSettingsViewProps): ReactElement {
  const [maxFileSizeInput, setMaxFileSizeInput] = useState("");
  const [allowedFileTypes, setAllowedFileTypes] = useState<string[]>([]);
  const [highlightMisspellings, setHighlightMisspellings] = useState(false);
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState(false);
  const [animateMisspellings, setAnimateMisspellings] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchAnimationFrameRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    if (switchAnimationFrameRef.current !== null) {
      cancelAnimationFrame(switchAnimationFrameRef.current);
    }
  }, []);

  useLayoutEffect(() => {
    if (!result) return;
    if (switchAnimationFrameRef.current !== null) {
      cancelAnimationFrame(switchAnimationFrameRef.current);
    }
    setAnimateMisspellings(false);
    setMaxFileSizeInput(
      result.settings.uploads.maxFileSizeMb === null
        ? ""
        : String(result.settings.uploads.maxFileSizeMb)
    );
    setAllowedFileTypes([...result.settings.uploads.allowedFileTypes]);
    setHighlightMisspellings(result.settings.editor.highlightMisspellings);
    setFormError("");
    switchAnimationFrameRef.current = requestAnimationFrame(() => {
      switchAnimationFrameRef.current = null;
      setAnimateMisspellings(true);
    });
  }, [result]);

  const supportedFileTypes = result?.constraints.uploads.supportedFileTypes ?? [];

  const clearSavedState = () => {
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
    setSaved(false);
  };

  const toggleFileType = (extension: string) => {
    clearSavedState();
    setAllowedFileTypes((current) => (
      current.includes(extension)
        ? current.filter((item) => item !== extension)
        : supportedFileTypes.filter((item) => item === extension || current.includes(item))
    ));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!result) return;

    const trimmedSize = maxFileSizeInput.trim();
    const maxFileSizeMb = trimmedSize === "" ? null : Number(trimmedSize);
    if (
      maxFileSizeMb !== null &&
      (!Number.isSafeInteger(maxFileSizeMb) || maxFileSizeMb < 0)
    ) {
      setFormError("Maximum file size must be blank or a non-negative whole number.");
      return;
    }

    setFormError("");
    clearSavedState();
    const didSave = await onSave({
      uploads: {
        maxFileSizeMb,
        allowedFileTypes
      },
      editor: {
        highlightMisspellings
      }
    });
    if (!didSave) return;

    setSaved(true);
    savedTimerRef.current = setTimeout(() => {
      savedTimerRef.current = null;
      setSaved(false);
    }, 1000);
  };

  return (
    <EditorPageLayout title="Settings">
      {loadState === "loading" && !result ? (
        <p className="py-6 text-sm text-muted-foreground">Loading settings…</p>
      ) : loadState === "error" || !result ? (
        <div className="py-6">
          <p className="text-sm text-muted-foreground">Settings could not be loaded.</p>
          <Button type="button" variant="ghost" className="mt-3" onClick={onReload}>
            Try again
          </Button>
        </div>
      ) : (
        <form className="space-y-10" onSubmit={submit}>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-6">
              <label htmlFor="highlight-misspellings" className="text-sm font-medium">
                Misspellings
              </label>
              <Switch
                id="highlight-misspellings"
                animate={animateMisspellings}
                checked={highlightMisspellings}
                aria-label="Highlight misspelled words"
                onCheckedChange={(checked) => {
                  clearSavedState();
                  setHighlightMisspellings(checked);
                }}
              />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Show browser spelling suggestions and red underlines while editing.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-6">
              <label htmlFor="maximum-upload-size" className="text-sm font-medium">
                Maximum file size
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="maximum-upload-size"
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder="No limit"
                  value={maxFileSizeInput}
                  className="w-28 text-right tabular-nums"
                  onChange={(event) => {
                    clearSavedState();
                    setMaxFileSizeInput(event.currentTarget.value);
                  }}
                />
                <span className="text-xs text-muted-foreground">MB</span>
              </div>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Blank allows any size. Zero disables uploads.
            </p>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-sm font-medium">Allowed file formats</h2>
            <p className="text-xs leading-5 text-muted-foreground">
              Clear every checkbox to disable uploads. Existing files remain readable.
            </p>
            <div className="grid max-w-xs grid-cols-2 gap-x-8 gap-y-2.5 pt-2">
              {supportedFileTypes.map((extension) => (
                <label
                  key={extension}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={allowedFileTypes.includes(extension)}
                    className="h-4 w-4 shrink-0 accent-sky-600"
                    onChange={() => toggleFileType(extension)}
                  />
                  <span>{extension}</span>
                </label>
              ))}
            </div>
          </div>

          {formError ? (
            <p role="alert" className="text-sm text-destructive">{formError}</p>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" className="min-w-24">
              {saved ? (
                <>
                  <Check size={15} weight="bold" />
                  Saved
                </>
              ) : (
                <>
                  <FloppyDisk size={15} />
                  Save
                </>
              )}
            </Button>
          </div>
        </form>
      )}
    </EditorPageLayout>
  );
}
