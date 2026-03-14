import React, { useCallback, useEffect, useRef, useImperativeHandle } from 'react'
import { escapeHtml, convertPlainTextToHtml } from '../utils/html'
import { usePillEditorCore } from '../hooks/usePillEditorCore'

const SimplePillEditor = React.forwardRef(({
  value,
  onChange,
  variables,
  placeholder,
  onVariablesChange,
  focusedVarName,
  onFocusedVarChange,
  variant = 'default',
  templateLanguage = 'fr'
}, ref) => {
  const editorRef = useRef(null)

  const {
    isFocused,
    setIsFocused,
    deletedPill,
    setDeletedPill,
    deletedPillTimeoutRef,
    autoSelectSuppressedUntilRef,
    getVarValue,
    clearActivePillPlaceholder,
    applyFocusedPill,
    queueAutoSelectForPill,
    syncSiblingPills,
    detectDeletedPills,
    extractText,
    processPillValues,
    trackDeletedPill,
    updatePreviousPills,
    handleKeyDown,
    handleBeforeInput,
    handleCompositionStart,
    handleDoubleClick,
    handleMouseDown,
    handleCopy,
  } = usePillEditorCore({
    editorRef,
    variables,
    templateLanguage,
    focusedVarName,
    onFocusedVarChange,
    value,
    trackFocusedVar: false
  })

  const renderContent = (text) => {
    if (!text) return '';
    const regex = /<<([^>]+)>>/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const varName = match[1];
      const varValue = getVarValue(varName);
      
      // Skip deleted variables - don't render the pill at all
      if (varValue === '__DELETED__') {
        lastIndex = regex.lastIndex;
        continue;
      }
      
      const isFilled = varValue.trim().length > 0;
      const displayValue = isFilled ? varValue : `<<${varName}>>`;
      const storedValue = `<<${varName}>>`;
      const displayAttr = isFilled ? varValue : '';
      if (match.index > lastIndex) {
        parts.push(convertPlainTextToHtml(text.substring(lastIndex, match.index)));
      }
      const pillClass = `var-pill ${isFilled ? 'filled' : 'empty'}`;
      parts.push(`<span class="${pillClass}" data-var="${varName}" data-value="${escapeHtml(storedValue)}" data-display="${escapeHtml(displayAttr)}" contenteditable="true" spellcheck="false">${convertPlainTextToHtml(displayValue)}</span>`);
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      parts.push(convertPlainTextToHtml(text.substring(lastIndex)));
    }
    return parts.join('');
  };

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    getHtml: () => editorRef.current?.innerHTML ?? '',
    getPlainText: () => extractText(),
    getEditorElement: () => editorRef.current
  }))

  const restoreDeletedPill = useCallback((varName) => {
    if (!varName || !value) return
    const placeholder = `<<${varName}>>`
    const newValue = value.trim() + ' ' + placeholder
    onChange?.({ target: { value: newValue } })
    setDeletedPill(null)
    if (deletedPillTimeoutRef.current) {
      clearTimeout(deletedPillTimeoutRef.current)
      deletedPillTimeoutRef.current = null
    }
  }, [value, onChange, setDeletedPill, deletedPillTimeoutRef])

  const handleInput = () => {
    const text = extractText()
    const pillElements = editorRef.current?.querySelectorAll('.var-pill')

    const selection = document.getSelection?.()
    let activePill = null
    if (selection?.anchorNode) {
      const anchor = selection.anchorNode
      activePill = anchor.nodeType === Node.ELEMENT_NODE
        ? anchor.closest?.('.var-pill')
        : anchor.parentElement?.closest?.('.var-pill')
    }

    // Detect deleted pills before processing
    const deleted = detectDeletedPills()
    if (deleted) trackDeletedPill(deleted)

    const { updates, hasChanges } = processPillValues(pillElements, activePill)

    updatePreviousPills(pillElements)
    Object.entries(updates).forEach(([vn, nv]) => syncSiblingPills(vn, nv))

    if (hasChanges && typeof onVariablesChange === 'function') onVariablesChange(updates)
    onChange?.({ target: { value: text } })
  }

  const handleFocus = () => {
    setIsFocused(true)
    requestAnimationFrame(() => {
      const selection = document.getSelection?.()
      const anchor = selection?.anchorNode || null
      if (!editorRef.current || !anchor || !editorRef.current.contains(anchor)) return
      const pillElement = anchor.nodeType === Node.ELEMENT_NODE ? anchor.closest?.('.var-pill') : anchor.parentElement?.closest?.('.var-pill')
      const varName = pillElement?.getAttribute('data-var') || null
      if (varName) {
        clearActivePillPlaceholder()
        applyFocusedPill(varName)
        if (Date.now() >= (autoSelectSuppressedUntilRef.current || 0)) queueAutoSelectForPill(pillElement, varName)
      }
    })
  }

  const handleBlur = () => {
    setIsFocused(false)
    handleInput()
    const docHasFocus = typeof document === 'undefined' || !document.hasFocus || document.hasFocus()
    if (docHasFocus) applyFocusedPill(null)
  }

  // Render on mount and when props change (not focused)
  const hasMountedRef = useRef(false)
  useEffect(() => {
    if (!editorRef.current) return
    if (!hasMountedRef.current) {
      // First mount: always render
      editorRef.current.innerHTML = renderContent(value)
      hasMountedRef.current = true
      return
    }
    if (isFocused) return
    const rendered = renderContent(value)
    if (editorRef.current.innerHTML !== rendered) editorRef.current.innerHTML = rendered
  }, [value, variables, isFocused, getVarValue, templateLanguage])

  // Update pill display values when variables change while focused
  useEffect(() => {
    if (!editorRef.current) return
    const selection = document.getSelection?.()
    let activePill = null
    if (selection?.anchorNode) {
      const anchor = selection.anchorNode
      activePill = anchor.nodeType === Node.ELEMENT_NODE
        ? anchor.closest?.('.var-pill')
        : anchor.parentElement?.closest?.('.var-pill')
    }
    const pills = editorRef.current.querySelectorAll('.var-pill')
    pills.forEach((pill) => {
      if (activePill && pill === activePill) return
      const varName = pill.getAttribute('data-var')
      if (!varName) return
      const varValue = getVarValue(varName)
      if (varValue === '__DELETED__') { pill.replaceWith(document.createTextNode('')); return }
      const isFilled = varValue.trim().length > 0
      const displayValue = isFilled ? varValue : `<<${varName}>>`
      const currentText = (pill.textContent || '').trim()
      const expectedText = displayValue.trim()
      if (currentText !== expectedText) {
        pill.textContent = displayValue
        pill.classList.toggle('filled', isFilled)
        pill.classList.toggle('empty', !isFilled)
        pill.setAttribute('data-display', isFilled ? varValue : '')
      }
    })
  }, [variables, getVarValue])

  const undoLabel = templateLanguage === 'fr' ? 'Annuler' : 'Undo'

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-autocomplete="none"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        inputMode="text"
        data-gramm="false"
        data-lpignore="true"
        data-1p-ignore="true"
        data-1password-blocklist="true"
        className={`lexical-content-editable${variant === 'compact' ? ' lexical-content-editable--compact' : ''}`}
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onBeforeInput={handleBeforeInput}
        onCompositionStart={handleCompositionStart}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        onCopy={handleCopy}
        suppressContentEditableWarning
        data-placeholder={placeholder}
      />
      {deletedPill && (
        <button
          type="button"
          onClick={() => restoreDeletedPill(deletedPill)}
          className="absolute -top-1 right-0 transform -translate-y-full px-2 py-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-md shadow-sm border border-amber-300 transition-colors flex items-center gap-1 z-10"
          title={`${undoLabel}: ${deletedPill}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          {undoLabel}
        </button>
      )}
    </div>
  )
})

export default SimplePillEditor

