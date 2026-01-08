import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Edit3, X, RotateCcw } from 'lucide-react'
import {
  LANGUAGE_SUFFIXES,
  expandVariableAssignment,
  normalizeVarKey,
  resolveVariableValue,
  varKeysMatch
} from './utils/variables'
import { resolveVariableInfo, guessSampleValue, applyAssignments } from './utils/template'

/**
 * Standalone Variables Editor Popout Window
 * 
 * This component renders in a separate browser window (popout) and allows
 * editing of template variables. Changes are synced back to the main window
 * via BroadcastChannel.
 */
const shallowEqual = (a, b) => {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false
  }
  return true
}

export default function VariablesPopout({ 
  selectedTemplate, 
  templatesData, 
  initialVariables, 
  interfaceLanguage,
  templateLanguage = 'fr',
  darkMode = false
}) {
  const [variables, setVariables] = useState(initialVariables || {})
  const varInputRefs = useRef({})
  const variablesRef = useRef(variables)

  // Auto-resize helper for textareas
  const autoResize = useCallback((el) => {
    if (!el) return
    try {
      el.style.height = 'auto'
      const next = Math.max(32, el.scrollHeight)
      el.style.height = `${next}px`
    } catch {}
  }, [])
  const lastInitialVarsRef = useRef(initialVariables)
  // Keep local variables in sync with prop changes from parent page
  // but never override while the user is typing (focused field)
  useEffect(() => {
    if (lastInitialVarsRef.current === initialVariables) return

    // If a field is focused, skip applying incoming props to avoid cursor jump
    if (focusedVarRef.current) {
      return
    }

    lastInitialVarsRef.current = initialVariables
    if (initialVariables && typeof initialVariables === 'object') {
      setVariables((prev) => shallowEqual(prev, initialVariables) ? prev : { ...initialVariables })
    } else {
      setVariables({})
    }
  }, [initialVariables])

  useEffect(() => {
    variablesRef.current = variables
  }, [variables])

  const applyVariablesToInputs = useCallback((nextVars) => {
    const focused = focusedVarRef.current
    const list = Array.isArray(selectedTemplate?.variables) ? selectedTemplate.variables : []
    
    // Check if the popout window actually has focus
    // This is critical: when user edits in main window, popout window doesn't have focus
    // so we should update ALL fields. Only skip focused field when user is actively
    // typing in the popout window itself.
    const windowHasFocus = document.hasFocus()
    
    for (const baseName of list) {
      const el = varInputRefs.current?.[baseName]
      if (!el) continue
      
      // Only skip if the element is active AND the window has focus
      // (user is actually typing in this popout)
      if (el === document.activeElement && windowHasFocus) continue
      if (focused && varKeysMatch(focused, baseName) && windowHasFocus) continue

      const resolved = resolveVariableValue(nextVars || {}, baseName, templateLanguage)
      const nextValue = resolved === '__DELETED__' ? '' : String(resolved ?? '')
      if (el.value !== nextValue) {
        el.value = nextValue
        autoResize(el)
      }
    }
  }, [autoResize, selectedTemplate, templateLanguage])

  // Resize all inputs whenever variables change (content update) or on mount
  useEffect(() => {
    try {
      const map = varInputRefs.current || {}
      Object.values(map).forEach((el) => autoResize(el))
    } catch {}
  }, [variables, autoResize])

  const activeLanguageCode = useMemo(() => (templateLanguage || 'fr').toUpperCase(), [templateLanguage])
  const targetVarForLanguage = useCallback((name = '') => {
    if (/_(FR|EN)$/i.test(name)) return name
    return `${name}_${activeLanguageCode}`
  }, [activeLanguageCode])

  const getVarValue = useCallback((name = '') => {
    const value = resolveVariableValue(variables, name, templateLanguage)
    return value === '__DELETED__' ? '' : value
  }, [variables, templateLanguage])
  const [columns, setColumns] = useState(2)

  // Auto-adjust columns based on window width
  useEffect(() => {
    const calculateColumns = () => {
      const width = window.innerWidth
      if (width < 500) return 1
      if (width < 800) return 2
      return 3
    }
    
    const handleResize = () => {
      setColumns(calculateColumns())
    }
    
    // Set initial columns
    handleResize()
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  const [focusedVar, setFocusedVar] = useState(null)
  const channelRef = useRef(null)
  const senderIdRef = useRef(Math.random().toString(36).slice(2))
  const retryIntervalRef = useRef(null)
  // varInputRefs declared earlier
  const focusedVarRef = useRef(focusedVar)
  const sendTimerRef = useRef(null)
  const lastSentAtRef = useRef(0)
  const lastScrollFocusRef = useRef(null)

  useEffect(() => {
    focusedVarRef.current = focusedVar
  }, [focusedVar])
      


  const notifyFocusChange = (varName, broadcast = true) => {
    const nextRaw = varName ?? null
    const prevRaw = focusedVarRef.current ?? null
    const nextNormalized = normalizeVarKey(nextRaw)
    const prevNormalized = normalizeVarKey(prevRaw)

    if (prevNormalized !== nextNormalized || prevRaw !== nextRaw) {
      focusedVarRef.current = nextRaw
      setFocusedVar(nextRaw)
      lastScrollFocusRef.current = nextNormalized
    } else if (!broadcast) {
      return
    }

    if (broadcast) {
      if (channelRef.current) {
        try {
          channelRef.current.postMessage({
            type: 'focusedVar',
            varName: nextRaw,
            normalizedVar: nextNormalized || null,
            sender: senderIdRef.current
          })
        } catch (e) {
          console.error('Failed to send focus update:', e)
        }
      }

      try {
        localStorage.setItem('ea_focused_var', JSON.stringify({
          focusedVar: nextRaw,
          normalizedVar: nextNormalized || null,
          timestamp: Date.now(),
          sender: senderIdRef.current
        }))
      } catch (storageError) {
        console.warn('Unable to persist focus sync payload:', storageError)
      }
    }
  }

  const notifyHoverChange = (varName) => {
    if (!channelRef.current) return
    try {
      channelRef.current.postMessage({
        type: 'variableHovered',
        varName: varName ?? null,
        sender: senderIdRef.current
      })
    } catch (e) {
      console.error('Failed to send hover update:', e)
    }
  }

  // Initialize BroadcastChannel for syncing with main window
  useEffect(() => {
    try {
      const channel = new BroadcastChannel('email-assistant-sync')
      channelRef.current = channel

      // Listen for messages from main window
      channel.onmessage = (event) => {
        try {
          const message = event.data
          if (!message || message.sender === senderIdRef.current) return

          if (message.type === 'focusedVar') {
            const next = message.varName ?? null
            const normalized = message.normalizedVar || normalizeVarKey(next)
            notifyFocusChange(next, false)

            document.querySelectorAll('.ea-popout-card').forEach((card) => {
              const cardVar = card.getAttribute('data-var')
              const matches = normalized && normalizeVarKey(cardVar) === normalized
              if (matches) {
                card.classList.add('ea-popout-focused')
                if (lastScrollFocusRef.current !== normalized) {
                  try {
                    card.scrollIntoView({ block: 'center', behavior: 'smooth' })
                    lastScrollFocusRef.current = normalized
                  } catch {}
                }
              } else {
                card.classList.remove('ea-popout-focused')
              }

              const textarea = card.querySelector('textarea')
              if (textarea) {
                if (matches) {
                  textarea.classList.add('ea-popout-input-focused')
                } else {
                  textarea.classList.remove('ea-popout-input-focused')
                }
              }
            })

            if (!normalized) {
              lastScrollFocusRef.current = null
            }
            return
          }

          if (message.type === 'variableHovered') {
            const hoveredVar = message.varName ?? null
            const hoveredNormalized = normalizeVarKey(hoveredVar)
            document.querySelectorAll('.ea-popout-card').forEach((card) => {
              const cardVarName = card.getAttribute('data-var')
              const matches = hoveredNormalized && normalizeVarKey(cardVarName) === hoveredNormalized
              card.classList.toggle('ea-popout-hovered', !!matches)
            })
            return
          }

          if (message.type === 'variablesUpdated') {
            // Ignore updates that originated from this popout to avoid cursor reset
            if (message.sender === senderIdRef.current) return

            const incoming = message.variables || {}
            // Update state (for helpers) and imperatively update inputs (uncontrolled) except focused
            setVariables((prev) => shallowEqual(prev, incoming) ? prev : incoming)
            try { applyVariablesToInputs(incoming) } catch {}
            return
          }

          if (message.type === 'popoutFocusRequest') {
            try { window.focus() } catch {}
            if (channelRef.current) {
              try {
                channelRef.current.postMessage({ type: 'popoutFocusAck', sender: senderIdRef.current })
              } catch (e) {
                console.error('Failed to send popoutFocusAck:', e)
              }
            }
            return
          }
          
          // Handle sync completion (from explicit syncFromText requests)
          if (message.type === 'syncComplete') {
            const nextVariables = message.variables || {}
            setVariables(nextVariables)
            return
          }
        } catch (msgError) {
          console.error('Error processing BroadcastChannel message:', msgError)
        }
      }

      return () => {
        try {
          channel.close()
        } catch (closeError) {
          console.error('Error closing BroadcastChannel:', closeError)
        }
      }
    } catch (e) {
      console.error('BroadcastChannel not available:', e)
    }
  }, [])

  // Wait for initial variables from main window via variablesUpdated message
  // No need to request syncFromText - main window will send variablesUpdated when popout opens
  useEffect(() => {
    if (!channelRef.current) return
    
    // The main window will send variablesUpdated when it detects popoutOpened
    // We just need to wait for it
    
    return () => {
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current)
        retryIntervalRef.current = null
      }
    }
  }, [])

  // Fallback: listen for variable sync via localStorage
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== 'ea_vars_sync_payload' || !e.newValue) return
      try {
        const payload = JSON.parse(e.newValue)
        if (!payload || payload.sender === senderIdRef.current) return
        if (!payload.timestamp || (Date.now() - payload.timestamp) > 5000) return

        if (payload.type === 'variablesUpdated' && payload.variables && typeof payload.variables === 'object') {
          const incoming = payload.variables
          setVariables((prev) => shallowEqual(prev, incoming) ? prev : incoming)
          try { applyVariablesToInputs(incoming) } catch {}
        }
      } catch {}
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [applyVariablesToInputs])

  // Sync variable changes to main window
  const enqueueVariableUpdate = (varName, value, allVariables) => {
    if (!channelRef.current) return

    try {
      channelRef.current.postMessage({
        type: 'variableChanged',
        varName,
        value,
        allVariables,
        sender: senderIdRef.current
      })
      lastSentAtRef.current = Date.now()
    } catch (e) {
      console.error('Failed to send variable update:', e)
    }

    // Fallback sync via localStorage events (more reliable across windows)
    try {
      localStorage.setItem('ea_vars_sync_payload', JSON.stringify({
        type: 'variableChanged',
        varName,
        value,
        allVariables,
        timestamp: Date.now(),
        sender: senderIdRef.current
      }))
    } catch {}
  }

  const updateVariable = (varName, value) => {
    const current = variablesRef.current || {}
    const assignments = expandVariableAssignment(varName, value, {
      preferredLanguage: activeLanguageCode,
      variables: current
    })
    // Compute the next snapshot synchronously to avoid race conditions
    const snapshot = applyAssignments(current, assignments)
    setVariables(snapshot)
    enqueueVariableUpdate(varName, value, snapshot)
  }

  const removeVariable = (varName) => {
    // Mark variable as deleted by setting to special marker
    const current = variablesRef.current || {}
    const assignments = expandVariableAssignment(varName, '__DELETED__', {
      preferredLanguage: activeLanguageCode,
      variables: current
    })
    const snapshot = applyAssignments(current, assignments)
    setVariables(snapshot)
    enqueueVariableUpdate(varName, '__DELETED__', snapshot)

    if (!channelRef.current) return

    try {
      channelRef.current.postMessage({
        type: 'variableDeleted',
        varName,
        allVariables: snapshot,
        sender: senderIdRef.current
      })
    } catch (e) {
      console.error('Failed to send variable deletion:', e)
    }
  }

  const reinitializeVariable = (varName) => {
    const targetName = targetVarForLanguage(varName)
    const exampleValue = guessSampleValue(templatesData, targetName)
    // Compute next snapshot synchronously to avoid race conditions
    const current = variablesRef.current || {}
    const assignments = expandVariableAssignment(varName, exampleValue, {
      preferredLanguage: activeLanguageCode,
      variables: current
    })
    const snapshot = applyAssignments(current, assignments)
    setVariables(snapshot)
    enqueueVariableUpdate(varName, exampleValue, snapshot)

    if (!channelRef.current) return

    try {
      channelRef.current.postMessage({
        type: 'variableRestored',
        varName,
        value: exampleValue,
        allVariables: snapshot,
        sender: senderIdRef.current
      })
    } catch (e) {
      console.error('Failed to send variable restoration:', e)
    }
  }

  useEffect(() => () => { clearTimeout(sendTimerRef.current) }, [])
  
  // Auto-focus first empty variable on mount
  useEffect(() => {
    if (!selectedTemplate?.variables || selectedTemplate.variables.length === 0) return
    
    try {
      const firstEmpty = selectedTemplate.variables.find(
        (vn) => !getVarValue(vn).trim()
      ) || selectedTemplate.variables[0]
      
      const el = varInputRefs.current?.[firstEmpty]
      if (el && typeof el.focus === 'function') {
        setTimeout(() => {
          try {
            el.focus()
            if (typeof el.select === 'function') {
              el.select()
            }
          } catch (focusError) {
            console.warn('Focus error:', focusError)
          }
        }, 100)
      }
    } catch (error) {
      console.error('Auto-focus error:', error)
    }
  }, [])

  if (!selectedTemplate || !templatesData) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <p className={darkMode ? 'text-slate-300' : 'text-gray-500'}>Loading...</p>
      </div>
    )
  }

  const t = interfaceLanguage === 'fr' ? {
    title: 'Modifier les variables',
    reinitialize: 'Réinitialiser',
    clear: 'Supprimer',
    close: 'Fermer'
  } : {
    title: 'Edit Variables',
    reinitialize: 'Reinitialize',
    clear: 'Delete',
    close: 'Close'
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div 
        className="sticky top-0 z-10 px-5 py-3 flex items-center justify-between"
        style={{ 
          background: darkMode ? '#1e293b' : '#2c3d50',
          borderBottom: darkMode ? '3px solid #fbbf24' : '3px solid rgba(163, 179, 84, 0.5)'
        }}
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            <Edit3 className={`h-5 w-5 mr-2 ${darkMode ? 'text-[#fbbf24]' : 'text-white'}`} />
            <h1 className="text-lg font-bold text-white">{t.title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.close()}
            className={`rounded-lg p-2 transition-colors ${darkMode ? 'text-slate-300 hover:text-white hover:bg-slate-700' : 'text-white hover:bg-white/20'}`}
            title={t.close}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Variables Grid */}
      <div className="py-2 px-5">
        <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, width: '100%', minWidth: 0 }}>
          {(() => {
            // Extract variables in the order they appear in template text
            const subjectText = selectedTemplate?.subject?.[templateLanguage] || ''
            const bodyText = selectedTemplate?.body?.[templateLanguage] || ''
            const combinedText = subjectText + '\n' + bodyText
            
            const seenVars = new Set()
            const orderedVars = []
            const regex = /<<([^>]+)>>/g
            let match
            
            while ((match = regex.exec(combinedText)) !== null) {
              const varNameInText = match[1] // e.g., "client_name_FR"
              // Strip language suffix to match template.variables format
              const baseVarName = varNameInText.replace(/_(FR|EN)$/i, '')
              
              if (!seenVars.has(baseVarName) && (selectedTemplate?.variables || []).includes(baseVarName)) {
                seenVars.add(baseVarName)
                orderedVars.push(baseVarName)
              }
            }
            
            // Add any remaining variables not found in text (shouldn't happen normally)
            ;(selectedTemplate?.variables || []).forEach(v => {
              if (!seenVars.has(v)) orderedVars.push(v)
            })
            
            return orderedVars
          })().map((varName) => {
            const varInfo = templatesData?.variables?.[varName]
            if (!varInfo) {
              console.warn('🔍 Variable info not found for:', varName)
              return null
            }

            const currentValue = getVarValue(varName)
            // Skip deleted variables
            if (currentValue === '__DELETED__') {
              return null
            }
            const isFocused = varKeysMatch(focusedVar, varName)
            const sanitizedVarId = `popout-var-${varName.replace(/[^a-z0-9_-]/gi, '-')}`
            const langForDisplay = (templateLanguage || interfaceLanguage || 'fr').toLowerCase()

            return (
              <div
                key={varName}
                data-var={varName}
                className={`ea-popout-card rounded-lg transition-all duration-200 ${isFocused ? 'ea-popout-focused' : ''} ${
                  darkMode 
                    ? 'bg-slate-800 border border-slate-600' 
                    : 'bg-white border border-gray-200'
                } ${isFocused && darkMode ? 'ring-2 ring-blue-400 border-blue-400 scale-[1.02]' : ''} ${isFocused && !darkMode ? 'ring-2 ring-blue-500 border-blue-500 scale-[1.02]' : ''}`}
                onMouseEnter={() => notifyHoverChange(varName)}
                onMouseLeave={() => notifyHoverChange(null)}
              >
                <div className={`rounded-lg p-3 ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
                  {/* Label and buttons */}
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <label htmlFor={sanitizedVarId} className={`text-sm font-semibold flex-1 leading-snug ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                      {varInfo.description?.[langForDisplay] || varInfo.description?.fr || varInfo.description?.en || varName}
                    </label>
                    <div className={`shrink-0 flex items-center gap-1 transition-opacity ${darkMode ? 'opacity-80 hover:opacity-100' : 'opacity-0 hover:opacity-100 focus-within:opacity-100'}`}>
                      <button
                        className={`text-xs px-2 py-1 rounded border flex items-center gap-1 font-medium ${
                          darkMode 
                            ? 'border-slate-500 text-amber-400 hover:bg-slate-700 hover:border-amber-400/50' 
                            : 'border-gray-300 text-teal-700 hover:bg-teal-50'
                        }`}
                        title={t.reinitialize}
                        onClick={() => reinitializeVariable(varName)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {t.reinitialize}
                      </button>
                      <button
                        className={`text-xs px-2 py-1 rounded border font-medium ${
                          darkMode 
                            ? 'border-slate-500 text-red-400 hover:bg-red-900/40 hover:border-red-400/50' 
                            : 'border-gray-300 text-red-700 hover:bg-red-50'
                        }`}
                        title={t.clear}
                        onClick={() => removeVariable(varName)}
                      >
                        X
                      </button>
                    </div>
                  </div>

                  {/* Input field */}
                  <textarea
                    ref={el => { if (el) varInputRefs.current[varName] = el }}
                    id={sanitizedVarId}
                    name={sanitizedVarId}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    // Hint popular extensions to ignore these fields to avoid content_script errors
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    data-gramm="false"
                    data-enable-grammarly="false"
                    data-ms-editor="false"
                    defaultValue={currentValue}
                    onChange={(e) => { updateVariable(varName, e.target.value); autoResize(e.target) }}
                    onFocus={(e) => {
                      notifyFocusChange(varName)
                      requestAnimationFrame(() => {
                        try {
                          e.target.select()
                        } catch {}
                        autoResize(e.target)
                      })
                    }}
                    onBlur={() => notifyFocusChange(null)}
                    onKeyDown={(e) => {
                      // Tab or Enter to next field
                      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                        e.preventDefault()
                        const list = selectedTemplate.variables
                        const currentIdx = list.indexOf(varName)
                        
                        let nextIdx
                        if (e.shiftKey && e.key === 'Tab') {
                          // Shift+Tab = previous
                          nextIdx = (currentIdx - 1 + list.length) % list.length
                        } else {
                          // Tab or Enter = next
                          nextIdx = (currentIdx + 1) % list.length
                        }
                        
                        const nextVar = list[nextIdx]
                        const el = varInputRefs.current[nextVar]
                        if (el && el.focus) {
                          el.focus()
                          el.select?.()
                        }
                      }
                    }}
                    placeholder={(() => {
                      if (varInfo.examples && varInfo.examples[langForDisplay]) return varInfo.examples[langForDisplay]
                      const ex = varInfo.example
                      if (ex && typeof ex === 'object') {
                        return langForDisplay === 'en' ? (ex.en || ex.fr || '') : (ex.fr || ex.en || '')
                      }
                      return ex || ''
                    })()}
                    className={`w-full min-h-[36px] border-2 rounded-md resize-none overflow-hidden transition-all duration-200 text-sm px-2.5 py-1.5 leading-5 ${
                      darkMode 
                        ? 'bg-slate-900 border-slate-500 text-white placeholder-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/40' 
                        : 'bg-white border-gray-300 text-gray-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-200'
                    }`}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
