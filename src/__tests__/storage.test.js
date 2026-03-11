import { describe, it, expect, beforeEach } from 'vitest'
import { loadState, saveState, getDefaultState, clearState } from '../utils/storage'

describe('storage utilities', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('getDefaultState', () => {
    it('returns expected defaults', () => {
      const state = getDefaultState()
      expect(state.interfaceLanguage).toBe('fr')
      expect(state.templateLanguage).toBe('fr')
      expect(state.searchQuery).toBe('')
      expect(state.selectedCategory).toBe('all')
      expect(state.variables).toEqual({})
      expect(state.favorites).toEqual([])
      expect(state.favoritesOnly).toBe(false)
      expect(state.darkMode).toBe(false)
    })
  })

  describe('loadState', () => {
    it('returns default state when localStorage is empty', () => {
      expect(loadState()).toEqual(getDefaultState())
    })

    it('merges saved state with defaults', () => {
      localStorage.setItem('ea_state_v1', JSON.stringify({ darkMode: true }))
      const state = loadState()
      expect(state.darkMode).toBe(true)
      expect(state.interfaceLanguage).toBe('fr')
    })

    it('handles corrupt JSON gracefully', () => {
      localStorage.setItem('ea_state_v1', '{invalid json')
      expect(loadState()).toEqual(getDefaultState())
    })
  })

  describe('saveState', () => {
    it('saves state to localStorage', () => {
      saveState({ darkMode: true })
      const raw = localStorage.getItem('ea_state_v1')
      expect(JSON.parse(raw)).toEqual({ darkMode: true })
    })
  })

  describe('clearState', () => {
    it('removes state from localStorage', () => {
      saveState({ darkMode: true })
      clearState()
      expect(localStorage.getItem('ea_state_v1')).toBeNull()
    })
  })
})
