// @ts-nocheck -- functionality-first migration from the proven Rumi editor
export function searchMentionItems<T>(
  items: T[],
  query: string,
  getName: (item: T) => string,
  getPath: (item: T) => string
): T[] {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return [...items]

  return items
    .map((item, index) => {
      const name = normalize(getName(item))
      const path = normalize(getPath(item))
      return { item, index, score: scoreMatch(name, path, normalizedQuery) }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item)
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function scoreMatch(name: string, path: string, query: string): number {
  if (!name && !path) return 0
  if (!query) return 1

  let score = 0

  if (name === query) score += 1000
  if (name.startsWith(query)) score += 700

  const nameIndex = name.indexOf(query)
  if (nameIndex !== -1) score += 500 - Math.min(nameIndex, 120)

  const pathIndex = path.indexOf(query)
  if (pathIndex !== -1) score += 300 - Math.min(pathIndex, 120)

  const queryTerms = query.split(/\s+/).filter(Boolean)
  if (queryTerms.length > 1) {
    let termsMatched = 0
    for (const term of queryTerms) {
      if (name.includes(term) || path.includes(term)) {
        termsMatched += 1
      }
    }
    if (termsMatched === queryTerms.length) {
      score += 200 + termsMatched * 20
    }
  }

  return score
}
