import { describe, expect, it } from "vitest";
import { sidebarWidthForViewport } from "./sidebarLayout";

describe("sidebar shell layout", () => {
  it("matches desktop width and the narrow overlay cap", () => {
    expect(sidebarWidthForViewport(320, 1280)).toBe(320);
    expect(sidebarWidthForViewport(520, 320)).toBe(275);
    expect(sidebarWidthForViewport(240, 320)).toBe(240);
  });
});
