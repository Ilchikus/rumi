import { describe, expect, it } from "vitest";
import { schema } from "../schema";
import { createMentionLinkContent, mentionKindForPath } from "./atMention";

describe("at mentions", () => {
  it("uses a typed mention mark while keeping the Markdown prefix out of the visible label", () => {
    const mention = createMentionLinkContent(schema, {
      name: "Project notes.md",
      path: "Projects/Project notes.md",
      kind: "page"
    });
    const marker = mention.child(0);
    const label = mention.child(1);

    expect(marker.type.name).toBe("link_marker");
    expect(marker.attrs).toMatchObject({
      href: "Projects/Project notes.md",
      linkType: "internal",
      mentionKind: "page"
    });
    expect(label.text).toBe("Project notes");
    expect(label.marks[0]?.attrs).toMatchObject({
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
