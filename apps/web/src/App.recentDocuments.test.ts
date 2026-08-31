import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("recent document app wiring", () => {
  it("records a document only after its successful load survives navigation guards", () => {
    const rememberRecentOpen = sourceBetween("const rememberRecentOpen", "const prefetchNode");
    const openNode = sourceBetween("const openNode = useCallback(", "const redirectAfterDeletedNode");

    expect(rememberRecentOpen).toContain(
      "recordRecentDocument(window.localStorage, workspaceRootPath, node)"
    );
    expect(openNode.indexOf("const nextPage = await loadPage(openPath)")).toBeLessThan(
      openNode.indexOf("rememberRecentOpen(node)")
    );
    expect(openNode.indexOf("hasUnsavedPageChanges(saveStateRef.current)")).toBeLessThan(
      openNode.indexOf("rememberRecentOpen(node)")
    );
    expect(openNode.indexOf("rememberRecentOpen(node)")).toBeLessThan(
      openNode.indexOf("setPage(nextPage)")
    );
  });

  it("keeps Settings, Trash, and failed opens outside recent persistence", () => {
    const openNode = sourceBetween("const openNode = useCallback(", "const redirectAfterDeletedNode");
    const openTrashPage = sourceBetween("const openTrashPage = useCallback", "useEffect(() => {");
    const openSettings = sourceBetween("const openSettings = useCallback", "const saveWorkspaceSettings");

    expect(sourceBetween("} catch (error) {", "},\n    [isNarrow, loadPage", openNode))
      .not.toContain("rememberRecentOpen(");
    expect(openTrashPage).not.toContain("rememberRecentOpen(");
    expect(openSettings).not.toContain("rememberRecentOpen(");
  });

  it("opens search and recent results through canonical tree navigation", () => {
    const openSearchResult = sourceBetween("const openSearchResult", "const renameNode");

    expect(openSearchResult).toContain("findWorkspaceDocumentNode(tree, item.path)");
    expect(openSearchResult).toContain("await openNode(node)");
    expect(openSearchResult).not.toContain("loadPage(item.path)");
  });

  it("replaces recent paths after rename and move success", () => {
    expect(appSource.match(/replaceRecentDocumentPath\(/gu)?.length).toBeGreaterThanOrEqual(4);
    expect(sourceBetween("const renameNode = useCallback", "const deleteNode"))
      .toContain("node.path,\n          result.path");
    expect(sourceBetween("const moveNode = useCallback", "const savePage"))
      .toContain("node.path,\n          result.path");
    expect(sourceBetween("const renameOpenPage = useCallback", "const renameOpenPageTitle"))
      .toContain("intent.previousNodePath,\n        result.path");
    expect(sourceBetween("const handleMovedEvent = useCallback", "const handleDeletedEvent"))
      .toContain("event.previousPath,\n        event.path");
  });
});

function sourceBetween(start: string, end: string, source = appSource): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Could not find App source boundaries: ${start} -> ${end}`);
  }
  return source.slice(startIndex, endIndex);
}
