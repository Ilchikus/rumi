// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkspaceNode } from "@rumi/contracts";
import { WorkspaceIcon } from "../components/icons/WorkspaceIcon";
import {
  applyLinkMarkerIcon,
  linkMarkerNodeView
} from "../components/editor/migrated/plugins/linkMarkerNodeView";
import { parseMarkdown } from "../components/editor/migrated/markdown";
import { schema } from "../components/editor/migrated/schema";
import {
  parseWorkspaceIcon,
  publishWorkspaceIcons,
  withWorkspaceNodeIcon,
  workspaceFaviconHref,
  workspaceIconForLink,
  workspaceIconForPath
} from "./workspaceIcons";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  publishWorkspaceIcons(null);
});

const tree: WorkspaceNode = {
  path: "",
  name: "Notes",
  kind: "workspace",
  companionPath: "index.md",
  icon: "🌲",
  children: [
    { path: "Idea.md", name: "Idea.md", kind: "page", icon: "ph:lightbulb" },
    { path: "Plain.md", name: "Plain.md", kind: "page" },
    {
      path: "Projects",
      name: "Projects",
      kind: "folder",
      companionPath: "Projects/Projects.index.md",
      icon: ".assets/projects.png",
      children: [{ path: "Projects/Launch plan.md", name: "Launch plan.md", kind: "page", icon: "not an icon" }]
    }
  ]
};

describe("workspace icon values", () => {
  it("recognizes emoji, Phosphor names, and uploaded images only", () => {
    expect(parseWorkspaceIcon("🚀")).toEqual({ type: "emoji", emoji: "🚀" });
    expect(parseWorkspaceIcon("👩🏽‍💻")).toEqual({ type: "emoji", emoji: "👩🏽‍💻" });
    expect(parseWorkspaceIcon("🇺🇦")).toEqual({ type: "emoji", emoji: "🇺🇦" });
    expect(parseWorkspaceIcon(" ph:rocket-launch ")).toEqual({ type: "phosphor", name: "rocket-launch" });
    expect(parseWorkspaceIcon(".assets/team logo.PNG")).toEqual({ type: "asset", path: ".assets/team logo.PNG" });

    for (const invalid of [undefined, "", "  ", "rocket", "ph:", "ph:Rocket", "ph:../x", ".assets/notes.md",
      ".assets/../secret.png", "Notes/logo.png", "🚀 launch", "https://example.com/a.png"]) {
      expect(parseWorkspaceIcon(invalid)).toBeNull();
    }
  });

  it("resolves icons by node path, companion path, and link destination", () => {
    publishWorkspaceIcons(tree);

    expect(workspaceIconForPath("Idea.md")).toBe("ph:lightbulb");
    expect(workspaceIconForPath("Projects")).toBe(".assets/projects.png");
    expect(workspaceIconForPath("Projects/Projects.index.md")).toBe(".assets/projects.png");
    expect(workspaceIconForPath("index.md")).toBe("🌲");
    expect(workspaceIconForPath("Plain.md")).toBeUndefined();
    expect(workspaceIconForPath("Projects/Launch plan.md")).toBeUndefined();

    expect(workspaceIconForLink("Idea.md")).toBe("ph:lightbulb");
    expect(workspaceIconForLink("../Idea.md", "Projects/Launch plan.md")).toBe("ph:lightbulb");
    expect(workspaceIconForLink("<Projects/Projects.index.md>")).toBe(".assets/projects.png");
    expect(workspaceIconForLink("https://example.com")).toBeUndefined();
  });

  it("replaces one node's icon without touching unrelated branches", () => {
    const updated = withWorkspaceNodeIcon(tree, "Projects/Launch plan.md", "⭐");
    const removed = withWorkspaceNodeIcon(updated, "Idea.md", null);

    expect(updated.children?.[2]?.children?.[0]?.icon).toBe("⭐");
    expect(updated.children?.[0]).toBe(tree.children?.[0]);
    expect(removed.children?.[0]).not.toHaveProperty("icon");
    expect(withWorkspaceNodeIcon(tree, "", "🏠").icon).toBe("🏠");
  });

  it("builds favicons from emoji, Phosphor paths, and uploads", () => {
    expect(decodeURIComponent(workspaceFaviconHref({ type: "emoji", emoji: "🌲" })!)).toContain(">🌲</text>");
    expect(decodeURIComponent(workspaceFaviconHref({ type: "phosphor", name: "tree" }, "M0,0Z")!))
      .toContain('<path d="M0,0Z"/>');
    expect(workspaceFaviconHref({ type: "phosphor", name: "tree" })).toBeNull();
    expect(workspaceFaviconHref({ type: "asset", path: ".assets/logo.png" }))
      .toBe("/api/asset?path=.assets%2Flogo.png");
  });
});

