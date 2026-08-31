import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AssetListItem } from "@rumi/contracts";
import {
  assetTypeLabel,
  formatAssetModifiedAt,
  formatAssetSize,
  MediaLibraryView
} from "./MediaLibraryView";
import { assetEndpointUrl, mediaAssetCopyValue } from "../../lib/mediaAssets";

const viewSource = readFileSync(new URL("./MediaLibraryView.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");

const image: AssetListItem = {
  path: ".assets/album/photo one.png",
  fileName: "photo one.png",
  contentType: "image/png",
  size: 1536,
  modifiedAt: "2026-08-22T10:00:00.000Z"
};

const handlers = {
  onReload: vi.fn(),
  onPreview: vi.fn(),
  onDownload: vi.fn(),
  onCopyUrl: vi.fn(),
  onCopyRelativePath: vi.fn(),
  onRename: vi.fn(async () => true),
  onMoveToTrash: vi.fn(async () => undefined)
};

describe("MediaLibraryView", () => {
  it("renders loading, error, and empty states in the editor page layout", () => {
    const loading = renderView([], "loading");
    const error = renderView([], "error");
    const empty = renderView([], "idle");

    expect(loading).toContain('data-rumi-system-page="Uploads"');
    expect(loading).toContain("Loading Uploads…");
    expect(loading).toContain('role="status"');
    expect(error).toContain("Uploads could not be loaded.");
    expect(error).toContain("Try again");
    expect(empty).toContain("No uploads yet");
  });

  it("uses endpoint-backed lazy image previews and compact metadata", () => {
    const markup = renderView([image], "idle");

    expect(markup).toContain('aria-label="Preview photo one.png"');
    expect(markup).toContain('src="/api/asset?path=.assets%2Falbum%2Fphoto+one.png"');
    expect(markup).toContain('loading="lazy"');
    expect(markup).toContain("1.5 KB");
    expect(markup).toContain("PNG image");
    expect(markup).not.toContain("2026-08-22T10:00:00.000Z");
    expect(markup).toContain('aria-label="Actions for photo one.png"');
  });

  it("formats canonical URL, size, type, and modification values", () => {
    expect(assetEndpointUrl(image.path)).toBe(
      "/api/asset?path=.assets%2Falbum%2Fphoto+one.png"
    );
    expect(mediaAssetCopyValue("url", {
      origin: "https://notes.example",
      path: image.path
    })).toBe("https://notes.example/api/asset?path=.assets%2Falbum%2Fphoto+one.png");
    expect(mediaAssetCopyValue("relative-path", {
      origin: "https://notes.example",
      path: image.path
    })).toBe(image.path);
    expect(formatAssetSize(0)).toBe("0 B");
    expect(formatAssetSize(1024)).toBe("1.0 KB");
    expect(formatAssetSize(12 * 1024 * 1024)).toBe("12 MB");
    expect(formatAssetSize(-1)).toBe("Unknown size");
    expect(formatAssetModifiedAt("bad")).toBe("Unknown modification time");
    expect(formatAssetModifiedAt(image.modifiedAt)).not.toBe("Unknown modification time");
    expect(assetTypeLabel(image)).toBe("PNG image");
    expect(assetTypeLabel({ fileName: "clip.webm", contentType: "video/webm" }))
      .toBe("WEBM video");
    expect(assetTypeLabel({ fileName: "manual.pdf", contentType: "application/pdf" }))
      .toBe("PDF");
  });

  it("offers every keyboard-accessible item action and wires App mutations", () => {
    for (const label of [
      "Preview / Open",
      "Download",
      "Copy URL",
      "Copy relative path",
      "Rename",
      "Move to Trash"
    ]) {
      expect(viewSource).toContain(label);
    }
    expect(viewSource).toContain("<DropdownMenuItem");
    expect(viewSource).toContain("onRename(renameTarget, renameValue)");
    expect(appSource).toContain("api.renameNode({ path: asset.path, newName: nextName })");
    expect(appSource).toContain("api.deleteNode({ path: asset.path })");
    expect(appSource).toContain("Promise.all([loadAssets(), loadTrash()])");
    expect(appSource).toContain("navigator.clipboard.writeText(value)");
  });

  it("refreshes inventory for uploads, normalized events, rename, delete, and restore", () => {
    expect(appSource).toContain('if (event.name === "asset.changed")');
    expect(appSource).toContain('event.name === "workspace.treeChanged"');
    expect(appSource).toContain("await Promise.all([loadTree(), loadAssets()])");
    expect(appSource).toContain("await Promise.all([loadTree(), loadAssets(), loadTrash()])");
    expect(appSource).toContain("const result = await api.uploadAsset(file.name, file);");
    expect(appSource).toContain("await loadAssets();");
  });
});

function renderView(assets: AssetListItem[], loadState: "idle" | "loading" | "error"): string {
  return renderToStaticMarkup(createElement(MediaLibraryView, {
    assets,
    loadState,
    renamingPath: null,
    movingToTrashPath: null,
    ...handlers
  }));
}
