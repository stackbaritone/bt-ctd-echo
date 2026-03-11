import { useEffect, useRef, useCallback } from 'react'
import { normalizeVarKey, expandVariableAssignment, resolveVariableValue } from '../utils/variables'
import { applyAssignments, findTemplatePlaceholderForVar, removeVariablePlaceholderFromText, ensurePlaceholderInText } from '../utils/template'

/**
 * Cross-window synchronization hook for variables, highlights, and popout communication.
 * Manages BroadcastChannel (ea_vars + email-assistant-sync), localStorage fallback,
 * hover/focus highlighting, and popout window lifecycle.
 */
export const useVariablesSync = ({
  variables,
  setVariables,
  variablesRef,
  selectedTemplate,
  selectedTemplateRef,
  templateLanguage,
  templateLanguageRef,
  setTemplateLanguage,
  selectedTemplateId,
  setSelectedTemplate,
  focusedVar,
  setFocusedVar,
  showHighlights,
  setShowHighlights,
  setFinalSubject,
  setFinalBody,
  finalSubjectRef,
  finalBodyRef,
  syncFromTextRef,
  darkMode,
  templatesData,
  varsOnlyMode,
}) => {
  // Cross-window sync refs
  const varsChannelRef = useRef(null)
  const varsSenderIdRef = useRef(Math.random().toString(36).slice(2))
  const popoutChannelRef = useRef(null)
  const popoutSenderIdRef = useRef(Math.random().toString(36).slice(2))
  const pendingPopoutSnapshotRef = useRef(null)
  const varsRemoteUpdateRef = useRef(false)
  const skipPopoutBroadcastRef = useRef({ pending: false, templateId: null, templateLanguage: null })
  const popoutWindowRef = useRef(null)
  const lastPopoutOpenedTimestampRef = useRef(0)
  const pendingTemplateIdRef = useRef(null)
  const focusFromPopoutRef = useRef(false)
  const focusClearTimerRef = useRef(null)

  const canUseBC = typeof window !== 'undefined' && 'BroadcastChannel' in window

  // ── Highlight helpers ──────────────────────────────────────────────

  const updateFocusHighlight = useCallback((varName) => {
    try {
      const normalized = normalizeVarKey(varName)
      const marks = document.querySelectorAll('mark.var-highlight')
      const pills = document.querySelectorAll('.var-pill')
      marks.forEach((node) => {
        const nodeKey = node.getAttribute('data-var')
        const isMatch = normalized && normalizeVarKey(nodeKey) === normalized
        node.classList.toggle('focused', !!isMatch)
      })
      pills.forEach((node) => {
        const nodeKey = node.getAttribute('data-var')
        const isMatch = normalized && normalizeVarKey(nodeKey) === normalized
        node.classList.toggle('focused', !!isMatch)
      })
    } catch (err) {
      console.warn('Failed to update focus highlight', err)
    }
  }, [])

  const scrollFocusIntoView = useCallback((varName) => {
    const normalized = normalizeVarKey(varName)
    if (!normalized) return
    requestAnimationFrame(() => {
      const pill = Array.from(document.querySelectorAll('.var-pill')).find((node) => normalizeVarKey(node.getAttribute('data-var')) === normalized)
      const mark = pill ? null : Array.from(document.querySelectorAll('mark.var-highlight')).find((node) => normalizeVarKey(node.getAttribute('data-var')) === normalized)
      const target = pill || mark
      if (!target) return
      try { target.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch {}
    })
  }, [])

  const updateHoverHighlight = useCallback((varName) => {
    try {
      const normalized = normalizeVarKey(varName)
      const marks = document.querySelectorAll('mark.var-highlight')
      const pills = document.querySelectorAll('.var-pill')
      marks.forEach((node) => {
        const nodeKey = node.getAttribute('data-var')
        const isMatch = normalized && normalizeVarKey(nodeKey) === normalized
        node.classList.toggle('hovered', !!isMatch)
      })
      pills.forEach((node) => {
        const nodeKey = node.getAttribute('data-var')
        const isMatch = normalized && normalizeVarKey(nodeKey) === normalized
        node.classList.toggle('hovered', !!isMatch)
      })
    } catch (err) {
      console.warn('Failed to update hover highlight', err)
    }
  }, [])

  const flagSkipPopoutBroadcast = useCallback(() => {
    skipPopoutBroadcastRef.current = {
      pending: true,
      templateId: selectedTemplateRef.current?.id || null,
      templateLanguage: templateLanguageRef.current || null
    }
  }, [selectedTemplateRef, templateLanguageRef])

  // ── Popout focus request ───────────────────────────────────────────

  const requestExistingPopoutFocus = useCallback(() => {
    if (!canUseBC) return Promise.resolve(false)

    const channel = popoutChannelRef.current || (() => {
      try { return new BroadcastChannel('email-assistant-sync') } catch { return null }
    })()
    if (!channel) return Promise.resolve(false)

    return new Promise((resolve) => {
      let done = false
      const cleanup = (handler, timer) => {
        try { channel.removeEventListener('message', handler) } catch {}
        clearTimeout(timer)
        if (!popoutChannelRef.current) {
          try { channel.close() } catch {}
        }
      }
      const handler = (event) => {
        const msg = event.data
        if (!msg || msg.sender === popoutSenderIdRef.current) return
        if (msg.type === 'popoutFocusAck') {
          if (done) return
          done = true
          cleanup(handler, timer)
          resolve(true)
        }
      }
      const timer = setTimeout(() => {
        if (done) return
        done = true
        cleanup(handler, timer)
        resolve(false)
      }, 400)
      try { channel.addEventListener('message', handler) } catch {}
      try { channel.postMessage({ type: 'popoutFocusRequest', sender: popoutSenderIdRef.current }) } catch {}
    })
  }, [canUseBC])

  // ── Focus highlight effects ────────────────────────────────────────

  // Focus → outline matching marks/pills; blur clears after a short delay
  useEffect(() => {
    if (focusClearTimerRef.current) { clearTimeout(focusClearTimerRef.current); focusClearTimerRef.current = null }
    if (focusedVar) {
      updateFocusHighlight(focusedVar)
    } else {
      focusClearTimerRef.current = setTimeout(() => updateFocusHighlight(null), 300)
    }
    return () => { if (focusClearTimerRef.current) { clearTimeout(focusClearTimerRef.current); focusClearTimerRef.current = null } }
  }, [focusedVar, updateFocusHighlight])

  // Listen for pill focus events dispatched from PillComponent
  useEffect(() => {
    const handler = (e) => {
      const { key } = e.detail || {}
      setFocusedVar(key || null)
    }
    window.addEventListener('ea-focus-variable', handler)
    return () => window.removeEventListener('ea-focus-variable', handler)
  }, [setFocusedVar])

  // Track hover over pills and marks to sync with popout
  useEffect(() => {
    let currentHoveredVar = null
    const handleMouseOver = (e) => {
      const target = e.target
      if (!target) return
      const pill = target.closest('.var-pill')
      const mark = target.closest('mark.var-highlight')
      const element = pill || mark
      if (element) {
        const varName = element.getAttribute('data-var')
        if (varName && varName !== currentHoveredVar) {
          currentHoveredVar = varName
          updateHoverHighlight(varName)
          if (popoutChannelRef.current) {
            try {
              popoutChannelRef.current.postMessage({ type: 'variableHovered', varName, sender: popoutSenderIdRef.current })
            } catch (e) { console.error('Failed to send hover update:', e) }
          }
        }
      } else if (currentHoveredVar) {
        currentHoveredVar = null
        updateHoverHighlight(null)
        if (popoutChannelRef.current) {
          try {
            popoutChannelRef.current.postMessage({ type: 'variableHovered', varName: null, sender: popoutSenderIdRef.current })
          } catch (e) { console.error('Failed to send hover clear:', e) }
        }
      }
    }
    document.addEventListener('mouseover', handleMouseOver, true)
    return () => {
      document.removeEventListener('mouseover', handleMouseOver, true)
      if (currentHoveredVar) updateHoverHighlight(null)
    }
  }, [updateHoverHighlight])

  // Refresh outlines if content updates while focused
  useEffect(() => {
    if (!focusedVar) return
    requestAnimationFrame(() => updateFocusHighlight(focusedVar))
  }, [variables, showHighlights, focusedVar, updateFocusHighlight])

  // Clear any lingering highlight when switching template or language
  useEffect(() => {
    updateFocusHighlight(null)
  }, [selectedTemplateId, templateLanguage, updateFocusHighlight])

  // ── BroadcastChannel: ea_vars ──────────────────────────────────────

  useEffect(() => {
    if (!canUseBC) return
    try {
      const ch = new BroadcastChannel('ea_vars')
      varsChannelRef.current = ch

      ch.onmessage = (ev) => {
        const msg = ev?.data || {}
        if (!msg || msg.sender === varsSenderIdRef.current) return
        const applyTemplateMeta = (m) => {
          if (m?.templateLanguage && (m.templateLanguage === 'fr' || m.templateLanguage === 'en')) {
            setTemplateLanguage(m.templateLanguage)
          }
          if (m?.templateId) {
            if (templatesData?.templates?.length) {
              const found = templatesData.templates.find(t => t.id === m.templateId)
              if (found) setSelectedTemplate(found)
            } else {
              pendingTemplateIdRef.current = m.templateId
            }
          }
        }
        if (msg.type === 'update' && (msg.variables || msg.templateId || msg.templateLanguage || Object.hasOwn(msg, 'focusedVar'))) {
          if (msg.variables && typeof msg.variables === 'object') {
            varsRemoteUpdateRef.current = true
            setVariables(prev => {
              const next = { ...prev, ...msg.variables }
              variablesRef.current = next
              return next
            })
          }
          if (Object.hasOwn(msg, 'focusedVar')) {
            setFocusedVar(msg.focusedVar)
          }
          applyTemplateMeta(msg)
        } else if (msg.type === 'request_state') {
          ch.postMessage({ type: 'state', variables, templateId: selectedTemplate?.id || null, templateLanguage, focusedVar, sender: varsSenderIdRef.current })
        } else if (msg.type === 'state') {
          if (msg.variables) {
            varsRemoteUpdateRef.current = true
            setVariables(prev => {
              const next = { ...prev, ...msg.variables }
              variablesRef.current = next
              return next
            })
          }
          if (Object.hasOwn(msg, 'focusedVar')) {
            setFocusedVar(msg.focusedVar)
          }
          applyTemplateMeta(msg)
        }
      }
      if (varsOnlyMode) {
        setTimeout(() => {
          try { ch.postMessage({ type: 'request_state', sender: varsSenderIdRef.current }) } catch {}
        }, 50)
      }
      return () => { try { ch.close() } catch {} }
    } catch {}
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── BroadcastChannel: email-assistant-sync ─────────────────────────

  useEffect(() => {
    if (!canUseBC) return
    try {
      const channel = new BroadcastChannel('email-assistant-sync')
      popoutChannelRef.current = channel

      channel.onmessage = (event) => {
        const msg = event.data
        if (!msg || msg.sender === popoutSenderIdRef.current) return

        if (msg.type === 'variableHovered') {
          updateHoverHighlight(msg.varName || null)
          return
        }

        if (msg.type === 'popoutFocusRequest') {
          if (varsOnlyMode) {
            try { window.focus() } catch {}
            try { channel.postMessage({ type: 'popoutFocusAck', sender: popoutSenderIdRef.current }) } catch {}
          }
          return
        }

        if (msg.type === 'variableChanged' && msg.allVariables) {
          varsRemoteUpdateRef.current = true
          flagSkipPopoutBroadcast()
          const next = { ...msg.allVariables }
          variablesRef.current = next
          setVariables(next)
          try {
            const lang = templateLanguageRef.current || 'fr'
            document.querySelectorAll('.var-pill').forEach(pill => {
              const varName = pill.getAttribute('data-var')
              if (!varName) return
              const varValue = resolveVariableValue(next, varName, lang)
              if (varValue === '__DELETED__') { pill.remove(); return }
              const isFilled = varValue.trim().length > 0
              const displayValue = isFilled ? varValue : `<<${varName}>>`
              const currentText = (pill.textContent || '').trim()
              if (currentText !== displayValue.trim()) {
                pill.textContent = displayValue
                pill.classList.toggle('filled', isFilled)
                pill.classList.toggle('empty', !isFilled)
                pill.setAttribute('data-display', isFilled ? varValue : '')
              }
            })
          } catch {}
          try {
            Object.entries(next).forEach(([k, v]) => {
              if (v === '__DELETED__') {
                const base = k.replace(/_(FR|EN)$/i, '')
                document.querySelectorAll('.var-pill').forEach(pill => {
                  const pv = pill.getAttribute('data-var') || ''
                  if (pv === k || pv.replace(/_(FR|EN)$/i, '') === base) pill.remove()
                })
              }
            })
          } catch {}
          return
        }

        if (msg.type === 'variableDeleted' && msg.varName) {
          const { varName } = msg
          varsRemoteUpdateRef.current = true
          flagSkipPopoutBroadcast()
          const next = msg.allVariables
            ? { ...msg.allVariables }
            : { ...variablesRef.current, [varName]: '__DELETED__' }
          variablesRef.current = next
          setVariables(next)

          if (varName) {
            setFinalSubject(prev => {
              const base = typeof prev === 'string' ? prev : finalSubjectRef.current || ''
              const updated = removeVariablePlaceholderFromText(base, varName)
              finalSubjectRef.current = updated
              return updated
            })
            setFinalBody(prev => {
              const base = typeof prev === 'string' ? prev : finalBodyRef.current || ''
              const updated = removeVariablePlaceholderFromText(base, varName)
              finalBodyRef.current = updated
              return updated
            })
            try {
              const baseName = varName.replace(/_(FR|EN)$/i, '')
              document.querySelectorAll('.var-pill').forEach(pill => {
                const pv = pill.getAttribute('data-var') || ''
                if (pv === varName || pv.replace(/_(FR|EN)$/i, '') === baseName) pill.remove()
              })
            } catch {}
          }
          return
        }

        if (msg.type === 'variableRestored' && msg.varName) {
          const { varName, value = '' } = msg
          varsRemoteUpdateRef.current = true
          flagSkipPopoutBroadcast()
          const next = msg.allVariables
            ? { ...msg.allVariables }
            : (() => {
                const assignments = expandVariableAssignment(varName, value, {
                  preferredLanguage: (templateLanguageRef.current || 'fr').toUpperCase(),
                  variables: variablesRef.current
                })
                return applyAssignments(variablesRef.current, assignments)
              })()
          variablesRef.current = next
          setVariables(next)

          const latestTemplate = selectedTemplateRef.current
          const latestLanguage = templateLanguageRef.current || templateLanguage
          const subjectTemplate = latestTemplate?.subject?.[latestLanguage] || ''
          const bodyTemplate = latestTemplate?.body?.[latestLanguage] || ''

          const subjectHasVar = !!findTemplatePlaceholderForVar(subjectTemplate, varName)
          if (subjectHasVar) {
            setFinalSubject(prev => {
              const base = typeof prev === 'string' ? prev : finalSubjectRef.current || ''
              const updated = ensurePlaceholderInText(base, subjectTemplate, varName)
              finalSubjectRef.current = updated
              return updated
            })
          }
          const bodyHasVar = !!findTemplatePlaceholderForVar(bodyTemplate, varName)
          if (bodyHasVar) {
            setFinalBody(prev => {
              const base = typeof prev === 'string' ? prev : finalBodyRef.current || ''
              const updated = ensurePlaceholderInText(base, bodyTemplate, varName)
              finalBodyRef.current = updated
              return updated
            })
          }
          return
        }

        if (msg.type === 'focusedVar') {
          focusFromPopoutRef.current = true
          const next = msg.varName ?? null
          setFocusedVar(next)
          updateFocusHighlight(next)
          scrollFocusIntoView(next)
          return
        }

        if (msg.type === 'popoutOpened' || msg.type === 'popoutReady') {
          const now = Date.now()
          if (lastPopoutOpenedTimestampRef.current && (now - lastPopoutOpenedTimestampRef.current) < 5000) return
          lastPopoutOpenedTimestampRef.current = now

          setTimeout(() => {
            let latestVariables = null
            try {
              const runSync = syncFromTextRef.current
              const syncResult = typeof runSync === 'function' ? runSync() : null
              if (syncResult?.variables) latestVariables = { ...syncResult.variables }
            } catch (syncError) {
              console.error('Failed to extract variables while preparing popout snapshot:', syncError)
            }
            if (!latestVariables && pendingPopoutSnapshotRef.current) latestVariables = { ...pendingPopoutSnapshotRef.current }
            if (!latestVariables) latestVariables = { ...variablesRef.current }
            pendingPopoutSnapshotRef.current = null
            try {
              channel.postMessage({
                type: 'variablesUpdated',
                variables: latestVariables,
                templateId: selectedTemplateRef.current?.id || null,
                templateLanguage: templateLanguageRef.current || templateLanguage,
                sender: popoutSenderIdRef.current
              })
            } catch (e) { console.error('Failed to send variables snapshot to popout:', e) }
          }, 60)
          return
        }

        if (msg.type === 'syncFromText') {
          setTimeout(() => {
            const runSync = syncFromTextRef.current
            const result = typeof runSync === 'function' ? runSync() : { success: false, updated: false, variables: { ...variablesRef.current } }
            try {
              channel.postMessage({ type: 'syncComplete', success: result.success, updated: result.updated, variables: result.variables, sender: popoutSenderIdRef.current })
            } catch (e) { console.error('Failed to send sync result:', e) }
          }, 50)
          return
        }
      }

      return () => {
        try { channel.close() } catch (e) { console.error('Error closing BroadcastChannel:', e) }
        popoutChannelRef.current = null
      }
    } catch (e) {
      console.error('BroadcastChannel not available:', e)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Emit variable updates (debounced) ──────────────────────────────

  useEffect(() => {
    if (!canUseBC) return
    if (varsRemoteUpdateRef.current) { varsRemoteUpdateRef.current = false; return }
    const snapshot = { ...variables }
    const timeoutId = setTimeout(() => {
      const ch = varsChannelRef.current
      if (!ch) return
      try { ch.postMessage({ type: 'update', variables: snapshot, sender: varsSenderIdRef.current }) } catch {}
    }, 90)
    return () => clearTimeout(timeoutId)
  }, [variables]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Emit template & language sync ──────────────────────────────────

  useEffect(() => {
    if (!canUseBC) return
    const activeTemplateId = selectedTemplateRef.current?.id || selectedTemplateId || null
    const ch = varsChannelRef.current
    if (!ch) return
    const payload = { type: 'update', templateId: activeTemplateId, templateLanguage, sender: varsSenderIdRef.current }
    try { ch.postMessage(payload) } catch {}
    const popCh = popoutChannelRef.current
    if (popCh) {
      try { popCh.postMessage({ type: 'variablesUpdated', variables: { ...variablesRef.current }, templateId: activeTemplateId, templateLanguage, sender: popoutSenderIdRef.current }) } catch {}
    }
  }, [selectedTemplateId, templateLanguage]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync variables to popout in real-time ──────────────────────────

  useEffect(() => {
    if (!canUseBC) return
    const channel = popoutChannelRef.current
    if (!channel) return
    if (varsRemoteUpdateRef.current) { varsRemoteUpdateRef.current = false; return }

    const activeTemplateId = selectedTemplateRef.current?.id || selectedTemplateId || null
    const skipMeta = skipPopoutBroadcastRef.current
    if (skipMeta?.pending && skipMeta.templateId === activeTemplateId && skipMeta.templateLanguage === (templateLanguage || null)) {
      skipPopoutBroadcastRef.current = { pending: false, templateId: null, templateLanguage: null }
      return
    }
    skipPopoutBroadcastRef.current = { pending: false, templateId: null, templateLanguage: null }

    try {
      channel.postMessage({
        type: 'variablesUpdated',
        variables: { ...variables },
        templateId: activeTemplateId,
        templateLanguage,
        darkMode,
        sender: popoutSenderIdRef.current
      })
    } catch (e) { console.error('Failed to broadcast variables to popout:', e) }

    try {
      localStorage.setItem('ea_vars_sync_payload', JSON.stringify({
        type: 'variablesUpdated',
        variables: { ...variables },
        templateId: activeTemplateId,
        templateLanguage,
        timestamp: Date.now(),
        sender: popoutSenderIdRef.current
      }))
    } catch {}
  }, [variables, selectedTemplateId, templateLanguage]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Emit focused variable changes ──────────────────────────────────

  useEffect(() => {
    if (focusFromPopoutRef.current) {
      focusFromPopoutRef.current = false
    } else if (canUseBC) {
      const ch = varsChannelRef.current
      if (ch) {
        try { ch.postMessage({ type: 'update', focusedVar, sender: varsSenderIdRef.current }) } catch {}
      }
      const popoutChannel = popoutChannelRef.current
      if (popoutChannel) {
        try {
          popoutChannel.postMessage({
            type: 'focusedVar',
            varName: focusedVar ?? null,
            normalizedVar: normalizeVarKey(focusedVar) || null,
            sender: popoutSenderIdRef.current
          })
        } catch {}
      }
    }
    const timeoutId = setTimeout(() => {
      if (focusFromPopoutRef.current) return
      try {
        localStorage.setItem('ea_focused_var', JSON.stringify({
          focusedVar,
          normalizedVar: normalizeVarKey(focusedVar) || null,
          timestamp: Date.now(),
          sender: varsSenderIdRef.current
        }))
      } catch {}
    }, 50)
    return () => clearTimeout(timeoutId)
  }, [focusedVar]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Emit showHighlights changes ────────────────────────────────────

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem('ea_show_highlights_sync', JSON.stringify({
          showHighlights,
          timestamp: Date.now(),
          sender: varsSenderIdRef.current
        }))
      } catch {}
    }, 50)
    return () => clearTimeout(timeoutId)
  }, [showHighlights])

  // ── localStorage fallback listener ─────────────────────────────────

  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'ea_focused_var' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue)
          if (data.sender !== varsSenderIdRef.current && (Date.now() - data.timestamp) < 5000) {
            setFocusedVar(data.focusedVar)
          }
        } catch {}
      } else if (e.key === 'ea_show_highlights_sync' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue)
          if (data.sender !== varsSenderIdRef.current && (Date.now() - data.timestamp) < 5000) {
            setShowHighlights(data.showHighlights)
          }
        } catch {}
      } else if (e.key === 'ea_vars_sync_payload' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue)
          if (!data || !data.timestamp || (Date.now() - data.timestamp) >= 5000) return
          if (data.sender === varsSenderIdRef.current || data.sender === popoutSenderIdRef.current) return
          if (data.type === 'variableChanged' && data.allVariables && typeof data.allVariables === 'object') {
            varsRemoteUpdateRef.current = true
            const next = { ...data.allVariables }
            variablesRef.current = next
            setVariables(next)
          }
        } catch {}
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [setFocusedVar, setShowHighlights, setVariables, variablesRef])

  // ── Apply pending remote template once templates load ──────────────

  useEffect(() => {
    const pid = pendingTemplateIdRef.current
    if (!pid || !templatesData?.templates?.length) return
    const found = templatesData.templates.find(t => t.id === pid)
    if (found) setSelectedTemplate(found)
    pendingTemplateIdRef.current = null
  }, [templatesData, setSelectedTemplate])

  return {
    canUseBC,
    requestExistingPopoutFocus,
    popoutChannelRef,
    popoutSenderIdRef,
    popoutWindowRef,
    varsRemoteUpdateRef,
    pendingPopoutSnapshotRef,
    focusFromPopoutRef,
    flagSkipPopoutBroadcast,
    updateFocusHighlight,
    updateHoverHighlight,
    scrollFocusIntoView,
  }
}
