import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebarSource = readFileSync(new URL("./Sidebar.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
const editableTitleSource = readFileSync(
  new URL("../editor/EditablePageTitle.tsx", import.meta.url),
  "utf8"
);

describe("sidebar create-menu shortcuts", () => {
  it("keeps the root create menu controlled by the browser shell", () => {
    expect(sidebarSource).toContain("<DropdownMenu open={open} onOpenChange={onOpenChange}>");
    expect(appSource).toContain('action === "open-create-menu"');
    expect(appSource).toContain("setRootCreateMenuOpen(true)");
  });

  it("supports numbered focus and primary-modifier immediate creation", () => {
    expect(sidebarSource).toContain("createMenuIndexForKey(event)");
    expect(sidebarSource).toContain("itemRefs.current[index]?.focus()");
    expect(sidebarSource).toContain('event.key !== "Enter" || !hasPrimaryModifier(event, platform)');
    expect(sidebarSource).toContain("immediatePointerKindRef.current === option.kind");
  });

  it("opens default-named items with their complete title selected", () => {
    expect(appSource).toContain("const defaultName = emptyPageTitle(kind)");
    expect(appSource).toContain("selectAll: true");
    expect(editableTitleSource).toContain("selectTextContents(editableTitle)");
    expect(editableTitleSource).toContain("range.selectNodeContents(root)");
  });
});
