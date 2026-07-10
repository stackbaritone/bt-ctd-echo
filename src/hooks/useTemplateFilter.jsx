import React, { useMemo, useCallback } from 'react'
import Fuse from 'fuse.js'
import { normalize, expandQuery } from '../constants/synonyms.js'
import { interfaceTexts } from '../constants/interfaceTexts.js'

/**
 * Hook for template search, filtering, category labelling, and favorites.
 * Extracts the advanced search logic from App.jsx (exact → synonym → fuzzy → substring).
 */
export function useTemplateFilter({
  templatesData,
  searchQuery,
  selectedCategory,
  selectedType,
  favoritesOnly,
  favorites,
  selectedMode,
  isModeUnlocked,
  interfaceLanguage,
  debug,
}) {
  // Category labels from metadata + template fallbacks
  const categoryLabels = useMemo(() => {
    if (!templatesData) return {}
    const labels = { ...(templatesData.metadata?.categoryLabels || {}) }
    ;(templatesData.templates || []).forEach(t => {
      const key = t?.category
      if (!key) return
      if (!labels[key]) labels[key] = { fr: '', en: '' }
      if (t.category_fr && !labels[key].fr) labels[key].fr = t.category_fr
      if (t.category_en && !labels[key].en) labels[key].en = t.category_en
    })
    return labels
  }, [templatesData])

  // Category list from metadata or derived from templates
  const categories = useMemo(() => {
    if (!templatesData) return []
    const metaCats = templatesData?.metadata?.categories
    return Array.isArray(metaCats) && metaCats.length
      ? metaCats
      : [...new Set((templatesData.templates || []).map(t => t.category).filter(Boolean))]
  }, [templatesData])

  const getCategoryLabel = useCallback((categoryKey) => {
    if (!categoryKey) {
      return interfaceLanguage === 'fr' ? 'Autre' : 'Other'
    }
    const labels = categoryLabels[categoryKey]
    if (labels) {
      const primary = interfaceLanguage === 'fr' ? labels.fr : labels.en
      if (primary && primary.trim().length > 0) return primary
      const fallback = interfaceLanguage === 'fr' ? labels.en : labels.fr
      if (fallback && fallback.trim().length > 0) return fallback
    }
    const fallbackText = (interfaceTexts?.[interfaceLanguage]?.categories?.[categoryKey]) || categoryKey
    if (debug && !labels) {
      console.log(`Category label not found for: ${categoryKey}, using fallback: ${fallbackText}`)
    }
    return fallbackText
  }, [categoryLabels, interfaceLanguage, debug])

  const orderedCategories = useMemo(() => {
    if (!categories || !categories.length) return []
    return [...categories].sort((a, b) => {
      const labelA = getCategoryLabel(a) || a
      const labelB = getCategoryLabel(b) || b
      return labelA.localeCompare(labelB, interfaceLanguage === 'fr' ? 'fr' : 'en', { sensitivity: 'base' })
    })
  }, [categories, getCategoryLabel, interfaceLanguage])

  // Main search/filter computation
  const { filteredTemplates, searchMatchMap, locked } = useMemo(() => {
    const empty = { filteredTemplates: [], searchMatchMap: {}, locked: false }
    if (!templatesData) return empty
    if (!isModeUnlocked) return { ...empty, locked: true }
    let dataset = templatesData.templates

    const hasMode = (t, mode) => {
      const modes = Array.isArray(t.utilisateur) ? t.utilisateur : (t.utilisateur ? [t.utilisateur] : ['conseillers'])
      return modes.includes(mode)
    }

    dataset = dataset.filter(t => hasMode(t, selectedMode))

    // Filter by template type (default to 'email' for templates without a type)
    if (selectedType && selectedType !== 'all') {
      dataset = dataset.filter(t => (t.type || 'email') === selectedType)
    }

    const qRaw = (searchQuery || '').trim()
    const hasSearchQuery = qRaw.length > 0

    if (!hasSearchQuery) {
      if (selectedCategory !== 'all') dataset = dataset.filter(t => t.category === selectedCategory)
      if (favoritesOnly) {
        const favSet = new Set(favorites)
        dataset = dataset.filter(t => favSet.has(t.id))
      }
    }

    if (!qRaw) return { filteredTemplates: dataset, searchMatchMap: {} }

    // Tokenize query supporting quotes and AND/OR (EN/FR)
    const tokenize = (s) => {
      const out = []
      let buf = ''
      let inQ = false
      for (let i = 0; i < s.length; i++) {
        const ch = s[i]
        if (ch === '"') { inQ = !inQ; if (!inQ && buf) { out.push(buf); buf = '' } continue }
        if (!inQ && /\s/.test(ch)) { if (buf) { out.push(buf); buf = '' } continue }
        buf += ch
      }
      if (buf) out.push(buf)
      return out.map(tok => {
        const t = tok.trim()
        const upper = t.toUpperCase()
        if (upper === 'AND' || upper === 'ET' || upper === '&&') return 'AND'
        if (upper === 'OR' || upper === 'OU' || upper === '||' || upper === '|') return 'OR'
        return t
      })
    }

    const tokens = tokenize(qRaw)
    const hasOps = tokens.some(t => t === 'AND' || t === 'OR') || /"/.test(qRaw)
    const clauses = []
    let current = []
    const pushCurrent = () => { if (current.length) { clauses.push(current); current = [] } }
    for (const t of tokens) {
      if (t === 'OR') { pushCurrent() } else if (t === 'AND') { /* implicit */ } else { current.push(t) }
    }
    pushCurrent()

    const sortWithFavoritesFirst = (templateList) => {
      if (!hasSearchQuery) return templateList
      const favSet = new Set(favorites)
      const favs = templateList.filter(t => favSet.has(t.id))
      const nonFavs = templateList.filter(t => !favSet.has(t.id))
      return [...favs, ...nonFavs]
    }

    const itemText = (it) => normalize([
      it.title?.fr || '', it.title?.en || '', it.description?.fr || '', it.description?.en || '', it.category || ''
    ].join(' '))

    const itemMatchesClause = (it, clause) => {
      const text = itemText(it)
      return clause.every(term => {
        const exp = expandQuery(term).split(/\s+/).filter(Boolean)
        if (!exp.length) return true
        return exp.some(w => text.includes(w))
      })
    }

    let gated = dataset
    if (hasOps && clauses.length) {
      gated = dataset.filter(it => clauses.some(cl => itemMatchesClause(it, cl)))
    }
    if (!gated.length) return { filteredTemplates: [], searchMatchMap: {} }

    const findRangesInsensitive = (text = '', needle = '') => {
      const ranges = []
      if (!needle) return ranges
      const nNeedle = normalize(needle)
      const win = nNeedle.length
      if (!win) return ranges
      for (let i = 0; i + win <= text.length; i++) {
        const seg = text.substr(i, win)
        if (normalize(seg) === nNeedle) {
          ranges.push([i, i + win - 1])
        }
      }
      return ranges
    }

    const collectExact = (items, termsList) => {
      const out = []
      const map = {}
      const FIELDS = [
        ['title.fr', (it) => it.title?.fr || ''],
        ['title.en', (it) => it.title?.en || ''],
        ['description.fr', (it) => it.description?.fr || ''],
        ['description.en', (it) => it.description?.en || ''],
        ['category', (it) => it.category || ''],
      ]
      for (const it of items) {
        const matches = {}
        let totalHits = 0
        for (const [key, getter] of FIELDS) {
          const txt = String(getter(it))
          const keyRanges = []
          for (const term of termsList) {
            const r = findRangesInsensitive(txt, term)
            if (r.length) {
              keyRanges.push(...r)
            }
          }
          if (keyRanges.length) {
            keyRanges.sort((a, b) => a[0] - b[0])
            const merged = []
            for (const rng of keyRanges) {
              const last = merged[merged.length - 1]
              if (!last || rng[0] > last[1] + 1) merged.push(rng)
              else last[1] = Math.max(last[1], rng[1])
            }
            matches[key] = merged
            totalHits += merged.length
          }
        }
        if (totalHits > 0) {
          out.push({ item: it, hits: totalHits })
          map[it.id] = matches
        }
      }
      out.sort((a, b) => b.hits - a.hits)
      return { items: out.map(o => o.item), matchMap: map }
    }

    // Stage 1: exact match on RAW tokens
    const rawTerms = tokens.filter(t => t !== 'AND' && t !== 'OR').map(s => s.trim()).filter(Boolean)
    if (rawTerms.length) {
      const { items: exactItems, matchMap: exactMap } = collectExact(gated, rawTerms)
      if (exactItems.length) {
        return { filteredTemplates: sortWithFavoritesFirst(exactItems), searchMatchMap: exactMap }
      }
    }

    // Stage 2: exact match on expanded synonyms
    const expanded = expandQuery(qRaw)
    const expandedTerms = Array.from(new Set(expanded.split(/\s+/).filter(Boolean)))
    if (expandedTerms.length) {
      const { items: exactItems2, matchMap: exactMap2 } = collectExact(gated, expandedTerms)
      if (exactItems2.length) {
        return { filteredTemplates: sortWithFavoritesFirst(exactItems2), searchMatchMap: exactMap2 }
      }
    }

    // Stage 3: conservative fuzzy with dynamic threshold
    const shortest = (rawTerms.length ? Math.min(...rawTerms.map(t => t.length)) : qRaw.length) || 1
    let dynThreshold = 0.32
    if (shortest <= 2) dynThreshold = 0.1
    else if (shortest === 3) dynThreshold = 0.18
    else if (shortest === 4) dynThreshold = 0.22
    else if (shortest === 5) dynThreshold = 0.28
    else dynThreshold = 0.32

    const fuse = new Fuse(gated, {
      includeScore: true,
      includeMatches: true,
      shouldSort: false,
      threshold: dynThreshold,
      ignoreLocation: true,
      minMatchCharLength: 2,
      keys: [
        { name: 'title.fr', weight: 0.45 },
        { name: 'title.en', weight: 0.45 },
        { name: 'description.fr', weight: 0.30 },
        { name: 'description.en', weight: 0.30 },
        { name: 'category', weight: 0.20 },
      ]
    })

    const fuzzTerms = rawTerms.length ? rawTerms : expandedTerms
    if (fuzzTerms.length === 0) {
      return { filteredTemplates: gated, searchMatchMap: {} }
    }

    const acc = new Map()
    const mergeMatches = (dst, srcMatches) => {
      if (!Array.isArray(srcMatches)) return
      for (const m of srcMatches) {
        if (!m?.key || !Array.isArray(m?.indices)) continue
        const key = m.key
        if (!dst[key]) dst[key] = []
        dst[key].push(...m.indices)
      }
    }

    for (const term of fuzzTerms) {
      const res = fuse.search(term)
      for (const r of res) {
        const id = r.item.id
        const prev = acc.get(id)
        if (!prev) {
          acc.set(id, { item: r.item, score: r.score ?? 0.0, matches: {} })
          mergeMatches(acc.get(id).matches, r.matches)
        } else {
          prev.score = Math.min(prev.score, r.score ?? prev.score)
          mergeMatches(prev.matches, r.matches)
        }
      }
    }

    // Stage 4: simple normalized substring fallback
    if (acc.size === 0) {
      const needle = normalize(qRaw)
      const simple = []
      const sMatchMap = {}
      for (const it of gated) {
        const fields = [
          ['title.fr', it.title?.fr || ''],
          ['title.en', it.title?.en || ''],
          ['description.fr', it.description?.fr || ''],
          ['description.en', it.description?.en || ''],
          ['category', it.category || ''],
        ]
        let matched = false
        const keyMap = {}
        for (const [key, val] of fields) {
          if (normalize(val).includes(needle)) {
            matched = true
            keyMap[key] = findRangesInsensitive(String(val), qRaw)
          }
        }
        if (matched) {
          simple.push({ item: it, score: 1.0 })
          sMatchMap[it.id] = keyMap
        }
      }
      if (simple.length === 0) return { filteredTemplates: [], searchMatchMap: {} }
      return { filteredTemplates: sortWithFavoritesFirst(simple.map(s => s.item)), searchMatchMap: sMatchMap }
    }

    const results = Array.from(acc.values()).sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
    const items = results.map(r => r.item)
    const matchMap = {}
    for (const r of results) {
      matchMap[r.item.id] = r.matches
    }

    return { filteredTemplates: sortWithFavoritesFirst(items), searchMatchMap: matchMap }
  }, [templatesData, searchQuery, selectedCategory, selectedType, favoritesOnly, favorites, selectedMode, isModeUnlocked])

  // Highlight helpers
  const getMatchRanges = (id, key) => (searchMatchMap && searchMatchMap[id] && searchMatchMap[id][key]) || null

  const renderHighlighted = (text = '', ranges) => {
    if (!ranges || !ranges.length) return text
    const parts = []
    let last = 0
    for (const [start, end] of ranges) {
      if (start > last) parts.push(text.slice(last, start))
      parts.push(<mark key={`${start}-${end}`} className="search-hit">{text.slice(start, end + 1)}</mark>)
      last = end + 1
    }
    if (last < text.length) parts.push(text.slice(last))
    return <>{parts}</>
  }

  const isFav = (id) => favorites.includes(id)

  return {
    filteredTemplates,
    searchMatchMap,
    locked,
    getMatchRanges,
    renderHighlighted,
    categoryLabels,
    categories,
    getCategoryLabel,
    orderedCategories,
    isFav,
  }
}
