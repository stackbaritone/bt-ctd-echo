import { useCallback, useEffect, useRef, useState } from 'react'
import { varKeysMatch, resolveVariableValue } from '../utils/variables'
import { escapeHtml, BLOCK_ELEMENTS, convertPlainTextToHtml, selectEntirePill } from '../utils/html'

/**
 * Shared core logic for SimplePillEditor and RichTextPillEditor.
 * Extracts common state, refs, callbacks, and effects to eliminate duplication.
 */
export function usePillEditorCore({
  editorRef,
  variables,
  templateLanguage,
  focusedVarName,
  onFocusedVarChange,
  value,
  // Optional: Rich text calls emitFocusedVarChange; Simple does not
  trackFocusedVar = false
}) {
  const [isFocused, setIsFocused] = useState(false)
  const [deletedPill, setDeletedPill] = useState(null)
  const deletedPillTimeoutRef = useRef(null)
  const previousPillsRef = useRef(new Set())
  const autoSelectTrackerRef = useRef({ varName: null, timestamp: 0 })
  const autoSelectSuppressedUntilRef = useRef(0)
  const clickSelectTimerRef = useRef(null)
  const lastSelectionVarRef = useRef(null)

  const getVarValue = useCallback((name = '') => {
    return resolveVariableValue(variables, name, templateLanguage)
  }, [variables, templateLanguage])

  const clearActivePillPlaceholder = useCallback(() => {
    if (!editorRef.current) return false
    const selection = document.getSelection?.()
    if (!selection?.anchorNode) return false
    const anchor = selection.anchorNode
    const pillElement = anchor.nodeType === Node.ELEMENT_NODE
      ? anchor.closest?.('.var-pill')
      : anchor.parentElement?.closest?.('.var-pill')
    if (!pillElement) return false
    const varName = pillElement.getAttribute('data-var')
    if (!varName) return false
    const placeholderToken = `<<${varName}>>`
    const currentText = (pillElement.textContent || '').trim()
    if (currentText === placeholderToken) {
      pillElement.innerHTML = ''
      pillElement.setAttribute('data-display', '')
      pillElement.classList.add('empty')
      pillElement.classList.remove('filled')
      return true
    }
    return false
  }, [editorRef])

  const applyFocusedPill = useCallback((varName) => {
    const editor = editorRef.current
    if (!editor) return
    editor.querySelectorAll('.var-pill').forEach((pill) => {
      const pillVar = pill.getAttribute('data-var')
      const isMatch = varName ? varKeysMatch(pillVar, varName) : false
      pill.classList.toggle('focused', !!isMatch)
    })
  }, [editorRef])

  const queueAutoSelectForPill = useCallback((pill, varName) => {
    if (!pill || !varName) return
    if (!pill.classList.contains('empty')) return
    const nowTs = Date.now()
    if (nowTs < (autoSelectSuppressedUntilRef.current || 0)) return
    const selection = document.getSelection?.()
    if (!selection) return
    if (!selection.isCollapsed && selection.toString()) return
    const tracker = autoSelectTrackerRef.current
    const now = Date.now()
    if (tracker.varName === varName && now - tracker.timestamp < 200) return
    tracker.varName = varName
    tracker.timestamp = now
    requestAnimationFrame(() => selectEntirePill(pill))
  }, [])

  const syncSiblingPills = useCallback((varName, newValue) => {
    if (!editorRef.current || !varName) return
    const selection = document.getSelection?.()
    let activePill = null
    if (selection?.anchorNode) {
      const anchor = selection.anchorNode
      activePill = anchor.nodeType === Node.ELEMENT_NODE
        ? anchor.closest?.('.var-pill')
        : anchor.parentElement?.closest?.('.var-pill')
    }
    const normalizedValue = newValue ?? ''
    const trimmed = normalizedValue.trim()
    const displayValue = trimmed.length > 0 ? normalizedValue : `<<${varName}>>`
    const displayHtml = convertPlainTextToHtml(displayValue)
    const isFilled = trimmed.length > 0
    editorRef.current.querySelectorAll('.var-pill').forEach((pill) => {
      if (pill.getAttribute('data-var') !== varName) return
      if (activePill && pill === activePill) return
      if (pill.innerHTML !== displayHtml) pill.innerHTML = displayHtml
      pill.classList.toggle('filled', isFilled)
      pill.classList.toggle('empty', !isFilled)
      pill.setAttribute('data-display', isFilled ? normalizedValue : '')
    })
  }, [editorRef])

  const detectDeletedPills = useCallback(() => {
    if (!editorRef.current) return null
    const currentPills = new Set()
    editorRef.current.querySelectorAll('.var-pill').forEach(pill => {
      const varName = pill.getAttribute('data-var')
      if (varName) currentPills.add(varName)
    })
    for (const varName of previousPillsRef.current) {
      if (!currentPills.has(varName)) return varName
    }
    return null
  }, [editorRef])

  const extractText = useCallback(() => {
    if (!editorRef.current) return ''
    let result = ''
    const append = (t = '') => { if (!t) return; result += t }
    const ensureTrailingNewline = () => { if (!result.endsWith('\n')) result += '\n' }
    const traverse = (node) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const parentElement = child.parentElement
          if (parentElement && parentElement.closest('.var-pill')) return
          append(child.textContent ?? '')
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const element = child
          if (element.classList.contains('var-pill')) {
            const vn = element.getAttribute('data-var')
            const placeholder = element.getAttribute('data-value') || (vn ? `<<${vn}>>` : '')
            append(placeholder)
          } else if (element.tagName === 'BR') {
            append('\n')
          } else {
            const isBlock = BLOCK_ELEMENTS.has(element.tagName)
            if (isBlock && result && !result.endsWith('\n')) append('\n')
            traverse(element)
            if (isBlock) ensureTrailingNewline()
          }
        }
      })
    }
    traverse(editorRef.current)
    const normalized = result.replace(/\u00a0/g, ' ')
    if (normalized.endsWith('\n') && !normalized.endsWith('\n\n')) return normalized.slice(0, -1)
    return normalized
  }, [editorRef])

  const emitFocusedVarChange = useCallback((varName) => {
    if (!trackFocusedVar) return
    const normalized = varName || null
    if (lastSelectionVarRef.current === normalized) return
    lastSelectionVarRef.current = normalized
    if (typeof onFocusedVarChange === 'function') onFocusedVarChange(normalized)
  }, [trackFocusedVar, onFocusedVarChange])

  // Shared event handlers
  const handleKeyDown = useCallback((event) => {
    if (event.key !== 'Enter') return
    const selection = document.getSelection?.()
    if (!selection) return
    const anchorNode = selection.anchorNode
    if (!anchorNode) return
    const pillElement = anchorNode.nodeType === Node.ELEMENT_NODE
      ? anchorNode.closest?.('.var-pill')
      : anchorNode.parentElement?.closest?.('.var-pill')
    if (pillElement) event.preventDefault()
  }, [])

  const handleBeforeInput = useCallback((event) => {
    const inputType = event?.inputType || ''
    if (!inputType || inputType.startsWith('insert') || inputType === 'deleteContentBackward') {
      clearActivePillPlaceholder()
    }
  }, [clearActivePillPlaceholder])

  const handleCompositionStart = useCallback(() => {
    clearActivePillPlaceholder()
  }, [clearActivePillPlaceholder])

  const handleDoubleClick = useCallback((event) => {
    if (!editorRef.current) return
    const target = event.target
    if (!(target instanceof Element)) return
    const pillElement = target.closest?.('.var-pill')
    if (!pillElement || !editorRef.current.contains(pillElement)) return
    event.preventDefault()
    try {
      const selection = document.getSelection?.()
      if (!selection) return
      let range = null
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(event.clientX, event.clientY)
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(event.clientX, event.clientY)
        if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); range.collapse(true) }
      }
      if (!range || !pillElement.contains(range.startContainer)) {
        range = document.createRange()
        range.selectNodeContents(pillElement)
        range.collapse(false)
      }
      selection.removeAllRanges()
      selection.addRange(range)
      autoSelectSuppressedUntilRef.current = Date.now() + 600
    } catch {}
  }, [editorRef])

  const handleMouseDown = useCallback((event) => {
    if (!editorRef.current) return
    const target = event.target
    if (!(target instanceof Element)) return
    const pillElement = target.closest?.('.var-pill')
    if (pillElement && editorRef.current.contains(pillElement)) {
      const clickCount = event.detail
      const varName = pillElement.getAttribute('data-var') || null
      if (clickCount === 1) {
        if (clickSelectTimerRef.current) clearTimeout(clickSelectTimerRef.current)
        clickSelectTimerRef.current = setTimeout(() => { selectEntirePill(pillElement); clickSelectTimerRef.current = null }, 220)
      } else if (clickCount >= 2) {
        if (clickSelectTimerRef.current) { clearTimeout(clickSelectTimerRef.current); clickSelectTimerRef.current = null }
        autoSelectSuppressedUntilRef.current = Date.now() + 600
      }
      if (trackFocusedVar) {
        emitFocusedVarChange(varName)
        applyFocusedPill(varName)
      }
    }
  }, [editorRef, trackFocusedVar, emitFocusedVarChange, applyFocusedPill])

  const handleCopy = useCallback((event) => {
    const selection = document.getSelection?.()
    if (!selection || selection.isCollapsed) return
    event.preventDefault()
    const range = selection.getRangeAt(0)
    const fragment = range.cloneContents()
    const tempDiv = document.createElement('div')
    tempDiv.appendChild(fragment)

    const pillBackgroundColors = new Set([
      'rgb(245, 243, 232)', 'rgb(245,243,232)', '#f5f3e8',
      'rgb(254, 249, 195)', 'rgb(254,249,195)', '#fef9c3',
      'rgb(219, 234, 254)', 'rgb(219,234,254)', '#dbeafe',
      'rgba(245, 243, 232, 1)', 'rgba(245,243,232,1)',
      'rgba(254, 249, 195, 1)', 'rgba(254,249,195,1)',
      'rgba(219, 234, 254, 1)', 'rgba(219,234,254,1)',
    ])
    const isPillBackground = (color) => {
      if (!color) return false
      const normalized = color.replace(/\s+/g, '').toLowerCase()
      return pillBackgroundColors.has(normalized) ||
        normalized.includes('245,243,232') ||
        normalized.includes('254,249,195') ||
        normalized.includes('219,234,254')
    }

    const pills = tempDiv.querySelectorAll('.var-pill')
    pills.forEach(pill => {
      const varName = pill.getAttribute('data-var')
      const resolvedValue = varName ? getVarValue(varName) : ''
      const displayText = resolvedValue.trim() || pill.textContent || ''
      const textNode = document.createTextNode(displayText)
      pill.replaceWith(textNode)
    })

    const allElements = tempDiv.querySelectorAll('*')
    allElements.forEach(el => {
      const style = el.getAttribute('style')
      if (style) {
        const bgMatch = style.match(/background(?:-color)?:\s*([^;]+)/i)
        if (bgMatch && isPillBackground(bgMatch[1])) {
          const newStyle = style
            .replace(/background-color:\s*[^;]+;?\s*/gi, '')
            .replace(/background:\s*[^;]+;?\s*/gi, '')
            .trim()
          if (newStyle) el.setAttribute('style', newStyle)
          else el.removeAttribute('style')
        }
      }
      el.classList.remove('var-pill', 'filled', 'empty', 'focused', 'hovered')
      if (el.classList.length === 0) el.removeAttribute('class')
      el.removeAttribute('data-var')
      el.removeAttribute('data-value')
      el.removeAttribute('data-display')
      el.removeAttribute('data-template')
    })

    const textContent = tempDiv.textContent || ''
    const htmlContent = tempDiv.innerHTML

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const clipboardItem = new ClipboardItem({
          'text/html': new Blob([htmlContent], { type: 'text/html' }),
          'text/plain': new Blob([textContent], { type: 'text/plain' })
        })
        navigator.clipboard.write([clipboardItem])
      } else {
        event.clipboardData?.setData('text/plain', textContent)
        event.clipboardData?.setData('text/html', htmlContent)
      }
    } catch (err) {
      console.error('Copy failed:', err)
      event.clipboardData?.setData('text/plain', textContent)
    }
  }, [getVarValue])

  // Shared pill-value processing for handleInput
  const processPillValues = useCallback((pillElements, activePill, afterPillProcess) => {
    const updates = {}
    const seenVars = new Set()
    let hasChanges = false

    const processPill = (pill) => {
      const varName = pill.getAttribute('data-var')
      if (!varName || seenVars.has(varName)) return
      const rawText = pill.textContent ?? ''
      const normalizedText = rawText.replace(/\u00a0/g, ' ').replace(/[\r\n]+/g, ' ')
      const placeholder = `<<${varName}>>`
      const withoutPlaceholder = normalizedText.split(placeholder).join('')
      const trimmedValue = withoutPlaceholder.trim()
      let newValue = trimmedValue
      if (!trimmedValue) {
        newValue = ''
        if (rawText !== placeholder) pill.textContent = placeholder
        pill.classList.remove('filled')
        pill.classList.add('empty')
      } else {
        pill.classList.add('filled')
        pill.classList.remove('empty')
      }
      pill.setAttribute('data-display', newValue)
      if ((variables?.[varName] || '') !== newValue) hasChanges = true
      updates[varName] = newValue
      seenVars.add(varName)
      if (afterPillProcess) afterPillProcess(pill)
    }

    // First pass: active pill
    if (activePill && pillElements) processPill(activePill)
    // Second pass: remaining pills
    if (pillElements) {
      pillElements.forEach((pill) => {
        if (activePill && pill === activePill) return
        processPill(pill)
      })
    }

    return { updates, hasChanges }
  }, [variables])

  // Track deleted pill helper
  const trackDeletedPill = useCallback((deletedVar) => {
    if (deletedVar) {
      if (deletedPillTimeoutRef.current) clearTimeout(deletedPillTimeoutRef.current)
      setDeletedPill(deletedVar)
      deletedPillTimeoutRef.current = setTimeout(() => {
        setDeletedPill(null)
        deletedPillTimeoutRef.current = null
      }, 5000)
    }
  }, [])

  // Update previousPillsRef from current pills
  const updatePreviousPills = useCallback((pillElements) => {
    const currentPills = new Set()
    if (pillElements) {
      pillElements.forEach(pill => {
        const varName = pill.getAttribute('data-var')
        if (varName) currentPills.add(varName)
      })
    }
    previousPillsRef.current = currentPills
  }, [])

  // --- Shared effects ---

  // Apply focused pill styling
  useEffect(() => {
    applyFocusedPill(focusedVarName)
  }, [focusedVarName, variables, applyFocusedPill])

  // Initialize previous pills reference when value changes
  useEffect(() => {
    if (!editorRef.current) return
    const pillNames = new Set()
    editorRef.current.querySelectorAll('.var-pill').forEach(pill => {
      const varName = pill.getAttribute('data-var')
      if (varName) pillNames.add(varName)
    })
    previousPillsRef.current = pillNames
  }, [value, editorRef])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (deletedPillTimeoutRef.current) clearTimeout(deletedPillTimeoutRef.current)
    }
  }, [])

  // Selection change listener
  useEffect(() => {
    if (!isFocused || !editorRef.current) return
    const handleSelectionChange = () => {
      const editor = editorRef.current
      if (!editor) return
      const docHasFocus = typeof document === 'undefined' || !document.hasFocus || document.hasFocus()
      if (!docHasFocus) return
      const selection = document.getSelection?.()
      if (!selection) {
        if (trackFocusedVar) { emitFocusedVarChange(null); applyFocusedPill(null) }
        autoSelectTrackerRef.current = { varName: null, timestamp: 0 }
        return
      }
      const anchor = selection.anchorNode
      if (!anchor || !editor.contains(anchor)) {
        if (trackFocusedVar) { emitFocusedVarChange(null); applyFocusedPill(null) }
        autoSelectTrackerRef.current = { varName: null, timestamp: 0 }
        return
      }
      const pillElement = anchor.nodeType === Node.ELEMENT_NODE
        ? anchor.closest?.('.var-pill')
        : anchor.parentElement?.closest?.('.var-pill')
      const varName = pillElement?.getAttribute('data-var') || null
      if (trackFocusedVar) {
        emitFocusedVarChange(varName)
        applyFocusedPill(varName)
      }
      if (varName && selection.isCollapsed) {
        if (Date.now() >= (autoSelectSuppressedUntilRef.current || 0)) {
          queueAutoSelectForPill(pillElement, varName)
        }
      }
      if (!varName) autoSelectTrackerRef.current = { varName: null, timestamp: 0 }
    }
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [isFocused, editorRef, trackFocusedVar, emitFocusedVarChange, applyFocusedPill, queueAutoSelectForPill])

  return {
    // State
    isFocused,
    setIsFocused,
    deletedPill,
    setDeletedPill,
    deletedPillTimeoutRef,
    previousPillsRef,
    autoSelectSuppressedUntilRef,
    // Callbacks
    getVarValue,
    clearActivePillPlaceholder,
    applyFocusedPill,
    queueAutoSelectForPill,
    syncSiblingPills,
    detectDeletedPills,
    extractText,
    emitFocusedVarChange,
    processPillValues,
    trackDeletedPill,
    updatePreviousPills,
    // Event handlers
    handleKeyDown,
    handleBeforeInput,
    handleCompositionStart,
    handleDoubleClick,
    handleMouseDown,
    handleCopy,
  }
}

// Re-export utilities needed by components for renderContent
export { escapeHtml, convertPlainTextToHtml }
