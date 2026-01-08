import React, { useCallback, useEffect, useRef, useState, useImperativeHandle } from 'react'
import { varKeysMatch, resolveVariableValue } from '../utils/variables'
import { escapeHtml, BLOCK_ELEMENTS, convertPlainTextToHtml, selectEntirePill } from '../utils/html'

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
  const editorRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  const autoSelectTrackerRef = useRef({ varName: null, timestamp: 0 });
  const autoSelectSuppressedUntilRef = useRef(0);
  const clickSelectTimerRef = useRef(null);
  
  // Track deleted pills for undo functionality
  const [deletedPill, setDeletedPill] = useState(null);
  const deletedPillTimeoutRef = useRef(null);
  const previousPillsRef = useRef(new Set());

  const getVarValue = useCallback((name = '') => {
    return resolveVariableValue(variables, name, templateLanguage);
  }, [variables, templateLanguage]);

  const clearActivePillPlaceholder = useCallback(() => {
    if (!editorRef.current) return false;
    const selection = document.getSelection?.();
    if (!selection?.anchorNode) return false;
    const anchor = selection.anchorNode;
    const pillElement = anchor.nodeType === Node.ELEMENT_NODE
      ? anchor.closest?.('.var-pill')
      : anchor.parentElement?.closest?.('.var-pill');
    if (!pillElement) return false;
    const varName = pillElement.getAttribute('data-var');
    if (!varName) return false;
    const placeholderToken = `<<${varName}>>`;
    const currentText = (pillElement.textContent || '').trim();
    if (currentText === placeholderToken) {
      pillElement.textContent = '';
      pillElement.setAttribute('data-display', '');
      pillElement.classList.add('empty');
      pillElement.classList.remove('filled');
      return true;
    }
    return false;
  }, []);

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

  const applyFocusedPill = useCallback((varName) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.querySelectorAll('.var-pill').forEach((pill) => {
      const pillVar = pill.getAttribute('data-var');
      const isMatch = varKeysMatch(pillVar, varName);
      pill.classList.toggle('focused', !!isMatch);
    });
  }, []);

  const queueAutoSelectForPill = useCallback((pill, varName) => {
    if (!pill || !varName) return;
    if (!pill.classList.contains('empty')) return;
    const nowTs = Date.now();
    if (nowTs < (autoSelectSuppressedUntilRef.current || 0)) return;
    const selection = document.getSelection?.();
    if (!selection) return;
    if (!selection.isCollapsed && selection.toString()) return;
    const tracker = autoSelectTrackerRef.current;
    const now = Date.now();
    if (tracker.varName === varName && now - tracker.timestamp < 200) return;
    tracker.varName = varName;
    tracker.timestamp = now;
    requestAnimationFrame(() => selectEntirePill(pill));
  }, []);

  const syncSiblingPills = useCallback((varName, newValue) => {
    if (!editorRef.current || !varName) return;

    const selection = document.getSelection?.();
    let activePill = null;
    if (selection?.anchorNode) {
      const anchor = selection.anchorNode;
      activePill = anchor.nodeType === Node.ELEMENT_NODE
        ? anchor.closest?.('.var-pill')
        : anchor.parentElement?.closest?.('.var-pill');
    }

    const normalizedValue = newValue ?? '';
    const trimmed = normalizedValue.trim();
    const displayValue = trimmed.length > 0 ? normalizedValue : `<<${varName}>>`;
    const displayHtml = convertPlainTextToHtml(displayValue);
    const isFilled = trimmed.length > 0;

    editorRef.current.querySelectorAll('.var-pill').forEach((pill) => {
      if (pill.getAttribute('data-var') !== varName) return;
      if (activePill && pill === activePill) return;

      if (pill.innerHTML !== displayHtml) {
        pill.innerHTML = displayHtml;
      }
      pill.classList.toggle('filled', isFilled);
      pill.classList.toggle('empty', !isFilled);
      pill.setAttribute('data-display', isFilled ? normalizedValue : '');
    });
  }, []);

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    getHtml: () => editorRef.current?.innerHTML ?? '',
    getPlainText: () => extractText(),
    getEditorElement: () => editorRef.current
  }));

  const extractText = () => {
    if (!editorRef.current) return '';
    let result = '';
    const append = (t = '') => { if (!t) return; result += t; };
    const ensureTrailingNewline = () => { if (!result.endsWith('\n')) result += '\n'; };
    const traverse = (node) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const parentElement = child.parentElement;
          if (parentElement && parentElement.closest('.var-pill')) return;
          append(child.textContent ?? '');
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const element = child;
          if (element.classList.contains('var-pill')) {
            const varName = element.getAttribute('data-var');
            const placeholder = element.getAttribute('data-value') || (varName ? `<<${varName}>>` : '');
            append(placeholder);
          } else if (element.tagName === 'BR') {
            append('\n');
          } else {
            const isBlock = BLOCK_ELEMENTS.has(element.tagName);
            if (isBlock && result && !result.endsWith('\n')) append('\n');
            traverse(element);
            if (isBlock) ensureTrailingNewline();
          }
        }
      });
    };
    traverse(editorRef.current);
    const normalized = result.replace(/\u00a0/g, ' ');
    if (normalized.endsWith('\n') && !normalized.endsWith('\n\n')) return normalized.slice(0, -1);
    return normalized;
  };

  // Detect deleted pills by comparing current pills with previous state
  const detectDeletedPills = useCallback(() => {
    if (!editorRef.current) return null;
    const currentPills = new Set();
    editorRef.current.querySelectorAll('.var-pill').forEach(pill => {
      const varName = pill.getAttribute('data-var');
      if (varName) currentPills.add(varName);
    });
    
    // Find pills that were in previous state but not in current
    for (const varName of previousPillsRef.current) {
      if (!currentPills.has(varName)) {
        return varName;
      }
    }
    return null;
  }, []);

  // Restore a deleted pill
  const restoreDeletedPill = useCallback((varName) => {
    if (!varName || !value) return;
    
    // Insert the placeholder at the end of the current value
    const placeholder = `<<${varName}>>`;
    const newValue = value.trim() + ' ' + placeholder;
    onChange?.({ target: { value: newValue } });
    setDeletedPill(null);
    
    // Clear timeout
    if (deletedPillTimeoutRef.current) {
      clearTimeout(deletedPillTimeoutRef.current);
      deletedPillTimeoutRef.current = null;
    }
  }, [value, onChange]);

  const handleInput = () => {
    const text = extractText();
    const pillElements = editorRef.current?.querySelectorAll('.var-pill');
    const updates = {};
    const seenVars = new Set();
    let hasChanges = false;
    
    // Detect if a pill was deleted
    const deleted = detectDeletedPills();
    if (deleted) {
      setDeletedPill(deleted);
      // Clear previous timeout
      if (deletedPillTimeoutRef.current) {
        clearTimeout(deletedPillTimeoutRef.current);
      }
      // Auto-hide after 5 seconds
      deletedPillTimeoutRef.current = setTimeout(() => {
        setDeletedPill(null);
      }, 5000);
    }
    
    // Update previous pills reference
    const currentPillNames = new Set();
    pillElements?.forEach(pill => {
      const varName = pill.getAttribute('data-var');
      if (varName) currentPillNames.add(varName);
    });
    previousPillsRef.current = currentPillNames;
    
    // Get the currently active/focused pill to prioritize its value
    const selection = document.getSelection?.();
    let activePill = null;
    if (selection?.anchorNode) {
      const anchor = selection.anchorNode;
      activePill = anchor.nodeType === Node.ELEMENT_NODE
        ? anchor.closest?.('.var-pill')
        : anchor.parentElement?.closest?.('.var-pill');
    }
    
    // First pass: collect value from active pill
    if (activePill && pillElements) {
      const varName = activePill.getAttribute('data-var');
      if (varName) {
        const rawText = activePill.textContent ?? '';
        const normalizedText = rawText.replace(/\u00a0/g, ' ').replace(/[\r\n]+/g, ' ');
        const placeholder = `<<${varName}>>`;
        const withoutPlaceholder = normalizedText.split(placeholder).join('');
        const trimmedValue = withoutPlaceholder.trim();
        let newValue = trimmedValue;
        if (!trimmedValue) {
          newValue = '';
          if (rawText !== placeholder) activePill.textContent = placeholder;
          activePill.classList.remove('filled');
          activePill.classList.add('empty');
        } else {
          activePill.classList.add('filled');
          activePill.classList.remove('empty');
        }
        activePill.setAttribute('data-display', newValue);
        if ((variables?.[varName] || '') !== newValue) hasChanges = true;
        updates[varName] = newValue;
        seenVars.add(varName);
      }
    }
    
    // Second pass: collect values from other pills (but skip if varName already collected)
    if (pillElements) {
      pillElements.forEach((pill) => {
        const varName = pill.getAttribute('data-var');
        if (!varName || seenVars.has(varName)) return;
        
        const rawText = pill.textContent ?? '';
        const normalizedText = rawText.replace(/\u00a0/g, ' ').replace(/[\r\n]+/g, ' ');
        const placeholder = `<<${varName}>>`;
        const withoutPlaceholder = normalizedText.split(placeholder).join('');
        const trimmedValue = withoutPlaceholder.trim();
        let newValue = trimmedValue;
        if (!trimmedValue) {
          newValue = '';
          if (rawText !== placeholder) pill.textContent = placeholder;
          pill.classList.remove('filled');
          pill.classList.add('empty');
        } else {
          pill.classList.add('filled');
          pill.classList.remove('empty');
        }
        pill.setAttribute('data-display', newValue);
        if ((variables?.[varName] || '') !== newValue) hasChanges = true;
        updates[varName] = newValue;
        seenVars.add(varName);
      });
    }
    
    Object.entries(updates).forEach(([varName, newValue]) => {
      syncSiblingPills(varName, newValue);
    });

    if (hasChanges && typeof onVariablesChange === 'function') onVariablesChange(updates);
    onChange?.({ target: { value: text } });
  };

  const handleFocus = () => {
    setIsFocused(true);
    requestAnimationFrame(() => {
      const selection = document.getSelection?.();
      const anchor = selection?.anchorNode || null;
      if (!editorRef.current || !anchor || !editorRef.current.contains(anchor)) return;
      const pillElement = anchor.nodeType === Node.ELEMENT_NODE ? anchor.closest?.('.var-pill') : anchor.parentElement?.closest?.('.var-pill');
      const varName = pillElement?.getAttribute('data-var') || null;
      if (varName) {
        clearActivePillPlaceholder();
        applyFocusedPill(varName);
        if (Date.now() >= (autoSelectSuppressedUntilRef.current || 0)) queueAutoSelectForPill(pillElement, varName);
      }
    });
  };

  const handleBlur = () => {
    setIsFocused(false);
    handleInput();
    const docHasFocus = typeof document === 'undefined' || !document.hasFocus || document.hasFocus();
    if (docHasFocus) applyFocusedPill(null);
    autoSelectTrackerRef.current = { varName: null, timestamp: 0 };
  };

  const handleMouseDown = (event) => {
    if (!editorRef.current) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const pillElement = target.closest?.('.var-pill');
    if (pillElement && editorRef.current.contains(pillElement)) {
      const clickCount = event.detail;
      if (clickCount === 1) {
        if (clickSelectTimerRef.current) clearTimeout(clickSelectTimerRef.current);
        clickSelectTimerRef.current = setTimeout(() => { selectEntirePill(pillElement); clickSelectTimerRef.current = null; }, 220);
      } else if (clickCount >= 2) {
        if (clickSelectTimerRef.current) { clearTimeout(clickSelectTimerRef.current); clickSelectTimerRef.current = null; }
        autoSelectSuppressedUntilRef.current = Date.now() + 600;
      }
    }
  };

  const handleDoubleClick = (event) => {
    if (!editorRef.current) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const pillElement = target.closest?.('.var-pill');
    if (!pillElement || !editorRef.current.contains(pillElement)) return;
    event.preventDefault();
    try {
      const selection = document.getSelection?.();
      if (!selection) return;
      let range = null;
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(event.clientX, event.clientY);
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(event.clientX, event.clientY);
        if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); range.collapse(true); }
      }
      if (!range || !pillElement.contains(range.startContainer)) { range = document.createRange(); range.selectNodeContents(pillElement); range.collapse(false); }
      selection.removeAllRanges(); selection.addRange(range);
      autoSelectSuppressedUntilRef.current = Date.now() + 600;
    } catch {}
  };

  useEffect(() => {
    if (!editorRef.current || isFocused) return;
    const rendered = renderContent(value);
    if (editorRef.current.innerHTML !== rendered) editorRef.current.innerHTML = rendered;
  }, [value, variables, isFocused, getVarValue, templateLanguage]);

  useEffect(() => { applyFocusedPill(focusedVarName); }, [focusedVarName, variables, applyFocusedPill]);

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
        // Remove pill entirely when variable is marked deleted
        const textReplacement = document.createTextNode('');
        pill.replaceWith(textReplacement);
        return;
      }
      const isFilled = varValue.trim().length > 0;
      const displayValue = isFilled ? varValue : `<<${varName}>>`;
      
      // Only update if the pill content doesn't match the expected display value
      const currentText = (pill.textContent || '').trim();
      const expectedText = displayValue.trim();
      if (currentText !== expectedText) {
        pill.textContent = displayValue;
        pill.classList.toggle('filled', isFilled);
        pill.classList.toggle('empty', !isFilled);
        pill.setAttribute('data-display', isFilled ? varValue : '');
      }
    });
  }, [variables, getVarValue]);

  useEffect(() => {
    if (!isFocused || !editorRef.current) return;
    const handleSelectionChange = () => {
      const editor = editorRef.current; if (!editor) return;
      const docHasFocus = typeof document === 'undefined' || !document.hasFocus || document.hasFocus(); if (!docHasFocus) return;
      const selection = document.getSelection?.(); if (!selection) { autoSelectTrackerRef.current = { varName: null, timestamp: 0 }; return; }
      const anchor = selection.anchorNode; if (!anchor || !editor.contains(anchor)) { autoSelectTrackerRef.current = { varName: null, timestamp: 0 }; return; }
      const pillElement = anchor.nodeType === Node.ELEMENT_NODE ? anchor.closest?.('.var-pill') : anchor.parentElement?.closest?.('.var-pill');
      const varName = pillElement?.getAttribute('data-var') || null;
      if (varName && selection.isCollapsed) { if (Date.now() >= (autoSelectSuppressedUntilRef.current || 0)) queueAutoSelectForPill(pillElement, varName); }
      if (!varName) { autoSelectTrackerRef.current = { varName: null, timestamp: 0 }; }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [isFocused, queueAutoSelectForPill]);

  // Initialize previous pills reference when value changes
  useEffect(() => {
    if (!editorRef.current) return;
    const pillNames = new Set();
    editorRef.current.querySelectorAll('.var-pill').forEach(pill => {
      const varName = pill.getAttribute('data-var');
      if (varName) pillNames.add(varName);
    });
    previousPillsRef.current = pillNames;
  }, [value]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (deletedPillTimeoutRef.current) {
        clearTimeout(deletedPillTimeoutRef.current);
      }
    };
  }, []);

  const handleKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    const selection = document.getSelection?.(); if (!selection) return;
    const anchorNode = selection.anchorNode; if (!anchorNode) return;
    const pillElement = anchorNode.nodeType === Node.ELEMENT_NODE ? anchorNode.closest?.('.var-pill') : anchorNode.parentElement?.closest?.('.var-pill');
    if (pillElement) event.preventDefault();
  };

  const handleBeforeInput = useCallback((event) => {
    const inputType = event?.inputType || '';
    if (!inputType || inputType.startsWith('insert') || inputType === 'deleteContentBackward') {
      clearActivePillPlaceholder();
    }
  }, [clearActivePillPlaceholder]);

  const handleCompositionStart = useCallback(() => {
    clearActivePillPlaceholder();
  }, [clearActivePillPlaceholder]);

  // Handle copy event - clean up pill styles and resolve variables
  const handleCopy = useCallback((event) => {
    const selection = document.getSelection?.();
    if (!selection || selection.isCollapsed) return; // Let default handle if no selection
    
    event.preventDefault();
    
    // Get the selected range
    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();
    
    // Create a temporary container to process the content
    const tempDiv = document.createElement('div');
    tempDiv.appendChild(fragment);
    
    // Colors to strip (pill backgrounds that should not appear in pasted content)
    const pillBackgroundColors = new Set([
      'rgb(245, 243, 232)', 'rgb(245,243,232)', '#f5f3e8',  // filled pill
      'rgb(254, 249, 195)', 'rgb(254,249,195)', '#fef9c3',  // empty pill (yellow)
      'rgb(219, 234, 254)', 'rgb(219,234,254)', '#dbeafe',  // focused pill (blue)
      'rgba(245, 243, 232, 1)', 'rgba(245,243,232,1)',
      'rgba(254, 249, 195, 1)', 'rgba(254,249,195,1)',
      'rgba(219, 234, 254, 1)', 'rgba(219,234,254,1)',
    ]);
    
    // Helper to check if a color is a pill background
    const isPillBackground = (color) => {
      if (!color) return false;
      const normalized = color.replace(/\s+/g, '').toLowerCase();
      return pillBackgroundColors.has(normalized) || 
             normalized.includes('245,243,232') || 
             normalized.includes('254,249,195') ||
             normalized.includes('219,234,254');
    };
    
    // Process all pills - replace with resolved values (plain text)
    const pills = tempDiv.querySelectorAll('.var-pill');
    pills.forEach(pill => {
      const varName = pill.getAttribute('data-var');
      const resolvedValue = varName ? getVarValue(varName) : '';
      const displayText = resolvedValue.trim() || pill.textContent || '';
      // Replace pill with plain text
      const textNode = document.createTextNode(displayText);
      pill.replaceWith(textNode);
    });
    
    // Strip pill background colors from ALL elements (in case browser left remnants)
    const allElements = tempDiv.querySelectorAll('*');
    allElements.forEach(el => {
      const style = el.getAttribute('style');
      if (style) {
        // Parse and filter out pill background colors
        const bgMatch = style.match(/background(?:-color)?:\s*([^;]+)/i);
        if (bgMatch && isPillBackground(bgMatch[1])) {
          // Remove background-color from style
          const newStyle = style
            .replace(/background-color:\s*[^;]+;?\s*/gi, '')
            .replace(/background:\s*[^;]+;?\s*/gi, '')
            .trim();
          if (newStyle) {
            el.setAttribute('style', newStyle);
          } else {
            el.removeAttribute('style');
          }
        }
      }
      
      // Also remove var-pill class if any remnants
      el.classList.remove('var-pill', 'filled', 'empty', 'focused', 'hovered');
      if (el.classList.length === 0) {
        el.removeAttribute('class');
      }
      
      // Remove data attributes from pills
      el.removeAttribute('data-var');
      el.removeAttribute('data-value');
      el.removeAttribute('data-display');
    });
    
    // Get clean text content
    const textContent = tempDiv.textContent || '';
    
    // Build clean HTML (preserve basic formatting but remove pill styles)
    const htmlContent = tempDiv.innerHTML
      .replace(/<br\s*\/?>/gi, '<br>')
      .trim();
    
    // Write to clipboard with both formats
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const clipboardItem = new ClipboardItem({
          'text/html': new Blob([htmlContent], { type: 'text/html' }),
          'text/plain': new Blob([textContent], { type: 'text/plain' })
        });
        navigator.clipboard.write([clipboardItem]);
      } else {
        // Fallback for older browsers
        event.clipboardData?.setData('text/plain', textContent);
        event.clipboardData?.setData('text/html', htmlContent);
      }
    } catch (err) {
      console.error('Copy failed:', err);
      // Last resort fallback
      event.clipboardData?.setData('text/plain', textContent);
    }
  }, [getVarValue]);

  const undoLabel = templateLanguage === 'fr' ? 'Annuler' : 'Undo';

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
        dangerouslySetInnerHTML={{ __html: renderContent(value) }}
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
  );
});

export default SimplePillEditor;

