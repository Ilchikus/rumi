import { describe, expect, it } from "vitest";
import { filterSlashCommands, slashCommandItems } from "./editorCommands";

describe("editor slash commands", () => {
  it("preserves the core block actions without requiring asset upload", () => {
    const ids = slashCommandItems().map((item) => item.id);

    expect(ids).toEqual(expect.arrayContaining([
      "paragraph",
      "heading-1",
      "bullet",
      "numbered",
      "task",
      "quote",
      "code",
      "mermaid",
      "divider",
      "table",
      "bookmark",
      "database"
    ]));
    expect(ids).not.toContain("image");
    expect(ids).not.toContain("file");
  });

  it("matches commands by their user-facing aliases", () => {
    const commands = slashCommandItems();

    expect(filterSlashCommands(commands, "todo").map((item) => item.id)).toEqual(["task"]);
    expect(filterSlashCommands(commands, "diagram").map((item) => item.id)).toEqual(["mermaid"]);
    expect(filterSlashCommands(commands, "grid").map((item) => item.id)).toEqual(["table"]);
  });
});
