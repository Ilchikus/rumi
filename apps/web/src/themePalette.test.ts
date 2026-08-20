import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const sidebar = readFileSync(
  new URL("./components/sidebar/Sidebar.tsx", import.meta.url),
  "utf8"
);
const addressBar = readFileSync(
  new URL("./components/layout/WorkspaceHeader.tsx", import.meta.url),
  "utf8"
);

describe("release theme palette", () => {
  it("uses the requested Light and Dark neutral surfaces", () => {
    expect(styles).toContain("--background: 0 0% 100%;");
    expect(styles).toContain("--sidebar: 0 0% 98%;");
    expect(styles).toContain(".dark {");
    expect(styles).toContain("--background: 0 0% 15%;");
    expect(styles.match(/--surface-subtle: 0 0% 25\.1%;/gu)).toHaveLength(1);
    expect(styles.match(/--sidebar: 0 0% 25\.1%;/gu)).toHaveLength(1);
    expect(sidebar).toContain("bg-sidebar");
    expect(addressBar).toContain("bg-surface-subtle");
  });

  it("uses Sky 500/Sky 400 accents and theme-specific Yellow 500 highlights", () => {
    expect(styles).toContain("--primary: 199 89% 48%;");
    expect(styles).toContain("--primary-hover: 198 93% 60%;");
    expect(styles).toContain("--highlight-background: hsl(48 96% 53% / 0.3);");
    expect(styles).toContain("--highlight-background: hsl(48 96% 53% / 0.2);");
    expect(styles).toContain("background: var(--highlight-background);");
  });
});
