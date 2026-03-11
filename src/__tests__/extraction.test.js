import { describe, it, expect } from 'vitest'
import {
  stripRichTextForSync,
  extractVariablesFromPills,
  parseTemplateStructure,
  computeVarRangesInText,
  extractVariablesFromTemplate,
  extractVariableWithAnchors,
  normalizeForMatching,
} from '../utils/extraction'

// ---------------------------------------------------------------------------
// parseTemplateStructure
// ---------------------------------------------------------------------------
describe('parseTemplateStructure', () => {
  it('splits template into text and var parts', () => {
    const parts = parseTemplateStructure('Hello <<name>>, your total is <<amount>>.')
    expect(parts).toEqual([
      { type: 'text', value: 'Hello ' },
      { type: 'var', name: 'name' },
      { type: 'text', value: ', your total is ' },
      { type: 'var', name: 'amount' },
      { type: 'text', value: '.' },
    ])
  })

  it('returns single text part for string with no variables', () => {
    expect(parseTemplateStructure('just text')).toEqual([
      { type: 'text', value: 'just text' },
    ])
  })

  it('handles template starting with variable', () => {
    const parts = parseTemplateStructure('<<greeting>> World')
    expect(parts[0]).toEqual({ type: 'var', name: 'greeting' })
    expect(parts[1]).toEqual({ type: 'text', value: ' World' })
  })

  it('handles adjacent variables', () => {
    const parts = parseTemplateStructure('<<a>><<b>>')
    expect(parts).toEqual([
      { type: 'var', name: 'a' },
      { type: 'var', name: 'b' },
    ])
  })

  it('returns empty array for falsy input', () => {
    expect(parseTemplateStructure('')).toEqual([])
    expect(parseTemplateStructure(null)).toEqual([])
    expect(parseTemplateStructure(undefined)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// normalizeForMatching
// ---------------------------------------------------------------------------
describe('normalizeForMatching', () => {
  it('strips carriage returns and builds index map', () => {
    const { normalized, indexMap } = normalizeForMatching('a\r\nb')
    expect(normalized).toBe('a\nb')
    // indexMap maps normalized indices back to original
    expect(indexMap[0]).toBe(0) // 'a'
    expect(indexMap[1]).toBe(2) // '\n' (skipped \r at 1)
    expect(indexMap[2]).toBe(3) // 'b'
  })

  it('returns empty string for empty input', () => {
    const { normalized, indexMap } = normalizeForMatching('')
    expect(normalized).toBe('')
    expect(indexMap).toEqual([0])
  })

  it('passes through text without \\r unchanged', () => {
    const { normalized } = normalizeForMatching('hello')
    expect(normalized).toBe('hello')
  })
})

// ---------------------------------------------------------------------------
// computeVarRangesInText
// ---------------------------------------------------------------------------
describe('computeVarRangesInText', () => {
  it('computes correct ranges for known text', () => {
    const tpl = 'Hello <<name>>, bye.'
    const text = 'Hello Jean, bye.'
    const ranges = computeVarRangesInText(text, tpl)
    expect(ranges).toHaveLength(1)
    expect(ranges[0].name).toBe('name')
    expect(text.substring(ranges[0].start, ranges[0].end)).toBe('Jean')
  })

  it('handles multiple variables', () => {
    const tpl = '<<a>> and <<b>>.'
    const text = 'X and Y.'
    const ranges = computeVarRangesInText(text, tpl)
    expect(ranges).toHaveLength(2)
    expect(text.substring(ranges[0].start, ranges[0].end)).toBe('X')
    expect(text.substring(ranges[1].start, ranges[1].end)).toBe('Y')
  })

  it('returns empty array for null template', () => {
    expect(computeVarRangesInText('some text', null)).toEqual([])
  })

  it('returns empty array when text does not match', () => {
    const tpl = 'Prefix <<var>> Suffix'
    const text = 'Completely different text'
    expect(computeVarRangesInText(text, tpl)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// extractVariablesFromTemplate
// ---------------------------------------------------------------------------
describe('extractVariablesFromTemplate', () => {
  it('extracts variable values from filled text', () => {
    const tpl = 'Bonjour <<name>>, votre montant est <<amount>>.'
    const text = 'Bonjour Jean, votre montant est 100$.'
    const result = extractVariablesFromTemplate(text, tpl, ['name', 'amount'])
    expect(result.name).toBe('Jean')
    expect(result.amount).toBe('100$')
  })

  it('returns empty object when no variable names provided', () => {
    expect(extractVariablesFromTemplate('text', 'tpl', [])).toEqual({})
  })

  it('returns empty object for empty text', () => {
    expect(extractVariablesFromTemplate('', 'tpl', ['a'])).toEqual({})
  })

  it('ignores variables not in validVariables list', () => {
    const tpl = '<<a>> <<b>>'
    const text = 'X Y'
    const result = extractVariablesFromTemplate(text, tpl, ['a'])
    expect(result).toHaveProperty('a')
    expect(result).not.toHaveProperty('b')
  })

  it('does not extract placeholder value <<name>> as actual value', () => {
    const tpl = 'Hello <<name>>!'
    const text = 'Hello <<name>>!'
    const result = extractVariablesFromTemplate(text, tpl, ['name'])
    expect(result.name).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// extractVariableWithAnchors
// ---------------------------------------------------------------------------
describe('extractVariableWithAnchors', () => {
  it('extracts value using surrounding anchors', () => {
    const tpl = 'Bonjour <<name>>, merci.'
    const text = 'Bonjour Jean, merci.'
    expect(extractVariableWithAnchors(text, tpl, 'name')).toBe('Jean')
  })

  it('returns null when variable not in template', () => {
    expect(extractVariableWithAnchors('text', 'template', 'nope')).toBeNull()
  })

  it('returns null for empty inputs', () => {
    expect(extractVariableWithAnchors('', 'tpl', 'v')).toBeNull()
    expect(extractVariableWithAnchors('text', '', 'v')).toBeNull()
    expect(extractVariableWithAnchors('text', 'tpl', '')).toBeNull()
  })

  it('handles variable at end of template', () => {
    const tpl = 'Total: <<montant>>'
    const text = 'Total: 500$'
    expect(extractVariableWithAnchors(text, tpl, 'montant')).toBe('500$')
  })

  it('handles variable at beginning of template', () => {
    const tpl = '<<greeting>> World'
    const text = 'Hello World'
    expect(extractVariableWithAnchors(text, tpl, 'greeting')).toBe('Hello')
  })
})

// ---------------------------------------------------------------------------
// stripRichTextForSync (DOM-dependent, jsdom)
// ---------------------------------------------------------------------------
describe('stripRichTextForSync', () => {
  it('returns empty string for empty input', () => {
    expect(stripRichTextForSync('')).toBe('')
    expect(stripRichTextForSync()).toBe('')
  })

  it('converts pill spans to <<varName>> placeholders', () => {
    const html = 'Bonjour <span data-var="clientName">Jean</span>, merci.'
    const result = stripRichTextForSync(html)
    expect(result).toContain('<<clientName>>')
    expect(result).toContain('Bonjour')
    expect(result).toContain('merci.')
  })

  it('converts <br> to newline', () => {
    const result = stripRichTextForSync('line1<br>line2')
    expect(result).toContain('line1')
    expect(result).toContain('\n')
    expect(result).toContain('line2')
  })

  it('strips inline formatting but keeps text', () => {
    const result = stripRichTextForSync('<b>bold</b> and <i>italic</i>')
    expect(result).toContain('bold')
    expect(result).toContain('italic')
    expect(result).not.toContain('<b>')
    expect(result).not.toContain('<i>')
  })

  it('handles block elements with newlines', () => {
    const result = stripRichTextForSync('<p>Para 1</p><p>Para 2</p>')
    expect(result).toContain('Para 1')
    expect(result).toContain('Para 2')
  })
})

// ---------------------------------------------------------------------------
// extractVariablesFromPills (DOM-dependent, jsdom)
// ---------------------------------------------------------------------------
describe('extractVariablesFromPills', () => {
  it('returns empty object for empty input', () => {
    expect(extractVariablesFromPills('')).toEqual({})
    expect(extractVariablesFromPills()).toEqual({})
  })

  it('extracts variable values from data-var and data-display', () => {
    const html = '<span data-var="clientName" data-display="Jean Dupont">Jean Dupont</span>'
    const result = extractVariablesFromPills(html)
    expect(result.clientName).toBe('Jean Dupont')
  })

  it('falls back to textContent when data-display is missing', () => {
    const html = '<span data-var="amount">1000$</span>'
    const result = extractVariablesFromPills(html)
    expect(result.amount).toBe('1000$')
  })

  it('extracts multiple variables', () => {
    const html = `
      <span data-var="a" data-display="X">X</span>
      <span data-var="b" data-display="Y">Y</span>
    `
    const result = extractVariablesFromPills(html)
    expect(result.a).toBe('X')
    expect(result.b).toBe('Y')
  })

  it('skips pills with empty varName', () => {
    const html = '<span data-var="">value</span>'
    const result = extractVariablesFromPills(html)
    expect(Object.keys(result)).toHaveLength(0)
  })
})
