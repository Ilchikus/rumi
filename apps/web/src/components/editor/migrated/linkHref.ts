export function normalizeLinkHref(href: string): string {
  const trimmed = href.trim()
  return /^www\./iu.test(trimmed) ? `https://${trimmed}` : trimmed
}

export function isExternalLinkHref(href: string): boolean {
  return /^https?:\/\//iu.test(normalizeLinkHref(href))
}
