import { describe, it, expect } from 'vitest'
import {
  mergeTemplateDatasets,
  buildInitialVariables,
  resolveVariableInfo,
  guessSampleValue,
  findTemplatePlaceholderForVar,
  cleanupWhitespace,
  removeVariablePlaceholderFromText,
  ensurePlaceholderInText,
  applyAssignments,
  CANONICAL_TEMPLATES,
} from '../utils/template'

// ---------------------------------------------------------------------------
// mergeTemplateDatasets
// ---------------------------------------------------------------------------
describe('mergeTemplateDatasets', () => {
  it('returns primary with normalized variables when no fallback', () => {
    const primary = {
      metadata: { version: '1.0' },
      templates: [{ id: 't1' }],
      variables: {
        clientName: { description: { fr: 'Nom' }, example: 'Jean' },
      },
    }
    const result = mergeTemplateDatasets(primary, null)
    expect(result.metadata).toEqual({ version: '1.0' })
    expect(result.templates).toEqual([{ id: 't1' }])
    // normalised example: string → { fr, en }
    expect(result.variables.clientName.example).toEqual({ fr: 'Jean', en: 'Jean' })
    expect(result.variables.clientName.format).toBe('text')
  })

  it('merges primary over fallback', () => {
    const primary = {
      metadata: { version: '2.0' },
      templates: [{ id: 'p1' }],
      variables: {
        clientName: { description: { fr: 'Nom client' }, example: { fr: 'Jean', en: '' } },
      },
    }
    const fallback = {
      metadata: { author: 'admin' },
      templates: [{ id: 'f1' }],
      variables: {
        clientName: { description: { fr: '', en: 'Client name' }, example: { fr: '', en: 'John' } },
        other: { description: { fr: 'Autre' }, example: 'x' },
      },
    }
    const result = mergeTemplateDatasets(primary, fallback)
    expect(result.metadata).toEqual({ author: 'admin', version: '2.0' })
    // primary templates win when non-empty
    expect(result.templates).toEqual([{ id: 'p1' }])
    // merged variable: primary fr wins, fallback en fills gap
    expect(result.variables.clientName.description.fr).toBe('Nom client')
    expect(result.variables.clientName.description.en).toBe('Client name')
    expect(result.variables.clientName.example.fr).toBe('Jean')
    expect(result.variables.clientName.example.en).toBe('John')
    // fallback-only variable still present
    expect(result.variables.other).toBeDefined()
  })

  it('uses fallback templates when primary has none', () => {
    const result = mergeTemplateDatasets(
      { templates: [] },
      { templates: [{ id: 'fb' }] },
    )
    expect(result.templates).toEqual([{ id: 'fb' }])
  })

  it('handles empty/null inputs gracefully', () => {
    expect(mergeTemplateDatasets()).toEqual({ variables: {} })
    expect(mergeTemplateDatasets(null, null)).toEqual({ variables: {} })
  })
})

// ---------------------------------------------------------------------------
// CANONICAL_TEMPLATES (smoke)
// ---------------------------------------------------------------------------
describe('CANONICAL_TEMPLATES', () => {
  it('is an object with templates and variables', () => {
    expect(CANONICAL_TEMPLATES).toBeDefined()
    expect(Array.isArray(CANONICAL_TEMPLATES.templates)).toBe(true)
    expect(typeof CANONICAL_TEMPLATES.variables).toBe('object')
  })
})

