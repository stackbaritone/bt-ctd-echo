/* eslint-disable no-console, no-prototype-builtins, no-unreachable, no-undef, no-empty */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  expandVariableAssignment,
  LANGUAGE_SUFFIXES,
  normalizeVarKey,
  resolveVariableValue
} from './utils/variables'
import {
  buildInitialVariables,
  resolveVariableInfo,
  guessSampleValue,
  applyAssignments,
  cleanupWhitespace,
  findTemplatePlaceholderForVar,
  removeVariablePlaceholderFromText,
  ensurePlaceholderInText
} from './utils/template.js'
import { createPortal } from 'react-dom'

import { loadState, saveState, getDefaultState, clearState } from './utils/storage.js'
import { sanitizeHtml } from './utils/html.js'
import { NAVY_TEXT, CATEGORY_BADGE_STYLES, getCategoryBadgeStyle, customEditorStyles } from './constants/styles.js'

import { interfaceTexts } from './constants/interfaceTexts.js'
import { Search, FileText, Copy, RotateCcw, Languages, Filter, Globe, Sparkles, Mail, Edit3, Link, Settings, X, Move, Send, Star, ClipboardPaste, Eraser, Pin, PinOff, Minimize2, ExternalLink, Expand, Shrink, MoveRight, LifeBuoy, Moon, Sun } from 'lucide-react'
import echoLogo from './assets/echo-logo.svg'
import { Button } from './components/ui/button.jsx'
import { Input } from './components/ui/input.jsx'
import SimplePillEditor from './components/SimplePillEditor.jsx'
import RichTextPillEditor from './components/RichTextPillEditor.jsx'
import AISidebar from './components/AISidebar';
import HelpCenter from './components/HelpCenter.jsx'
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card.jsx'
import { Badge } from './components/ui/badge.jsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select.jsx'
import { ScrollArea } from './components/ui/scroll-area.jsx'
import { useToast } from './components/ui/toast.jsx'
import { useAuthState, MODE_CONFIG } from './hooks/useAuthState.js'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js'
import { useTemplateLoader } from './hooks/useTemplateLoader.js'
import { useClipboardActions } from './hooks/useClipboardActions.js'
import { useTemplateFilter } from './hooks/useTemplateFilter.jsx'
import './App.css'

const normalizeForMatching = (value = '') => {
  if (!value) return { normalized: '', indexMap: [0] }
  const indexMap = []
  let normalized = ''
  let normalizedIndex = 0
  for (let i = 0; i < value.length; i++) {
    const char = value[i]
    if (char === '\r') continue
    indexMap[normalizedIndex] = i
    normalized += char
    normalizedIndex++
  }
  indexMap[normalizedIndex] = value.length
  return { normalized, indexMap }
}

// Helper function to strip rich text formatting while preserving variable pills
const stripRichTextForSync = (htmlText = '') => {
  if (!htmlText) return ''
  
  // Create a temporary div to parse HTML (sanitized to prevent XSS)
  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = sanitizeHtml(htmlText)
  
  // Process nodes to extract plain text while preserving variable pills
  const processNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || ''
    }
    
    if (node.nodeType === Node.ELEMENT_NODE) {
      // Handle variable pills - convert back to placeholder
      if (node.hasAttribute('data-var')) {
        const varName = node.getAttribute('data-var')
        return `<<${varName}>>`
      }
      
      // Handle line breaks
      if (node.tagName === 'BR') {
        return '\n'
      }
      
      // Handle block elements - add line breaks
      if (['DIV', 'P', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 
           'UL', 'OL', 'LI', 'PRE', 'BLOCKQUOTE', 'TABLE', 'TBODY', 'THEAD', 
           'TFOOT', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR'].includes(node.tagName)) {
        let content = ''
        for (const child of node.childNodes) {
          content += processNode(child)
        }
        // Add line break after block elements (except if it's the last element)
        if (node.tagName !== 'DIV' || node.nextSibling) {
          content += '\n'
        }
        return content
      }
      
      // Handle inline elements - just extract text content
      let content = ''
      for (const child of node.childNodes) {
        content += processNode(child)
      }
      return content
    }
    
    return ''
  }
  
  let plainText = processNode(tempDiv)
  
  // Clean up extra line breaks
  plainText = plainText.replace(/\n\n+/g, '\n\n').replace(/^\n+|\n+$/g, '')
  
  return plainText
}

// Extract variable values directly from pill elements in HTML
const extractVariablesFromPills = (htmlText = '') => {
  if (!htmlText) return {}
  
  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = sanitizeHtml(htmlText)
  
  const variables = {}
  const pills = tempDiv.querySelectorAll('[data-var]')
  
  pills.forEach(pill => {
    const varName = pill.getAttribute('data-var')
    // Use data-display which contains the actual value, not data-value which contains the placeholder
    const varValue = pill.getAttribute('data-display') || pill.textContent || ''
    if (varName && varValue) {
      // Only store if there's an actual value (not empty)
      variables[varName] = varValue
    }
  })
  
  return variables
}

// Parse template structure into text and variable parts
const parseTemplateStructure = (tpl) => {
  if (!tpl) return []
  const parts = []
  const regex = /<<([^>]+)>>/g
  let lastIndex = 0
  let match
  while ((match = regex.exec(tpl)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: tpl.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'var', name: match[1] })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < tpl.length) {
    parts.push({ type: 'text', value: tpl.slice(lastIndex) })
  }
  return parts
}

// Compute variable ranges in text based on template structure
const computeVarRangesInText = (text, tpl) => {
  if (!tpl || typeof text !== 'string') return []
  const parts = parseTemplateStructure(tpl)
  if (!parts.length) return []
  let cursor = 0
  const ranges = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (part.type === 'text') {
      if (!part.value) continue
      const idx = text.indexOf(part.value, cursor)
      if (idx === -1) return []
      cursor = idx + part.value.length
    } else if (part.type === 'var') {
      const nextText = (() => {
        for (let j = i + 1; j < parts.length; j++) {
          if (parts[j].type === 'text' && parts[j].value) return parts[j].value
        }
        return null
      })()
      const start = cursor
      let end
      if (nextText) {
        const nextIdx = text.indexOf(nextText, start)
        end = nextIdx === -1 ? text.length : nextIdx
      } else {
        end = text.length
      }
      if (end >= start) {
        ranges.push({ start, end, name: part.name })
        cursor = end
      }
    }
  }
  return ranges
}

const extractVariablesFromTemplate = (text = '', templateText = '', variableNames = []) => {
  if (!text || !templateText || !Array.isArray(variableNames) || !variableNames.length) return {}

  const { normalized: normalizedText, indexMap } = normalizeForMatching(text)
  const normalizedTemplate = templateText.replace(/\r/g, '')
  const ranges = computeVarRangesInText(normalizedText, normalizedTemplate)
  if (!ranges.length) return {}

  const validVariables = new Set(variableNames)
  const result = {}

  ranges.forEach(({ start, end, name }) => {
    if (!validVariables.has(name)) return
    const realStart = indexMap[start] ?? 0
    const realEnd = indexMap[end] ?? text.length
    const value = text.substring(realStart, realEnd).trim()
    if (value && value !== `<<${name}>>`) {
      result[name] = value
    }
  })

  return result
}

const extractVariableWithAnchors = (text = '', templateText = '', varName = '') => {
  if (!text || !templateText || !varName) return null
  const varPlaceholder = `<<${varName}>>`
  const varIndex = templateText.indexOf(varPlaceholder)
  if (varIndex === -1) return null

  const beforeSegments = templateText.substring(0, varIndex).split(/<<[^>]+>>/)
  const beforeAnchor = beforeSegments[beforeSegments.length - 1] || ''

  const afterStart = varIndex + varPlaceholder.length
  const afterSegments = templateText.substring(afterStart).split(/<<[^>]+>>/)
  const afterAnchor = afterSegments[0] || ''

  let startPos = 0
  let endPos = text.length

  if (beforeAnchor) {
    const beforeIndex = text.lastIndexOf(beforeAnchor)
    if (beforeIndex !== -1) {
      startPos = beforeIndex + beforeAnchor.length
    } else {
      const trimmed = beforeAnchor.trim()
      if (!trimmed) return null
      const approx = text.toLowerCase().lastIndexOf(trimmed.toLowerCase())
      if (approx === -1) return null
      startPos = approx + trimmed.length
    }
  }

  if (afterAnchor) {
    const afterIndex = text.indexOf(afterAnchor, startPos)
    if (afterIndex !== -1) {
      endPos = afterIndex
    } else {
      const trimmed = afterAnchor.trim()
      if (trimmed) {
        const approx = text.toLowerCase().indexOf(trimmed.toLowerCase(), startPos)
        if (approx !== -1) {
          endPos = approx
        }
      }
    }
  }

  const extracted = text.substring(startPos, endPos).trim()
  if (!extracted || extracted === varPlaceholder) return null
  return extracted
}

