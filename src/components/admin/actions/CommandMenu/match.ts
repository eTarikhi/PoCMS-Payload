/**
 * Ranks a command-menu label against the query: 0 = no match, higher = better. Prefix matches beat
 * word-start matches, which beat substring matches; every query word must match the label or a
 * keyword. Case- and accent-insensitive.
 */
export function matchScore(query: string, label: string, keywords: readonly string[] = []): number {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return 1
  const haystacks = [label, ...keywords].map(normalize)
  let score = 0
  for (const word of words) {
    let best = 0
    for (const [index, text] of haystacks.entries()) {
      const weight = index === 0 ? 1 : 0.5
      if (text.startsWith(word)) best = Math.max(best, 3 * weight)
      else if (new RegExp(`\\b${escapeRegExp(word)}`).test(text)) best = Math.max(best, 2 * weight)
      else if (text.includes(word)) best = Math.max(best, 1 * weight)
    }
    if (best === 0) return 0
    score += best
  }
  return score
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
