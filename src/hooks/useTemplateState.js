import { useState, useEffect } from 'react'
import { loadState } from '../utils/storage'
import { CANONICAL_TEMPLATES, mergeTemplateDatasets } from '../utils/template'

export function useTemplateState() {
  const [templatesData, setTemplatesData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [favorites, setFavorites] = useState([])
  const [favoritesOnly, setFavoritesOnly] = useState(false)

  useEffect(() => {
    const savedState = loadState()
    if (savedState) {
      setSelectedTemplateId(savedState.selectedTemplateId)
      setSearchQuery(savedState.searchQuery)
      setSelectedCategory(savedState.selectedCategory)
      setFavorites(savedState.favorites)
      setFavoritesOnly(savedState.favoritesOnly)
    }
  }, [])

  useEffect(() => {
    const tryLoadAdminDataset = () => {
      try {
        const adminLocal = localStorage.getItem('ea_admin_templates_data')
        if (adminLocal) {
          const parsed = JSON.parse(adminLocal)
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.templates) && parsed.templates.length) {
            return parsed
          }
        }
      } catch {
        // ignore
      }
      return null
    }

    const fetchTemplatesFromSources = async () => {
      const RAW_MAIN = (import.meta?.env?.VITE_TEMPLATES_URL) || 'https://raw.githubusercontent.com/snarky1980/bt-ctd-echo/main/complete_email_templates.json'
      const RAW_GHPAGES = 'https://raw.githubusercontent.com/snarky1980/bt-ctd-echo/gh-pages/complete_email_templates.json'
      const LOCAL_URL = './complete_email_templates.json'
      const BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) ? import.meta.env.BASE_URL : '/'
      const ABSOLUTE_URL = (BASE_URL.endsWith('/') ? BASE_URL : BASE_URL + '/') + 'complete_email_templates.json'
      const ts = Date.now()
      const withBust = (u) => u + (u.includes('?') ? '&' : '?') + 'cb=' + ts
      // Try local URLs first (works for private repos), then remote fallbacks
      const candidates = [withBust(ABSOLUTE_URL), withBust(LOCAL_URL), withBust(RAW_MAIN), withBust(RAW_GHPAGES)]

      let loaded = null
      let lastErr = null
      for (const url of candidates) {
        try {
          const resp = await fetch(url, { cache: 'no-cache' })
          if (!resp.ok) throw new Error('HTTP ' + resp.status)
          const j = await resp.json()
          loaded = j
          break
        } catch (e) {
          lastErr = e
        }
      }
      if (!loaded) throw lastErr || new Error('No template source reachable')
      return loaded
    }

    const loadTemplatesData = async () => {
      const canonicalDataset = CANONICAL_TEMPLATES
      const adminDataset = tryLoadAdminDataset()
      if (adminDataset) {
        setTemplatesData(mergeTemplateDatasets(adminDataset, canonicalDataset))
        setLoading(false)
        try {
          const fallbackDataset = await fetchTemplatesFromSources()
          if (fallbackDataset) {
            setTemplatesData((prev) => mergeTemplateDatasets(prev || canonicalDataset, fallbackDataset))
          }
        } catch {
          // ignore
        }
        return
      }

      setTemplatesData(canonicalDataset)
      try {
        const remoteData = await fetchTemplatesFromSources()
        if (remoteData) {
          setTemplatesData(mergeTemplateDatasets(remoteData, canonicalDataset))
        }
      } catch (error) {
        console.error('Error loading templates data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadTemplatesData()
  }, [])

  useEffect(() => {
    if (!loading && templatesData && selectedTemplateId) {
      const templateToSelect = templatesData.templates.find(t => t.id === selectedTemplateId)
      if (templateToSelect) {
        setSelectedTemplate(templateToSelect)
      }
    }
  }, [loading, templatesData, selectedTemplateId])

  return {
    templatesData,
    loading,
    selectedTemplate,
    setSelectedTemplate,
    selectedTemplateId,
    setSelectedTemplateId,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    favorites,
    setFavorites,
    favoritesOnly,
    setFavoritesOnly,
  }
}
