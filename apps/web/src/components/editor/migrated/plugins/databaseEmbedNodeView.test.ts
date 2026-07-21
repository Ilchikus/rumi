import { describe, expect, it } from "vitest";
import type { MigratedEditorDocument } from "../platform";
import { databaseSourceOptions } from "./databaseEmbedNodeView";

describe("database embed source options", () => {
  it("lists only database folders and uses their logical container paths", () => {
    const documents: MigratedEditorDocument[] = [
      { path: "Page.md", nodePath: "Page.md", title: "Page", kind: "page" },
      {
        path: "Tasks/Tasks.db.md",
        nodePath: "Tasks",
        title: "Tasks",
        kind: "database"
      },
      {
        path: "Projects/Tasks/Tasks.db.md",
        nodePath: "Projects/Tasks",
        title: "Tasks",
        kind: "database"
      }
    ];

    expect(databaseSourceOptions(documents)).toEqual([
      { label: "Tasks", value: "Tasks" },
      { label: "Tasks — Projects/Tasks", value: "Projects/Tasks" }
    ]);
  });
});
