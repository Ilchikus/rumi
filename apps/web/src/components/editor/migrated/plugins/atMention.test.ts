import { describe, expect, it } from "vitest";
import { schema } from "../schema";
import { createMentionLinkText, mentionKindForPath } from "./atMention";

describe("at mentions", () => {
  it("uses a typed mention mark while keeping the Markdown prefix out of the visible label", () => {
    const mention = createMentionLinkText(schema, {
      name: "Project notes.md",
      path: "Projects/Project notes.md",
      kind: "page"
    });

    expect(mention.text).toBe("Project notes");
    expect(mention.marks[0]?.attrs).toMatchObject({
      href: "Projects/Project notes.md",
      mention: true,
      mentionKind: "page"
    });
  });

  it("uses the same page, folder, and database types as the workspace tree", () => {
    expect(mentionKindForPath("Notes/Note.md")).toBe("page");
    expect(mentionKindForPath("Notes/Notes.index.md")).toBe("folder");
    expect(mentionKindForPath("Projects/Projects.db.md")).toBe("database");
    expect(mentionKindForPath("index.md")).toBe("folder");
  });
});