// ---------------------------------------------------------------------------
// resolveVariableInfo
// ---------------------------------------------------------------------------
describe('resolveVariableInfo', () => {
  const data = {
    variables: {
      clientName: { description: { fr: 'Nom' }, example: { fr: 'Jean', en: 'John' } },
    },
  }

  it('returns entry for exact match', () => {
    expect(resolveVariableInfo(data, 'clientName')).toBe(data.variables.clientName)
  })

  it('strips _FR/_EN suffix to match base name', () => {
    expect(resolveVariableInfo(data, 'clientName_FR')).toBe(data.variables.clientName)
    expect(resolveVariableInfo(data, 'clientName_EN')).toBe(data.variables.clientName)
  })

  it('returns null for unknown variable', () => {
    expect(resolveVariableInfo(data, 'unknown')).toBeNull()
  })

  it('returns null for missing data or empty name', () => {
    expect(resolveVariableInfo(null, 'x')).toBeNull()
    expect(resolveVariableInfo(data, '')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// guessSampleValue
// ---------------------------------------------------------------------------
describe('guessSampleValue', () => {
  it('returns "…" for unknown text variable with no data', () => {
    expect(guessSampleValue({}, 'whatever')).toBe('…')
  })

  it('returns date fallback for date-like variable', () => {
    const val = guessSampleValue({}, 'date_envoi')
    expect(val).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns currency fallback for amount', () => {
    expect(guessSampleValue({}, 'montant_total')).toBe('2 890,00 $')
  })

  it('returns EN-style sample for _EN suffix', () => {
    const data = {
      variables: {
        montant: { format: 'currency', example: { fr: '1 250,00 $', en: '' } },
      },
    }
    const val = guessSampleValue(data, 'montant_EN')
    expect(val).toContain('$')
    // Should convert FR-style currency to EN
    expect(val).toMatch(/^\$/)
  })

  it('returns FR example for _FR suffix', () => {
    const data = {
      variables: {
        clientName: { example: { fr: 'Jean', en: 'John' } },
      },
    }
    expect(guessSampleValue(data, 'clientName_FR')).toBe('Jean')
  })

  it('uses info.example string directly', () => {
    const data = {
      variables: {
        truc: { example: { fr: 'Bonjour', en: 'Hello' } },
      },
    }
    // Base (no suffix): prefer fr
    expect(guessSampleValue(data, 'truc')).toBe('Bonjour')
  })
})

// ---------------------------------------------------------------------------
// buildInitialVariables
// ---------------------------------------------------------------------------
describe('buildInitialVariables', () => {
  const templateData = {
    variables: {
      clientName: {
        example: { fr: 'Jean', en: 'John' },
        description: { fr: '', en: '' },
        format: 'text',
      },
    },
  }

  it('creates entries for base + _FR + _EN variants', () => {
    const template = { variables: ['clientName'] }
    const result = buildInitialVariables(template, templateData, 'fr')
    expect(result).toHaveProperty('clientName')
    expect(result).toHaveProperty('clientName_FR')
    expect(result).toHaveProperty('clientName_EN')
  })

  it('uses fr example for base variable when lang is fr', () => {
    const template = { variables: ['clientName'] }
    const result = buildInitialVariables(template, templateData, 'fr')
    expect(result.clientName).toBe('Jean')
  })

  it('uses en example for base variable when lang is en', () => {
    const template = { variables: ['clientName'] }
    const result = buildInitialVariables(template, templateData, 'en')
    expect(result.clientName).toBe('John')
  })

  it('returns empty object when template has no variables', () => {
    expect(buildInitialVariables({}, templateData)).toEqual({})
    expect(buildInitialVariables(null, templateData)).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// findTemplatePlaceholderForVar
// ---------------------------------------------------------------------------
describe('findTemplatePlaceholderForVar', () => {
  const tpl = 'Bonjour <<client_name>>, votre montant est <<MONTANT>>.'

  it('finds placeholder with normalized match', () => {
    expect(findTemplatePlaceholderForVar(tpl, 'client_name')).toBe('<<client_name>>')
  })

  it('matches case-insensitively via normalizeVarKey', () => {
    expect(findTemplatePlaceholderForVar(tpl, 'MONTANT')).toBe('<<MONTANT>>')
    expect(findTemplatePlaceholderForVar(tpl, 'montant')).toBe('<<MONTANT>>')
  })

  it('returns null for unknown variable', () => {
    expect(findTemplatePlaceholderForVar(tpl, 'inexistant')).toBeNull()
  })

  it('returns null for empty inputs', () => {
    expect(findTemplatePlaceholderForVar('', 'x')).toBeNull()
    expect(findTemplatePlaceholderForVar(tpl, '')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// cleanupWhitespace
// ---------------------------------------------------------------------------
describe('cleanupWhitespace', () => {
  it('collapses multiple spaces to one', () => {
    expect(cleanupWhitespace('hello    world')).toBe('hello world')
  })

  it('removes space before punctuation', () => {
    expect(cleanupWhitespace('bonjour !')).toBe('bonjour!')
    expect(cleanupWhitespace('end .')).toBe('end.')
  })

  it('strips trailing spaces on lines', () => {
    expect(cleanupWhitespace('hello   \nworld')).toBe('hello\nworld')
  })

  it('collapses 3+ newlines to 2', () => {
    expect(cleanupWhitespace('a\n\n\n\nb')).toBe('a\n\nb')
  })

  it('returns empty string for empty input', () => {
    expect(cleanupWhitespace('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// removeVariablePlaceholderFromText
// ---------------------------------------------------------------------------
describe('removeVariablePlaceholderFromText', () => {
  it('removes placeholder and collapses whitespace', () => {
    const text = 'Bonjour <<client_name>>, merci.'
    const result = removeVariablePlaceholderFromText(text, 'client_name')
    expect(result).not.toContain('<<client_name>>')
    expect(result).toContain('Bonjour')
    expect(result).toContain('merci.')
  })

  it('preserves newlines appropriately when placeholder is on its own line', () => {
    const text = 'Line1\n<<varA>>\nLine2'
    const result = removeVariablePlaceholderFromText(text, 'varA')
    expect(result).not.toContain('<<varA>>')
    expect(result).toContain('Line1')
    expect(result).toContain('Line2')
  })

  it('returns text unchanged if variable not found', () => {
    const text = 'Hello <<other>>!'
    expect(removeVariablePlaceholderFromText(text, 'nope')).toBe(text)
  })

  it('returns text for empty varName', () => {
    const text = 'Hello'
    expect(removeVariablePlaceholderFromText(text, '')).toBe(text)
  })
})

// ---------------------------------------------------------------------------
// ensurePlaceholderInText
// ---------------------------------------------------------------------------
describe('ensurePlaceholderInText', () => {
  const tpl = 'Bonjour <<clientName>>,\nVotre montant: <<montant>>\nMerci.'

  it('returns text unchanged if placeholder already present', () => {
    const text = 'Bonjour <<clientName>>,\nReste du texte.'
    expect(ensurePlaceholderInText(text, tpl, 'clientName')).toBe(text)
  })

  it('inserts missing placeholder near its template position', () => {
    const text = 'Bonjour,\nVotre montant: 100$\nMerci.'
    const result = ensurePlaceholderInText(text, tpl, 'clientName')
    expect(result).toContain('<<clientName>>')
  })

  it('returns empty string for no text and no template', () => {
    expect(ensurePlaceholderInText('', '', 'x')).toBe('')
  })

  it('handles missing varName', () => {
    expect(ensurePlaceholderInText('text', tpl, '')).toBe('text')
  })
})

// ---------------------------------------------------------------------------
// applyAssignments
// ---------------------------------------------------------------------------
describe('applyAssignments', () => {
  it('merges new values into prev', () => {
    const prev = { a: '1', b: '2' }
    const result = applyAssignments(prev, { b: '3', c: '4' })
    expect(result).toEqual({ a: '1', b: '3', c: '4' })
  })

  it('returns same reference if no diff', () => {
    const prev = { a: '1' }
    const result = applyAssignments(prev, { a: '1' })
    expect(result).toBe(prev) // referential equality
  })

  it('converts numeric values to string', () => {
    const result = applyAssignments({}, { amount: 42 })
    expect(result.amount).toBe('42')
  })

  it('handles null/undefined assignments', () => {
    const prev = { a: '1' }
    expect(applyAssignments(prev, null)).toBe(prev)
    expect(applyAssignments(prev, undefined)).toBe(prev)
    expect(applyAssignments(prev, {})).toBe(prev)
  })

  it('handles empty prev', () => {
    const result = applyAssignments({}, { x: 'y' })
    expect(result).toEqual({ x: 'y' })
  })

  it('treats null assignment value as empty string', () => {
    const prev = { a: 'old' }
    const result = applyAssignments(prev, { a: null })
    expect(result.a).toBe('')
  })
})