describe("workspace icon rendering", () => {
  function render(icon: string | undefined) {
    container ??= document.body.appendChild(document.createElement("div"));
    root ??= createRoot(container);
    act(() => root?.render(createElement(WorkspaceIcon, {
      icon,
      size: 16,
      fallback: createElement("i", { "data-kind-icon": "" })
    })));
    return container;
  }

  it("shows the custom icon instead of the kind icon, never both", () => {
    expect(render("🚀").querySelector("[data-workspace-icon='emoji']")?.textContent).toBe("🚀");
    expect(render("🚀").querySelector("[data-kind-icon]")).toBeNull();
    expect(render(".assets/a.png").querySelector("img")?.getAttribute("src")).toBe("/api/asset?path=.assets%2Fa.png");
    expect(render(undefined).querySelector("[data-kind-icon]")).not.toBeNull();
    expect(render("plain words").querySelector("[data-kind-icon]")).not.toBeNull();
  });

  it("falls back to the kind icon when an uploaded icon cannot load", () => {
    const view = render(".assets/missing.png");
    act(() => view.querySelector("img")?.dispatchEvent(new Event("error")));
    expect(view.querySelector("[data-kind-icon]")).not.toBeNull();
  });

  it("swaps the editor link glyph for a custom icon and restores it on removal", () => {
    const marker = document.createElement("span");

    applyLinkMarkerIcon(marker, { type: "emoji", emoji: "📁" });
    expect(marker.dataset.customIcon).toBe("emoji");
    expect(marker.dataset.iconEmoji).toBe("📁");

    applyLinkMarkerIcon(marker, { type: "phosphor", path: "M0,0Z" });
    expect(marker.dataset.iconEmoji).toBeUndefined();
    expect(marker.style.getPropertyValue("--rumi-link-icon")).toContain("data:image/svg+xml");

    applyLinkMarkerIcon(marker, null);
    expect(marker.hasAttribute("data-custom-icon")).toBe(false);
    expect(marker.style.getPropertyValue("--rumi-link-icon")).toBe("");
  });
});

describe("internal link icons in the editor", () => {
  function markers(markdown: string) {
    const found: Array<{ href: string; mention: boolean }> = [];
    parseMarkdown(markdown, schema).descendants((node) => {
      if (node.type.name === "link_marker") found.push({ href: node.attrs.href, mention: node.attrs.mention });
    });
    return found;
  }

  it("marks @ mentions apart from ordinary internal and external links", () => {
    expect(markers("[@Idea](Idea.md), [my notes](Idea.md), [@site](https://example.com)")).toEqual([
      { href: "Idea.md", mention: true },
      { href: "Idea.md", mention: false },
      { href: "https://example.com", mention: false }
    ]);
  });

  it("shows the target's custom icon for mentions and the kind glyph for other links", () => {
    publishWorkspaceIcons(tree);
    const mention = linkMarkerNodeView(schema.nodes.link_marker!.create({
      href: "Projects/Projects.index.md",
      linkType: "internal",
      mentionKind: "folder",
      mention: true
    }));
    const plain = linkMarkerNodeView(schema.nodes.link_marker!.create({
      href: "Projects/Projects.index.md",
      linkType: "internal",
      mentionKind: "folder"
    }));

    expect((mention.dom as HTMLElement).dataset.customIcon).toBe("asset");
    expect((plain.dom as HTMLElement).hasAttribute("data-custom-icon")).toBe(false);

    publishWorkspaceIcons({ ...tree, children: [] });
    expect((mention.dom as HTMLElement).hasAttribute("data-custom-icon")).toBe(false);
    mention.destroy?.();
    plain.destroy?.();
  });
});
