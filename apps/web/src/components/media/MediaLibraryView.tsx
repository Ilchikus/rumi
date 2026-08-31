import { useEffect, useState } from "react";
import type { FormEvent, ReactElement } from "react";
import { ArrowSquareOut } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { DotsThree } from "@phosphor-icons/react/dist/csr/DotsThree";
import { DownloadSimple } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { File } from "@phosphor-icons/react/dist/csr/File";
import { FilePdf } from "@phosphor-icons/react/dist/csr/FilePdf";
import { FilmStrip } from "@phosphor-icons/react/dist/csr/FilmStrip";
import { Image } from "@phosphor-icons/react/dist/csr/Image";
import { LinkSimple } from "@phosphor-icons/react/dist/csr/LinkSimple";
import { PencilSimple } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import type { AssetListItem } from "@rumi/contracts";
import { EditorPageLayout } from "../layout/EditorPageLayout";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import { assetEndpointUrl } from "../../lib/mediaAssets";

type MediaLoadState = "idle" | "loading" | "error";

export interface MediaLibraryViewProps {
  assets: AssetListItem[];
  loadState: MediaLoadState;
  renamingPath: string | null;
  movingToTrashPath: string | null;
  onReload: () => void;
  onPreview: (asset: AssetListItem) => void;
  onDownload: (asset: AssetListItem) => void;
  onCopyUrl: (asset: AssetListItem) => void;
  onCopyRelativePath: (asset: AssetListItem) => void;
  onRename: (asset: AssetListItem, nextName: string) => Promise<boolean>;
  onMoveToTrash: (asset: AssetListItem) => Promise<void>;
}

export function MediaLibraryView({
  assets,
  loadState,
  renamingPath,
  movingToTrashPath,
  onReload,
  onPreview,
  onDownload,
  onCopyUrl,
  onCopyRelativePath,
  onRename,
  onMoveToTrash
}: MediaLibraryViewProps): ReactElement {
  const [renameTarget, setRenameTarget] = useState<AssetListItem | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    setRenameValue(renameTarget?.fileName ?? "");
  }, [renameTarget]);

  const submitRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!renameTarget || renamingPath) return;
    if (await onRename(renameTarget, renameValue)) setRenameTarget(null);
  };

  return (
    <EditorPageLayout title="Uploads">
      <p className="text-sm text-muted-foreground">
        Browse workspace uploads, copy their references, or move them to Trash.
      </p>

      <div className="mt-8">
        {loadState === "loading" && assets.length === 0 ? (
          <p className="min-h-40 py-6 text-sm text-muted-foreground" role="status">
            Loading Uploads…
          </p>
        ) : loadState === "error" && assets.length === 0 ? (
          <div className="py-6">
            <p className="text-sm text-muted-foreground">Uploads could not be loaded.</p>
            <Button type="button" variant="ghost" className="mt-3" onClick={onReload}>
              Try again
            </Button>
          </div>
        ) : assets.length === 0 ? (
          <div className="grid place-items-center px-6 py-16 text-center">
            <Image size={28} className="text-muted-foreground" />
            <p className="mt-3 font-medium">No uploads yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Files uploaded from the editor will appear here.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {assets.map((asset) => {
              const busy = renamingPath === asset.path || movingToTrashPath === asset.path;
              return (
                <li
                  key={asset.path}
                  className="group overflow-hidden rounded-lg border border-border bg-background"
                >
                  <button
                    type="button"
                    className="grid h-36 w-full place-items-center overflow-hidden bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    aria-label={`Preview ${asset.fileName}`}
                    onClick={() => onPreview(asset)}
                  >
                    {isImageAsset(asset) ? (
                      <img
                        src={assetEndpointUrl(asset.path)}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <MediaTypeIcon asset={asset} size={32} />
                    )}
                  </button>

                  <div className="flex items-start gap-2 p-3">
                    <MediaTypeIcon asset={asset} size={17} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={asset.fileName}>
                        {asset.fileName}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground" title={asset.path}>
                        {formatAssetSize(asset.size)} · {assetTypeLabel(asset)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatAssetModifiedAt(asset.modifiedAt)}
                      </p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          aria-label={`Actions for ${asset.fileName}`}
                          disabled={busy}
                        >
                          <DotsThree size={18} weight="bold" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => onPreview(asset)}>
                          <ArrowSquareOut size={16} />
                          Preview / Open
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onDownload(asset)}>
                          <DownloadSimple size={16} />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onCopyUrl(asset)}>
                          <LinkSimple size={16} />
                          Copy URL
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onCopyRelativePath(asset)}>
                          <Copy size={16} />
                          Copy relative path
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setRenameTarget(asset)}>
                          <PencilSimple size={16} />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => void onMoveToTrash(asset)}
                        >
                          <Trash size={16} />
                          Move to Trash
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => {
          if (!open && !renamingPath) setRenameTarget(null);
        }}
      >
        <DialogContent>
          <form onSubmit={(event) => void submitRename(event)}>
            <DialogHeader>
              <DialogTitle>Rename upload</DialogTitle>
              <DialogDescription>
                References in workspace pages will be updated to the path Rumi selects.
              </DialogDescription>
            </DialogHeader>
            <Input
              className="mt-4"
              aria-label="Upload file name"
              autoFocus
              value={renameValue}
              disabled={Boolean(renamingPath)}
              onChange={(event) => setRenameValue(event.target.value)}
            />
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                disabled={Boolean(renamingPath)}
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={Boolean(renamingPath) || renameValue.trim().length === 0}
              >
                {renamingPath ? "Renaming" : "Rename"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </EditorPageLayout>
  );
}

export function formatAssetSize(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "Unknown size";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB"] as const;
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatAssetModifiedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown modification time";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function assetTypeLabel(asset: Pick<AssetListItem, "contentType" | "fileName">): string {
  const extension = asset.fileName.split(".").at(-1)?.toLocaleUpperCase();
  if (asset.contentType === "application/pdf") return "PDF";
  if (asset.contentType.startsWith("image/")) return extension ? `${extension} image` : "Image";
  if (asset.contentType.startsWith("video/")) return extension ? `${extension} video` : "Video";
  return extension || "File";
}

function isImageAsset(asset: AssetListItem): boolean {
  return asset.contentType.startsWith("image/");
}

function MediaTypeIcon({ asset, size }: { asset: AssetListItem; size: number }): ReactElement {
  const className = "shrink-0 text-neutral-400";
  if (asset.contentType === "application/pdf") return <FilePdf size={size} className={className} />;
  if (asset.contentType.startsWith("video/")) return <FilmStrip size={size} className={className} />;
  if (asset.contentType.startsWith("image/")) return <Image size={size} className={className} />;
  return <File size={size} className={className} />;
}
