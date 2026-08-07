import { describe, expect, it } from "vitest";
import { pageCopyValue } from "./pageCopyActions";

describe("current-page copy values", () => {
  it("builds an absolute URL from the canonical application route", () => {
    expect(pageCopyValue("url", {
      origin: "https://notes.example.test:8443",
      route: "/projects/launch-plan",
      relativePath: "Projects/Launch plan.md"
    })).toBe("https://notes.example.test:8443/projects/launch-plan");
  });

  it("copies the canonical workspace-root-relative Markdown path", () => {
    expect(pageCopyValue("relative-path", {
      origin: "https://notes.example.test",
      route: "/projects/launch-plan",
      relativePath: "Projects/Launch plan.md"
    })).toBe("/Projects/Launch plan.md");
  });

  it("does not duplicate an existing workspace-root slash", () => {
    expect(pageCopyValue("relative-path", {
      origin: "https://notes.example.test",
      route: "/projects/launch-plan",
      relativePath: "/Projects/Launch plan.md"
    })).toBe("/Projects/Launch plan.md");
  });
});
