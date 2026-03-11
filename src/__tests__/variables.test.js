import { describe, it, expect } from 'vitest'
import { normalizeVarKey, varKeysMatch, expandVariableAssignment, resolveVariableValue } from '../utils/variables'

describe('normalizeVarKey', () => {
  it('lowercases and strips non-alphanumeric chars', () => {
    expect(normalizeVarKey('First_Name')).toBe('firstname')
    expect(normalizeVarKey('  Email Address  ')).toBe('emailaddress')
  })

  it('strips language suffixes', () => {
    expect(normalizeVarKey('Name_FR')).toBe('name')
    expect(normalizeVarKey('Name_EN')).toBe('name')
    expect(normalizeVarKey('name_fr')).toBe('name')
  })

  it('returns empty string for falsy values', () => {
    expect(normalizeVarKey('')).toBe('')
    expect(normalizeVarKey(null)).toBe('')
    expect(normalizeVarKey(undefined)).toBe('')
  })

  it('handles numeric input', () => {
    expect(normalizeVarKey(123)).toBe('123')
  })
})

describe('varKeysMatch', () => {
  it('matches equivalent variable names', () => {
    expect(varKeysMatch('First Name', 'first_name')).toBe(true)
    expect(varKeysMatch('Name_FR', 'Name_EN')).toBe(true)
    expect(varKeysMatch('email', 'EMAIL')).toBe(true)
  })

  it('returns false for different variables', () => {
    expect(varKeysMatch('email', 'phone')).toBe(false)
    expect(varKeysMatch('first_name', 'last_name')).toBe(false)
  })

  it('returns false when either argument is falsy', () => {
    expect(varKeysMatch('', 'name')).toBe(false)
    expect(varKeysMatch('name', null)).toBe(false)
    expect(varKeysMatch(null, undefined)).toBe(false)
  })
})

describe('expandVariableAssignment', () => {
  it('assigns value to the given variable', () => {
    const result = expandVariableAssignment('Name', 'Alice')
    expect(result.Name).toBe('Alice')
  })

  it('expands to language suffixed variants', () => {
    const result = expandVariableAssignment('Name', 'Alice')
    expect(result.name_FR).toBe('Alice')
    expect(result.name_EN).toBe('Alice')
  })

  it('returns empty object for null varName', () => {
    expect(expandVariableAssignment(null, 'val')).toEqual({})
    expect(expandVariableAssignment('', 'val')).toEqual({})
  })

  it('converts null value to empty string', () => {
    const result = expandVariableAssignment('Name', null)
    expect(result.Name).toBe('')
  })

  it('respects preferredLanguage option', () => {
    const result = expandVariableAssignment('Name', 'Alice', { preferredLanguage: 'FR' })
    expect(result.name_FR).toBe('Alice')
  })
})

describe('resolveVariableValue', () => {
  it('returns direct match', () => {
    expect(resolveVariableValue({ Name: 'Alice' }, 'Name')).toBe('Alice')
  })

  it('returns empty string for missing variable', () => {
    expect(resolveVariableValue({ Name: 'Alice' }, 'Email')).toBe('')
  })

  it('handles normalized key matching', () => {
    expect(resolveVariableValue({ name_fr: 'Alice' }, 'Name_FR', 'fr')).toBe('Alice')
  })

  it('returns empty string for empty inputs', () => {
    expect(resolveVariableValue({}, '')).toBe('')
    expect(resolveVariableValue(null, 'Name')).toBe('')
  })

  it('prefers language-specific variant', () => {
    const vars = { name_fr: 'Bonjour', name_en: 'Hello' }
    expect(resolveVariableValue(vars, 'Name', 'fr')).toBe('Bonjour')
    expect(resolveVariableValue(vars, 'Name', 'en')).toBe('Hello')
  })
})
