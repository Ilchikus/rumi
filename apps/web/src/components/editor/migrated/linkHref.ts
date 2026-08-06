export function normalizeLinkHref(href: string): string {
  const trimmed = href.trim()
  return /^www\./iu.test(trimmed) ? `https://${trimmed}` : trimmed
}

export function isExternalLinkHref(href: string): boolean {
  return /^https?:\/\//iu.test(normalizeLinkHref(href))
}

export function isLinkDestination(value: string): boolean {
  const href = value.trim()
  if (!href || /[\r\n]/u.test(href)) return false
  if (/^(?:https?:\/\/|www\.)[^\s<>"]+$/iu.test(href)) return true
  if (/^[a-z][a-z\d+.-]*:[^\s]+$/iu.test(href)) return true

  return /^(?:\.{0,2}\/|#)/u.test(href) ||
    /[\\/]/u.test(href) ||
    /\.md(?:[?#].*)?$/iu.test(href)
}
