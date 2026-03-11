import { useState, useEffect, useRef } from 'react'
import { CANONICAL_TEMPLATES, mergeTemplateDatasets } from '../utils/template.js'

function tryLoadAdminDataset(debug) {
  try {
    const adminLocal = localStorage.getItem('ea_admin_templates_data')
    if (adminLocal) {
      const parsed = JSON.parse(adminLocal)
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.templates) && parsed.templates.length) {
        if (debug) console.log('[EA][Debug] Using locally published admin templates dataset')
        return parsed
      }
    }
  } catch (e) {
    if (debug) console.warn('[EA][Debug] local admin dataset parse failed', e)
  }
  return null
}

async function fetchTemplatesFromSources(debug) {
  if (debug) console.log('[EA][Debug] Fetching templates (prefer local data)...')
  const RAW_MAIN = (import.meta?.env?.VITE_TEMPLATES_URL) || 'https://raw.githubusercontent.com/snarky1980/bt-ctd-echo/main/complete_email_templates.json'
  const RAW_GHPAGES = 'https://raw.githubusercontent.com/snarky1980/bt-ctd-echo/gh-pages/complete_email_templates.json'
  const LOCAL_URL = './complete_email_templates.json'
  const BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) ? import.meta.env.BASE_URL : '/'
  const ABSOLUTE_URL = (BASE_URL.endsWith('/') ? BASE_URL : BASE_URL + '/') + 'complete_email_templates.json'
  const ts = Date.now()
  const withBust = (u) => u + (u.includes('?') ? '&' : '?') + 'cb=' + ts
  const candidates = [withBust(ABSOLUTE_URL), withBust(LOCAL_URL), withBust(RAW_MAIN), withBust(RAW_GHPAGES)]

  let loaded = null
  let lastErr = null
  for (const url of candidates) {
    try {
      if (debug) console.log('[EA][Debug] Try fetch', url)
      const resp = await fetch(url, { cache: 'no-cache' })
      if (!resp.ok) throw new Error('HTTP ' + resp.status)
      const j = await resp.json()
      loaded = j
      break
    } catch (e) {
      lastErr = e
      if (debug) console.warn('[EA][Debug] fetch candidate failed', url, e?.message || e)
    }
  }
  if (!loaded) throw lastErr || new Error('No template source reachable')
  return loaded
}

/**
 * Hook to load templates and auto-refresh from admin console updates.
 * Returns { templatesData, setTemplatesData, loading }.
 * Also handles localStorage polling and storage events for admin sync.
 */
