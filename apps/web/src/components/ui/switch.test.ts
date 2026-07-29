import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./switch";

describe("Switch", () => {
  it("renders a stored enabled state without transition classes when animation is disabled", () => {
    const markup = renderToStaticMarkup(
      createElement(Switch, {
        animate: false,
        checked: true,
        onCheckedChange: vi.fn()
      })
    );

    expect(markup).toContain('aria-checked="true"');
    expect(markup).toContain("bg-sky-600");
    expect(markup).toContain("translate-x-[18px]");
    expect(markup).not.toContain("transition-colors");
    expect(markup).not.toContain("transition-transform");
  });
});
