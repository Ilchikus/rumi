import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("pinned item app wiring", () => {
  it("hydrates, persists, projects, and prunes workspace-scoped pinned paths", () => {
    expect(appSource).toContain("readPinnedItemPaths(window.localStorage, initialWorkspaceRootPath)");
    expect(appSource).toContain("resolvePinnedItemPaths(tree, storedPaths)");
    expect(appSource).toContain("writePinnedItemPaths(window.localStorage, workspaceRootPath, nextPaths)");
    expect(appSource).toContain("pinnedPaths={pinnedPaths}");
    expect(appSource).toContain("onPinnedChange={changePinnedNode}");
  });

  it("repairs pins after every explicit and externally observed rename or move path", () => {
    expect(appSource.match(/repairPinnedNodePath\(/gu)?.length).toBe(4);
    expect(sourceBetween("const renameNode = useCallback", "const deleteNode"))
      .toContain("repairPinnedNodePath(node.path, result.path)");
    expect(sourceBetween("const moveNode = useCallback", "const savePage"))
      .toContain("repairPinnedNodePath(node.path, result.path)");
    expect(sourceBetween("const renameOpenPage = useCallback", "const renameOpenPageTitle"))
      .toContain("repairPinnedNodePath(intent.previousNodePath, result.path)");
    expect(sourceBetween("const handleMovedEvent = useCallback", "const handleDeletedEvent"))
      .toContain("repairPinnedNodePath(event.previousPath, event.path)");
  });

  it("routes shared revision actions to the selected node's openable page", () => {
    const revisions = sourceBetween(
      "const openWorkspaceNodeRevisions = useCallback",
      "const copyOpenPageReference"
    );
    expect(revisions).toContain("const revisionPath = openPathForNode(node)");
    expect(revisions).toContain("const revisionPage = await loadPage(revisionPath)");
    expect(appSource).toContain("onSeeRevisions={(node) => void openWorkspaceNodeRevisions(node)}");
  });
});

function sourceBetween(start: string, end: string): string {
  const startIndex = appSource.indexOf(start);
  const endIndex = appSource.indexOf(end, startIndex);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Could not find App source boundaries: ${start} -> ${end}`);
  }
  return appSource.slice(startIndex, endIndex);
}
