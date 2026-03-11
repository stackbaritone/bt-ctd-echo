import React, { useState, useEffect, useRef, useCallback } from 'react'
import VariablesPopout from './VariablesPopout'

/**
 * Variables Page - Renders when ?varsOnly=1 is in URL
 * 
 * This page loads the template data and renders the Variables popout interface.
 * It receives template ID and language from URL parameters and syncs with the
 * main window via BroadcastChannel.
 */
export default function VariablesPage() {
  const paramsRef = useRef(null)
  if (!paramsRef.current) {
    paramsRef.current = new URLSearchParams(window.location.search)
  }
  const initialTemplateId = paramsRef.current.get('id')
  const initialLang = paramsRef.current.get('lang') || 'fr'

  const [templatesData, setTemplatesData] = useState(null)
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [variables, setVariables] = useState({})
  const [interfaceLanguage, setInterfaceLanguage] = useState(initialLang)
  const [pendingTemplateId, setPendingTemplateId] = useState(initialTemplateId || null)
  const [pendingTemplateLanguage, setPendingTemplateLanguage] = useState(initialLang)
  const [loading, setLoading] = useState(true)
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('ea_dark_mode')
      return saved === 'true'
    } catch { return false }
  })
  const hydratedTemplateIdRef = useRef(null)
  const debugLog = (...args) => { try { console.log('[Popout]', ...args) } catch {} }

  const normalizeTemplateId = useCallback((id) => {
    try {
      const raw = String(id || '').trim().toLowerCase()
      // strip trailing copy/dup markers and numeric suffixes like _1, -copy, -copy2
      const noCopy = raw.replace(/[-_ ](?:copy|dup|duplicate)\d*$/i, '')
      return noCopy.replace(/_(\d+)$/i, '')
    } catch { return String(id || '').trim().toLowerCase() }
  }, [])

  const inferTemplateFromVariables = useCallback((data, varsObj) => {
    try {
      if (!data?.templates?.length || !varsObj) return null
      const varKeys = new Set(Object.keys(varsObj).map(k => String(k).replace(/_(FR|EN)$/i,'')))
      let bestId = null
      let bestScore = 0
      for (const t of data.templates) {
        const list = Array.isArray(t.variables) ? t.variables : []
        const score = list.reduce((acc, v) => acc + (varKeys.has(v) ? 1 : 0), 0)
        if (score > bestScore) { bestScore = score; bestId = t.id }
      }
      return bestScore > 0 ? bestId : null
    } catch (e) {
      debugLog('inferTemplateFromVariables error', e)
      return null
    }
  }, [])

  const applyTemplateSelection = useCallback((data, templateId, options = {}) => {
    if (!data?.templates || !templateId) return false
    
    // First try exact match (most common case, fastest)
    let template = data.templates.find(t => t.id === templateId)
    
    // If no exact match, try normalized matching (for legacy IDs with suffixes)
    if (!template) {
      const want = normalizeTemplateId(templateId)
      for (const t of data.templates) {
        const nid = normalizeTemplateId(t.id)
        if (nid === want) { template = t; break }
      }
    }
    
    if (!template) return false

    debugLog('applyTemplateSelection', { templateId, resolvedId: template.id })
    setSelectedTemplate(template)

    if (options.preferLanguage) {
      setInterfaceLanguage(options.preferLanguage)
    }

    if (options.hydrateVariables) {
      const shouldHydrate = options.forceHydration || hydratedTemplateIdRef.current !== templateId
      if (shouldHydrate) {
        const fallback = {}
        const allowedKeys = new Set()
        const catalog = data.variables || {}
        const suffixes = ['FR', 'EN']
        if (Array.isArray(template.variables)) {
          template.variables.forEach((varName) => {
            const info = catalog[varName]
            const example = (() => {
              const ex = info?.example
              if (ex && typeof ex === 'object') return ex.fr || ex.en || ''
              return ex || ''
            })()
            fallback[varName] = example
            allowedKeys.add(varName)
            suffixes.forEach((suffix) => {
              const composite = `${varName}_${suffix}`
              // For suffixed variables prefer matching language if object form present
              const ex = info?.example
              if (ex && typeof ex === 'object') {
                if (/_(FR)$/i.test(composite)) fallback[composite] = ex.fr || ex.en || ''
                else if (/_(EN)$/i.test(composite)) fallback[composite] = ex.en || ex.fr || ''
                else fallback[composite] = ex.fr || ex.en || ''
              } else {
                fallback[composite] = example
              }
              allowedKeys.add(composite)
            })
          })
        }

  hydratedTemplateIdRef.current = templateId
        setVariables((prevVars) => {
          const prev = prevVars || {}
          if (options.mergeWithExisting === false) {
            return fallback
          }
          const merged = { ...fallback }
          Object.keys(prev).forEach((key) => {
            if (allowedKeys.has(key)) {
              merged[key] = prev[key]
            }
          })
          return merged
        })
      }
    }

    return true
  }, [setInterfaceLanguage, setVariables])

  useEffect(() => {
    let cancelled = false

    const loadSnapshot = () => {
      try {
        const stored = localStorage.getItem('ea_pending_popout_snapshot')
        if (!stored) return
        const parsed = JSON.parse(stored)
        const matchesTemplate = !parsed?.templateId || parsed.templateId === (pendingTemplateId || null)
        const matchesLanguage = !parsed?.templateLanguage || parsed.templateLanguage === (pendingTemplateLanguage || null)
        if (matchesTemplate && matchesLanguage) {
          if (parsed?.variables && typeof parsed.variables === 'object') {
            setVariables({ ...parsed.variables })
          }
        }
        // If snapshot carries template context but URL was empty, adopt it
        if (!pendingTemplateId && parsed?.templateId) {
          setPendingTemplateId(parsed.templateId)
        }
        if (parsed?.templateLanguage) {
          setPendingTemplateLanguage(parsed.templateLanguage)
          setInterfaceLanguage(parsed.templateLanguage)
        }
      } catch (hydrateError) {
        console.warn('📋 Unable to hydrate pending popout snapshot:', hydrateError)
      } finally {
        try { localStorage.removeItem('ea_pending_popout_snapshot') } catch {}
      }
    }

    const loadData = async () => {
      try {
        const RAW_MAIN = 'https://raw.githubusercontent.com/stackbaritone/bt-ctd-echo/main/complete_email_templates.json'
        const RAW_GHPAGES = 'https://raw.githubusercontent.com/stackbaritone/bt-ctd-echo/gh-pages/complete_email_templates.json'
        const base = (import.meta?.env?.BASE_URL) || '/'
        const normalizedBase = base.endsWith('/') ? base : `${base}/`
        const primaryBase = new URL(normalizedBase, window.location.origin)
        const bust = `?t=${Date.now()}`
        // Try local URLs first (works for private repos), then remote fallbacks
        const candidates = [
          new URL('complete_email_templates.json', primaryBase).href + bust,
          new URL('complete_email_templates.json', window.location.href).href + bust,
          new URL('complete_email_templates.json', window.location.origin).href + bust,
          RAW_MAIN + bust,
          RAW_GHPAGES + bust
        ]

        let data = null
        let lastError = null

        debugLog('attempting template fetch', { base, candidates })

        for (const url of candidates) {
          try {
            // Add cache-busting to ensure fresh template data
            const response = await fetch(url, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
            if (!response.ok) {
              lastError = new Error(`HTTP ${response.status} for ${url}`)
              continue
            }
            data = await response.json()
            debugLog('loaded templates', { count: Array.isArray(data?.templates) ? data.templates.length : 0, source: url })
            break
          } catch (attemptError) {
            lastError = attemptError
          }
        }

        if (!data) {
          throw lastError || new Error('Template catalog fetch failed')
        }

        if (cancelled) return
        setTemplatesData(data)
      } catch (error) {
        if (!cancelled) console.error('Failed to load templates:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSnapshot()
    loadData()

    // If no template id provided yet, use last used template from localStorage
    try {
      if (!pendingTemplateId) {
        const lastId = localStorage.getItem('ea_last_template_id')
        const lastLang = localStorage.getItem('ea_last_template_lang')
        if (lastId) {
          setPendingTemplateId(lastId)
          if (lastLang) {
            setPendingTemplateLanguage(lastLang)
            setInterfaceLanguage(lastLang)
          }
        }
      }
    } catch {}

    // Setup BroadcastChannel with small delay to ensure proper initialization
    let channel
    const setupChannel = () => {
      try {
        channel = new BroadcastChannel('email-assistant-sync')
        debugLog('BroadcastChannel connected')
        
        channel.onmessage = (event) => {
          const data = event.data || {}
          // Handle dark mode sync from main window
          if (data.type === 'darkModeChanged') {
            debugLog('received darkModeChanged', { darkMode: data.darkMode })
            setDarkMode(!!data.darkMode)
            return
          }
          if (data.type === 'variablesUpdated') {
            debugLog('received variablesUpdated', { templateId: data.templateId, templateLanguage: data.templateLanguage, vars: Object.keys(data.variables||{}).length })
            // Also sync dark mode if present in the update
            if (typeof data.darkMode === 'boolean') {
              setDarkMode(data.darkMode)
            }
            if (data.templateId) {
              setPendingTemplateId(data.templateId)
            }
            if (data.templateLanguage) {
              setPendingTemplateLanguage(data.templateLanguage)
              setInterfaceLanguage(data.templateLanguage)
            }
            if (data.variables && typeof data.variables === 'object') {
              setVariables({ ...data.variables })
            } else if (!data.templateId && templatesData) {
              // Try to infer the template from variables if possible
              const guessed = inferTemplateFromVariables(templatesData, data.variables || {})
              if (guessed) setPendingTemplateId(guessed)
            }
            // If we already have templates, apply template selection immediately to avoid flicker or fallback
            if (templatesData && data.templateId) {
              applyTemplateSelection(templatesData, data.templateId, {
                preferLanguage: data.templateLanguage,
                hydrateVariables: true
              })
            }
            return
          }
          // Also handle sync completion in case popout and page are both open
          if (data.type === 'syncComplete' && data.success) {
            debugLog('received syncComplete', { vars: Object.keys(data.variables||{}).length })
            if (data.variables && typeof data.variables === 'object') {
              setVariables({ ...data.variables })
            }
            if (data.templateId) {
              setPendingTemplateId(data.templateId)
            }
            if (data.templateLanguage) {
              setPendingTemplateLanguage(data.templateLanguage)
              setInterfaceLanguage(data.templateLanguage)
            }
          }
        }
        
        // Send ready signal to main window once
        const sendReady = () => {
          if (channel && !cancelled) {
            try {
              channel.postMessage({ type: 'popoutReady', timestamp: Date.now() })
              debugLog('sent popoutReady')
            } catch (e) {
              console.error('Failed to send ready signal:', e)
            }
          }
        }
        
        // Send once after a short delay to ensure everything is initialized
        setTimeout(sendReady, 200)
        
      } catch (e) {
        console.error('BroadcastChannel not available:', e)
      }
    }
    
    // Setup channel with delay
    const channelTimer = setTimeout(setupChannel, 100)

    return () => {
      cancelled = true
      clearTimeout(channelTimer)
      if (channel) channel.close()
    }
  }, [])

  useEffect(() => {
    if (!templatesData || !pendingTemplateId) return
    const resolved = applyTemplateSelection(templatesData, pendingTemplateId, {
      preferLanguage: pendingTemplateLanguage,
      hydrateVariables: true
    })
    if (!resolved) {
      console.warn('[VariablesPage] Unable to locate template for popout:', pendingTemplateId)
      // Template not found - could be a new template not yet in this window's cache
      // Try to reload templates once before giving up
      const allIds = (templatesData?.templates||[]).map(t => t.id)
      if (!allIds.includes(pendingTemplateId)) {
        // Template not in current catalog, attempting fresh reload
        // Try to fetch fresh data once
        const retryFetch = async () => {
          try {
            const base = (import.meta?.env?.BASE_URL) || '/'
            const normalizedBase = base.endsWith('/') ? base : `${base}/`
            const primaryBase = new URL(normalizedBase, window.location.origin)
            const url = new URL('complete_email_templates.json', primaryBase).href + '?t=' + Date.now()
            
            const response = await fetch(url, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
            if (response.ok) {
              const freshData = await response.json()
              setTemplatesData(freshData)
              // The effect will re-run with fresh data and try again
            } else {
              console.error('[VariablesPage] Fresh fetch failed with status:', response.status)
              // Give up after failed retry
              hydratedTemplateIdRef.current = null
              setSelectedTemplate(null)
              setPendingTemplateId(null)
            }
          } catch (e) {
            console.error('[VariablesPage] Exception during fresh fetch:', e)
            // Give up after exception
            hydratedTemplateIdRef.current = null
            setSelectedTemplate(null)
            setPendingTemplateId(null)
          }
        }
        retryFetch()
      }
    }
  }, [templatesData, pendingTemplateId, pendingTemplateLanguage, applyTemplateSelection, normalizeTemplateId])

  // Last-resort fallback: if data loaded but no template picked after a short grace period, pick first
  useEffect(() => {
    if (!templatesData || selectedTemplate || loading) return
    const timer = setTimeout(() => {
      if (!selectedTemplate && !pendingTemplateId && Array.isArray(templatesData?.templates) && templatesData.templates.length) {
        const fallbackId = templatesData.templates[0].id
        debugLog('fallback selecting first template', fallbackId)
        setPendingTemplateId(fallbackId)
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [templatesData, selectedTemplate, pendingTemplateId, loading])

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className={`animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4 ${darkMode ? 'border-[#fbbf24]' : 'border-teal-600'}`}></div>
          <p className={darkMode ? 'text-slate-300' : 'text-gray-600'}>
            {interfaceLanguage === 'fr' ? 'Chargement...' : 'Loading...'}
          </p>
        </div>
      </div>
    )
  }

  if (!selectedTemplate || !templatesData) {
    const waitingForTemplate = !!pendingTemplateId && !!templatesData && !selectedTemplate
    const message = waitingForTemplate
      ? (interfaceLanguage === 'fr' ? 'Recherche du modèle...' : 'Searching for template...')
      : !templatesData
      ? (interfaceLanguage === 'fr' ? 'Chargement des données...' : 'Loading data...')
      : (interfaceLanguage === 'fr' ? 'Modèle introuvable. Fermez et rouvrez le panneau.' : 'Template not found. Close and reopen panel.')
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className={`animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4 ${darkMode ? 'border-[#fbbf24]' : 'border-teal-600'}`}></div>
          <p className={`text-lg ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>{message}</p>
          {templatesData && pendingTemplateId && (
            <p className={`text-sm mt-2 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
              {interfaceLanguage === 'fr' ? `Modèle : ${pendingTemplateId}` : `Template: ${pendingTemplateId}`}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <VariablesPopout
      selectedTemplate={selectedTemplate}
      templatesData={templatesData}
      initialVariables={variables}
      interfaceLanguage={interfaceLanguage}
      templateLanguage={pendingTemplateLanguage || interfaceLanguage}
      darkMode={darkMode}
    />
  )
}
