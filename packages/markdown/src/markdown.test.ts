import { describe, expect, it } from "vitest";
import { parseMarkdownFile, serializeMarkdownFile } from "./index";

describe("markdown frontmatter", () => {
  it("parses one normal YAML frontmatter block", () => {
    const parsed = parseMarkdownFile("---\nstatus: done\ntags:\n  - server\n---\n# Body");

    expect(parsed.hasFrontmatter).toBe(true);
    expect(parsed.frontmatter).toEqual({ status: "done", tags: ["server"] });
    expect(parsed.body).toBe("# Body");
  });

  it("handles markdown without frontmatter", () => {
    const parsed = parseMarkdownFile("# Plain\n\nBody");

    expect(parsed.hasFrontmatter).toBe(false);
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe("# Plain\n\nBody");
  });

  it("serializes frontmatter and body", () => {
    expect(serializeMarkdownFile({ status: "done" }, "Body")).toBe("---\nstatus: done\n---\nBody");
  });

  it("does not create empty frontmatter for plain pages", () => {
    expect(serializeMarkdownFile({}, "Body")).toBe("Body");
  });
});
