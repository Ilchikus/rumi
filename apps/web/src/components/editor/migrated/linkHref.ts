const BARE_WEB_DESTINATION = /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:[/?#][^\s<>"]*)?$/iu

export function isWebLinkDestination(value: string): boolean {
  const href = value.trim()
  if (!href || /[\r\n]/u.test(href)) return false
  if (/^https?:\/\/[^\s<>"]+$/iu.test(href)) return true
  if (/^www\.[^\s<>"]+$/iu.test(href)) return true
  if (/\.md(?:[?#].*)?$/iu.test(href)) return false
  return BARE_WEB_DESTINATION.test(href)
}

export function normalizeLinkHref(href: string): string {
  const trimmed = href.trim()
  if (/^https?:\/\//iu.test(trimmed)) return trimmed
  return isWebLinkDestination(trimmed) ? `https://${trimmed}` : trimmed
}

export function isExternalLinkHref(href: string): boolean {
  return /^https?:\/\//iu.test(normalizeLinkHref(href))
}

export function isLinkDestination(value: string): boolean {
  const href = value.trim()
  if (!href || /[\r\n]/u.test(href)) return false
  if (isWebLinkDestination(href)) return true
  if (/^[a-z][a-z\d+.-]*:[^\s]+$/iu.test(href)) return true

  return /^(?:\.{0,2}\/|#)/u.test(href) ||
    /[\\/]/u.test(href) ||
    /\.md(?:[?#].*)?$/iu.test(href)
}
