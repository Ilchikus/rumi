import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync(
  new URL("./WorkspaceSettingsView.tsx", import.meta.url),
  "utf8"
);
const appSource = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");

describe("workspace settings page", () => {
  it("uses the editor page layout and setting rows instead of a dialog or sections", () => {
    expect(viewSource).toContain('<EditorPageLayout title="Settings">');
    expect(viewSource).not.toContain("<Dialog");
    expect(viewSource).not.toContain("<section");
    expect(viewSource).toContain("Highlight misspelled words");
    expect(viewSource).toContain("Enable inline replacements");
    expect(viewSource).toContain("Enable emoji suggestions");
    expect(viewSource).toContain("Editor toolbar");
    expect(viewSource).not.toContain("Inline toolbar");
    expect(viewSource).toContain("Open on start");
    expect(viewSource).toContain('{ value: "last-visited", label: "Last visited" }');
    expect(viewSource).toContain('{ value: "home", label: "Home" }');
    expect(viewSource).toContain('{ value: "floating", label: "Floating" }');
    expect(viewSource).toContain('{ value: "top", label: "Top" }');
    expect(viewSource).toContain('{ value: "bottom", label: "Bottom" }');
    expect(viewSource).toContain('{ value: "none", label: "None" }');
    expect(viewSource).toContain("<DropdownMenu>");
    expect(viewSource).toContain("<DropdownMenuContent");
    expect(viewSource).not.toContain("<select");
    expect(viewSource).toContain("Maximum file size");
    expect(viewSource).toContain("Allowed file formats");
    expect(viewSource).toContain("text-xs");
    expect(viewSource).not.toContain("grid-cols-[10rem_minmax(0,1fr)_auto]");
    expect(viewSource).toContain("flex items-center justify-between");
    expect(viewSource).toContain("<Switch");
    expect(viewSource).toContain("animate={animateMisspellings}");
    expect(viewSource).toContain("setAnimateMisspellings(false)");
    expect(viewSource).toContain("setHighlightMisspellings(checked)");
    expect(viewSource).toContain("setInlineReplacements(checked)");
    expect(viewSource).toContain("setEmojiSuggestions(checked)");
  });

  it("uses a switch for misspellings, Blue checkboxes for formats, and auto-saves blank as unlimited", () => {
    expect(viewSource).toContain('type="checkbox"');
    expect(viewSource).toContain("accent-sky-600");
    expect(viewSource).toContain('trimmedSize === "" ? null');
    expect(viewSource).toContain("Zero disables uploads");
    expect(viewSource).toContain("{extension}");
    expect(viewSource).not.toContain("toUpperCase");
    expect(viewSource).toContain("grid-cols-2");
    expect(viewSource).toContain("highlightMisspellings");
    expect(viewSource).toContain("onSave({");
    expect(viewSource).toContain("}, startupPageMode)");
    expect(viewSource).toContain("<Check");
    expect(viewSource).not.toContain("<FloppyDisk");
    expect(viewSource).not.toContain('type="submit"');
    expect(viewSource).not.toContain("{saved ? (");
    expect(viewSource).not.toContain("Saving…");
    expect(viewSource).not.toContain("Save settings");
    expect(viewSource).not.toMatch(/>\s*Save\s*</);
    expect(viewSource).toContain("changeRevision");
    expect(viewSource).toContain("markChanged");
    expect(viewSource).toContain("void onSave({");
    expect(appSource).not.toContain('toast.success("Settings saved")');
  });

  it("serializes auto-save requests without replacing or disabling the live settings form", () => {
    expect(appSource.match(/setWorkspaceSettingsResult\(result\)/g)).toHaveLength(1);
    expect(appSource.match(/setCachedWorkspaceSettings\(result\.settings\)/g)).toHaveLength(2);
    expect(appSource).toContain(
      "setHighlightMisspellings(result.settings.editor.highlightMisspellings)"
    );
    expect(appSource).toContain(
      "setInlineReplacements(result.settings.editor.inlineReplacements)"
    );
    expect(appSource).toContain(
      "setEmojiSuggestions(result.settings.editor.emojiSuggestions)"
    );
    expect(appSource).toContain(
      "setEditorToolbar(result.settings.editor.inlineToolbar)"
    );
    expect(appSource).toContain("settingsSaveQueueRef.current.then");
    expect(appSource).not.toContain("settingsSaveInFlightRef.current");
    expect(viewSource).not.toContain("saving:");
    expect(viewSource).not.toContain("disabled={saving}");
  });

  it("wires workspace settings and highlighting into the editor", () => {
    expect(viewSource).toContain("highlightMisspellings");
    expect(viewSource).toContain("inlineReplacements");
    expect(viewSource).toContain("emojiSuggestions");
    expect(viewSource).toContain("editorToolbar");
    expect(appSource).toContain("api.getWorkspaceSettings()");
    expect(appSource).toContain("api.updateWorkspaceSettings(settings)");
    expect(appSource).toContain("writeStartupPageMode");
    expect(appSource).toContain("highlightMisspellings={highlightMisspellings}");
    expect(appSource).toContain("inlineReplacements={inlineReplacements}");
    expect(appSource).toContain("emojiSuggestions={emojiSuggestions}");
    expect(appSource).toContain("editorToolbar={editorToolbar}");
    expect(appSource).toContain("allowedUploadFileTypes={allowedUploadFileTypes}");
    expect(appSource).toContain("showReservedSystemRouteToast");
    expect(appSource).toContain("is reserved for the system page");
    expect(appSource).toContain('href={route.url}');
    expect(appSource).toContain('route?.view === "settings"');
    expect(appSource).toContain('? "/settings"');
  });
});
