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

  it("uses a switch for misspellings, Sky checkboxes for formats, and saves blank as unlimited", () => {
    expect(viewSource).toContain('type="checkbox"');
    expect(viewSource).toContain("accent-sky-600");
    expect(viewSource).toContain('trimmedSize === "" ? null');
    expect(viewSource).toContain("Zero disables uploads");
    expect(viewSource).toContain("{extension}");
    expect(viewSource).not.toContain("toUpperCase");
    expect(viewSource).toContain("grid-cols-2");
    expect(viewSource).toContain("highlightMisspellings");
    expect(viewSource).toContain("onSave({");
    expect(viewSource).toContain("<Check");
    expect(viewSource).toContain("<FloppyDisk");
    expect(viewSource).toContain("{saved ? (");
    expect(viewSource).not.toContain("Saving…");
    expect(viewSource).not.toContain("Save settings");
    expect(viewSource).toContain("}, 1000)");
    expect(appSource).not.toContain('toast.success("Settings saved")');
  });

  it("persists without replacing or disabling the live settings form", () => {
    expect(appSource.match(/setWorkspaceSettingsResult\(result\)/g)).toHaveLength(1);
    expect(appSource).toContain(
      "setHighlightMisspellings(result.settings.editor.highlightMisspellings)"
    );
    expect(appSource).toContain(
      "setInlineReplacements(result.settings.editor.inlineReplacements)"
    );
    expect(appSource).toContain(
      "setEmojiSuggestions(result.settings.editor.emojiSuggestions)"
    );
    expect(appSource).toContain("settingsSaveInFlightRef.current");
    expect(viewSource).not.toContain("saving:");
    expect(viewSource).not.toContain("disabled={saving}");
  });

  it("wires workspace settings and highlighting into the editor", () => {
    expect(viewSource).toContain("highlightMisspellings");
    expect(viewSource).toContain("inlineReplacements");
    expect(viewSource).toContain("emojiSuggestions");
    expect(appSource).toContain("api.getWorkspaceSettings()");
    expect(appSource).toContain("api.updateWorkspaceSettings(settings)");
    expect(appSource).toContain("highlightMisspellings={highlightMisspellings}");
    expect(appSource).toContain("inlineReplacements={inlineReplacements}");
    expect(appSource).toContain("emojiSuggestions={emojiSuggestions}");
    expect(appSource).toContain("showReservedSystemRouteToast");
    expect(appSource).toContain("is reserved for the system page");
    expect(appSource).toContain('href={route.url}');
    expect(appSource).toContain('route?.view === "settings"');
    expect(appSource).toContain('? "/settings"');
  });
});
