import React, { useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { escapeHtml, convertPlainTextToHtml } from '../utils/html'
import { usePillEditorCore } from '../hooks/usePillEditorCore'
import RichTextToolbar from './RichTextToolbar.jsx'

const PILL_TEMPLATE_TOKEN = '__RT_PILL_VALUE__'

const escapeSelector = (value = '') => {
  if (typeof window !== 'undefined' && window.CSS?.escape) {
    return window.CSS.escape(value);
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
};

const normalizeColor = (value = '') => String(value || '').replace(/\s+/g, '').toLowerCase();
const defaultPillBackgrounds = new Set([
  'rgb(245,243,232)', // #f5f3e8 filled background
  'rgba(245,243,232,1)',
  'rgb(254,249,195)', // #fef9c3 empty background
  'rgba(254,249,195,1)',
  'rgb(219,234,254)', // #dbeafe focus background
  'rgba(219,234,254,1)'
]);
const isDefaultPillBackground = (color = '') => defaultPillBackgrounds.has(normalizeColor(color));

const createFormattingTemplate = (pill) => {
  if (!pill) return null;

  const clone = pill.cloneNode(true);
  
  // CRITICAL: Inline all computed styles BEFORE creating the template
  // This ensures font-size, font-family, and all other CSS properties are preserved
  const inlineComputedStyles = (sourceNode, cloneNode) => {
    if (cloneNode.nodeType !== Node.ELEMENT_NODE) return;
    
    const computedStyle = window.getComputedStyle(sourceNode);
    let inlineStyle = '';
    
    // Capture ALL relevant style properties
    const propertiesToCapture = [
      'fontSize', 'fontFamily', 'fontWeight', 'fontStyle',
      'color', 'textDecoration',
      'textAlign', 'lineHeight', 'letterSpacing'
    ];
    
    propertiesToCapture.forEach(prop => {
      const value = computedStyle[prop];
      if (value && value !== 'normal' && value !== 'none') {
        // Convert camelCase to kebab-case for CSS
        const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
        inlineStyle += `${cssProp}: ${value}; `;
      }
    });
    
    // Special handling for backgroundColor (highlighting)
    const bgColor = computedStyle.backgroundColor;
    const bgColorNormalized = bgColor?.replace(/\s/g, '');
    if (bgColor && 
      bgColorNormalized !== 'rgba(0,0,0,0)' && 
      bgColorNormalized !== 'transparent' &&
      bgColorNormalized !== 'rgb(255,255,255)' &&
      bgColorNormalized !== 'rgba(255,255,255,1)' &&
      !isDefaultPillBackground(bgColor)) {
      inlineStyle += `background-color: ${bgColor}; `;
    }
    
    if (inlineStyle) {
      cloneNode.setAttribute('style', inlineStyle.trim());
    }
    
    // Recursively process child elements
    for (let i = 0; i < sourceNode.childNodes.length; i++) {
      if (sourceNode.childNodes[i].nodeType === Node.ELEMENT_NODE &&
          cloneNode.childNodes[i]?.nodeType === Node.ELEMENT_NODE) {
        inlineComputedStyles(sourceNode.childNodes[i], cloneNode.childNodes[i]);
      }
    }
  };
  
  // Apply computed styles from original pill to clone
  inlineComputedStyles(pill, clone);
  
  let placeholderInserted = false;

  const walk = (node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        if (!placeholderInserted) {
          child.textContent = PILL_TEMPLATE_TOKEN;
          placeholderInserted = true;
        } else {
          child.textContent = '';
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
      }
    });
  };

  walk(clone);

  if (!placeholderInserted) {
    return null;
  }

  return clone.innerHTML;
};

const storePillTemplate = (pill) => {
  if (!pill) return;
  const template = createFormattingTemplate(pill);
  if (template) {
    pill.dataset.template = template;
  } else {
    delete pill.dataset.template;
  }
};

const applyTemplateToPill = (pill, sanitizedHtml) => {
  if (!pill) return;

  const template = pill.dataset?.template;
  if (template && template.includes(PILL_TEMPLATE_TOKEN)) {
    const updated = template.replace(PILL_TEMPLATE_TOKEN, sanitizedHtml);
    pill.innerHTML = updated;
    storePillTemplate(pill);
    return;
  }

  const singleChild = pill.childNodes.length === 1 && pill.childNodes[0].nodeType === Node.ELEMENT_NODE;
  if (singleChild) {
    pill.childNodes[0].innerHTML = sanitizedHtml;
    storePillTemplate(pill);
    return;
  }

  pill.innerHTML = sanitizedHtml;
  storePillTemplate(pill);
};

