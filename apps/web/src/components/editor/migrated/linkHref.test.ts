import { describe, expect, it } from "vitest"
import {
  isExternalLinkHref,
  isWebLinkDestination,
  normalizeLinkHref
} from "./linkHref"

describe("web link destinations", () => {
  it.each([
    "https://rumi.md",
    "http://localhost:3000",
    "www.rumi.md",
    "example.com",
    "docs.example.com.ua/guide?ready=true#start"
  ])("recognizes %s", (destination) => {
    expect(isWebLinkDestination(destination)).toBe(true)
  })

  it.each([
    "Notes/Today.md",
    "Today.md",
    "person@example.com",
    "not a domain",
    "www.",
    "http"
  ])("does not mistake %s for a web destination", (destination) => {
    expect(isWebLinkDestination(destination)).toBe(false)
  })

  it("renders scheme-less domains through HTTPS without changing explicit schemes", () => {
    expect(normalizeLinkHref("example.com")).toBe("https://example.com")
    expect(normalizeLinkHref("www.rumi.md/docs")).toBe("https://www.rumi.md/docs")
    expect(normalizeLinkHref("http://rumi.md")).toBe("http://rumi.md")
    expect(isExternalLinkHref("example.com")).toBe(true)
  })
})
