import { describe, it, expect } from 'vitest'
import { SYNONYMS, normalize, expandQuery } from '../constants/synonyms.js'

describe('normalize', () => {
  it('removes accents and lowercases', () => {
    expect(normalize('Délai')).toBe('delai')
    expect(normalize('Révision')).toBe('revision')
    expect(normalize('Problème')).toBe('probleme')
  })

  it('handles empty/null input', () => {
    expect(normalize('')).toBe('')
    expect(normalize()).toBe('')
    expect(normalize(undefined)).toBe('')
  })

  it('preserves already normalized strings', () => {
    expect(normalize('invoice')).toBe('invoice')
    expect(normalize('abc 123')).toBe('abc 123')
  })
})

describe('SYNONYMS', () => {
  it('has expected keys', () => {
    const keys = Object.keys(SYNONYMS)
    expect(keys.length).toBeGreaterThan(10)
    expect(keys).toContain('facture')
    expect(keys).toContain('client')
    expect(keys).toContain('traduction')
  })

  it('values are arrays of strings', () => {
    for (const [key, value] of Object.entries(SYNONYMS)) {
      expect(Array.isArray(value), `${key} should be an array`).toBe(true)
      value.forEach(v => expect(typeof v).toBe('string'))
    }
  })

  it('each key appears in its own synonym list', () => {
    for (const [key, value] of Object.entries(SYNONYMS)) {
      const normalized = value.map(v => normalize(v))
      expect(normalized, `"${key}" should include itself`).toContain(normalize(key))
    }
  })
})

describe('expandQuery', () => {
  it('returns empty for falsy input', () => {
    expect(expandQuery('')).toBe('')
    expect(expandQuery(null)).toBe('')
    expect(expandQuery(undefined)).toBe('')
  })

  it('expands a known synonym', () => {
    const result = expandQuery('facture')
    expect(result).toContain('facture')
    expect(result).toContain('invoice')
    expect(result).toContain('billing')
  })

  it('expands multi-word queries', () => {
    const result = expandQuery('devis client')
    expect(result).toContain('devis')
    expect(result).toContain('quote')
    expect(result).toContain('client')
    expect(result).toContain('customer')
  })

  it('passes through unknown words unchanged', () => {
    const result = expandQuery('xyzabc')
    expect(result).toContain('xyzabc')
  })

  it('normalizes accents in queries', () => {
    const result = expandQuery('délai')
    expect(result).toContain('delai')
    expect(result).toContain('deadline')
  })

  it('matches partial keys via startsWith', () => {
    const result = expandQuery('trad')
    // 'trad' startsWith 'trad' should match 'traduction' key
    expect(result).toContain('translation')
  })
})
