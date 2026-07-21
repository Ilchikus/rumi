import { describe, expect, it } from "vitest";
import { schema } from "../schema";
import { createMentionLinkText } from "./atMention";

describe("at mentions", () => {
  it("keeps the at-sign and marks inserted workspace links as mentions", () => {
    const mention = createMentionLinkText(schema, {
      name: "Project notes.md",
      path: "Projects/Project notes.md"
    });

    expect(mention.text).toBe("@Project notes");
    expect(mention.marks[0]?.attrs).toMatchObject({
      href: "Projects/Project notes.md",
      mention: true
    });
  });
});
