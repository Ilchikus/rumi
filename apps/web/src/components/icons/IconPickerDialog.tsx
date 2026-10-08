import { useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { UploadSimple } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { useEmojiCatalog } from "../emoji/emojiCatalogLoader";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { cn } from "../../lib/utils";
import {
  WORKSPACE_ICON_COLORS,
  getSavedIconColor,
  parseWorkspaceIcon,
  phosphorIconValue,
  saveIconColor,
  type WorkspaceIconColor
} from "../../lib/workspaceIcons";
import { searchPhosphorIcons, usePhosphorCatalog } from "./phosphorCatalog";
import { WorkspaceIcon } from "./WorkspaceIcon";

type IconPickerTab = "emoji" | "icons" | "upload";

const RESULT_LIMIT = 480;
const TABS: ReadonlyArray<{ id: IconPickerTab; label: string }> = [
  { id: "emoji", label: "Emoji" },
  { id: "icons", label: "Icons" },
  { id: "upload", label: "Upload" }
];
const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.svg,.avif,image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/avif";

/** Rendered only while open; closing unmounts it, so each opening starts fresh. */
export interface IconPickerDialogProps {
  itemName: string;
  currentIcon?: string | undefined;
  onOpenChange: (open: boolean) => void;
  /** A new icon value, or null to remove the current one. */
  onSelect: (icon: string | null) => void;
  /** Uploads an image through the workspace upload rules and returns its asset path. */
  onUpload: (file: File) => Promise<string>;
}

export function IconPickerDialog({
  itemName,
  currentIcon,
  onOpenChange,
  onSelect,
  onUpload
}: IconPickerDialogProps): ReactElement {
  const parsedCurrentIcon = parseWorkspaceIcon(currentIcon);
  const currentIconName = parsedCurrentIcon?.type === "phosphor" ? parsedCurrentIcon.name : null;
  const [tab, setTab] = useState<IconPickerTab>(() =>
    parsedCurrentIcon?.type === "phosphor" ? "icons" : parsedCurrentIcon?.type === "asset" ? "upload" : "emoji"
  );
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [color, setColor] = useState<WorkspaceIconColor>(getSavedIconColor);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiCatalog = useEmojiCatalog();
  const catalog = usePhosphorCatalog();

  const emojiResults = useMemo(
    () =>
      !emojiCatalog
        ? []
        : query.trim()
          ? emojiCatalog.searchEmoji(query, { limit: RESULT_LIMIT })
          : emojiCatalog.EMOJI_CATALOG.slice(0, RESULT_LIMIT),
    [emojiCatalog, query]
  );
  const iconResults = useMemo(
    () => (catalog ? searchPhosphorIcons(catalog, query, RESULT_LIMIT) : []),
    [catalog, query]
  );
  const resultsLoading = tab === "emoji" ? !emojiCatalog : !catalog;
  const resultCount = tab === "emoji" ? emojiResults.length : iconResults.length;

  const select = (icon: string | null) => {
    onSelect(icon);
    onOpenChange(false);
  };

  const chooseColor = (next: WorkspaceIconColor) => {
    setColor(next);
    saveIconColor(next);
  };

  const selectFirstResult = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (tab === "emoji" && emojiResults[0]) select(emojiResults[0].emoji);
    if (tab === "icons" && iconResults[0]) select(phosphorIconValue(iconResults[0].name, color));
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      select(await onUpload(file));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-3 p-3" data-icon-picker="">
        <div className="flex items-center justify-between gap-3 px-1">
          <DialogTitle className="truncate text-sm font-medium">Icon for {itemName}</DialogTitle>
          {currentIcon ? (
            <Button
              type="button"
              variant="ghost"
              className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => select(null)}
            >
              Remove
            </Button>
          ) : null}
        </div>
        <DialogDescription className="sr-only">
          Choose an emoji, an icon, or an uploaded image for this item.
        </DialogDescription>

        <div className="flex gap-1 rounded-md bg-muted p-0.5" role="tablist" aria-label="Icon source">
          {TABS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={tab === option.id}
              className={cn(
                "h-7 flex-1 rounded text-xs transition-colors",
                tab === option.id
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setTab(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* One fixed-height body for every tab and loading state, so the dialog never resizes. */}
        <div className="flex h-[23rem] flex-col gap-3" data-icon-picker-body="">
          {tab === "upload" ? (
            <div className="grid flex-1 content-center justify-items-center gap-3 rounded-md border border-dashed border-border px-4 py-8 text-center">
              <p className="text-xs leading-5 text-muted-foreground">
                Use a square PNG, JPG, GIF, WebP, or SVG image. It is saved to Uploads with the
                workspace upload settings.
              </p>
              <Button type="button" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                <UploadSimple size={16} />
                {uploading ? "Uploading…" : "Choose image"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={IMAGE_ACCEPT}
                className="hidden"
                onChange={(event) => void upload(event.currentTarget.files?.[0])}
              />
              {uploadError ? <p role="alert" className="text-xs text-destructive">{uploadError}</p> : null}
            </div>
          ) : (
            <>
              <Input
                autoFocus
                value={query}
                placeholder={tab === "emoji" ? "Search emoji" : "Search icons"}
                aria-label={tab === "emoji" ? "Search emoji" : "Search icons"}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={selectFirstResult}
              />
              {tab === "icons" ? <IconColorPicker value={color} onChange={chooseColor} /> : null}
              <div
                className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] content-start gap-0.5 overflow-y-auto"
                role="listbox"
                aria-label={tab === "emoji" ? "Emoji" : "Icons"}
              >
                {tab === "emoji"
                  ? emojiResults.map((item) => (
                      <PickerOption
                        key={`${item.emoji}-${item.order}`}
                        label={item.name}
                        selected={currentIcon === item.emoji}
                        onSelect={() => select(item.emoji)}
                      >
                        <span className="text-xl leading-none">{item.emoji}</span>
                      </PickerOption>
                    ))
                  : iconResults.map((item) => {
                      const value = phosphorIconValue(item.name, color);
                      return (
                        <PickerOption
                          key={item.name}
                          label={item.name.replace(/-/gu, " ")}
                          selected={currentIconName === item.name}
                          onSelect={() => select(value)}
                        >
                          <WorkspaceIcon icon={value} size={20} className="text-muted-foreground" />
                        </PickerOption>
                      );
                    })}
                {resultsLoading ? (
                  <p className="col-span-full py-6 text-center text-xs text-muted-foreground">
                    {tab === "emoji" ? "Loading emoji…" : "Loading icons…"}
                  </p>
                ) : resultCount === 0 ? (
                  <p className="col-span-full py-6 text-center text-xs text-muted-foreground">Nothing found</p>
                ) : null}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IconColorPicker({
  value,
  onChange
}: {
  value: WorkspaceIconColor;
  onChange: (color: WorkspaceIconColor) => void;
}): ReactElement {
  return (
    <div
      className="grid justify-items-center"
      style={{ gridTemplateColumns: `repeat(${WORKSPACE_ICON_COLORS.length}, minmax(0, 1fr))` }}
      role="radiogroup"
      aria-label="Icon color"
      data-icon-color-picker=""
    >
      {WORKSPACE_ICON_COLORS.map((option) => (
        <button
          key={option.name}
          type="button"
          role="radio"
          aria-checked={value === option.name}
          aria-label={option.name}
          title={option.name[0]!.toUpperCase() + option.name.slice(1)}
          className={cn(
            "grid aspect-square w-full max-w-5 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === option.name && "ring-[1.5px] ring-current"
          )}
          style={{ color: option.hex }}
          onClick={() => onChange(option.name)}
        >
          <span className="h-[70%] w-[70%] rounded-full bg-current" />
        </button>
      ))}
    </div>
  );
}

function PickerOption({
  label,
  selected,
  onSelect,
  children
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  children: ReactElement;
}): ReactElement {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-9 place-items-center rounded-md transition-colors [content-visibility:auto] hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
        selected && "bg-accent"
      )}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}
