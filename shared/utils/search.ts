/** A run of characters in the searched text that the query matched. */
export type MatchRange = [start: number, end: number]

interface TermMatch {
  score: number
  ranges: MatchRange[]
}

/**
 * Characters a new word may start after. A breadcrumb is mostly separators, so
 * matching right behind one is what makes `p/w/n` find `Production / Web / Nuxt`.
 */
const SEPARATORS = new Set([' ', '/', '-', '_', '.', ':', ',', '(', ')', '[', ']'])

/*
 * A contiguous hit always beats a scattered one, and both beat nothing. The
 * numbers only ever get compared against each other for the same query, so
 * their absolute size means nothing.
 */
const EXACT_SCORE = 1000
const SUBSEQUENCE_SCORE = 100
const BOUNDARY_BONUS = 40
const CONSECUTIVE_BONUS = 20
const GAP_PENALTY = 2

/** Words of a query. Several of them all have to match, in any field. */
function queryTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean)
}

function isBoundary(text: string, index: number): boolean {
  return index === 0 || SEPARATORS.has(text[index - 1]!)
}

/**
 * One word against one text. A plain substring is tried first: typing part of a
 * name is what people actually do, and it deserves both the better score and
 * the unbroken highlight a subsequence walk cannot produce.
 */
function matchTerm(text: string, lower: string, term: string): TermMatch | null {
  const exact = lower.indexOf(term)

  if (exact !== -1) {
    return {
      // Earlier is better, and the start of a word better still.
      score: EXACT_SCORE + (isBoundary(lower, exact) ? BOUNDARY_BONUS : 0) - exact,
      ranges: [[exact, exact + term.length]]
    }
  }

  /*
   * A scattered match has to begin where a word does. Without that anchor a
   * short query finds a letter in the middle of every other name — `api` would
   * "match" `Example Service` and light up three stray letters.
   */
  const first = [...term][0]!
  let cursor = lower.indexOf(first)

  while (cursor !== -1 && !isBoundary(lower, cursor)) {
    cursor = lower.indexOf(first, cursor + first.length)
  }

  if (cursor === -1) {
    return null
  }

  const ranges: MatchRange[] = []
  let score = SUBSEQUENCE_SCORE

  for (const character of term) {
    const at = lower.indexOf(character, cursor)

    if (at === -1) {
      return null
    }

    const previous = ranges.at(-1)

    if (previous && previous[1] === at) {
      previous[1] = at + character.length
      score += CONSECUTIVE_BONUS
    } else {
      ranges.push([at, at + character.length])
      score -= (at - cursor) * GAP_PENALTY
    }

    if (isBoundary(lower, at)) {
      score += BOUNDARY_BONUS
    }

    cursor = at + character.length
  }

  return { score, ranges }
}

/**
 * How well a query matches a record, across everything worth searching, or null
 * when it does not match at all. Every word has to land somewhere, but they may
 * land in different fields — `prod nuxt.com` finds a monitor by its group and
 * its URL at once.
 */
export function fuzzyScore(fields: Array<string | null | undefined>, query: string): number | null {
  const terms = queryTerms(query)

  if (!terms.length) {
    return 0
  }

  let total = 0

  for (const term of terms) {
    let best: number | null = null

    for (const field of fields) {
      if (!field) {
        continue
      }

      const match = matchTerm(field, field.toLowerCase(), term)

      if (match && (best === null || match.score > best)) {
        best = match.score
      }
    }

    if (best === null) {
      return null
    }

    total += best
  }

  return total
}

/**
 * Every place in the text one word points at. Scoring only cares about the best
 * single occurrence, but a highlight that marks `API` in `APIs / GitHub API`
 * once and leaves the other one plain just looks like a bug.
 */
function termRanges(text: string, lower: string, term: string): MatchRange[] {
  const ranges: MatchRange[] = []

  for (let at = lower.indexOf(term); at !== -1; at = lower.indexOf(term, at + term.length)) {
    ranges.push([at, at + term.length])
  }

  return ranges.length ? ranges : matchTerm(text, lower, term)?.ranges ?? []
}

/** Overlapping and touching ranges folded into one, in reading order. */
function mergeRanges(ranges: MatchRange[]): MatchRange[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const merged: MatchRange[] = []

  for (const [start, end] of sorted) {
    const previous = merged.at(-1)

    if (previous && start <= previous[1]) {
      previous[1] = Math.max(previous[1], end)
    } else {
      merged.push([start, end])
    }
  }

  return merged
}

/**
 * The text split into plain and matched pieces, ready to render.
 *
 * Unlike `fuzzyScore` this never vetoes: a word that matched some other field
 * simply contributes nothing here, so a row found by its URL still shows its
 * name unmarked rather than disappearing.
 */
export function highlightSegments(text: string, query: string): Array<{ text: string, match: boolean }> {
  const terms = queryTerms(query)

  if (!terms.length || !text) {
    return [{ text, match: false }]
  }

  const lower = text.toLowerCase()
  const ranges = mergeRanges(terms.flatMap(term => termRanges(text, lower, term)))

  if (!ranges.length) {
    return [{ text, match: false }]
  }

  const segments: Array<{ text: string, match: boolean }> = []
  let cursor = 0

  for (const [start, end] of ranges) {
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), match: false })
    }

    segments.push({ text: text.slice(start, end), match: true })
    cursor = end
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false })
  }

  return segments
}