export function useTemplateLoader(debug, selectedTemplateRef, setSelectedTemplate, lastRebuiltTemplateIdRef) {
  const [templatesData, setTemplatesData] = useState(null)
  const [loading, setLoading] = useState(true)
  const loadingGuardRef = useRef(false)

  // Initial load
  useEffect(() => {
    if (loadingGuardRef.current) return
    loadingGuardRef.current = true
    let cancelled = false

    const loadTemplatesData = async () => {
      const canonicalDataset = CANONICAL_TEMPLATES
      const adminDataset = tryLoadAdminDataset(debug)
      if (adminDataset) {
        if (cancelled) return
        setTemplatesData(mergeTemplateDatasets(adminDataset, canonicalDataset))
        setLoading(false)
        try {
          const fallbackDataset = await fetchTemplatesFromSources(debug)
          if (cancelled) return
          if (fallbackDataset) {
            setTemplatesData((prev) => mergeTemplateDatasets(prev || canonicalDataset, fallbackDataset))
            if (debug) console.log('[EA][Debug] Admin dataset merged with fallback metadata')
          }
        } catch (fallbackError) {
          if (debug) console.warn('[EA][Debug] Fallback template fetch failed', fallbackError)
        }
        return
      }

      setTemplatesData(canonicalDataset)
      try {
        const remoteData = await fetchTemplatesFromSources(debug)
        if (cancelled) return
        if (remoteData) {
          setTemplatesData((prev) => mergeTemplateDatasets(remoteData, prev || canonicalDataset))
          if (debug) console.log('[EA][Debug] Templates loaded:', remoteData?.templates?.length)
        }
      } catch (error) {
        console.error('Error loading templates data:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadTemplatesData()
    return () => { cancelled = true }
  }, [debug])

  // Auto-refresh: poll for admin console updates
  const lastKnownUpdatedAt = useRef(null)
  const lastLocalStorageCheck = useRef(null)
  useEffect(() => {
    if (!templatesData) return

    if (!lastKnownUpdatedAt.current) {
      lastKnownUpdatedAt.current = templatesData?.metadata?.updatedAt || null
    }

    const abortController = new AbortController()

    const checkForUpdates = async () => {
      try {
        // Check localStorage for admin draft (instant sync)
        const adminLocal = localStorage.getItem('ea_admin_templates_data')
        if (adminLocal && adminLocal !== lastLocalStorageCheck.current) {
          lastLocalStorageCheck.current = adminLocal
          const parsed = JSON.parse(adminLocal)
          const localUpdatedAt = parsed?.metadata?.updatedAt || JSON.stringify(parsed?.templates?.length)

          if (localUpdatedAt && localUpdatedAt !== lastKnownUpdatedAt.current) {
            console.log('[EA] Local admin update detected, syncing...', { old: lastKnownUpdatedAt.current, new: localUpdatedAt })
            lastKnownUpdatedAt.current = localUpdatedAt

            const currentTemplateId = selectedTemplateRef.current?.id || null
            setTemplatesData(parsed)

            if (currentTemplateId) {
              const stillExists = parsed.templates.find(t => t.id === currentTemplateId)
              if (stillExists) {
                setSelectedTemplate(stillExists)
                if (lastRebuiltTemplateIdRef) lastRebuiltTemplateIdRef.current = null
              } else {
                setSelectedTemplate(null)
              }
            }
            return
          }
        }

        // Check remote file
        const BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) ? import.meta.env.BASE_URL : '/'
        const url = (BASE_URL.endsWith('/') ? BASE_URL : BASE_URL + '/') + 'complete_email_templates.json?t=' + Date.now()

        const resp = await fetch(url, { cache: 'no-store', signal: abortController.signal })
        if (!resp.ok) return

        const json = await resp.json()
        const remoteUpdatedAt = json?.metadata?.updatedAt || null

        if (remoteUpdatedAt && remoteUpdatedAt !== lastKnownUpdatedAt.current) {
          console.log('[EA] Template update detected, reloading...', { old: lastKnownUpdatedAt.current, new: remoteUpdatedAt })
          lastKnownUpdatedAt.current = remoteUpdatedAt

          const currentTemplateId = selectedTemplateRef.current?.id || null
          setTemplatesData(json)

          if (currentTemplateId) {
            const stillExists = json.templates.find(t => t.id === currentTemplateId)
            if (stillExists) {
              setSelectedTemplate(stillExists)
              if (lastRebuiltTemplateIdRef) lastRebuiltTemplateIdRef.current = null
            } else {
              setSelectedTemplate(null)
              console.log('[EA] Selected template was deleted')
            }
          }
        }
      } catch (e) {
        if (debug) console.warn('[EA][Debug] Update check failed:', e)
      }
    }

    const interval = setInterval(checkForUpdates, 5000)

    const handleStorageChange = (e) => {
      if (e.key === 'ea_admin_templates_data') {
        checkForUpdates()
      }
    }
    window.addEventListener('storage', handleStorageChange)

    return () => {
      clearInterval(interval)
      abortController.abort()
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [templatesData, debug, selectedTemplateRef, setSelectedTemplate, lastRebuiltTemplateIdRef])

  return { templatesData, setTemplatesData, loading, setLoading }
}