const refreshAllPillTemplates = (editor) => {
  if (!editor) return;
  const pills = editor.querySelectorAll('.var-pill');
  pills.forEach(storePillTemplate);
};

const haveVariablesChanged = (prevVars = {}, nextVars = {}) => {
  const prevKeys = Object.keys(prevVars);
  const nextKeys = Object.keys(nextVars);

  if (prevKeys.length !== nextKeys.length) return true;

  for (const key of nextKeys) {
    if ((prevVars[key] ?? '') !== (nextVars[key] ?? '')) {
      return true;
    }
  }

  return false;
};

/**
 * RichTextPillEditor - SimplePillEditor with rich text formatting support
 * Uses IDENTICAL variable handling logic to SimplePillEditor
 */
const RichTextPillEditor = React.forwardRef(({
  value = '',
  onChange,
  onFocus,
  onBlur,
  onVariablesChange,
  variables = {},
  placeholder = '',
  className = '',
  style = {},
  focusedVarName = null,
  onFocusedVarChange,
  variant = 'default',
  disabled = false,
  minHeight = '120px',
  showRichTextToolbar = true,
  onRichTextCommand,
  templateLanguage = 'fr'
}, ref) => {
  const editorRef = useRef(null)
  const prevValueRef = useRef(value)
  const prevVariablesRef = useRef(variables)
  const hasMountedRef = useRef(false)

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
    emitFocusedVarChange,
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
    trackFocusedVar: true
  })

  // Restore a deleted pill by inserting its placeholder at cursor or end
  const restoreDeletedPill = useCallback((varName) => {
    if (!varName || !editorRef.current) return
    const placeholder = `<<${varName}>>`
    const selection = document.getSelection?.()
    if (selection && selection.rangeCount > 0 && editorRef.current.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0)
      range.deleteContents()
      const textNode = document.createTextNode(placeholder)
      range.insertNode(textNode)
      range.collapse(false)
    } else {
      const currentValue = extractText()
      const newValue = currentValue + placeholder
      if (onChange) onChange({ target: { value: newValue, htmlValue: editorRef.current.innerHTML } })
    }
    setDeletedPill(null)
    if (deletedPillTimeoutRef.current) {
      clearTimeout(deletedPillTimeoutRef.current)
      deletedPillTimeoutRef.current = null
    }
    setTimeout(() => { handleInput() }, 10)
  }, [onChange, extractText, setDeletedPill, deletedPillTimeoutRef])

  // Render content with pills - IDENTICAL to SimplePillEditor
  const renderContent = useCallback((text) => {
    if (!text) return '';
    
    // First, decode HTML entities in variables
    // Convert &lt;&lt;VarName&gt;&gt; back to <<VarName>>
    let processedText = text
      .replace(/&lt;&lt;([^&]+?)&gt;&gt;/g, '<<$1>>')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    
    // Check if text contains HTML block tags (paragraphs, divs, lists, etc.)
    const hasHtmlTags = /<(p|div|br|strong|b|i|u|span|ul|ol|li|h[1-6])[>\s]/i.test(processedText);
    
    const regex = /<<([^>]+)>>/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(processedText)) !== null) {
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

      // Add text before the variable
      if (match.index > lastIndex) {
        const beforeText = processedText.substring(lastIndex, match.index);
        // If input has HTML tags, preserve them; otherwise convert plain text
        parts.push(hasHtmlTags ? beforeText : convertPlainTextToHtml(beforeText));
      }

      // Add the pill
      const pillClass = `var-pill ${isFilled ? 'filled' : 'empty'}`;
      parts.push(
        `<span class="${pillClass}" data-var="${varName}" data-value="${escapeHtml(storedValue)}" data-display="${escapeHtml(displayAttr)}" contenteditable="true" spellcheck="false">${convertPlainTextToHtml(displayValue)}</span>`
      );

      lastIndex = regex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < processedText.length) {
      const remainingText = processedText.substring(lastIndex);
      parts.push(hasHtmlTags ? remainingText : convertPlainTextToHtml(remainingText));
    }

    return parts.join('');
  }, [getVarValue]);

  // Handle input - Rich text version with storePillTemplate
  const handleInput = () => {
    const text = extractText()
    const html = editorRef.current?.innerHTML ?? ''
    const pillElements = editorRef.current?.querySelectorAll('.var-pill')

    const selection = document.getSelection?.()
    let activePill = null
    if (selection?.anchorNode) {
      const anchor = selection.anchorNode
      activePill = anchor.nodeType === Node.ELEMENT_NODE
        ? anchor.closest?.('.var-pill')
        : anchor.parentElement?.closest?.('.var-pill')
    }

    const { updates, hasChanges } = processPillValues(pillElements, activePill, (pill) => {
      storePillTemplate(pill)
    })

    Object.entries(updates).forEach(([vn, nv]) => syncSiblingPills(vn, nv))

    if (hasChanges && typeof onVariablesChange === 'function') onVariablesChange(updates)
    if (onChange) onChange({ target: { value: text, htmlValue: html } })

    // Detect deleted pills after processing
    const deletedVar = detectDeletedPills()
    if (deletedVar) trackDeletedPill(deletedVar)
    updatePreviousPills(pillElements)
  }

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    getHtml: () => editorRef.current?.innerHTML ?? '',
    getPlainText: () => extractText(),
    getEditorElement: () => editorRef.current
  }))

  // Handle focus
  const handleFocus = (e) => {
    setIsFocused(true)
    // Defer to allow selection to settle
    requestAnimationFrame(() => {
      const selection = document.getSelection?.();
      const anchor = selection?.anchorNode || null;
      if (!editorRef.current || !anchor || !editorRef.current.contains(anchor)) return;
      const pillElement = anchor.nodeType === Node.ELEMENT_NODE
        ? anchor.closest?.('.var-pill')
        : anchor.parentElement?.closest?.('.var-pill');
      const varName = pillElement?.getAttribute('data-var') || null;
      if (varName) {
        clearActivePillPlaceholder();
        applyFocusedPill(varName);
        emitFocusedVarChange(varName);
        if (Date.now() >= (autoSelectSuppressedUntilRef.current || 0)) {
          queueAutoSelectForPill(pillElement, varName);
        }
      }
    });
    onFocus?.(e);
  };

  const handleBlur = (e) => {
    setIsFocused(false)
    handleInput()

    if (typeof document !== 'undefined' ? document.hasFocus?.() !== false : true) {
      emitFocusedVarChange(null)
      applyFocusedPill(null)
    }

    onBlur?.(e)
  }

  const handlePaste = (event) => {
    if (!editorRef.current) return;

    event.preventDefault();

    const pastedText = event.clipboardData?.getData('text/plain') ?? '';
    if (!pastedText) return;

    const sanitized = convertPlainTextToHtml(pastedText);
    const selection = document.getSelection?.();

    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const fragment = range.createContextualFragment(sanitized);
      range.insertNode(fragment);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      editorRef.current.insertAdjacentHTML('beforeend', sanitized);
    }

    // Defer input handling to ensure DOM updates settle
    requestAnimationFrame(() => {
      handleInput();
    });
  };



  // Handle rich text commands
  const handleRichTextCommand = useCallback((command, value) => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    // If the command came from a control that may have moved focus (like <select>),
    // ensure the editor regains focus and the previous selection is restored.
    if (document.activeElement !== editor) {
      editor.focus();
    }

    // Nothing to execute here; toolbar already applied the change. Just notify parent.
    onRichTextCommand?.(command, value);
    
    // Trigger input event to sync with React state
    setTimeout(() => {
      if (editor) {
        const event = new Event('input', { bubbles: true });
        editor.dispatchEvent(event);
      }
    }, 10);
  }, [onRichTextCommand]);

  // Update editor when value changes - IDENTICAL to SimplePillEditor
  useEffect(() => {
    const editor = editorRef.current;
    const firstRun = !hasMountedRef.current;

    if (!editor) {
      prevValueRef.current = value;
      prevVariablesRef.current = variables;
      return;
    }

    if (isFocused) {
      prevValueRef.current = value;
      prevVariablesRef.current = variables;
      hasMountedRef.current = true;
      return;
    }

    const prevValue = prevValueRef.current;
    const prevVars = prevVariablesRef.current;
    const textChanged = value !== prevValue;
    const varsChanged = haveVariablesChanged(prevVars || {}, variables || {});

    if (firstRun) {
      const rendered = renderContent(value);
      if (editor.innerHTML !== rendered) {
        editor.innerHTML = rendered;
      }
    } else if (textChanged) {
      const rendered = renderContent(value);
      if (editor.innerHTML !== rendered) {
        editor.innerHTML = rendered;
      }
    } else if (varsChanged) {
      const pills = editor.querySelectorAll('.var-pill');
      pills.forEach((pill) => {
        const varName = pill.getAttribute('data-var');
        if (!varName) return;

        const rawValue = variables?.[varName];
        const stringValue = rawValue == null ? '' : String(rawValue);
        if (stringValue === '__DELETED__') {
          pill.replaceWith(document.createTextNode(''));
          return;
        }
        const trimmed = stringValue.trim();
        const placeholder = `<<${varName}>>`;
        const displayValue = trimmed.length ? stringValue : placeholder;
        const newHtml = convertPlainTextToHtml(displayValue);

        applyTemplateToPill(pill, newHtml);
        pill.setAttribute('data-display', stringValue);
        pill.setAttribute('data-value', placeholder);

        if (trimmed.length) {
          pill.classList.add('filled');
          pill.classList.remove('empty');
        } else {
          pill.classList.add('empty');
          pill.classList.remove('filled');
        }
      });
    }

    hasMountedRef.current = true;
    prevValueRef.current = value;
    prevVariablesRef.current = variables;
    if (firstRun || textChanged) {
      refreshAllPillTemplates(editor);
    }
  }, [value, variables, isFocused, renderContent, getVarValue, templateLanguage]);

  // Update pill display values when variables change, even when focused
  useEffect(() => {
    if (!editorRef.current) return;
    
    // Get currently active pill to avoid overwriting user input
    const selection = document.getSelection?.();
    let activePill = null;
    if (selection?.anchorNode) {
      const anchor = selection.anchorNode;
      activePill = anchor.nodeType === Node.ELEMENT_NODE
        ? anchor.closest?.('.var-pill')
        : anchor.parentElement?.closest?.('.var-pill');
    }
    
    const pills = editorRef.current.querySelectorAll('.var-pill');
    pills.forEach((pill) => {
      // Skip the pill user is currently editing
      if (activePill && pill === activePill) return;
      
      const varName = pill.getAttribute('data-var');
      if (!varName) return;
      const varValue = getVarValue(varName);
      if (varValue === '__DELETED__') {
        pill.replaceWith(document.createTextNode(''));
        return;
      }
      const isFilled = varValue.trim().length > 0;
      const displayValue = isFilled ? varValue : `<<${varName}>>`;
      
      // Only update if the pill content doesn't match the expected display value
      const currentText = (pill.textContent || '').trim();
      const expectedText = displayValue.trim();
      if (currentText !== expectedText) {
        const newHtml = convertPlainTextToHtml(displayValue);
        applyTemplateToPill(pill, newHtml);
        pill.classList.toggle('filled', isFilled);
        pill.classList.toggle('empty', !isFilled);
        pill.setAttribute('data-display', isFilled ? varValue : '');
      }
    });
  }, [variables, getVarValue]);

  const undoLabel = templateLanguage === 'fr' ? 'Annuler' : 'Undo';

  return (
    <div className="relative">
      {/* Rich Text Toolbar - Always visible when enabled */}
      {showRichTextToolbar && (
        <RichTextToolbar
          onCommand={handleRichTextCommand}
          disabled={disabled}
          className="mb-2"
        />
      )}
      
      {/* Undo deleted pill button */}
      {deletedPill && (
        <button
          type="button"
          onClick={() => restoreDeletedPill(deletedPill)}
          className="absolute top-0 right-0 transform -translate-y-full px-2 py-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-md shadow-sm border border-amber-300 transition-colors flex items-center gap-1 z-10"
          title={`${undoLabel}: ${deletedPill}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          {undoLabel}
        </button>
      )}
      
      {/* Content Editable - Uses IDENTICAL classes to SimplePillEditor */}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        className={`lexical-content-editable${variant === 'compact' ? ' lexical-content-editable--compact' : ''} ${className}`}
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
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onBeforeInput={handleBeforeInput}
        onCompositionStart={handleCompositionStart}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onCopy={handleCopy}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        style={{
          minHeight,
          ...style
        }}
      />
    </div>
  );
});

export default RichTextPillEditor;