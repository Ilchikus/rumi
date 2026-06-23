import { parse, stringify } from "yaml";
import type { FrontmatterRecord } from "@rumi/contracts";

export interface ParsedMarkdownFile {
  frontmatter: FrontmatterRecord;
  body: string;
  hasFrontmatter: boolean;
  rawFrontmatter: string;
}

export function parseMarkdownFile(markdown: string): ParsedMarkdownFile {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  if (lines[0] !== "---") {
    return {
      frontmatter: {},
      body: normalized,
      hasFrontmatter: false,
      rawFrontmatter: ""
    };
  }

  const closeIndex = lines.findIndex((line, index) => index > 0 && line === "---");

  if (closeIndex === -1) {
    return {
      frontmatter: {},
      body: normalized,
      hasFrontmatter: false,
      rawFrontmatter: ""
    };
  }

  const rawFrontmatter = lines.slice(1, closeIndex).join("\n");
  const parsed = rawFrontmatter.trim() === "" ? {} : parse(rawFrontmatter);
  const frontmatter = isPlainObject(parsed) ? (parsed as FrontmatterRecord) : {};

  return {
    frontmatter,
    body: lines.slice(closeIndex + 1).join("\n"),
    hasFrontmatter: true,
    rawFrontmatter
  };
}

export function serializeMarkdownFile(frontmatter: FrontmatterRecord, body: string): string {
  if (Object.keys(frontmatter).length === 0) {
    return body;
  }

  const yaml = stringify(frontmatter).trimEnd();
  return `---\n${yaml}\n---\n${body}`;
}

export function parseFrontmatter(markdown: string): FrontmatterRecord {
  return parseMarkdownFile(markdown).frontmatter;
}

export function serializeFrontmatter(frontmatter: FrontmatterRecord): string {
  return stringify(frontmatter).trimEnd();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