// Local utility for regex escaping (not in shared module)
const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function App() {
  // Toast notifications
  const toast = useToast()

  // Inject custom styles for variable highlighting
  useEffect(() => {
    const styleElement = document.createElement('style')
    styleElement.textContent = customEditorStyles
    document.head.appendChild(styleElement)
    return () => document.head.removeChild(styleElement)
  }, [])

  // Debug flag via ?debug=1
  const debug = useMemo(() => {
    try { return new URLSearchParams(window.location.search).has('debug') } catch { return false }
  }, [])

  // Load saved state
  const skipSavedState = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('reset') === '1'
    } catch {
      return false
    }
  }, [])

  const savedState = useMemo(() => (skipSavedState ? getDefaultState() : loadState()), [skipSavedState])

  useEffect(() => {
    if (!skipSavedState) return
    clearState()
    try {
      localStorage.removeItem('ea_last_template_id')
      localStorage.removeItem('ea_last_template_lang')
    } catch {}
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete('reset')
      window.history.replaceState(null, '', url.toString())
    } catch {}
  }, [skipSavedState])
  
  // Separate interface language from template language
  const [interfaceLanguage, setInterfaceLanguage] = useState(savedState.interfaceLanguage || 'fr') // Interface language
  const [templateLanguage, setTemplateLanguage] = useState(savedState.templateLanguage || 'fr')   // Template language
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState(savedState.selectedTemplateId || null)
  const [searchQuery, setSearchQuery] = useState(savedState.searchQuery || '')
  const [selectedCategory, setSelectedCategory] = useState(savedState.selectedCategory || 'all')
  
  const [finalSubject, setFinalSubject] = useState('') // Final editable version
  const [finalBody, setFinalBody] = useState('') // Final editable version
  const [variables, setVariables] = useState(savedState.variables || {})
  // Preference: Strict Classic Outlook (avoid ms-outlook/mailto to reduce New Outlook/Web)
  const [strictClassic, setStrictClassic] = useState(() => {
    if (typeof savedState.strictClassic !== 'undefined') return !!savedState.strictClassic
    try { return localStorage.getItem('ea_strict_classic') === '1' } catch (e) { return false }
  })

  const variablesRef = useRef(variables)
  const finalSubjectRef = useRef(finalSubject)
  const finalBodyRef = useRef(finalBody)
  const bodyEditorRef = useRef(null)
  const subjectEditorRef = useRef(null)
  const selectedTemplateRef = useRef(selectedTemplate)
  const templateLanguageRef = useRef(templateLanguage)
  const syncFromTextRef = useRef(null)
  const focusFromPopoutRef = useRef(false)
  const lastRebuiltTemplateId = useRef(null)

  // Template loading hook (replaces inline loading + auto-refresh polling)
  const { templatesData, loading } = useTemplateLoader(debug, selectedTemplateRef, setSelectedTemplate, lastRebuiltTemplateId)

  useEffect(() => { variablesRef.current = variables }, [variables])
  useEffect(() => { finalSubjectRef.current = finalSubject }, [finalSubject])
  useEffect(() => { finalBodyRef.current = finalBody }, [finalBody])

  // Persist Strict Classic preference
  useEffect(() => {
    try { localStorage.setItem('ea_strict_classic', strictClassic ? '1' : '0') } catch (e) {}
  }, [strictClassic])
  useEffect(() => { selectedTemplateRef.current = selectedTemplate }, [selectedTemplate])
  useEffect(() => { templateLanguageRef.current = templateLanguage }, [templateLanguage])
  const [favorites, setFavorites] = useState(savedState.favorites || [])
  const [favoritesOnly, setFavoritesOnly] = useState(savedState.favoritesOnly || false)
  const [copySuccess, setCopySuccess] = useState(null) // tracks which button was clicked: 'subject', 'body', 'all', or null

  const { replaceVariablesWithValues, replaceVariablesInHTML, copyToClipboard, copyTemplateLink, exportAs } = useClipboardActions({
    variablesRef, variables, finalSubjectRef, finalBodyRef, finalSubject, finalBody,
    bodyEditorRef, subjectEditorRef, templateLanguageRef, templateLanguage,
    selectedTemplate, setCopySuccess, toast,
  })

  const [showVariablePopup, setShowVariablePopup] = useState(false)
  const [showHelpCenter, setShowHelpCenter] = useState(false)
  const [showAIPanel, setShowAIPanel] = useState(false)
  
  // Auth state (admin + mode selection) — extracted to useAuthState hook
  const auth = useAuthState(interfaceLanguage)
  const {
    showAdminModal, setShowAdminModal,
    adminPassword, setAdminPassword,
    adminError, showAdminPassword, setShowAdminPassword,
    handleAdminLogin,
    selectedMode,
    showModeMenu, setShowModeMenu,
    showModeAuthModal, setShowModeAuthModal,
    pendingMode,
    managementPassword, setManagementPassword,
    managementError, showManagementPassword, setShowManagementPassword,
    handleModeSelect, handleModeAuth
  } = auth

  const {
    filteredTemplates, searchMatchMap, getMatchRanges, renderHighlighted,
    categoryLabels, categories, getCategoryLabel, orderedCategories, isFav,
  } = useTemplateFilter({
    templatesData, searchQuery, selectedCategory, favoritesOnly,
    favorites, selectedMode, interfaceLanguage, debug,
  })
  
  // Dark mode state
  const [darkMode, setDarkMode] = useState(() => {
    // Check saved preference first, then system preference
    const saved = savedState.darkMode
    if (typeof saved === 'boolean') return saved
    try {
      const localSaved = localStorage.getItem('ea_dark_mode')
      if (localSaved !== null) return localSaved === 'true'
      // Check system preference
      return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false
    } catch { return false }
  })
  
  // Apply dark mode class to HTML element
  useEffect(() => {
    const html = document.documentElement
    if (darkMode) {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
    // Save preference
    try { localStorage.setItem('ea_dark_mode', darkMode ? 'true' : 'false') } catch {}
    
    // Notify popout window of dark mode change
    if (canUseBC) {
      try {
        const channel = new BroadcastChannel('email-assistant-sync')
        channel.postMessage({ type: 'darkModeChanged', darkMode, sender: 'main' })
        channel.close()
      } catch {}
    }
  }, [darkMode])
  
  const [preferPopout, setPreferPopout] = useState(() => {
    try { return localStorage.getItem('ea_prefer_popout') === 'true' } catch { return false }
  })
  const [showHighlights, setShowHighlights] = useState(() => {
    const saved = localStorage.getItem('ea_show_highlights')
    return saved === null ? true : saved === 'true'
  })
  const supportEmail = useMemo(() => {
    try {
      const envEmail = import.meta?.env?.VITE_SUPPORT_EMAIL
      if (typeof envEmail === 'string') {
        const trimmed = envEmail.trim()
        if (trimmed) return trimmed
      }
    } catch {}
    return 'echo-support@jskennedy.net'
  }, [])
  const supportFormEndpoint = useMemo(() => {
    try {
      const endpoint = import.meta?.env?.VITE_SUPPORT_FORM_ENDPOINT
      if (typeof endpoint === 'string' && endpoint.trim().length) {
        return endpoint.trim()
      }
    } catch {}
    return null
  }, [])
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = Number(localStorage.getItem('ea_left_width'))
    return Number.isFinite(saved) && saved >= 340 && saved <= 680 ? saved : 480
  })
  const isDragging = useRef(false)
  const [varPopupPos, setVarPopupPos] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('ea_var_popup_pos_v3') || 'null')
      if (saved && typeof saved.top === 'number' && typeof saved.left === 'number' && typeof saved.width === 'number' && typeof saved.height === 'number') return saved
    } catch {}
    // Default: compact single-column pane sized for four cards tall
    return { top: 80, left: 80, width: 470, height: 700 }
  })
  const varPopupRef = useRef(null)
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, origTop: 0, origLeft: 0 })
  // Vars popup UX state
  const [varsFilter, setVarsFilter] = useState('')
  const [focusedVar, setFocusedVar] = useState(null)
  const varInputRefs = useRef({})
  const [varsPinned, setVarsPinned] = useState(true)
  const [varsMinimized, setVarsMinimized] = useState(false)
  const [pillPos, setPillPos] = useState({ right: 16, bottom: 16 })
  const [isFullscreen, setIsFullscreen] = useState(() => {
    try { return !!(document.fullscreenElement || document.webkitFullscreenElement) } catch { return false }
  })
  // Cross-window sync for variables (main <-> pop-out)
  const varsChannelRef = useRef(null)
  const varsSenderIdRef = useRef(Math.random().toString(36).slice(2))
  const popoutChannelRef = useRef(null)
  const popoutSenderIdRef = useRef(Math.random().toString(36).slice(2))
  const pendingPopoutSnapshotRef = useRef(null)
  const varsRemoteUpdateRef = useRef(false)
  const skipPopoutBroadcastRef = useRef({ pending: false, templateId: null, templateLanguage: null })
  const popoutWindowRef = useRef(null)
  const lastPopoutOpenedTimestampRef = useRef(0)
  const manualEditRef = useRef({ subject: false, body: false })
  const pendingTemplateIdRef = useRef(null)
  const canUseBC = typeof window !== 'undefined' && 'BroadcastChannel' in window

  // Ask existing popout (if any) to focus itself instead of opening a new one
  const requestExistingPopoutFocus = useCallback(() => {
    if (!canUseBC) return Promise.resolve(false)
    
    // Create a temporary channel if the main one isn't ready yet
    const channel = popoutChannelRef.current || (() => {
      try {
        return new BroadcastChannel('email-assistant-sync')
      } catch { return null }
    })()
    if (!channel) return Promise.resolve(false)

    return new Promise((resolve) => {
      let done = false
      const cleanup = (handler, timer) => {
        try { channel.removeEventListener('message', handler) } catch {}
        clearTimeout(timer)
        // Close temporary channel if we created one
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
      }, 400) // Slightly longer timeout for slower systems

      try { channel.addEventListener('message', handler) } catch {}
      try { channel.postMessage({ type: 'popoutFocusRequest', sender: popoutSenderIdRef.current }) } catch {}
    })
  }, [canUseBC])

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
      try {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      } catch {}
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

  // Keep highlight visible briefly after blur for better visual continuity
  const focusClearTimerRef = useRef(null)

  const flagSkipPopoutBroadcast = () => {
    skipPopoutBroadcastRef.current = {
      pending: true,
      templateId: selectedTemplateRef.current?.id || null,
      templateLanguage: templateLanguageRef.current || null
    }
  }
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
  }, [])

  // Track hover over pills and marks to sync with popout
  useEffect(() => {
    let currentHoveredVar = null

    const handleMouseOver = (e) => {
      const target = e.target
      if (!target) return

      // Check if hovering over a pill or mark
      const pill = target.closest('.var-pill')
      const mark = target.closest('mark.var-highlight')
      const element = pill || mark

      if (element) {
        const varName = element.getAttribute('data-var')
        if (varName && varName !== currentHoveredVar) {
          currentHoveredVar = varName
          updateHoverHighlight(varName)
          
          // Broadcast to popout
          if (popoutChannelRef.current) {
            try {
              popoutChannelRef.current.postMessage({
                type: 'variableHovered',
                varName,
                sender: popoutSenderIdRef.current
              })
            } catch (e) {
              console.error('Failed to send hover update:', e)
            }
          }
        }
      } else if (currentHoveredVar) {
        currentHoveredVar = null
        updateHoverHighlight(null)
        
        // Broadcast clear to popout
        if (popoutChannelRef.current) {
          try {
            popoutChannelRef.current.postMessage({
              type: 'variableHovered',
              varName: null,
              sender: popoutSenderIdRef.current
            })
          } catch (e) {
            console.error('Failed to send hover clear:', e)
          }
        }
      }
    }

    document.addEventListener('mouseover', handleMouseOver, true)
    return () => {
      document.removeEventListener('mouseover', handleMouseOver, true)
      if (currentHoveredVar) {
        updateHoverHighlight(null)
      }
    }
  }, [updateHoverHighlight])

  const handleInlineVariableChange = useCallback((updates) => {
    if (!updates) return
    setVariables((prev) => {
      const assignments = {}
      const preferredLang = (templateLanguageRef.current || 'fr').toUpperCase()
      Object.entries(updates).forEach(([key, rawValue]) => {
        const normalized = (rawValue ?? '').toString()
        Object.assign(assignments, expandVariableAssignment(key, normalized, {
          preferredLanguage: preferredLang,
          variables: prev
        }))
      })
      const next = applyAssignments(prev, assignments)
      if (next !== prev) {
        variablesRef.current = next
      }
      return next
    })
  }, [])

  // Refresh outlines if content updates while focused
  useEffect(() => {
    if (!focusedVar) return
    requestAnimationFrame(() => updateFocusHighlight(focusedVar))
  }, [variables, showHighlights, focusedVar, updateFocusHighlight])

  // Clear any lingering highlight when switching template or language
  useEffect(() => {
    updateFocusHighlight(null)
  }, [selectedTemplateId, templateLanguage, updateFocusHighlight])
  // Export menu state (replaces <details> for reliability)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef(null)
  
  // References for keyboard shortcuts
  const searchRef = useRef(null) // Reference for focus on search (Ctrl+J)

  // Template list interaction states
  const [pressedCardId, setPressedCardId] = useState(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const itemRefs = useRef({})
  const [favLiveMsg, setFavLiveMsg] = useState('')
  // Virtualization and mobile
  const viewportRef = useRef(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(600)
  const [showMobileTemplates, setShowMobileTemplates] = useState(false)
  // Pop-out (child window) mode: render variables only when ?varsOnly=1
  const varsOnlyMode = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get('varsOnly') === '1' } catch { return false }
  }, [])

  // Auto-open variables popup in vars-only mode
  useEffect(() => {
    if (varsOnlyMode) setShowVariablePopup(true)
  }, [varsOnlyMode])

  // In varsOnly mode, mark popout as open and clean up on close
  useEffect(() => {
    if (!varsOnlyMode) return
    
    // Mark popout as open
    try { localStorage.setItem('ea_popout_opened', String(Date.now())) } catch {}
    
    // Keep the timestamp fresh while popout is open
    const refreshInterval = setInterval(() => {
      try { localStorage.setItem('ea_popout_opened', String(Date.now())) } catch {}
    }, 10000) // Refresh every 10 seconds
    
    // Clean up on close
    const onUnload = () => {
      try { localStorage.removeItem('ea_popout_opened') } catch {}
    }
    window.addEventListener('beforeunload', onUnload)
    
    return () => {
      clearInterval(refreshInterval)
      window.removeEventListener('beforeunload', onUnload)
      try { localStorage.removeItem('ea_popout_opened') } catch {}
    }
  }, [varsOnlyMode])

  // In varsOnly mode, make the popup fill the window and follow resize
  useEffect(() => {
    if (!varsOnlyMode) return
    const setFull = () => setVarPopupPos(p => ({ ...p, top: 0, left: 0, width: window.innerWidth, height: window.innerHeight }))
    setFull()
    const onResize = () => setFull()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [varsOnlyMode])

  // Track fullscreen state (pop-out only)
  useEffect(() => {
    const onFs = () => {
      setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement))
      // adjust size again when entering/exiting fullscreen
      if (varsOnlyMode) setVarPopupPos(p => ({ ...p, top: 0, left: 0, width: window.innerWidth, height: window.innerHeight }))
    }
    document.addEventListener('fullscreenchange', onFs)
    document.addEventListener('webkitfullscreenchange', onFs)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      document.removeEventListener('webkitfullscreenchange', onFs)
    }
  }, [varsOnlyMode])

  const toggleFullscreen = () => {
    try {
      const el = document.documentElement
      const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement)
      if (!isFs) {
        if (el.requestFullscreen) el.requestFullscreen()
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen()
      } else {
        if (document.exitFullscreen) document.exitFullscreen()
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
      }
    } catch {}
  }

  // Automatically save important preferences with debouncing for variables
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveState({
        interfaceLanguage,
        templateLanguage,
        searchQuery,
        selectedCategory,
        selectedTemplateId,
        variables,
        favorites,
        favoritesOnly,
        darkMode
      })
    }, 300) // 300ms debounce
    
    return () => clearTimeout(timeoutId)
  }, [interfaceLanguage, templateLanguage, searchQuery, selectedCategory, selectedTemplateId, variables, favorites, favoritesOnly, darkMode])

  // Persist pane sizes
  useEffect(() => {
    try {
      localStorage.setItem('ea_left_width', String(leftWidth))
    } catch {}
  }, [leftWidth])

  // Persist highlight visibility
  useEffect(() => {
    try {
      localStorage.setItem('ea_show_highlights', String(showHighlights))
    } catch {}
  }, [showHighlights])

  // Persist popup position/size
  useEffect(() => {
    try { localStorage.setItem('ea_var_popup_pos_v3', JSON.stringify(varPopupPos)) } catch {}
  }, [varPopupPos])

  // Persist popout preference
  useEffect(() => {
    try { localStorage.setItem('ea_prefer_popout', String(preferPopout)) } catch {}
  }, [preferPopout])

  // Persist last used template and language for robust popout fallback
  useEffect(() => {
    try {
      if (selectedTemplateId) localStorage.setItem('ea_last_template_id', selectedTemplateId)
      if (templateLanguage) localStorage.setItem('ea_last_template_lang', templateLanguage)
    } catch {}
  }, [selectedTemplateId, templateLanguage])

  // Smart function to open variables (popup or popout based on preference)
  const openVariables = useCallback(async () => {
    if (preferPopout && selectedTemplate?.variables?.length > 0) {
      // If another popout already exists, focus it instead of opening a new one
      const focusedExisting = await requestExistingPopoutFocus()
      if (focusedExisting) {
        setVarsMinimized(false)
        setVarsPinned(false)
        setShowVariablePopup(false)
        return
      }

      // Check if a popout window is already open
      if (popoutWindowRef.current && !popoutWindowRef.current.closed) {
        try {
          // Focus the existing window instead of opening a new one
          popoutWindowRef.current.focus()
          return
        } catch (e) {
          // Window reference is stale, clear it
          popoutWindowRef.current = null
        }
      }

      // Fallback: check localStorage timestamp to prevent multiple popouts
      // This handles cases where we lose window reference (e.g., page refresh)
      try {
        const lastPopoutTs = parseInt(localStorage.getItem('ea_popout_opened') || '0', 10)
        const isStale = isNaN(lastPopoutTs) || (Date.now() - lastPopoutTs > 30000) // 30s timeout
        if (!isStale) {
          // A popout was opened recently - try to find it via BroadcastChannel
          const found = await requestExistingPopoutFocus()
          if (found) return
        }
      } catch {}
      
      // Auto-open popout (single-column, approx 470x700)
      const url = new URL(window.location.href)
      url.searchParams.set('varsOnly', '1')
      if (selectedTemplate?.id) url.searchParams.set('id', selectedTemplate.id)
      if (templateLanguage) url.searchParams.set('lang', templateLanguage)
      // Calculate optimal size based on number of variables
      const varCount = selectedTemplate?.variables?.length || 0
      
      // Base dimensions - responsive width that allows 2 columns by default
      const cardHeight = 110 // estimated height per card
      const headerHeight = 60 // header bar height
      const padding = 40 // total padding
      
      // Start with a good width for 2 columns (responsive breakpoint)
      let w = 720
      
      // Calculate height based on 2-column layout
      const rows = Math.ceil(varCount / 2)
      let h = Math.max(400, Math.min(900, headerHeight + (rows * cardHeight) + padding))
      
      // Clamp to available screen space
      const availW = (window.screen?.availWidth || window.innerWidth) - 40
      const availH = (window.screen?.availHeight || window.innerHeight) - 80
      w = Math.min(w, availW)
      h = Math.min(h, availH)
      
      const left = Math.max(0, Math.floor(((window.screen?.availWidth || window.innerWidth) - w) / 2))
      const top = Math.max(0, Math.floor(((window.screen?.availHeight || window.innerHeight) - h) / 3))
      // Important: open a blank window with features so size is respected
      // Some environments ignore features when opening a URL directly
      // Note: alwaysRaised is a Firefox-specific feature that helps keep window on top
      const features = `popup=yes,width=${Math.round(w)},height=${Math.round(h)},left=${left},top=${top},toolbar=0,location=0,menubar=0,status=0,scrollbars=1,resizable=1,alwaysRaised=yes`
      const win = window.open('', '_blank', features)
      
      // Store reference to the new window
      popoutWindowRef.current = win
      // Mark popout as opened in localStorage
      try { localStorage.setItem('ea_popout_opened', String(Date.now())) } catch {}
      if (win) {
        try {
          // Minimal loading state to avoid white flash
          win.document.write('<!doctype html><title>Loading…</title><style>html,body{height:100%;margin:0;font:14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif;display:grid;place-items:center;color:#6b7280;background:#fff}</style><div>Loading…</div>')
        } catch {}
        try { win.location.replace(url.toString()) } catch { try { win.location.href = url.toString() } catch {} }
        try { win.focus() } catch {}
      }
      
      // Auto-close the popup when popout opens successfully
      if (win) {
        setVarsMinimized(false)
        setVarsPinned(false)
        setShowVariablePopup(false)
        
        // Notify other components that popout opened
        if (canUseBC) {
          try {
            const channel = new BroadcastChannel('email-assistant-sync')
            channel.postMessage({ type: 'popoutOpened', timestamp: Date.now() })
            channel.close()
          } catch (e) {
            console.log('BroadcastChannel not available for popout sync')
          }
        }
        
        // Listen for when popout window closes
        const checkClosed = setInterval(() => {
          if (win.closed) {
            clearInterval(checkClosed)
            // Clear the window reference
            if (popoutWindowRef.current === win) {
              popoutWindowRef.current = null
            }
            // Notify that popout closed
            if (canUseBC) {
              try {
                const channel = new BroadcastChannel('email-assistant-sync')
                channel.postMessage({ type: 'popoutClosed', timestamp: Date.now() })
                channel.close()
              } catch (e) {
                console.log('BroadcastChannel not available for popout close sync')
              }
            }
          }
        }, 1000)
      }
    } else {
      // Open popup
      setShowVariablePopup(true)
      
      // Notify that variables popup opened
      if (canUseBC) {
        try {
          const channel = new BroadcastChannel('email-assistant-sync')
          channel.postMessage({ type: 'variablesPopupOpened', timestamp: Date.now() })
          channel.close()
        } catch (e) {
          console.log('BroadcastChannel not available for popup sync')
        }
      }
    }
  }, [preferPopout, selectedTemplate, templateLanguage, requestExistingPopoutFocus, canUseBC])

  // Auth handlers now provided by useAuthState hook

  // Setup BroadcastChannel for variables syncing
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
        if (msg.type === 'update' && (msg.variables || msg.templateId || msg.templateLanguage || msg.hasOwnProperty('focusedVar'))) {
          if (msg.variables && typeof msg.variables === 'object') {
            varsRemoteUpdateRef.current = true
            setVariables(prev => {
              const next = { ...prev, ...msg.variables }
              variablesRef.current = next
              return next
            })
          }
          if (msg.hasOwnProperty('focusedVar')) {
            setFocusedVar(msg.focusedVar)
          }
          // Skip showHighlights sync via BroadcastChannel to prevent interference
          // showHighlights will be synced only via localStorage fallback
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
          if (msg.hasOwnProperty('focusedVar')) {
            setFocusedVar(msg.focusedVar)
          }
          // Skip showHighlights sync via BroadcastChannel to prevent interference
          // showHighlights will be synced only via localStorage fallback
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
  }, [])

  // Listen for variable updates from the new Variables popout window
  useEffect(() => {
    if (!canUseBC) return
    try {
      const channel = new BroadcastChannel('email-assistant-sync')
      popoutChannelRef.current = channel
      
      channel.onmessage = (event) => {
        const msg = event.data
        if (!msg || msg.sender === popoutSenderIdRef.current) return
        
        // Handle hover synchronization from popout
        if (msg.type === 'variableHovered') {
          updateHoverHighlight(msg.varName || null)
          return
        }
        
        // Focus request from another window wanting to reuse existing popout
        // Only the popout (varsOnlyMode) should respond, NOT the main window
        if (msg.type === 'popoutFocusRequest') {
          if (varsOnlyMode) {
            try { window.focus() } catch {}
            try {
              channel.postMessage({ type: 'popoutFocusAck', sender: popoutSenderIdRef.current })
            } catch {}
          }
          return
        }

        // Handle variable changes from popout
        if (msg.type === 'variableChanged' && msg.allVariables) {
          varsRemoteUpdateRef.current = true
          flagSkipPopoutBroadcast()
          const next = { ...msg.allVariables }
          variablesRef.current = next
          setVariables(next)
          
          // Force update pill display values in the DOM
          // This is needed because React may not re-render pills immediately
          try {
            const lang = templateLanguageRef.current || 'fr'
            document.querySelectorAll('.var-pill').forEach(pill => {
              const varName = pill.getAttribute('data-var')
              if (!varName) return
              const varValue = resolveVariableValue(next, varName, lang)
              if (varValue === '__DELETED__') {
                pill.remove()
                return
              }
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
          
          // Purge any pills whose variables are now marked deleted
          try {
            Object.entries(next).forEach(([k,v]) => {
              if (v === '__DELETED__') {
                const base = k.replace(/_(FR|EN)$/i,'')
                document.querySelectorAll('.var-pill').forEach(pill => {
                  const pv = pill.getAttribute('data-var') || ''
                  if (pv === k || pv.replace(/_(FR|EN)$/i,'') === base) {
                    pill.remove()
                  }
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
            // Remove any existing pill DOM nodes for this variable (and language variants)
            try {
              const baseName = varName.replace(/_(FR|EN)$/i,'')
              document.querySelectorAll('.var-pill').forEach(pill => {
                const pv = pill.getAttribute('data-var') || ''
                if (pv === varName || pv.replace(/_(FR|EN)$/i,'') === baseName) {
                  pill.remove()
                }
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
          // Ignore all popoutOpened/popoutReady messages after the first one within 5 seconds
          const now = Date.now()
          if (lastPopoutOpenedTimestampRef.current && (now - lastPopoutOpenedTimestampRef.current) < 5000) {
            return
          }
          lastPopoutOpenedTimestampRef.current = now

          setTimeout(() => {
            // ALWAYS extract from editors when popout opens to get latest values
            // This ensures any edits made in the main window pills are captured
            let latestVariables = null
            
            try {
              const runSync = syncFromTextRef.current
              const syncResult = typeof runSync === 'function' ? runSync() : null
              if (syncResult?.variables) {
                latestVariables = { ...syncResult.variables }
              }
            } catch (syncError) {
              console.error('Failed to extract variables while preparing popout snapshot:', syncError)
            }

            // Fallback to snapshot or current variables if extraction failed
            if (!latestVariables && pendingPopoutSnapshotRef.current) {
              latestVariables = { ...pendingPopoutSnapshotRef.current }
            }

            if (!latestVariables) {
              latestVariables = { ...variablesRef.current }
            }

            pendingPopoutSnapshotRef.current = null

            try {
              channel.postMessage({
                type: 'variablesUpdated',
                variables: latestVariables,
                templateId: selectedTemplateRef.current?.id || null,
                templateLanguage: templateLanguageRef.current || templateLanguage,
                sender: popoutSenderIdRef.current
              })
            } catch (e) {
              console.error('Failed to send variables snapshot to popout:', e)
            }
          }, 60)
          return
        }
        
        // Handle sync request from popout
        if (msg.type === 'syncFromText') {
          // Extract current values from editors
          setTimeout(() => {
            const runSync = syncFromTextRef.current
            const result = typeof runSync === 'function' ? runSync() : { success: false, updated: false, variables: { ...variablesRef.current } }
            
            // Send back the extracted variables
            try {
              channel.postMessage({
                type: 'syncComplete',
                success: result.success,
                updated: result.updated,
                variables: result.variables,
                sender: popoutSenderIdRef.current
              })
            } catch (e) {
              console.error('Failed to send sync result:', e)
            }
          }, 50) // Small delay to ensure state consistency
          return
        }
      }
      
      return () => {
        try {
          channel.close()
        } catch (e) {
          console.error('Error closing BroadcastChannel:', e)
        }
        popoutChannelRef.current = null
      }
    } catch (e) {
      console.error('BroadcastChannel not available:', e)
    }
  }, [])

  // Emit updates when local variables change (avoid echo loops) with debouncing
  useEffect(() => {
    if (!canUseBC) return
    if (varsRemoteUpdateRef.current) { varsRemoteUpdateRef.current = false; return }
    
    const snapshot = { ...variables }
    const timeoutId = setTimeout(() => {
      const ch = varsChannelRef.current
      if (!ch) return
      try { ch.postMessage({ type: 'update', variables: snapshot, sender: varsSenderIdRef.current }) } catch {}
    }, 90) // slightly faster to improve perceived latency
    
    return () => clearTimeout(timeoutId)
  }, [variables])

  // Emit selected template and language so pop-out stays in sync
  useEffect(() => {
    if (!canUseBC) return
    const activeTemplateId = selectedTemplateRef.current?.id || selectedTemplateId || null
    const ch = varsChannelRef.current
    if (!ch) return
    const payload = { type: 'update', templateId: activeTemplateId, templateLanguage, sender: varsSenderIdRef.current }
    try { ch.postMessage(payload) } catch {}
    // Also notify popout channel directly for immediate template-language sync
    const popCh = popoutChannelRef.current
    if (popCh) {
      try { popCh.postMessage({ type: 'variablesUpdated', variables: { ...variablesRef.current }, templateId: activeTemplateId, templateLanguage, sender: popoutSenderIdRef.current }) } catch {}
    }
  }, [selectedTemplateId, templateLanguage])

  // Sync variables to popout in real-time when edited in main window
  useEffect(() => {
    if (!canUseBC) return
    const channel = popoutChannelRef.current
    if (!channel) return

    // Skip if this update came from the popout itself
    if (varsRemoteUpdateRef.current) {
      varsRemoteUpdateRef.current = false
      return
    }

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
        variables: { ...variables }, // send fresh shallow copy to avoid mutation references
        templateId: activeTemplateId,
        templateLanguage,
        darkMode,
        sender: popoutSenderIdRef.current
      })
    } catch (e) {
      console.error('Failed to broadcast variables to popout:', e)
    }

    // Fallback sync via localStorage events
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
  }, [variables, selectedTemplateId, templateLanguage])

  // Emit focused variable changes immediately for real-time visual feedback
  useEffect(() => {
    // Primary: BroadcastChannel for immediate sync
    if (focusFromPopoutRef.current) {
      focusFromPopoutRef.current = false
    } else if (canUseBC) {
      const ch = varsChannelRef.current
      if (ch) {
        try {
          ch.postMessage({ type: 'update', focusedVar, sender: varsSenderIdRef.current })
        } catch {}
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
    
    // Fallback: localStorage with minimal delay
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
    }, 50) // Small delay to let BroadcastChannel work first
    
    return () => clearTimeout(timeoutId)
  }, [focusedVar])

  // Emit showHighlights changes for cross-window sync
  useEffect(() => {
    // Primary: BroadcastChannel for immediate sync
    if (canUseBC) {
      const ch = varsChannelRef.current
      if (ch) {
        // showHighlights sync disabled via BroadcastChannel - using localStorage only
      }
    }
    
    // Fallback: localStorage with minimal delay
    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem('ea_show_highlights_sync', JSON.stringify({ 
          showHighlights, 
          timestamp: Date.now(),
          sender: varsSenderIdRef.current 
        }))
      } catch {}
    }, 50) // Small delay to let BroadcastChannel work first
    
    return () => clearTimeout(timeoutId)
  }, [showHighlights])

  // Listen for localStorage changes (fallback for cross-window sync)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'ea_focused_var' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue)
          // Only update if it's from a different sender and recent
          if (data.sender !== varsSenderIdRef.current && (Date.now() - data.timestamp) < 5000) {
            setFocusedVar(data.focusedVar)
          }
        } catch {}
      } else if (e.key === 'ea_show_highlights_sync' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue)
          // Only update if it's from a different sender and recent
          if (data.sender !== varsSenderIdRef.current && (Date.now() - data.timestamp) < 5000) {
            setShowHighlights(data.showHighlights)
          }
        } catch {}
      } else if (e.key === 'ea_vars_sync_payload' && e.newValue) {
        try {
          const data = JSON.parse(e.newValue)
          if (!data || !data.timestamp || (Date.now() - data.timestamp) >= 5000) return
          // Ignore our own broadcasts
          if (data.sender === varsSenderIdRef.current || data.sender === popoutSenderIdRef.current) return

          // Apply variableChanged payloads coming from popout/other windows
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
  }, [])

  // Apply pending remote template once templates load
  useEffect(() => {
    const pid = pendingTemplateIdRef.current
    if (!pid || !templatesData?.templates?.length) return
    const found = templatesData.templates.find(t => t.id === pid)
    if (found) setSelectedTemplate(found)
    pendingTemplateIdRef.current = null
  }, [templatesData])

  // Autofocus first empty variable when popup opens
  useEffect(() => {
    if (!showVariablePopup || varsMinimized) return
    const t = setTimeout(() => {
      try {
        if (!selectedTemplate || !selectedTemplate.variables || selectedTemplate.variables.length === 0) return
        // find first empty variable by template order
        const firstEmpty = selectedTemplate.variables.find(vn => !(variables[vn] || '').trim()) || selectedTemplate.variables[0]
        const el = varInputRefs.current[firstEmpty]
        if (el && typeof el.focus === 'function') { el.focus(); el.select?.() }
      } catch {}
    }, 0)
    return () => clearTimeout(t)
  }, [showVariablePopup, varsMinimized])

  // Outside click to auto-minimize when not pinned
  useEffect(() => {
    if (!showVariablePopup || varsPinned || varsMinimized) return
    const onDown = (e) => {
      if (!varPopupRef.current) return
      if (!varPopupRef.current.contains(e.target)) {
        setVarsMinimized(true)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showVariablePopup, varsPinned, varsMinimized])

  // Smart paste-to-fill: parse lines like "var: value" or "var = value" and map to known variables (case/diacritic-insensitive)
  const handleVarsSmartPaste = (text) => {
    if (!text || !selectedTemplate) return
    const lines = String(text).split(/\r?\n/)
    const map = {}
    const norm = (s='') => s.normalize('NFD').replace(/\p{Diacritic}+/gu,'').toLowerCase().trim()
    const known = selectedTemplate.variables
    const byDesc = {}
    for (const vn of known) {
      const info = templatesData?.variables?.[vn]
      const keys = [vn]
      if (info?.description) {
        const dfr = info.description.fr || ''
        const den = info.description.en || ''
        keys.push(dfr, den)
      }
      byDesc[vn] = keys.map(norm).filter(Boolean)
    }
    for (const line of lines) {
      const m = line.match(/^\s*([^:=]+?)\s*[:=-]\s*(.+)\s*$/)
      if (!m) continue
      const keyN = norm(m[1])
      const val = m[2]
      // find best variable with key match by name or description words
      let target = null
      for (const vn of known) {
        if (byDesc[vn].some(k => keyN.includes(k) || k.includes(keyN))) { target = vn; break }
      }
      if (!target) {
        // fallback: exact variable name within
        target = known.find(vn => norm(vn) === keyN)
      }
      if (target) map[target] = val
    }
    if (Object.keys(map).length) {
      setVariables(prev => {
        const assignments = {}
        const preferredLang = (templateLanguageRef.current || 'fr').toUpperCase()
        Object.entries(map).forEach(([varName, value]) => {
          Object.assign(assignments, expandVariableAssignment(varName, value, {
            preferredLanguage: preferredLang,
            variables: prev
          }))
        })
        const next = applyAssignments(prev, assignments)
        if (next !== prev) {
          variablesRef.current = next
        }
        return next
      })
      // focus first mapped field
      const first = Object.keys(map)[0]
      const el = varInputRefs.current[first]
      if (el) el.focus()
    }
  }

  // Close export menu on outside click or ESC
  useEffect(() => {
    if (!showExportMenu) return
    const onDocClick = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setShowExportMenu(false)
      }
    }
    const onEsc = (e) => { if (e.key === 'Escape') setShowExportMenu(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEsc)
    }
  }, [showExportMenu])

  const t = interfaceTexts[interfaceLanguage]

  // Get interface-specific placeholder text
  const getPlaceholderText = () => {
    return interfaceLanguage === 'fr' ? 'Sélectionnez un modèle' : 'Select a template'
  }

  // Set initial empty editors so contentEditable placeholder shows
  useEffect(() => {
    if (!selectedTemplate) {
      finalSubjectRef.current = ''
      finalBodyRef.current = ''
      setFinalSubject('')
      setFinalBody('')
    }
  }, [interfaceLanguage]) // Update when interface language changes

  // Auto-select first template after load to avoid "no template" UX if user hasn't picked one
  useEffect(() => {
    if (!loading || selectedTemplate || !templatesData?.templates?.length) return
    if (!selectedTemplateId) {
      if (debug) console.log('[EA][Debug] Template load complete without saved selection; awaiting user pick')
      return
    }
    const templateToSelect = templatesData.templates.find(t => t.id === selectedTemplateId)
    if (!templateToSelect) {
      if (debug) console.warn('[EA][Debug] Saved template id not found in catalog:', selectedTemplateId)
      return
    }
    setSelectedTemplate(templateToSelect)
    if (debug) console.log('[EA][Debug] Auto-selected restored template:', templateToSelect.id)
  }, [loading, templatesData, selectedTemplate, selectedTemplateId, debug])

  /**
   * URL PARAMETER SUPPORT FOR DEEP LINK SHARING
   */
  useEffect(() => {
    if (!templatesData) return
    
    // Read current URL parameters
    const params = new URLSearchParams(window.location.search)
    const templateId = params.get('id')
    const langParam = params.get('lang')
    
    // Apply language from URL if specified and valid
    if (langParam && ['fr', 'en'].includes(langParam)) {
      setTemplateLanguage(langParam)
      setInterfaceLanguage(langParam)
    }
    
    // Pre-select template from URL
    if (templateId) {
      const template = templatesData.templates.find(t => t.id === templateId)
      if (template) {
        setSelectedTemplate(template)
      }
    }
  }, [templatesData]) // Triggers when templates are loaded

  /**
   * REBUILD VARIABLES WHEN TEMPLATE CHANGES
   * Ensures popout receives correct variables for the selected template
   */
  useEffect(() => {
    if (!selectedTemplate || !templatesData) return
    
    // Only rebuild if template actually changed (avoid rebuilding on every re-render)
    if (lastRebuiltTemplateId.current === selectedTemplate.id) return
    lastRebuiltTemplateId.current = selectedTemplate.id
    
    // Rebuild variables with the new template's variable list
    const newVariables = buildInitialVariables(selectedTemplate, templatesData, templateLanguage)
    variablesRef.current = newVariables
    setVariables(newVariables)
    
    if (debug) console.log('[EA][Debug] Rebuilt variables for template:', selectedTemplate.id, 'vars:', Object.keys(newVariables).slice(0, 5))
    
    // Notify popout if BroadcastChannel is available (popout listens on this channel)
    setTimeout(() => {
      try {
        const channel = popoutChannelRef.current
        if (channel) {
          channel.postMessage({
            type: 'variablesUpdated',
            variables: newVariables,
            templateId: selectedTemplate.id,
            templateLanguage: templateLanguageRef.current || templateLanguage,
            sender: popoutSenderIdRef.current
          })
          if (debug) console.log('[EA][Debug] Notified popout of new template variables via BroadcastChannel')
        }
      } catch (e) {
        if (debug) console.error('Failed to notify popout:', e)
      }
    }, 100)
  }, [selectedTemplate, templatesData, templateLanguage, debug])

  // Keyboard shortcuts (extracted to hook)
  useKeyboardShortcuts({
    selectedTemplate,
    showVariablePopup,
    templatesData,
    templateLanguage,
    variablesRef,
    searchRef,
    copyToClipboard,
    setVariables,
    setVarsMinimized,
    setShowVariablePopup,
    handleVarsSmartPaste
  })

  const toggleFav = (id) => {
    setFavorites(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  // Sync from text: Extract variable values from text areas back to Variables Editor
  const syncFromText = useCallback(() => {
    if (!selectedTemplate || !templatesData) {
      return { success: false, updated: false, variables: { ...variables } }
    }

  const extracted = {}

  // Extract values directly from pill elements (most reliable method)
  const pillValuesFromSubject = extractVariablesFromPills(finalSubject)
  const pillValuesFromBody = extractVariablesFromPills(finalBody)
  
  // Merge pill values (subject takes priority)
  Object.assign(extracted, pillValuesFromBody, pillValuesFromSubject)

  const subjectTemplate = selectedTemplate.subject[templateLanguage] || ''
  const bodyTemplate = selectedTemplate.body[templateLanguage] || ''

    // For any variables not found in pills, try template-based extraction using actual placeholders
    const collectPlaceholders = (tpl = '') => {
      if (!tpl) return []
      return Array.from(tpl.matchAll(/<<([^>]+)>>/g), (match) => match[1])
    }

    const templatePlaceholders = new Set([
      ...collectPlaceholders(subjectTemplate),
      ...collectPlaceholders(bodyTemplate)
    ])

    if (templatePlaceholders.size > 0) {
      const missingPlaceholders = Array.from(templatePlaceholders).filter((name) => !extracted.hasOwnProperty(name))

      if (missingPlaceholders.length > 0 && subjectTemplate && finalSubject) {
        const subjectValues = extractVariablesFromTemplate(finalSubject, subjectTemplate, missingPlaceholders)
        Object.assign(extracted, subjectValues)
      }

      if (missingPlaceholders.length > 0 && bodyTemplate && finalBody) {
        const bodyTargets = missingPlaceholders.filter((name) => !extracted.hasOwnProperty(name))
        if (bodyTargets.length) {
          const bodyValues = extractVariablesFromTemplate(finalBody, bodyTemplate, bodyTargets)
          Object.assign(extracted, bodyValues)
        }
      }
    }

    // Normalize extracted values using assignment helper to ensure suffix/base parity
    const normalizedExtracted = {}
    const preferredLang = (templateLanguage || templateLanguageRef.current || 'fr').toUpperCase()
    Object.entries(extracted).forEach(([name, value]) => {
      Object.assign(normalizedExtracted, expandVariableAssignment(name, value, {
        preferredLanguage: preferredLang,
        variables
      }))
    })

    // Update variables state and return merged result
    const nextVariables = applyAssignments(variables, normalizedExtracted)
    const hasUpdates = nextVariables !== variables

    if (hasUpdates) {
      variablesRef.current = nextVariables
      setVariables(nextVariables)
    } else {
      variablesRef.current = nextVariables
    }

    return { success: true, updated: hasUpdates, variables: nextVariables }
  }, [selectedTemplate, templatesData, templateLanguage, finalSubject, finalBody, variables])

    useEffect(() => {
      syncFromTextRef.current = syncFromText
    }, [syncFromText])
  
  // Load a selected template
  useEffect(() => {
    if (selectedTemplate) {
      const initialVars = buildInitialVariables(selectedTemplate, templatesData, templateLanguage)

      const subjectTemplate = selectedTemplate.subject[templateLanguage] || ''
      const bodyTemplate = selectedTemplate.body[templateLanguage] || ''

      variablesRef.current = initialVars
      setVariables(initialVars)
      finalSubjectRef.current = subjectTemplate
      finalBodyRef.current = bodyTemplate
      setFinalSubject(subjectTemplate)
      setFinalBody(bodyTemplate)
      manualEditRef.current = { subject: false, body: false }
    } else {
      variablesRef.current = {}
      finalSubjectRef.current = ''
      finalBodyRef.current = ''
      setVariables({})
      setFinalSubject('')
      setFinalBody('')
      manualEditRef.current = { subject: false, body: false }
    }
  }, [selectedTemplate, templateLanguage, interfaceLanguage, templatesData])

  // Seed language-specific variables (_FR/_EN) from base on load/switch
  useEffect(() => {
    if (!selectedTemplate) return
    const list = Array.isArray(selectedTemplate.variables) ? selectedTemplate.variables : []
    if (!list.length) return
    setVariables((prev) => {
      if (!prev) return prev
      let next = prev
      let changed = false
      for (const baseName of list) {
        const baseVal = (prev[baseName] || '').trim()
        if (!baseVal) continue
        const enKey = `${baseName}_EN`
        const frKey = `${baseName}_FR`
        const enVal = (prev[enKey] || '').trim()
        const frVal = (prev[frKey] || '').trim()
        if (!enVal) {
          if (next === prev) next = { ...prev }
          next[enKey] = baseVal
          changed = true
        }
        if (!frVal) {
          if (next === prev) next = { ...prev }
          next[frKey] = baseVal
          changed = true
        }
      }
      if (!changed) return prev
      variablesRef.current = next
      return next
    })
  }, [selectedTemplate, templateLanguage])


  // When the user manually edits the subject/body, automatically try to reverse sync the values back into variables
  useEffect(() => {
    if (!selectedTemplate) return
    if (!manualEditRef.current.subject && !manualEditRef.current.body) return

    const debounce = setTimeout(() => {
      const result = syncFromText()

      manualEditRef.current = { subject: false, body: false }
    }, 220)

    return () => clearTimeout(debounce)
  }, [selectedTemplate, templateLanguage, finalSubject, finalBody, syncFromText])

  // Persist variables popup: no ESC-to-close
  // (Intentionally disabled per design: close only via the X button)

  // Disable automatic size persistence to avoid auto-resizing on open

  // Drag handlers
  const startDrag = (e) => {
    if (!varPopupRef.current) return
    e.preventDefault()
    const { clientX, clientY } = e
    dragState.current = { dragging: true, startX: clientX, startY: clientY, origTop: varPopupPos.top, origLeft: varPopupPos.left }
    const onMove = (ev) => {
      if (!dragState.current.dragging) return
      const dx = ev.clientX - dragState.current.startX
      const dy = ev.clientY - dragState.current.startY
      let nextTop = dragState.current.origTop + dy
      let nextLeft = dragState.current.origLeft + dx

      // Grid snapping (12px)
      const grid = 12
      const snap = (val) => Math.round(val / grid) * grid
      nextTop = snap(nextTop)
      nextLeft = snap(nextLeft)

      // Edge snapping with threshold (magnetic)
      const thresh = 16
      const maxLeft = window.innerWidth - (varPopupPos.width || 600)
      const maxTop = window.innerHeight - (varPopupPos.height || 400)
      if (Math.abs(nextLeft - 0) <= thresh) nextLeft = 0
      if (Math.abs(nextTop - 0) <= thresh) nextTop = 0
      if (Math.abs(nextLeft - maxLeft) <= thresh) nextLeft = Math.max(0, maxLeft)
      if (Math.abs(nextTop - maxTop) <= thresh) nextTop = Math.max(0, maxTop)

      // Clamp inside viewport with small margin
      nextTop = Math.max(0, Math.min(maxTop, nextTop))
      nextLeft = Math.max(0, Math.min(maxLeft, nextLeft))

      setVarPopupPos(p => ({ ...p, top: nextTop, left: nextLeft }))
    }
    const onUp = () => {
      dragState.current.dragging = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Reset form with confirmation
  const [showResetWarning, setShowResetWarning] = useState(false)
  
  const handleResetClick = () => {
    setShowResetWarning(true)
  }

  const confirmReset = () => {
    if (!selectedTemplate || !templatesData?.variables) {
      setShowResetWarning(false)
      return
    }

    const initialVars = buildInitialVariables(selectedTemplate, templatesData, templateLanguage)

    variablesRef.current = initialVars
    setVariables(initialVars)

    const subjectTemplate = selectedTemplate.subject?.[templateLanguage] || ''
    const bodyTemplate = selectedTemplate.body?.[templateLanguage] || ''

    finalSubjectRef.current = subjectTemplate
    finalBodyRef.current = bodyTemplate
    setFinalSubject(subjectTemplate)
    setFinalBody(bodyTemplate)

    manualEditRef.current = { subject: false, body: false }
    setFocusedVar(null)
    setShowResetWarning(false)
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(to bottom right, #f8fafc, #fefbe8, #e0f2fe)' }}>
      {debug && (
        <div style={{ position: 'fixed', bottom: 8, left: 8, background: '#1e293b', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: 12, zIndex: 9999, boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
          <div style={{ fontWeight: 600 }}>Debug</div>
          <div>loading: {String(loading)}</div>
          <div>templates: {templatesData?.templates?.length || 0}</div>
          <div>selected: {selectedTemplate?.id || 'none'}</div>
          <div>vars: {Object.keys(variables || {}).length}</div>
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: 'rgba(44, 61, 80, 0.9)' }}></div>
            <p className="text-gray-600">Chargement des modèles...</p>
          </div>
        </div>
      ) : (
        !varsOnlyMode && <>
      {/* Exact banner from attached design */}
  <header className="w-full mx-auto max-w-none page-wrap relative z-50 sticky top-0 border-b" style={{ backgroundColor: '#ffffff', borderColor: 'var(--tb-sage)', maxHeight: '120px', overflow: 'hidden', paddingTop: '0.125in', paddingBottom: '0px' }}>
        {/* Decorative pills and lines - EXACT positions from design */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {/* Top row of pills - bigger shapes, clear around logo */}
          <div className="banner-pill" style={{ top: '-48px', left: '-220px', width: '420px', height: '140px', background: '#2c3d50', opacity: 0.82, borderRadius: '160px' }}></div>
          <div className="banner-pill" style={{ top: '-23px', left: '720px', width: '340px', height: '115px', background: '#aca868', opacity: 0.40, borderRadius: '150px' }}></div>
          <div className="banner-pill" style={{ top: '-83px', left: '1140px', width: '680px', height: '125px', background: '#426388', opacity: 0.30, borderRadius: '160px' }}></div>
          
          {/* Bottom row of pills - bigger shapes */}
          <div className="banner-pill" style={{ top: '58px', left: '-200px', width: '380px', height: '110px', background: '#aca868', opacity: 0.30, borderRadius: '140px' }}></div>
          <div className="banner-pill" style={{ top: '65px', left: '780px', width: '720px', height: '185px', background: '#aca868', opacity: 0.15, borderRadius: '200px' }}></div>
          <div className="banner-pill" style={{ top: '85px', left: '1636px', width: '520px', height: '75px', background: '#2c3d50', opacity: 0.82, borderRadius: '130px' }}></div>
          
          {/* Horizontal line with dot - longer and bolder, extended left by 1 inch */}
          <div className="hpill-line" style={{ left: '472px', top: '40px', height: '3px', width: '528px', background: '#2c3d50', opacity: 0.70 }}>
            <span className="hpill-dot" style={{ top: '50%', left: '30%', transform: 'translate(-50%, -50%)', width: '18px', height: '18px', background: '#ffffff', borderRadius: '9999px', boxShadow: '0 0 0 4px #aca868', position: 'absolute' }}></span>
          </div>
          
          {/* Vertical line with dot */}
          <div className="hpill-line" style={{ left: '1530px', top: '-54px', height: '176px', width: '2px', background: '#2c3d50', opacity: 0.5 }}>
            <span className="hpill-dot" style={{ top: '52%', left: '50%', transform: 'translate(-50%, -50%)', width: '36px', height: '36px', background: '#ffffff', borderRadius: '9999px', boxShadow: '0 0 0 4px #8a7530', position: 'absolute' }}></span>
          </div>
        </div>
        
        {/* Main content */}
  <div className="flex items-start justify-between relative">
          {/* Left side: Logo + Subtitle with 2in margin */}
          <div className="flex items-center space-x-6" style={{ marginLeft: '3in' }}>
                {/* ECHO logo SVG - 225% larger (540×270), moved up ~0.65 inch */}
                <div className="relative" style={{ width: '270px', height: '135px', marginTop: '-0.185in', marginBottom: '2px', marginLeft: '-100px' }}>
                  <img src={echoLogo} alt="ECHO" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>

            {/* Subtitle only */}
            <div className="flex flex-col justify-center" style={{ marginLeft: '-60px', marginTop: '19px' }}>
              <p className="font-semibold" style={{ color: 'rgba(44, 61, 80, 0.9)', fontSize: '100%', maxWidth: '22rem' }}>
                {t.subtitle}
              </p>
            </div>
          </div>
          
          {/* Right side: Column with teal selector and subtle help below */}
          <div className="flex flex-col items-end" style={{ marginTop: '8px' }}>
            <div
              className="flex w-full max-w-sm flex-col gap-3 px-4 py-4 shadow-xl"
              style={{ backgroundColor: 'var(--primary)', borderRadius: 'calc(var(--radius) + 8px)' }}
            >
            <div className="flex items-center justify-between gap-0.5">
              <div className="flex items-center gap-3">
                <Globe className="h-8 w-8 text-white" />
                <span className="font-bold text-base text-white mr-[5px]">{t.interfaceLanguage}</span>
              </div>
              <div className="flex items-center gap-2">
                {/* Dark mode toggle */}
                <button
                  onClick={() => setDarkMode(prev => !prev)}
                  className="dark-mode-toggle"
                  title={darkMode 
                    ? (interfaceLanguage === 'fr' ? 'Mode clair' : 'Light mode')
                    : (interfaceLanguage === 'fr' ? 'Mode sombre' : 'Dark mode')
                  }
                >
                  {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </button>
                
                {/* Language selector */}
                <div className="flex bg-white p-1 shadow-lg" style={{ borderRadius: '14px' }}>
                <button
                  onClick={() => setInterfaceLanguage('fr')}
                  className={`px-3 py-1.5 text-sm font-bold transition-all duration-300 transform ${
                    interfaceLanguage === 'fr' ? 'shadow-xl scale-105' : ''
                  }`}
                  style={
                    interfaceLanguage === 'fr'
                      ? { backgroundColor: '#2c3d50', color: 'white', borderRadius: 'calc(var(--radius) + 4px)' }
                      : { backgroundColor: 'transparent', borderRadius: 'calc(var(--radius) + 4px)', color: '#6b7280' }
                  }
                >
                  FR
                </button>
                <button
                  onClick={() => setInterfaceLanguage('en')}
                  className={`px-3 py-1.5 text-sm font-bold transition-all duration-300 transform ${
                    interfaceLanguage === 'en' ? 'shadow-xl scale-105' : 'hover:scale-105'
                  }`}
                  style={
                    interfaceLanguage === 'en'
                      ? { backgroundColor: '#2c3d50', color: 'white', borderRadius: 'calc(var(--radius) + 4px)' }
                      : { backgroundColor: 'transparent', borderRadius: 'calc(var(--radius) + 4px)', color: '#6b7280' }
                  }
                >
                  EN
                </button>
              </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      </header>

  {/* Template submission button */}
  <Button
    onClick={() => {
      try {
        const url = new URL(window.location.href)
        url.searchParams.set('helpOnly', '1')
        url.searchParams.set('lang', interfaceLanguage)
        url.searchParams.set('category', 'template')
        url.searchParams.set('support', supportEmail)
        const w = Math.min(900, (window.screen?.availWidth || window.innerWidth) - 80)
        const h = Math.min(700, (window.screen?.availHeight || window.innerHeight) - 120)
        const left = Math.max(0, Math.floor(((window.screen?.availWidth || window.innerWidth) - w) / 2))
        const top = Math.max(0, Math.floor(((window.screen?.availHeight || window.innerHeight) - h) / 3))
        const features = `popup=yes,width=${Math.round(w)},height=${Math.round(h)},left=${left},top=${top},toolbar=0,location=0,menubar=0,status=0,scrollbars=1,resizable=1,noopener=1`
        const win = window.open(url.toString(), '_blank', features)
        if (win && win.focus) win.focus()
      } catch {}
    }}
    variant="outline"
    className="fixed bottom-4 right-[120px] z-40 inline-flex items-center gap-2 rounded-lg border-2 bg-white px-4 py-3 text-sm font-semibold tracking-wide shadow-lg transition-all"
    style={{ borderColor: 'rgba(44, 61, 80, 0.5)', color: '#2c3d50' }}
    onMouseEnter={(e) => {
      e.currentTarget.style.backgroundColor = 'rgba(44, 61, 80, 0.9)';
      e.currentTarget.style.color = 'white';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = 'white';
      e.currentTarget.style.color = '#2c3d50';
    }}
    title={interfaceLanguage === 'fr' ? 'Soumettre un modèle' : 'Submit a template'}
  >
    <FileText className="h-5 w-5" />
    <span>{interfaceLanguage === 'fr' ? 'Soumettre un modèle' : 'Submit a template'}</span>
  </Button>

  {/* Fixed Help button - bottom-right corner */}
  <Button
    onClick={() => {
      try {
        const url = new URL(window.location.href)
        url.searchParams.set('helpOnly', '1')
        url.searchParams.set('lang', interfaceLanguage)
        url.searchParams.set('support', supportEmail)
        // Minimal compact help popout dimensions
        const preferredW = 560
        const preferredH = 620
        const availW = (window.screen?.availWidth || window.innerWidth) - 40
        const availH = (window.screen?.availHeight || window.innerHeight) - 40
        const w = Math.min(preferredW, availW)
        const h = Math.min(preferredH, availH)
        const left = Math.max(0, Math.floor(((window.screen?.availWidth || window.innerWidth) - w) / 2))
        const top = Math.max(0, Math.floor(((window.screen?.availHeight || window.innerHeight) - h) / 3))
        const features = `popup=yes,width=${Math.round(w)},height=${Math.round(h)},left=${left},top=${top},toolbar=0,location=0,menubar=0,status=0,scrollbars=1,resizable=1,noopener=1`
        const win = window.open(url.toString(), '_blank', features)
        if (win && win.focus) win.focus()
      } catch {}
    }}
    variant="outline"
    className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-lg border-2 bg-white px-4 py-3 text-sm font-semibold tracking-wide shadow-lg transition-all"
    style={{ borderColor: 'rgba(44, 61, 80, 0.5)', color: '#2c3d50' }}
    onMouseEnter={(e) => {
      e.currentTarget.style.backgroundColor = 'rgba(44, 61, 80, 0.9)';
      e.currentTarget.style.color = 'white';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = 'white';
      e.currentTarget.style.color = '#2c3d50';
    }}
    title={interfaceLanguage === 'fr' ? "Ouvrir le centre d'aide" : 'Open help centre'}
  >
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <text x="12" y="16" fontSize="12" fill="currentColor" stroke="none" textAnchor="middle" fontWeight="bold">?</text>
    </svg>
    <span>{interfaceLanguage === 'fr' ? 'Aide' : 'Help'}</span>
  </Button>

  {/* Fixed Admin button - bottom-left corner (discreet) */}
  <Button
    onClick={() => {
      // Check if already authenticated (uses localStorage - synced with admin-simple.js)
      if (localStorage.getItem('ea_admin_auth') === 'true') {
        const adminUrl = new URL('./admin/admin-simple.html', window.location.href).href
        window.open(adminUrl, '_blank', 'noopener')
      } else {
        setShowAdminModal(true)
        setAdminPassword('')
        setAdminError('')
      }
    }}
    variant="ghost"
    className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium opacity-40 hover:opacity-100 transition-opacity"
    style={{ color: '#64748b' }}
    title={interfaceLanguage === 'fr' ? 'Console Admin' : 'Admin Console'}
  >
    <Settings className="h-4 w-4" />
    <span className="hidden sm:inline">Admin</span>
  </Button>

  {/* Mode Selector Button - next to Admin */}
  <div className="fixed bottom-4 left-24 z-40">
    <Button
      onClick={() => setShowModeMenu(!showModeMenu)}
      variant="ghost"
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
        selectedMode !== 'conseillers' ? 'opacity-100' : 'opacity-60 hover:opacity-100'
      }`}
      style={{ 
        color: selectedMode === 'conseillers' ? '#64748b' : 
               selectedMode === 'gestion' ? '#d97706' :
               selectedMode === 'equipe_admin' ? '#2563eb' : '#9333ea'
      }}
      title={interfaceLanguage === 'fr' ? 'Changer de mode' : 'Change mode'}
    >
      {MODE_CONFIG[selectedMode]?.icon || '👥'}
      <span className="hidden sm:inline">
        {interfaceLanguage === 'fr' ? MODE_CONFIG[selectedMode]?.labelFr : MODE_CONFIG[selectedMode]?.labelEn}
      </span>
      <svg className="h-3 w-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </Button>
    
    {/* Mode dropdown menu */}
    {showModeMenu && (
      <>
        <div className="fixed inset-0 z-40" onClick={() => setShowModeMenu(false)} />
        <div className="absolute bottom-full left-0 mb-2 w-56 bg-white dark:bg-zinc-800 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-700 py-1 z-50">
          <div className="px-3 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide border-b border-zinc-100 dark:border-zinc-700">
            {interfaceLanguage === 'fr' ? 'Sélectionner un mode' : 'Select a mode'}
          </div>
          {Object.entries(MODE_CONFIG).map(([mode, config]) => (
            <button
              key={mode}
              onClick={() => handleModeSelect(mode)}
              className={`w-full px-3 py-2.5 text-left text-sm flex items-center gap-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors ${
                selectedMode === mode ? 'bg-zinc-100 dark:bg-zinc-700' : ''
              }`}
            >
              <span className="text-base">{config.icon}</span>
              <span className={`flex-1 ${selectedMode === mode ? 'font-medium' : ''}`}>
                {interfaceLanguage === 'fr' ? config.labelFr : config.labelEn}
              </span>
              {selectedMode === mode && (
                <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {config.requiresAuth && selectedMode === 'conseillers' && (
                <span className="text-xs text-zinc-400">🔐</span>
              )}
            </button>
          ))}
        </div>
      </>
    )}
  </div>

  {/* Admin Login Modal */}
  {showAdminModal && (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setShowAdminModal(false)
          setAdminPassword('')
          setAdminError('')
          setShowAdminPassword(false)
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-[380px] max-w-[90vw] overflow-hidden">
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="text-4xl mb-3">🔐</div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            {interfaceLanguage === 'fr' ? 'Console Admin' : 'Admin Console'}
          </h2>
          <p className="text-sm text-gray-500">
            {interfaceLanguage === 'fr' ? 'Accès réservé aux administrateurs' : 'Administrators only'}
          </p>
        </div>
        
        <div className="px-6 pb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {interfaceLanguage === 'fr' ? 'Mot de passe' : 'Password'}
          </label>
          <div className="relative">
            <input
              type={showAdminPassword ? 'text' : 'password'}
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAdminLogin()
                }
              }}
              className="w-full px-4 py-3 pr-12 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:border-teal-500 transition-colors"
              placeholder={interfaceLanguage === 'fr' ? 'Entrez le mot de passe' : 'Enter password'}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowAdminPassword(!showAdminPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xl hover:opacity-70 transition-opacity"
              title={showAdminPassword 
                ? (interfaceLanguage === 'fr' ? 'Masquer le mot de passe' : 'Hide password')
                : (interfaceLanguage === 'fr' ? 'Afficher le mot de passe' : 'Show password')
              }
            >
              {showAdminPassword ? '🙈' : '👁️'}
            </button>
          </div>
          {adminError && (
            <p className="mt-2 text-sm text-red-600">{adminError}</p>
          )}
          
          <div className="flex gap-3 mt-5">
            <Button
              variant="outline"
              className="flex-1 py-3 rounded-xl font-semibold"
              onClick={() => {
                setShowAdminModal(false)
                setAdminPassword('')
                setAdminError('')
                setShowAdminPassword(false)
              }}
            >
              {interfaceLanguage === 'fr' ? 'Annuler' : 'Cancel'}
            </Button>
            <Button
              className="flex-1 py-3 rounded-xl font-semibold text-white"
              style={{ backgroundColor: '#059669' }}
              onClick={handleAdminLogin}
            >
              {interfaceLanguage === 'fr' ? 'Se connecter' : 'Login'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )}

  {/* Mode Authentication Modal */}
  {showModeAuthModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-6 w-full max-w-sm border border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {MODE_CONFIG[pendingMode]?.icon} {interfaceLanguage === 'fr' ? MODE_CONFIG[pendingMode]?.labelFr : MODE_CONFIG[pendingMode]?.labelEn}
          </h2>
          <button
            onClick={() => {
              setShowModeAuthModal(false)
              setShowManagementPassword(false)
              setPendingMode(null)
            }}
            className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          {interfaceLanguage === 'fr' 
            ? 'Ce mode contient des modèles réservés. Entrez le code d\'accès.'
            : 'This mode contains restricted templates. Enter the access code.'}
        </p>
        <div className="space-y-3">
          <div className="relative">
            <input
              type={showManagementPassword ? 'text' : 'password'}
              value={managementPassword}
              onChange={(e) => setManagementPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleModeAuth()}
              placeholder={interfaceLanguage === 'fr' ? 'Code d\'accès' : 'Access code'}
              className="w-full px-3 py-2 pr-10 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowManagementPassword(!showManagementPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-lg hover:opacity-70 transition-opacity"
              title={showManagementPassword 
                ? (interfaceLanguage === 'fr' ? 'Masquer' : 'Hide')
                : (interfaceLanguage === 'fr' ? 'Afficher' : 'Show')
              }
            >
              {showManagementPassword ? '🙈' : '👁️'}
            </button>
          </div>
          {managementError && (
            <p className="text-sm text-red-500">{managementError}</p>
          )}
          <Button
            onClick={handleModeAuth}
            className="w-full text-white"
            style={{ 
              backgroundColor: pendingMode === 'gestion' ? '#d97706' : 
                              pendingMode === 'equipe_admin' ? '#2563eb' : '#9333ea'
            }}
          >
            {interfaceLanguage === 'fr' ? 'Accéder' : 'Access'}
          </Button>
        </div>
      </div>
    </div>
  )}

  {/* Main content with resizable panes - full width */}
  <main className="w-full max-w-none px-3 sm:px-4 lg:px-6 py-5 pb-24">
  {/* Data integrity banner: show when templates failed to load */}
  {!loading && (!templatesData || !Array.isArray(templatesData.templates) || templatesData.templates.length === 0) && (
    <div className="mb-6 p-4 rounded-lg border-2 border-amber-300 bg-amber-50 text-amber-900 shadow-sm">
      <div className="font-semibold mb-1">{interfaceLanguage === 'fr' ? 'Aucun modèle chargé' : 'No templates loaded'}</div>
      <div className="text-sm">
        {interfaceLanguage === 'fr'
          ? "Le fichier complete_email_templates.json n'a pas été trouvé ou n'a pas pu être chargé. Le bouton d'envoi s'affiche uniquement quand un modèle est sélectionné."
          : 'The complete_email_templates.json file was not found or could not be loaded. The Send button only shows when a template is selected.'}
        <div className="mt-2">
          <a className="underline text-amber-800" href="./complete_email_templates.json" target="_blank" rel="noreferrer">complete_email_templates.json</a>
        </div>
        <div className="mt-1 text-xs text-amber-800/80">
          {interfaceLanguage === 'fr'
            ? 'Astuce: ajoutez ?debug=1 à l’URL pour voir les compteurs. Vérifiez la console réseau (F12) pour les erreurs 404/CORS.'
            : 'Tip: add ?debug=1 to the URL to see counters. Check the Network console (F12) for 404/CORS errors.'}
        </div>
      </div>
    </div>
  )}
  <div className="flex gap-4 items-stretch w-full">
    {/* Mobile open button */}
    <div className="md:hidden mb-3 w-full flex justify-start">
      <Button
        variant="outline"
        className="font-semibold border-2"
        style={{ borderColor: '#2c3d50', borderRadius: 12 }}
        onClick={() => { setShowMobileTemplates(true); setTimeout(() => searchRef.current?.focus(), 0) }}
      >
        <FileText className="h-4 w-4 mr-2 text-[#2c3d50]" />
        Templates
      </Button>
    </div>
    {/* Left panel - Template list (resizable) */}
    <div className="hidden md:block shrink-0" style={{ width: leftWidth }}>
      <Card className="h-fit card-soft border-0 overflow-hidden rounded-[14px]" style={{ background: '#ffffff', height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <CardContent className="p-0 flex flex-col h-full" style={{ padding: 0 }}>
          {/* Fixed header section */}
          <div className="flex-shrink-0 px-0 pt-0 pb-2 bg-white">
              {/* Teal header bar - match CardHeader style, extend to edges */}
              <div className="w-full px-4 flex items-center justify-center mb-3" style={{ background: 'var(--primary)', paddingTop: 10, paddingBottom: 10, minHeight: 48, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
                <div className="text-2xl font-bold text-white inline-flex items-center gap-2 leading-none whitespace-nowrap">
                  <FileText className="h-6 w-6 text-white" aria-hidden="true" />
                  <span className="truncate">{interfaceLanguage === 'fr' ? 'Modèles' : 'Templates'}</span>
                </div>
              </div>
              <div className="flex items-center justify-between px-4">
                <p className="text-sm text-gray-600">{filteredTemplates.length} {t.templatesCount}</p>
                <button
                  onClick={() => {
                    setFavoritesOnly(v => {
                      const next = !v
                      setFavLiveMsg(next ? `${t.favorites} (${favorites.length || 0})` : t.favorites)
                      return next
                    })
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
                  className={`px-3 py-1 text-sm font-bold rounded-md transition-all duration-200 border ${favoritesOnly ? 'bg-[#aca868]/20 text-[#2c3d50] border-[#aca868]' : 'bg-white text-[#2c3d50] border-[#2c3d50]'} flex items-center gap-2`}
                  title={t.showFavoritesOnly}
                  aria-pressed={favoritesOnly}
                  aria-live="polite"
                >
                  <span className={`text-xl transition-all duration-150 ${favoritesOnly ? 'text-[#8a8535] scale-110' : 'text-gray-200 scale-100'}`}>★</span>
                  {favoritesOnly ? `${t.favorites} (${favorites.length || 0})` : t.favorites}
                  <span style={{position:'absolute',left:'-9999px',height:0,width:0,overflow:'hidden'}} aria-live="polite">{favLiveMsg}</span>
                </button>
              </div>
              {/* Category filter */}
              <div className="mt-2 px-4">
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger
                    className={`w-full h-12 border rounded-md !bg-[#b5af70] !border-[#2c3d50] text-white font-semibold tracking-wide shadow-sm`}
                    style={{ color: 'white', fontSize: selectedCategory === 'all' ? '1rem' : '0.875rem' }}
                  >
                    <Filter className="h-4 w-4 mr-2 text-white" />
                    <span>{selectedCategory === 'all' ? t.allCategories : getCategoryLabel(selectedCategory)}</span>
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-[#2c3d50] rounded-[14px] shadow-xl text-[#2c3d50]">
                    <SelectItem value="all" className="font-semibold" style={{ fontSize: '1rem' }}>{t.allCategories}</SelectItem>
                    {orderedCategories
                      .filter(category => typeof category === 'string' && category.trim().length > 0)
                      .map(category => (
                        <SelectItem key={category} value={category}>
                          {getCategoryLabel(category)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Search */}
              <div className="relative group mt-2 px-4">
                <Search className="absolute top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" style={{ left: 34 }} />
                <Input
                  ref={searchRef}
                  id="template-search-main"
                  name="template-search-main"
                  type="text"
                  autoComplete="off"
                  placeholder={t.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex w-full min-w-0 rounded-[14px] bg-white px-3 py-1 text-base shadow-xs outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm h-12 pl-12 pr-12 border"
                  style={{ borderColor: '#2c3d50', backgroundColor: '#ffffff' }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
                    style={{ right: '31px' }}
                    title="Clear search"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            {/* Template language switcher - match CardHeader style */}
            <div className="w-full mt-3 px-4 flex items-center justify-between gap-0.5" style={{ background: 'var(--primary)', paddingTop: 10, paddingBottom: 10, minHeight: 48, borderRadius: '4px' }}>
              <div className="text-base font-bold text-white inline-flex items-center gap-2 leading-none whitespace-nowrap">
                <Languages className="h-5 w-5 text-white" />
                <span className="truncate mr-[5px]">{t.templateLanguage}</span>
              </div>
              <div className="flex bg-white rounded-lg p-1 shadow-sm">
                <button
                  onClick={() => setTemplateLanguage('fr')}
                  className={`px-3 py-1 text-sm font-bold rounded-md transition-all duration-300 button-ripple teal-focus ${templateLanguage === 'fr' ? 'text-white' : 'text-gray-600'}`}
                  style={templateLanguage === 'fr' ? { background: '#2c3d50' } : {} }
                >
                  FR
                </button>
                <button
                  onClick={() => setTemplateLanguage('en')}
                  className={`px-3 py-1 text-sm font-bold rounded-md transition-all duration-300 button-ripple teal-focus ${templateLanguage === 'en' ? 'text-white' : 'text-gray-600'}`}
                  style={templateLanguage === 'en' ? { background: '#2c3d50' } : {} }
                >
                  EN
                </button>
              </div>
            </div>
          </div>

          {/* Scrollable template cards */}
          <ScrollArea
            className="flex-1 rounded-b-[14px] overflow-y-auto bg-white"
            style={{ '--scrollbar-width': '20px', overscrollBehavior: 'contain', touchAction: 'pan-y' }}
            viewportRef={viewportRef}
            onViewportScroll={() => {
              const vp = viewportRef.current
              if (!vp) return
              // Throttle scroll updates for smoother performance
              if (vp._scrollTimeout) return
              vp._scrollTimeout = setTimeout(() => {
                setScrollTop(vp.scrollTop)
                setViewportH(vp.clientHeight)
                vp._scrollTimeout = null
              }, 16) // ~60fps
            }}
          >
            {/* Virtualized list */}
            {(() => {
              const ITEM_H = 104
              const count = filteredTemplates.length
              const start = Math.max(0, Math.floor(scrollTop / ITEM_H) - 3)
              const visible = Math.ceil((viewportH || 600) / ITEM_H) + 6
              const end = Math.min(count, start + visible)
              const topPad = start * ITEM_H
              const bottomPad = (count - end) * ITEM_H
              return (
                <div className="p-3 bg-white" style={{ minHeight: (count + 1) * ITEM_H }}>
                  <div style={{ height: topPad }} />
                  <div className="space-y-3">
                    {filteredTemplates.slice(start, end).map((template) => {
                      const badgeStyle = getCategoryBadgeStyle(template.category, templatesData?.metadata?.categoryColors || {})
                      const badgeLabel = getCategoryLabel(template.category)
                      return (
                        <div
                          key={template.id}
                          ref={(el) => { if (el) itemRefs.current[template.id] = el }}
                          onClick={() => {
                            setSelectedTemplate(template)
                            setSelectedTemplateId(template.id)
                          }}
                          onMouseDown={() => setPressedCardId(template.id)}
                          onMouseUp={() => setPressedCardId(null)}
                          onMouseLeave={() => setPressedCardId(null)}
                          className={`w-full p-4 border cursor-pointer transition-all duration-150 ${
                            selectedTemplate?.id === template.id
                              ? 'shadow-lg transform scale-[1.02]'
                              : 'border-[#e1eaf2] bg-white hover:border-[#2c3d50] hover:shadow-md hover:-translate-y-[1px]'
                          }`}
                          style={
                            selectedTemplate?.id === template.id
                              ? {
                                  borderColor: '#2c3d50',
                                  background: '#e6f0ff',
                                  borderRadius: '14px',
                                  scrollMarginTop: 220,
                                }
                              : { borderRadius: '14px', transform: pressedCardId === template.id ? 'scale(0.995)' : undefined, boxShadow: pressedCardId === template.id ? 'inset 0 0 0 1px rgba(0,0,0,0.05)' : undefined, scrollMarginTop: 220 }
                          }
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-bold text-gray-900 text-[13px]" title={template.title[templateLanguage]}>
                                  {renderHighlighted(
                                    template.title[templateLanguage],
                                    getMatchRanges(template.id, `title.${templateLanguage}`)
                                  )}
                                </h3>
                                {(() => {
                                  const modes = Array.isArray(template.utilisateur) ? template.utilisateur : (template.utilisateur ? [template.utilisateur] : ['conseillers'])
                                  const restrictedModes = modes.filter(m => ['gestion', 'equipe_admin', 'relations_fournisseurs'].includes(m))
                                  return restrictedModes.map(mode => (
                                    <span 
                                      key={mode}
                                      className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                                        mode === 'gestion' ? 'bg-amber-100 text-amber-700' :
                                        mode === 'equipe_admin' ? 'bg-blue-100 text-blue-700' :
                                        'bg-purple-100 text-purple-700'
                                      }`}
                                      title={interfaceLanguage === 'fr' 
                                        ? (mode === 'gestion' ? 'Gestion' :
                                           mode === 'equipe_admin' ? 'Équipe Admin' :
                                           'Relations fournisseurs')
                                        : (mode === 'gestion' ? 'Management' :
                                           mode === 'equipe_admin' ? 'Admin Team' :
                                           'Supplier Relations')}
                                    >
                                      {mode === 'gestion' ? '🔐' :
                                       mode === 'equipe_admin' ? '👔' : '🤝'}
                                    </span>
                                  ))
                                })()}
                              </div>
                              <p className="text-[12px] text-gray-600 mb-2 leading-relaxed line-clamp-2" title={template.description[templateLanguage]}>
                                {renderHighlighted(
                                  template.description[templateLanguage],
                                  getMatchRanges(template.id, `description.${templateLanguage}`)
                                )}
                              </p>
                              <Badge
                                variant="outline"
                                className="text-[11px] font-semibold px-3 py-1 border rounded-full shadow-sm"
                                style={{ background: badgeStyle.bg, color: badgeStyle.text, borderColor: badgeStyle.border }}
                              >

                                {badgeLabel}
                              </Badge>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleFav(template.id); }}
                              className={`ml-3 text-xl transition-colors ${isFav(template.id) ? 'text-[#8a8535]' : 'text-gray-200 hover:text-[#8a8535]'}`}
                              title={isFav(template.id) ? 'Unfavorite' : 'Favorite'}
                              aria-label="Toggle favorite"
                            >★</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ height: bottomPad }} />
                </div>
              );
            })()}

            {/* Keyboard nav capture */}
            <div
              className="sr-only"
              tabIndex={0}
              onKeyDown={(e) => {
                if (!filteredTemplates.length) return;
                if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return; }
                if (e.key === 'Escape') { if (searchQuery) setSearchQuery(''); return; }
                const max = filteredTemplates.length - 1;
                let idx = focusedIndex;
                if (idx < 0) idx = selectedTemplate ? Math.max(0, filteredTemplates.findIndex(t => t.id === selectedTemplate.id)) : 0;
                if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(max, idx + 1); setFocusedIndex(idx); itemRefs.current[filteredTemplates[idx].id]?.scrollIntoView({ block: 'nearest' }); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); setFocusedIndex(idx); itemRefs.current[filteredTemplates[idx].id]?.scrollIntoView({ block: 'nearest' }); return; }
                if (e.key.toLowerCase() === 'f') { e.preventDefault(); const id = filteredTemplates[idx]?.id; if (id) toggleFav(id); return; }
                if (e.key === 'Enter') { e.preventDefault(); const tSel = filteredTemplates[idx]; if (tSel) setSelectedTemplate(tSel); return; }
              }}
            />
          </ScrollArea>
        </CardContent>
      </Card>
    </div>

    {/* Mobile overlay for templates */}
    {showMobileTemplates && (
      <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-black/40" onClick={() => setShowMobileTemplates(false)} />
        <div className="absolute left-0 top-0 h-full w-[88vw] bg-white shadow-2xl border-r border-gray-200 p-2">
          <div className="flex justify-between items-center mb-2 px-2">
            <div className="font-semibold text-gray-700 flex items-center gap-2"><FileText className="h-5 w-5"/>Templates</div>
            <button className="text-gray-500 hover:text-gray-700" onClick={() => setShowMobileTemplates(false)}>✕</button>
          </div>
          {/* Reuse same card content in a simple scroll container */}
          <div className="h-[80vh] overflow-y-auto pr-1">
            {/* Simple reuse by rendering the desktop card again would duplicate logic; keep minimal: instruct to use desktop pane on mobile for now. */}
            {/* For simplicity, render the same ScrollArea block */}
            <div className="pr-2">
              {/* We re-mount the desktop block content by calling setShowMobileTemplates; for brevity, we mirror the header-only quick access and basic list without virtualization */}
              <div className="h-[48px] w-full rounded-[14px] px-4 flex items-center justify-center mb-2" style={{ background: 'var(--primary)' }}>
                <div className="text-base font-bold text-white inline-flex items-center gap-2 leading-none whitespace-nowrap">
                  <FileText className="h-5 w-5 text-white" aria-hidden="true" />
                  <span className="truncate">{interfaceLanguage === 'fr' ? 'Modèles' : 'Templates'}</span>
                </div>
              </div>
              <div className="mt-2">
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className={`w-full h-12 border transition-all duration-200 rounded-md ${selectedCategory === 'all' ? 'font-semibold' : ''}`} style={{ background: '#b5af70', borderColor: '#b5af70', color: 'white', fontSize: selectedCategory === 'all' ? '1rem' : '0.875rem' }}>
                    <Filter className="h-4 w-4 mr-2 text-white" />
                    <span>{selectedCategory === 'all' ? t.allCategories : getCategoryLabel(selectedCategory)}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="font-semibold" style={{ fontSize: '1rem' }}>{t.allCategories}</SelectItem>
                    {orderedCategories
                      .filter(category => typeof category === 'string' && category.trim().length > 0)
                      .map(category => (
                        <SelectItem key={category} value={category}>
                          {getCategoryLabel(category)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="relative group mt-2">
                <Search className="absolute top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" style={{ left: 14 }} />
                <Input
                  ref={searchRef}
                  id="template-search-mobile"
                  name="template-search-mobile"
                  type="text"
                  placeholder={t.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex w-full min-w-0 rounded-[14px] bg-transparent px-3 py-1 text-base shadow-xs outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm h-12 pl-12 pr-10 border"
                  style={{ borderColor: '#aca868' }}
                />
              </div>
              <div className="mt-3 space-y-3">
                {filteredTemplates.slice(0, 80).map((template) => {
                  const badgeStyle = getCategoryBadgeStyle(template.category, templatesData?.metadata?.categoryColors || {})
                  const badgeLabel = getCategoryLabel(template.category)
                  return (
                    <div key={template.id} onClick={() => { setSelectedTemplate(template); setShowMobileTemplates(false) }} className="w-full p-4 border border-[#e1eaf2] bg-white rounded-[14px]">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-bold text-gray-900 text-[13px]" title={template.title[templateLanguage]}>
                              {renderHighlighted(
                                template.title[templateLanguage],
                                getMatchRanges(template.id, `title.${templateLanguage}`)
                              )}
                            </h3>
                            {(() => {
                              const modes = Array.isArray(template.utilisateur) ? template.utilisateur : (template.utilisateur ? [template.utilisateur] : ['conseillers'])
                              const restrictedModes = modes.filter(m => ['gestion', 'equipe_admin', 'relations_fournisseurs'].includes(m))
                              return restrictedModes.map(mode => (
                                <span 
                                  key={mode}
                                  className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                                    mode === 'gestion' ? 'bg-amber-100 text-amber-700' :
                                    mode === 'equipe_admin' ? 'bg-blue-100 text-blue-700' :
                                    'bg-purple-100 text-purple-700'
                                  }`}
                                  title={interfaceLanguage === 'fr' 
                                    ? (mode === 'gestion' ? 'Gestion' :
                                       mode === 'equipe_admin' ? 'Équipe Admin' :
                                       'Relations fournisseurs')
                                    : (mode === 'gestion' ? 'Management' :
                                       mode === 'equipe_admin' ? 'Admin Team' :
                                       'Supplier Relations')}
                                >
                                  {mode === 'gestion' ? '🔐' :
                                   mode === 'equipe_admin' ? '👔' : '🤝'}
                                </span>
                              ))
                            })()}
                          </div>
                          <p className="text-[12px] text-gray-600 mb-2 leading-relaxed line-clamp-2" title={template.description[templateLanguage]}>
                            {renderHighlighted(
                              template.description[templateLanguage],
                              getMatchRanges(template.id, `description.${templateLanguage}`)
                            )}
                          </p>
                          <Badge
                            variant="outline"
                            className="text-[11px] font-semibold px-3 py-1 border rounded-full shadow-sm"
                            style={{ background: badgeStyle.bg, color: badgeStyle.text, borderColor: badgeStyle.border }}
                          >
                            {badgeLabel}
                          </Badge>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); toggleFav(template.id) }} className={`ml-3 text-xl ${isFav(template.id) ? 'text-[#8a8535]' : 'text-gray-200 hover:text-[#8a8535]'}`} title={isFav(template.id) ? 'Unfavorite' : 'Favorite'} aria-label="Toggle favorite">★</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

          {/* Main editing panel (flexible) */}
          <div className="flex-1 min-w-[600px] space-y-5">
            {selectedTemplate ? (
              <>
                {/* Editable version - MAIN AREA */}
                <Card className="card-soft border-0 overflow-hidden rounded-[14px]" style={{ background: '#ffffff' }}>
                  <CardHeader style={{ background: 'var(--primary)', paddingTop: 10, paddingBottom: 10, minHeight: 48, boxShadow: 'none', borderBottom: 'none', borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
                    <CardTitle className="text-2xl font-bold text-white flex items-center justify-between">
                      <div className="flex items-center">
                        <Mail className="h-6 w-6 mr-3 text-white" />
	                      {t.editEmail}
	                    </div>
	                    <div className="flex items-center space-x-3">
	                      {selectedTemplate && selectedTemplate.variables && selectedTemplate.variables.length > 0 && (
                          <>
                            <Button
                              onClick={() => {
                                let preparedSnapshot = null
                                try {
                                  const runSync = syncFromTextRef.current
                                  if (typeof runSync === 'function') {
                                    const result = runSync()
                                    if (result?.variables) {
                                      preparedSnapshot = { ...result.variables }
                                    }
                                  }
                                } catch (syncError) {
                                  console.error('Failed to extract variables before opening popout:', syncError)
                                }

                                if (!preparedSnapshot) {
                                  preparedSnapshot = { ...variablesRef.current }
                                }

                                pendingPopoutSnapshotRef.current = preparedSnapshot

                                try {
                                  localStorage.setItem('ea_pending_popout_snapshot', JSON.stringify({
                                    variables: preparedSnapshot,
                                    templateId: selectedTemplate?.id || null,
                                    templateLanguage,
                                    timestamp: Date.now()
                                  }))
                                } catch (storageError) {
                                  console.warn('Unable to persist pending popout snapshot:', storageError)
                                }

                                // Open variables in new popout window
                                const url = new URL(window.location.href)
                                url.searchParams.set('varsOnly', '1')
                                if (selectedTemplate?.id) url.searchParams.set('id', selectedTemplate.id)
                                if (templateLanguage) url.searchParams.set('lang', templateLanguage)
                                
                                // Calculate window size based on number of variables
                                const count = selectedTemplate?.variables?.length || 0
                                const columns = Math.max(1, Math.min(3, count >= 3 ? 3 : count))
                                const cardW = 360
                                const gap = 8
                                const headerH = 80
                                const rowH = 120 // approx per row
                                const rows = Math.max(1, Math.ceil(count / columns))
                                let w = columns * cardW + (columns - 1) * gap + 48
                                let h = Math.min(700, headerH + rows * rowH + 48)
                                const availW = (window.screen?.availWidth || window.innerWidth) - 40
                                const availH = (window.screen?.availHeight || window.innerHeight) - 80
                                w = Math.min(w, availW)
                                h = Math.min(h, availH)
                                const left = Math.max(0, Math.floor(((window.screen?.availWidth || window.innerWidth) - w) / 2))
                                const top = Math.max(0, Math.floor(((window.screen?.availHeight || window.innerHeight) - h) / 3))
                                const features = `popup=yes,width=${Math.round(w)},height=${Math.round(h)},left=${left},top=${top},toolbar=0,location=0,menubar=0,status=0,scrollbars=1,resizable=1,noopener=1`
                                
                                const win = window.open(url.toString(), '_blank', features)
                                if (win && win.focus) win.focus()
                                
                                // Auto-close the popup when popout opens successfully
                                if (win) {
                                  setVarsMinimized(false)
                                  setVarsPinned(false)
                                  setShowVariablePopup(false)
                                }
                              }}
                              size="sm"
                              className="shadow-soft"
                              variant="outline"
                              style={{ background: '#fff', color: '#2c3d50', borderColor: 'rgba(44, 61, 80, 0.35)' }}
                            >
	                          <Settings className="h-4 w-4 mr-2" />
	                          {t.variables}
	                        </Button>
                            
                          </>
	                      )}
                        {/* Copilot trigger: opens hidden AI panel - Sage accent */}
                        <Button
                          onClick={() => setShowAIPanel(true)}
                          size="sm"
                          variant="outline"
                          className="shadow-soft"
                          style={{ background: '#fff', color: '#2c3d50', borderColor: 'rgba(44, 61, 80, 0.35)' }}
                          title="Ouvrir l'assistant Copilot"
                        >
                          <Sparkles className="h-4 w-4 mr-1.5" />
                          Copilot
                        </Button>
                        {/* Outlook button moved below editor */}
	                    </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-5 space-y-5 mt-1" style={{ background: '#f6fbfb', borderRadius: 14 }}>

                    {/* Editable subject with preview highlighting */}
                    <div className="space-y-3 mt-2">
                      <div className="flex items-center gap-2 text-slate-800 font-semibold">
                        <span className="inline-block h-2 w-2 rounded-full bg-[#2c3d50]"></span>
                        <span>{t.subject}</span>
                      </div>
                      <SimplePillEditor
                        key={`subject-${selectedTemplate?.id || 'none'}-${templateLanguage}`}
                        ref={subjectEditorRef}
                        value={finalSubject}
                        onChange={(e) => {
                          const nextValue = e.target.value
                          finalSubjectRef.current = nextValue
                          setFinalSubject(nextValue)
                          manualEditRef.current.subject = true
                        }}
                        variables={variables}
                        templateLanguage={templateLanguage}
                        placeholder={getPlaceholderText()}
                        onVariablesChange={handleInlineVariableChange}
                        focusedVarName={focusedVar}
                        onFocusedVarChange={(varName) => {
                          // Local pill focus change
                          setFocusedVar(varName || null)
                          updateFocusHighlight(varName || null)
                          // Broadcast to popout so corresponding card highlights
                          if (popoutChannelRef.current) {
                            try {
                              popoutChannelRef.current.postMessage({
                                type: 'focusedVar',
                                varName: varName || null,
                                normalizedVar: normalizeVarKey(varName) || null,
                                sender: popoutSenderIdRef.current
                              })
                            } catch (e) {
                              console.warn('Focus broadcast failed:', e)
                            }
                          }
                        }}
                        variant="compact"
                      />

                    </div>

                    {/* Editable body with preview highlighting */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-slate-800 font-semibold">
                        <span className="inline-block h-2 w-2 rounded-full bg-[#2c3d50]"></span>
                        <span>{t.body}</span>
                      </div>
                      <RichTextPillEditor
                        key={`body-${selectedTemplate?.id || 'none'}-${templateLanguage}`}
                        value={finalBody}
                        onChange={(e) => {
                          const nextValue = e.target.value
                          finalBodyRef.current = nextValue
                          setFinalBody(nextValue)
                          manualEditRef.current.body = true
                        }}
                        ref={bodyEditorRef}
                        variables={variables}
                        templateLanguage={templateLanguage}
                        placeholder={getPlaceholderText()}
                        onVariablesChange={handleInlineVariableChange}
                        focusedVarName={focusedVar}
                        onFocusedVarChange={(varName) => {
                          setFocusedVar(varName || null)
                          updateFocusHighlight(varName || null)
                          if (popoutChannelRef.current) {
                            try {
                              popoutChannelRef.current.postMessage({
                                type: 'focusedVar',
                                varName: varName || null,
                                normalizedVar: normalizeVarKey(varName) || null,
                                sender: popoutSenderIdRef.current
                              })
                            } catch (e) {
                              console.warn('Focus broadcast failed:', e)
                            }
                          }
                        }}
                        minHeight="150px"
                        showRichTextToolbar={true}
                      />

                    </div>
                  </CardContent>
                </Card>

                {/* Actions with modern style */}
                <div className="flex justify-between items-center actions-row">
                  {/* Left-side tools: Export (+) then Copy link */}
                  <div className="flex items-center gap-2 relative" ref={exportMenuRef}>
                    <Button size="sm" variant="outline" className="font-medium border text-[#2c3d50]" style={{ borderRadius: 12, borderColor: '#2c3d50' }} onClick={() => setShowExportMenu(v => !v)} aria-expanded={showExportMenu} aria-haspopup="menu">
                      +
                    </Button>
                    {showExportMenu && (
                      <div className="absolute left-0 z-20 mt-2 w-52 bg-white border border-[#e6eef5] rounded-[12px] shadow-soft py-1" role="menu">
                        <button className="w-full text-left px-3 py-2 hover:bg-[#f5fbff] text-sm" onClick={() => { exportAs('pdf'); setShowExportMenu(false) }}>📄 Exporter en PDF</button>
                        <button className="w-full text-left px-3 py-2 hover:bg-[#f5fbff] text-sm" onClick={() => { exportAs('word'); setShowExportMenu(false) }}>📗 Ouvrir dans Word</button>
                        <button className="w-full text-left px-3 py-2 hover:bg-[#f5fbff] text-sm" onClick={() => { exportAs('docx'); setShowExportMenu(false) }}>📘 Télécharger Word (.doc)</button>
                        <div className="border-t border-gray-200 my-1"></div>
                        <button className="w-full text-left px-3 py-2 hover:bg-[#f5fbff] text-sm" onClick={() => { exportAs('html'); setShowExportMenu(false) }}>🌐 Exporter en HTML</button>
                        <button className="w-full text-left px-3 py-2 hover:bg-[#f5fbff] text-sm" onClick={() => { exportAs('eml'); setShowExportMenu(false) }}>✉️ Exporter en .eml</button>
                        <div className="border-t border-gray-200 my-1"></div>
                        <button className="w-full text-left px-3 py-2 hover:bg-[#f5fbff] text-sm" onClick={() => { exportAs('copy-html'); setShowExportMenu(false) }}>📋 Copier en HTML</button>
                        <button className="w-full text-left px-3 py-2 hover:bg-[#f5fbff] text-sm" onClick={() => { exportAs('copy-text'); setShowExportMenu(false) }}>📝 Copier en texte</button>
                      </div>
                    )}
                    <Button 
                      variant="ghost" 
                      onClick={() => copyTemplateLink()}
                      className="text-gray-500 hover:text-[#aca868] hover:bg-[#fefbe8] transition-all duration-300 font-medium text-sm"
                      title={t.copyLinkTitle}
                    >
                      <Link className="h-4 w-4 mr-2" />
                      {copySuccess === 'link' ? t.copied : t.copyLink}
                    </Button>

                  </div>
                  
                  <div className="flex space-x-3">
                    <Button 
                      onClick={handleResetClick}
                      size="sm"
                      variant="outline"
                      className="font-semibold shadow-soft hover:shadow-md border-2 text-black hover:bg-[#fee2e2]"
                      style={{ borderColor: '#7f1d1d', borderRadius: 12 }}
                      title={t.resetWarningTitle}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      {t.reset}
                    </Button>
                  
                  {/* 
                    GRANULAR COPY BUTTONS - ENHANCED UX
                  */}
                  <div className="flex space-x-2">
                    {/* Subject Copy Button - Teal theme */}
                    <Button 
                      onClick={() => copyToClipboard('subject')} 
                      variant="outline"
                      size="sm"
                      className="font-medium border-2 transition-all duration-300 group shadow-soft"
                      style={{ 
                        borderColor: '#2c3d50',
                        borderRadius: '12px',
                        backgroundColor: 'rgba(44, 61, 80, 0.08)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#2c3d50';
                        e.currentTarget.style.backgroundColor = 'rgba(44, 61, 80, 0.15)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#2c3d50';
                        e.currentTarget.style.backgroundColor = 'rgba(44, 61, 80, 0.08)';
                      }}
                      title="Copy subject only (Ctrl+J)"
                    >
                      <Mail className="h-4 w-4 mr-2 text-[#2c3d50]" />
                      <span className="text-[#2c3d50]">{copySuccess === 'subject' ? t.copied : (t.copySubject || 'Subject')}</span>
                    </Button>
                    
                    {/* Body Copy Button - Sage accent (slightly darker) */}
                    <Button 
                      onClick={() => copyToClipboard('body')} 
                      variant="outline"
                      size="sm"
                      className="font-medium border-2 transition-all duration-300 group shadow-soft"
                      style={{ 
                        borderColor: '#aca868',
                        borderRadius: '12px',
                        backgroundColor: 'rgba(172, 168, 104, 0.12)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#aca868';
                        e.currentTarget.style.backgroundColor = 'rgba(172, 168, 104, 0.22)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#aca868';
                        e.currentTarget.style.backgroundColor = 'rgba(172, 168, 104, 0.12)';
                      }}
                      title="Copy body only (Ctrl+B)"
                    >
                      <Edit3 className="h-4 w-4 mr-2 text-[#2c3d50]" />
                      <span className="text-[#2c3d50]">{copySuccess === 'body' ? t.copied : (t.copyBody || 'Body')}</span>
                    </Button>
                    
                    {/* Complete Copy Button - Gradient (main action) */}
                    <Button 
                      onClick={() => copyToClipboard('all')} 
                      className={`font-bold transition-all duration-200 shadow-soft btn-pill text-white ${
                        copySuccess === 'all'
                          ? 'transform scale-[1.02]' 
                          : 'hover:scale-[1.02]'
                      }`}
                      style={{ background: '#5a88b5' }}
                      title="Copy entire template (Ctrl+Enter)"
                    >
                      <Copy className="h-5 w-5 mr-2" />
                      {copySuccess === 'all' ? t.copied : (t.copyAll || 'All')}
                    </Button>
                  </div>
                  </div>
                </div>
              </>
            ) : (
              <Card className="empty-state-card card-soft border-0 bg-gradient-to-br from-white to-emerald-50 rounded-[18px]">
                <CardContent className="flex items-center justify-center h-80">
                  <div className="text-center">
                    <div className="relative mb-6">
                      <FileText className="empty-state-icon h-16 w-16 text-gray-300 mx-auto animate-bounce" />
                      <Sparkles className="empty-state-sparkle h-6 w-6 text-[#2c3d50] absolute -top-2 -right-2 animate-pulse" />
                    </div>
                    <p className="empty-state-text text-gray-500 text-lg font-medium">{t.noTemplate}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
          {/* Removed permanent AI sidebar; optional slide-over below */}
        </div>
      </main>

      {/* Footer Help button removed per request */}
        </>
      )}

      {/* Reset Warning Dialog */}
      {showResetWarning && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-md w-full p-6">
            <div className="text-center mb-6">
              <div className="text-yellow-500 text-6xl mb-4">⚠️</div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">{t.resetWarningTitle}</h2>
              <p className="text-gray-600">{t.resetWarningMessage}</p>
            </div>
            <div className="flex space-x-4">
              <Button
                onClick={() => setShowResetWarning(false)}
                variant="outline"
                className="flex-1"
              >
                {t.cancel}
              </Button>
              <Button
                onClick={confirmReset}
                variant="outline"
                className="flex-1 border-2 text-[#7f1d1d] hover:bg-[#fee2e2]"
                style={{ borderColor: '#7f1d1d' }}
              >
                {t.confirm}
              </Button>
            </div>
          </div>
        </div>
      )}



      {/* Variables minimized pill */}
  {showVariablePopup && varsMinimized && !varsOnlyMode && createPortal(
        <div
          className="fixed z-[9999] select-none"
          style={{ right: pillPos.right, bottom: pillPos.bottom }}
        >
          <button
            className="px-3 py-2 rounded-full shadow-lg border bg-white text-[#aca868] font-semibold"
            style={{ borderColor: '#aca868' }}
            onMouseDown={(e) => {
              e.preventDefault()
              const startX = e.clientX
              const startY = e.clientY
              const startR = pillPos.right
              const startB = pillPos.bottom
              const onMove = (ev) => {
                const dx = ev.clientX - startX
                const dy = ev.clientY - startY
                const grid = 12
                const snap = (v)=> Math.round(v/grid)*grid
                const nextRight = snap(Math.max(8, startR - dx))
                const nextBottom = snap(Math.max(8, startB - dy))
                setPillPos({ right: nextRight, bottom: nextBottom })
              }
              const onUp = () => {
                document.removeEventListener('mousemove', onMove)
                document.removeEventListener('mouseup', onUp)
              }
              document.addEventListener('mousemove', onMove)
              document.addEventListener('mouseup', onUp)
            }}
            onClick={() => setVarsMinimized(false)}
            title={interfaceLanguage==='fr'?'Variables':'Variables'}
          >
            <Edit3 className="inline h-4 w-4 mr-1" /> {t.variables}
          </button>
        </div>,
        document.body
      )}

      {/* Resizable Variables Popup (no blocking backdrop) */}
    {showVariablePopup && !varsMinimized && selectedTemplate && templatesData && templatesData.variables && selectedTemplate.variables && selectedTemplate.variables.length > 0 && createPortal(
  <div className="fixed inset-0 z-[9999] pointer-events-none" style={varsOnlyMode ? { background: '#ffffff' } : undefined}>
          <div 
            ref={varPopupRef}
            className={`bg-white ${varsOnlyMode ? '' : 'rounded-[14px] shadow-2xl border border-[#e6eef5]'} min-w-[420px] ${varsOnlyMode ? 'max-w-[100vw] max-h-[100vh]' : 'max-w-[92vw] max-h-[88vh]'} resizable-popup pointer-events-auto flex flex-col`}
            style={{ 
              position: 'fixed',
              top: varPopupPos.top,
              left: varPopupPos.left,
              width: varPopupPos.width,
              height: varPopupPos.height,
              cursor: dragState.current.dragging ? 'grabbing' : 'default'
            }}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="vars-title"
            // Do not close on keyboard; keep persistent unless user clicks X
          >
            {/* Popup Header: Teal background, white text + sticky tools */}
            <div 
              className={`px-3 py-2 select-none flex-shrink-0 ${varsOnlyMode ? '' : ''}`}
              style={{ background: 'var(--primary)', color: '#fff', cursor: 'grab' }}
              onMouseDown={(e)=>{
                // allow dragging by header background but not when targeting inputs/buttons/icons
                const tag = (e.target && e.target.tagName) ? String(e.target.tagName).toUpperCase() : ''
                if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SVG' || tag === 'PATH') return
                startDrag(e)
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Edit3 className="h-5 w-5 mr-2 text-white" />
                  <h2 id="vars-title" className="text-base font-bold text-white">{t.variables}</h2>
                </div>
                <div className="flex items-center space-x-2">
                  {!varsOnlyMode && (
                    <Button
                      onClick={(e) => {
                        if (e.shiftKey) {
                          // Shift+click toggles preference
                          setPreferPopout(v => !v)
                          return
                        }
                        
                        // Normal click opens popout
                        const url = new URL(window.location.href)
                        url.searchParams.set('varsOnly', '1')
                        if (selectedTemplate?.id) url.searchParams.set('id', selectedTemplate.id)
                        if (templateLanguage) url.searchParams.set('lang', templateLanguage)
                        // Narrower popout: single column, ~4 cards tall by default
                        const baseWidth = 460
                        const baseHeight = 700
                        const count = selectedTemplate?.variables?.length || 0
                        const cardW = 360 // px per field card
                        const padding = 48 // padding around cards
                        const headerH = 80
                        const rowH = 120 // approx per row with spacing
                        const rows = Math.max(1, count)
                        let w = Math.max(baseWidth, cardW + padding)
                        let h = Math.max(baseHeight, headerH + Math.min(rows, 8) * rowH + padding)
                        const availW = (window.screen?.availWidth || window.innerWidth) - 40
                        const availH = (window.screen?.availHeight || window.innerHeight) - 80
                        w = Math.min(w, availW)
                        h = Math.min(h, availH)
                        const left = Math.max(0, Math.floor(((window.screen?.availWidth || window.innerWidth) - w) / 2))
                        const top = Math.max(0, Math.floor(((window.screen?.availHeight || window.innerHeight) - h) / 3))
                        const features = `popup=yes,width=${Math.round(w)},height=${Math.round(h)},left=${left},top=${top},toolbar=0,location=0,menubar=0,status=0,scrollbars=1,resizable=1,noopener=1`
                        
                        const win = window.open(url.toString(), '_blank', features)
                        if (win && win.focus) win.focus()
                        
                        // Auto-close the popup when popout opens successfully
                        if (win) {
                          setVarsMinimized(false)
                          setVarsPinned(false)
                          setShowVariablePopup(false)
                        }
                      }}
                      variant="outline"
                      size="sm"
                      className="border-2 text-white"
                      style={{ 
                        borderColor: preferPopout ? 'rgba(139, 195, 74, 0.8)' : 'rgba(255,255,255,0.5)', 
                        borderRadius: 10, 
                        background: preferPopout ? 'rgba(139, 195, 74, 0.1)' : 'transparent' 
                      }}
                      title={interfaceLanguage==='fr'?`Détacher dans une nouvelle fenêtre${preferPopout ? ' (préféré)' : ''}\n• Déplacer sur un autre écran\n• Redimensionner librement\n• Ferme automatiquement cette popup\n\nShift+clic pour basculer la préférence`:`Detach to new window${preferPopout ? ' (preferred)' : ''}\n• Move to another screen\n• Resize freely\n• Auto-closes this popup\n\nShift+click to toggle preference`}
                      onMouseDown={(e)=> e.stopPropagation()}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                  {varsOnlyMode && (
                    <Button
                      onClick={(e) => { e.stopPropagation(); toggleFullscreen() }}
                      variant="outline"
                      size="sm"
                      className="border-2 text-white"
                      style={{ borderColor: 'rgba(255,255,255,0.5)', borderRadius: 10, background: 'transparent' }}
                      title={interfaceLanguage==='fr'?(isFullscreen?'Quitter le plein écran':'Plein écran'):(isFullscreen?'Exit full screen':'Full screen')}
                      onMouseDown={(e)=> e.stopPropagation()}
                    >
                      {isFullscreen ? <Shrink className="h-4 w-4" /> : <Expand className="h-4 w-4" />}
                    </Button>
                  )}
                  <Button
                    onClick={() => setVarsPinned(v => !v)}
                    variant="outline"
                    size="sm"
                    className="border-2 text-white"
                    style={{ borderColor: 'rgba(255,255,255,0.5)', borderRadius: 10, background: 'transparent' }}
                    title={interfaceLanguage==='fr'?(varsPinned?'Épinglé (cliquer pour libérer)':'Libre (cliquer pour épingler)'):(varsPinned?'Pinned (click to unpin)':'Unpinned (click to pin)')}
                    onMouseDown={(e)=> e.stopPropagation()}
                  >
                    {varsPinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
                  </Button>
                  <Button
                    onClick={() => {
                      if (!selectedTemplate || !templatesData) return
                      const initialVars = buildInitialVariables(selectedTemplate, templatesData, templateLanguage)
                      setVariables(prev => applyAssignments(prev, initialVars))
                    }}
                    variant="outline"
                    size="sm"
                    className="border-2 text-[#aca868]"
                    style={{ borderColor: 'rgba(20,90,100,0.35)', borderRadius: 10, background: '#fff' }}
                    title={t.reset}
                    onMouseDown={(e)=> e.stopPropagation()}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" /> {t.reset}
                  </Button>
                  <Button
                    onClick={() => {
                      if (!selectedTemplate) return
                      setVariables(prev => {
                        const assignments = {}
                        const preferredLang = (templateLanguageRef.current || 'fr').toUpperCase()
                        selectedTemplate.variables.forEach((vn) => {
                          Object.assign(assignments, expandVariableAssignment(vn, '', {
                            preferredLanguage: preferredLang,
                            variables: prev
                          }))
                        })
                        return applyAssignments(prev, assignments)
                      })
                    }}
                    variant="outline"
                    size="sm"
                    className="border-2 text-[#7f1d1d] hover:bg-[#fee2e2]"
                    style={{ borderColor: '#7f1d1d', borderRadius: 10, background: '#fff' }}
                    title={interfaceLanguage==='fr'?'Tout effacer':'Clear all'}
                    onMouseDown={(e)=> e.stopPropagation()}
                  >
                    <Eraser className="h-4 w-4 mr-1" /> {interfaceLanguage==='fr'?'Effacer':'Clear'}
                  </Button>
                  <Button
                    onClick={() => setVarsMinimized(true)}
                    variant="outline"
                    size="sm"
                    className="border-2 text-white"
                    style={{ borderColor: 'rgba(255,255,255,0.5)', borderRadius: 10, background: 'transparent' }}
                    title={interfaceLanguage === 'fr' 
                      ? 'Minimiser\n\nRaccourcis clavier:\n• Tab/Entrée: Champ suivant\n• Échap: Minimiser\n• Ctrl+Entrée: Fermer\n• Ctrl+R: Réinitialiser\n• Ctrl+Shift+V: Coller intelligent' 
                      : 'Minimize\n\nKeyboard shortcuts:\n• Tab/Enter: Next field\n• Escape: Minimize\n• Ctrl+Enter: Close\n• Ctrl+R: Reset all\n• Ctrl+Shift+V: Smart paste'
                    }
                    onMouseDown={(e)=> e.stopPropagation()}
                  >
                    <Minimize2 className="h-4 w-4" />
                  </Button>
                  <Button
                    onClick={() => {
                      if (varsOnlyMode) {
                        // close pop-out window
                        window.close()
                      } else {
                        setShowVariablePopup(false)
                        
                        // Notify that variables popup closed
                        if (canUseBC) {
                          try {
                            const channel = new BroadcastChannel('email-assistant-sync')
                            channel.postMessage({ type: 'variablesPopupClosed', timestamp: Date.now() })
                            channel.close()
                          } catch (e) {
                            console.log('BroadcastChannel not available for popup close sync')
                          }
                        }
                      }
                    }}
                    variant="ghost"
                    size="sm"
                    className="hover:bg-red-100 hover:text-red-600"
                    onMouseDown={(e)=> e.stopPropagation()}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Popup Content - Scrollable Area */}
            <div className="flex-1 overflow-y-auto" style={{ padding: varsOnlyMode ? '12px' : '16px' }}>
              {/* DEBUG: Simple test input */}
              <div className="mb-4 p-2 bg-yellow-100 border border-yellow-400 rounded">
                <label className="block text-sm font-bold mb-1">TEST INPUT (tape ici):</label>
                <input 
                  type="text"
                  className="w-full p-2 border border-gray-400 rounded"
                  placeholder="Test - tape quelque chose..."
                  onChange={(e) => console.log('TEST INPUT onChange:', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(() => {
                  // Extract variables in the order they appear in template text
                  const subjectText = selectedTemplate.subject?.[templateLanguage] || ''
                  const bodyText = selectedTemplate.body?.[templateLanguage] || ''
                  const combinedText = subjectText + '\n' + bodyText
                  
                  const seenVars = new Set()
                  const orderedVars = []
                  const regex = /<<([^>]+)>>/g
                  let match
                  
                  while ((match = regex.exec(combinedText)) !== null) {
                    const varNameInText = match[1] // e.g., "client_name_FR"
                    // Strip language suffix to match template.variables format
                    const baseVarName = varNameInText.replace(/_(FR|EN)$/i, '')
                    
                    if (!seenVars.has(baseVarName) && selectedTemplate.variables.includes(baseVarName)) {
                      seenVars.add(baseVarName)
                      orderedVars.push(baseVarName)
                    }
                  }
                  
                  // Add any remaining variables not found in text (shouldn't happen normally)
                  selectedTemplate.variables.forEach(v => {
                    if (!seenVars.has(v)) orderedVars.push(v)
                  })
                  
                  return orderedVars
                })().map((varName) => {
                  const varInfo = templatesData?.variables?.[varName]
                  if (!varInfo) return null
                  
                  const getVarValue = (name = '') => resolveVariableValue(variables, name, templateLanguage)

                  const currentValue = getVarValue(varName)
                  const sanitizedVarId = `var-${varName.replace(/[^a-z0-9_-]/gi, '-')}`
                  const langForDisplay = (templateLanguage || interfaceLanguage || 'fr').toLowerCase()
                  const targetVarForLanguage = (name) => {
                    if (/_(FR|EN)$/i.test(name)) return name
                    return `${name}_${(templateLanguage || 'fr').toUpperCase()}`
                  }
                  
                  return (
                    <div key={varName} className="rounded-[10px] p-3 transition-all duration-200" style={{ 
                      background: focusedVar === varName 
                        ? 'rgba(59, 130, 246, 0.15)' // Blue background when focused
                        : 'rgba(200, 215, 150, 0.4)', 
                      border: focusedVar === varName 
                        ? '2px solid rgba(59, 130, 246, 0.4)' // Blue border when focused
                        : '1px solid rgba(190, 210, 140, 0.6)',
                      boxShadow: focusedVar === varName 
                        ? '0 0 0 3px rgba(59, 130, 246, 0.1)' // Subtle outer glow when focused
                        : 'none'
                    }}>
                      <div className="bg-white rounded-[8px] p-4 border" style={{ border: '1px solid rgba(190, 210, 140, 0.4)' }}>
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <label htmlFor={sanitizedVarId} className="text-[14px] font-semibold text-gray-900 flex-1 leading-tight">
                            {varInfo?.description?.[langForDisplay] || varInfo?.description?.fr || varInfo?.description?.en || varName}
                          </label>
                          <div className="shrink-0 flex items-center gap-1 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <button
                              className="text-[11px] px-2 py-0.5 rounded border border-[#e6eef5] text-[#aca868] hover:bg-[#f0fbfb]"
                              title={interfaceLanguage==='fr'?'Remettre l’exemple':'Reset to example'}
                              onClick={() => {
                                const exampleValue = guessSampleValue(templatesData, targetVarForLanguage(varName))
                                const preferredLang = (templateLanguage || templateLanguageRef.current || 'fr').toUpperCase()
                                setVariables(prev => {
                                  const assignments = expandVariableAssignment(varName, exampleValue, {
                                    preferredLanguage: preferredLang,
                                    variables: prev
                                  })
                                  return applyAssignments(prev, assignments)
                                })
                              }}
                            >Ex.</button>
                            <button
                              className="text-[11px] px-2 py-0.5 rounded border border-[#e6eef5] text-[#7f1d1d] hover:bg-[#fee2e2]"
                              title={interfaceLanguage==='fr'?'Effacer ce champ':'Clear this field'}
                              onClick={() => {
                                const preferredLang = (templateLanguage || templateLanguageRef.current || 'fr').toUpperCase()
                                setVariables(prev => {
                                  const assignments = expandVariableAssignment(varName, '', {
                                    preferredLanguage: preferredLang,
                                    variables: prev
                                  })
                                  return applyAssignments(prev, assignments)
                                })
                              }}
                            >X</button>
                          </div>
                        </div>
                        <textarea
                          autoComplete="off"
                          autoCorrect="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          data-lpignore="true"
                          data-1p-ignore="true"
                          data-bwignore="true"
                          data-gramm="false"
                          data-enable-grammarly="false"
                          data-ms-editor="false"
                          ref={el => { if (el) varInputRefs.current[varName] = el }}
                          id={sanitizedVarId}
                          name={sanitizedVarId}
                          value={currentValue}
                          onChange={(e) => {
                            const newValue = e.target.value
                            // Only update if value actually changed
                            if (newValue !== currentValue) {
                              const preferredLang = (templateLanguage || templateLanguageRef.current || 'fr').toUpperCase()
                              setVariables(prev => {
                                const assignments = expandVariableAssignment(varName, newValue, {
                                  preferredLanguage: preferredLang,
                                  variables: prev
                                })
                                return applyAssignments(prev, assignments)
                              })
                            }
                            // Auto-resize (max 2 lines)
                            const lines = (newValue.match(/\n/g) || []).length + 1
                            e.target.style.height = lines <= 2 ? (lines === 1 ? '32px' : '52px') : '52px'
                          }}
                          onInput={(e) => {
                            const newValue = e.target.value
                            const preferredLang = (templateLanguage || templateLanguageRef.current || 'fr').toUpperCase()
                            setVariables(prev => {
                              const assignments = expandVariableAssignment(varName, newValue, {
                                preferredLanguage: preferredLang,
                                variables: prev
                              })
                              return applyAssignments(prev, assignments)
                            })
                          }}
                          onFocus={() => setFocusedVar(varName)}
                          onKeyDown={(e) => {
                            if (!selectedTemplate?.variables) return
                            const list = selectedTemplate.variables
                            
                            // Tab or Enter to next field (unless Shift+Enter for new line)
                            if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                              e.preventDefault()
                              const currentIdx = list.indexOf(varName)
                              let nextIdx
                              
                              if (e.shiftKey && e.key === 'Tab') {
                                // Shift+Tab = previous field
                                nextIdx = (currentIdx - 1 + list.length) % list.length
                              } else {
                                // Tab or Enter = next empty field, or next field if none empty
                                const emptyFields = list.filter(vn => !(getVarValue(vn).trim()))
                                if (emptyFields.length > 0) {
                                  const currentEmptyIdx = emptyFields.findIndex(vn => 
                                    list.indexOf(vn) > currentIdx
                                  )
                                  nextIdx = currentEmptyIdx >= 0 
                                    ? list.indexOf(emptyFields[currentEmptyIdx])
                                    : list.indexOf(emptyFields[0])
                                } else {
                                  nextIdx = (currentIdx + 1) % list.length
                                }
                              }
                              
                              const nextVar = list[nextIdx]
                              const el = varInputRefs.current[nextVar]
                              if (el && el.focus) { 
                                el.focus()
                                el.select?.()
                              }
                            }
                          }}
                          onBlur={() => setFocusedVar(prev => (prev===varName? null : prev))}
                          placeholder={(() => {
                            if (varInfo.examples && varInfo.examples[langForDisplay]) return varInfo.examples[langForDisplay]
                            const ex = varInfo?.example
                            if (ex && typeof ex === 'object') {
                              return langForDisplay === 'en' ? (ex.en || ex.fr || '') : (ex.fr || ex.en || '')
                            }
                            return ex || ''
                          })()}
                          className="w-full min-h-[32px] border-2 input-rounded border-[#e6eef5] resize-none transition-all duration-200 text-sm px-2 py-1 leading-5 flex items-center"
                          style={{ 
                            height: (() => {
                              const lines = (currentValue.match(/\n/g) || []).length + 1
                              return lines <= 2 ? (lines === 1 ? '32px' : '52px') : '52px'
                            })(),
                            maxHeight: '52px',
                            overflow: 'hidden',
                            borderColor: currentValue.trim() 
                              ? 'rgba(34, 197, 94, 0.4)' // Green for filled
                              : (focusedVar === varName 
                                ? 'rgba(59, 130, 246, 0.6)' // Stronger blue for focused
                                : 'rgba(239, 68, 68, 0.2)'), // Light red for empty
                            backgroundColor: !currentValue.trim() && focusedVar !== varName 
                              ? 'rgba(254, 242, 242, 0.5)' 
                              : (focusedVar === varName ? 'rgba(219, 234, 254, 0.3)' : 'white'), // Light blue background when focused
                            boxShadow: focusedVar === varName 
                              ? '0 0 0 3px rgba(59, 130, 246, 0.1)' // Subtle glow for focused
                              : 'none'
                          }}
                        />
                        {/* Soft validation hint: email/URL/date/amount */}
                        {(currentValue || focusedVar===varName) && (()=>{
                          const v = (currentValue||'').trim()
                          const fmt = (varInfo?.format||'').toLowerCase()
                          let kind = ''
                          let ok = true
                          if (fmt==='email' || (!fmt && /@/.test(v))) {
                            kind='email'
                            ok=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
                          } else if (fmt==='url' || (!fmt && /^(https?:\/\/|www\.)/i.test(v))) {
                            kind='url'
                            try { new URL(v.startsWith('http')? v : ('https://'+v)); ok=true } catch { ok=false }
                          } else if (fmt==='date' || (!fmt && /\d{4}-\d{2}-\d{2}/.test(v))) {
                            kind='date'
                            ok=/^\d{4}-\d{2}-\d{2}$/.test(v)
                          } else if (fmt==='amount' || (!fmt && /[\d][\d,.]*\s?(€|\$|usd|cad|eur|$)/i.test(v))) {
                            kind='amount'
                            ok=/^[-+]?\d{1,3}(?:[\s,]\d{3})*(?:[.,]\d+)?(?:\s?(€|\$|usd|cad|eur))?$/i.test(v)
                          }
                          if (!kind) return null
                          return (
                            <div className="mt-1 text-[11px] flex items-center gap-1" style={{color: ok? '#166534' : '#7f1d1d'}}>
                              <span aria-hidden="true" style={{display:'inline-block', width:8, height:8, borderRadius:9999, background: ok? '#16a34a' : '#dc2626'}} />
                              <span>
                                {kind==='email' && (ok ? (interfaceLanguage==='fr'?'Courriel valide':'Looks like an email') : (interfaceLanguage==='fr'?'Vérifiez le courriel':'Check email format'))}
                                {kind==='url' && (ok ? (interfaceLanguage==='fr'?'URL':'Looks like a URL') : (interfaceLanguage==='fr'?'Vérifiez l’URL':'Check URL'))}
                                {kind==='date' && (ok ? (interfaceLanguage==='fr'?'Date AAAA-MM-JJ':'Date YYYY-MM-DD') : (interfaceLanguage==='fr'?'Format: AAAA-MM-JJ':'Format: YYYY-MM-DD'))}
                                {kind==='amount' && (ok ? (interfaceLanguage==='fr'?'Montant':'Amount') : (interfaceLanguage==='fr'?'Ex: 100,50 €':'Ex: $1,600.50'))}
                              </span>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Custom resize handle in bottom-right (hidden in varsOnlyMode) */}
              {!varsOnlyMode && <div
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  // emulate resize by dragging from bottom-right corner
                  const startX = e.clientX
                  const startY = e.clientY
                  const startW = varPopupPos.width
                  const startH = varPopupPos.height
                  const onMove = (ev) => {
                    const dw = ev.clientX - startX
                    const dh = ev.clientY - startY
                    setVarPopupPos(p => ({ ...p, width: Math.max(420, Math.min(window.innerWidth * 0.92, startW + dw)), height: Math.max(380, Math.min(window.innerHeight * 0.88, startH + dh)) }))
                  }
                  const onUp = () => {
                    document.removeEventListener('mousemove', onMove)
                    document.removeEventListener('mouseup', onUp)
                  }
                  document.addEventListener('mousemove', onMove)
                  document.addEventListener('mouseup', onUp)
                }}
                title="Resize"
                className="custom-resize-handle"
                style={{
                  position: 'absolute',
                  right: 8,
                  bottom: 8,
                  width: 16,
                  height: 16,
                  cursor: 'nwse-resize',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1000
                }}
              >
                <MoveRight className="h-4 w-4 text-gray-400 transform rotate-45 hover:text-gray-600 transition-colors" />
              </div>}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Help center now opens in a popout */}

      {/* Slide-over AI panel */}
      {showAIPanel && (
        <div className="fixed inset-0 z-50" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAIPanel(false)} />
          <div className="absolute right-0 top-0 h-full w-[420px] bg-gradient-to-br from-gray-50 to-blue-50 shadow-2xl border-l border-gray-200 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 animate-pulse"></div>
                <span className="font-semibold text-gray-800">Assistant de rédaction Copilot M365</span>
              </div>
              <button 
                className="text-gray-400 hover:text-gray-600 hover:bg-gray-200 w-8 h-8 rounded-full flex items-center justify-center transition-all" 
                onClick={() => setShowAIPanel(false)}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AISidebar
                emailText={finalBody}
                onResult={setFinalBody}
                variables={variables}
                interfaceLanguage={interfaceLanguage}
                templateLanguage={templateLanguage}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
