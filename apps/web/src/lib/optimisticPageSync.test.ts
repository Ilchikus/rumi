import { describe, expect, it } from "vitest";
import type { PageDocument } from "@rumi/contracts";
import { rebasePageDocument } from "./optimisticPageSync";

const base: PageDocument = {
  path: "Idea.md",
  kind: "page",
  frontmatter: { status: "draft" },
  markdownBody: "Base body",
  contentHash: "base",
  frontmatterHash: "base-frontmatter",
  version: "base"
};

describe("optimistic page synchronization", () => {
  it("applies a clean external document in full", () => {
    const latest = {
      ...base,
      frontmatter: { status: "done" },
      markdownBody: "Remote body",
      version: "remote",
      contentHash: "remote"
    };

    expect(rebasePageDocument(latest, base, base.markdownBody, {
      body: false,
      frontmatter: false
    })).toEqual(latest);
  });

  it("keeps visible local fields while advancing to the latest server version", () => {
    const latest = {
      ...base,
      frontmatter: { status: "done" },
      markdownBody: "Remote body",
      version: "remote",
      contentHash: "remote"
    };
    const local = {
      ...base,
      frontmatter: { status: "local" }
    };

    expect(rebasePageDocument(latest, local, "Local body", {
      body: true,
      frontmatter: false
    })).toMatchObject({
      version: "remote",
      contentHash: "remote",
      frontmatter: { status: "done" },
      markdownBody: "Local body"
    });
  });
});
