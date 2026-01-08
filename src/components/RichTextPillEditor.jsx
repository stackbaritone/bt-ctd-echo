import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { varKeysMatch, resolveVariableValue } from '../utils/variables'
import { escapeHtml, BLOCK_ELEMENTS, convertPlainTextToHtml } from '../utils/html'
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

const selectEntirePill = (pill) => {
  if (!pill) return;
  const selection = document.getSelection?.();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(pill);
  selection.removeAllRanges();
  selection.addRange(range);
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
  const editorRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);
  const lastSelectionVarRef = useRef(null);
  const prevValueRef = useRef(value);
  const prevVariablesRef = useRef(variables);
  const hasMountedRef = useRef(false);
  const autoSelectTrackerRef = useRef({ varName: null, timestamp: 0 });
  const autoSelectSuppressedUntilRef = useRef(0);
  const clickSelectTimerRef = useRef(null);
  
  // Undo deleted pill state
  const [deletedPill, setDeletedPill] = useState(null);
  const deletedPillTimeoutRef = useRef(null);
  const previousPillsRef = useRef(new Set());

  // Resolve variable value by language preference
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
      pillElement.innerHTML = '';
      pillElement.setAttribute('data-display', '');
      pillElement.classList.add('empty');
      pillElement.classList.remove('filled');
      return true;
    }
    return false;
  }, []);

  // Detect if a pill was deleted by comparing current pills to previous state
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

  // Restore a deleted pill by inserting its placeholder at the end
  const restoreDeletedPill = useCallback((varName) => {
    if (!varName || !editorRef.current) return;
    
    // Insert the placeholder at the current cursor position or at the end
    const placeholder = `<<${varName}>>`;
    const selection = document.getSelection?.();
    
    if (selection && selection.rangeCount > 0 && editorRef.current.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(placeholder);
      range.insertNode(textNode);
      range.collapse(false);
    } else {
      // Insert at end
      const currentValue = extractText();
      const newValue = currentValue + placeholder;
      if (onChange) {
        onChange({ target: { value: newValue, htmlValue: editorRef.current.innerHTML } });
      }
    }
    
    // Clear the undo state
    setDeletedPill(null);
    if (deletedPillTimeoutRef.current) {
      clearTimeout(deletedPillTimeoutRef.current);
      deletedPillTimeoutRef.current = null;
    }
    
    // Trigger input to re-render
    setTimeout(() => {
      handleInput();
    }, 10);
  }, [onChange]);

  // Render content with pills - IDENTICAL to SimplePillEditor
  const renderContent = (text) => {
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
  };

  // Focus management - IDENTICAL to SimplePillEditor
  const applyFocusedPill = useCallback((varName) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.querySelectorAll('.var-pill').forEach((pill) => {
      const pillVar = pill.getAttribute('data-var');
      const isMatch = varName ? varKeysMatch(pillVar, varName) : false;
      pill.classList.toggle('focused', !!isMatch);
    });
  }, []);

  const queueAutoSelectForPill = useCallback((pill, varName) => {
    if (!pill || !varName) return;
    if (!pill.classList.contains('empty')) return;
    const nowTs = Date.now();
    if (nowTs < (autoSelectSuppressedUntilRef.current || 0)) {
      return;
    }
    const selection = document.getSelection?.();
    if (!selection) return;
    if (!selection.isCollapsed && selection.toString()) return;

    const tracker = autoSelectTrackerRef.current;
    const now = Date.now();
    if (tracker.varName === varName && now - tracker.timestamp < 200) {
      return;
    }

    tracker.varName = varName;
    tracker.timestamp = now;

    requestAnimationFrame(() => {
      selectEntirePill(pill);
    });
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

  const emitFocusedVarChange = useCallback((varName) => {
    const normalized = varName || null;
    if (lastSelectionVarRef.current === normalized) return;
    lastSelectionVarRef.current = normalized;
    if (typeof onFocusedVarChange === 'function') {
      onFocusedVarChange(normalized);
    }
  }, [onFocusedVarChange]);

  // Extract text - IDENTICAL to SimplePillEditor
  const extractText = () => {
    if (!editorRef.current) return '';

    let result = '';

    const append = (text = '') => {
      if (!text) return;
      result += text;
    };

    const ensureTrailingNewline = () => {
      if (!result.endsWith('\n')) {
        result += '\n';
      }
    };

    const traverse = (node) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const parentElement = child.parentElement;
          if (parentElement && parentElement.closest('.var-pill')) {
            return;
          }
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
            if (isBlock && result && !result.endsWith('\n')) {
              append('\n');
            }
            traverse(element);
            if (isBlock) {
              ensureTrailingNewline();
            }
          }
        }
      });
    };

    traverse(editorRef.current);

    const normalized = result.replace(/\u00a0/g, ' ');
    if (normalized.endsWith('\n') && !normalized.endsWith('\n\n')) {
      return normalized.slice(0, -1);
    }
    return normalized;
  };



  // Handle input - IDENTICAL to SimplePillEditor
  const handleInput = () => {
    const text = extractText();
    const html = editorRef.current?.innerHTML ?? '';

    const pillElements = editorRef.current?.querySelectorAll('.var-pill');
    const updates = {};
    const seenVars = new Set();
    let hasChanges = false;

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
        const normalizedText = rawText
          .replace(/\u00a0/g, ' ')
          .replace(/[\r\n]+/g, ' ');
        const placeholder = `<<${varName}>>`;
        const withoutPlaceholder = normalizedText.split(placeholder).join('');
        const trimmedValue = withoutPlaceholder.trim();
        let newValue = trimmedValue;

        if (!trimmedValue) {
          newValue = '';
          if (rawText !== placeholder) {
            activePill.textContent = placeholder;
          }
          activePill.classList.remove('filled');
          activePill.classList.add('empty');
        } else {
          activePill.classList.add('filled');
          activePill.classList.remove('empty');
        }

        activePill.setAttribute('data-display', newValue);

        if ((variables?.[varName] || '') !== newValue) {
          hasChanges = true;
        }
        updates[varName] = newValue;
        seenVars.add(varName);
        storePillTemplate(activePill);
      }
    }

    // Second pass: collect values from other pills (but skip if varName already collected)
    if (pillElements) {
      pillElements.forEach((pill) => {
        const varName = pill.getAttribute('data-var');
        if (!varName || seenVars.has(varName)) return;

        const rawText = pill.textContent ?? '';
        const normalizedText = rawText
          .replace(/\u00a0/g, ' ')
          .replace(/[\r\n]+/g, ' ');
        const placeholder = `<<${varName}>>`;
        const withoutPlaceholder = normalizedText.split(placeholder).join('');
        const trimmedValue = withoutPlaceholder.trim();
        let newValue = trimmedValue;

        if (!trimmedValue) {
          newValue = '';
          if (rawText !== placeholder) {
            pill.textContent = placeholder;
          }
          pill.classList.remove('filled');
          pill.classList.add('empty');
        } else {
          pill.classList.add('filled');
          pill.classList.remove('empty');
        }

        pill.setAttribute('data-display', newValue);

        if ((variables?.[varName] || '') !== newValue) {
          hasChanges = true;
        }
        updates[varName] = newValue;
        seenVars.add(varName);
        storePillTemplate(pill);
      });
    }

    Object.entries(updates).forEach(([varName, newValue]) => {
      syncSiblingPills(varName, newValue);
    });

    if (hasChanges && typeof onVariablesChange === 'function') {
      onVariablesChange(updates);
    }

    if (onChange) {
      onChange({ target: { value: text, htmlValue: html } });
    }

    // Detect if a pill was deleted and offer undo
    const deletedVar = detectDeletedPills();
    if (deletedVar) {
      // Clear any existing timeout
      if (deletedPillTimeoutRef.current) {
        clearTimeout(deletedPillTimeoutRef.current);
      }
      setDeletedPill(deletedVar);
      // Auto-hide after 5 seconds
      deletedPillTimeoutRef.current = setTimeout(() => {
        setDeletedPill(null);
        deletedPillTimeoutRef.current = null;
      }, 5000);
    }

    // Update previous pills reference
    const currentPills = new Set();
    if (pillElements) {
      pillElements.forEach(pill => {
        const varName = pill.getAttribute('data-var');
        if (varName) currentPills.add(varName);
      });
    }
    previousPillsRef.current = currentPills;
  };

  useImperativeHandle(ref, () => ({
    focus: () => {
      editorRef.current?.focus();
    },
    getHtml: () => editorRef.current?.innerHTML ?? '',
    getPlainText: () => extractText(),
    getEditorElement: () => editorRef.current
  }));

  // Handle focus - IDENTICAL to SimplePillEditor
  const handleFocus = (e) => {
    setIsFocused(true);
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

  // Handle blur - IDENTICAL to SimplePillEditor
  const handleBlur = (e) => {
    setIsFocused(false);
    handleInput(); // Ensure final value is captured

    if (typeof document !== 'undefined' ? document.hasFocus?.() !== false : true) {
      emitFocusedVarChange(null);
      applyFocusedPill(null);
    }

    autoSelectTrackerRef.current = { varName: null, timestamp: 0 };
    onBlur?.(e);
  };

  // Handle paste - IDENTICAL to SimplePillEditor
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

  // Handle key down - IDENTICAL to SimplePillEditor
  const handleKeyDown = (event) => {
    if (event.key !== 'Enter') {
      return;
    }

    const selection = document.getSelection?.();
    if (!selection) {
      return;
    }

    const anchorNode = selection.anchorNode;
    if (!anchorNode) {
      return;
    }

    const pillElement = anchorNode.nodeType === Node.ELEMENT_NODE
      ? anchorNode.closest?.('.var-pill')
      : anchorNode.parentElement?.closest?.('.var-pill');

    if (pillElement) {
      event.preventDefault();
    }
  };

  // Auto-select pill content on mouse down to enable quick overwrite
  const handleMouseDown = (event) => {
    if (!editorRef.current) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    const pillElement = target.closest?.('.var-pill');
    if (pillElement && editorRef.current.contains(pillElement)) {
      const clickCount = event.detail;
      const varName = pillElement.getAttribute('data-var') || null;
      // Single click: schedule select-all shortly. Double-click: cancel and allow native caret in pill.
      if (clickCount === 1) {
        if (clickSelectTimerRef.current) {
          clearTimeout(clickSelectTimerRef.current);
        }
        clickSelectTimerRef.current = setTimeout(() => {
          selectEntirePill(pillElement);
          clickSelectTimerRef.current = null;
        }, 220);
      } else if (clickCount >= 2) {
        if (clickSelectTimerRef.current) {
          clearTimeout(clickSelectTimerRef.current);
          clickSelectTimerRef.current = null;
        }
        autoSelectSuppressedUntilRef.current = Date.now() + 600;
      }
      emitFocusedVarChange(varName);
      applyFocusedPill(varName);
    }
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
    
    // Process all pills - replace with resolved values
    const pills = tempDiv.querySelectorAll('.var-pill');
    pills.forEach(pill => {
      const varName = pill.getAttribute('data-var');
      const resolvedValue = varName ? getVarValue(varName) : '';
      const displayText = resolvedValue.trim() || pill.textContent || '';
      
      // Create a plain text node (no span, no styling)
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
      el.removeAttribute('data-template');
    });
    
    // Get clean text content
    const textContent = tempDiv.textContent || '';
    
    // Build clean HTML preserving rich text formatting (but no pill styles)
    const htmlContent = tempDiv.innerHTML;
    
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

  const handleDoubleClick = (event) => {
    if (!editorRef.current) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    const pillElement = target.closest?.('.var-pill');
    if (!pillElement || !editorRef.current.contains(pillElement)) return;

    // Prevent native word selection and place a collapsed caret where clicked
    event.preventDefault();
    try {
      const selection = document.getSelection?.();
      if (!selection) return;

      let range = null;
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(event.clientX, event.clientY);
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(event.clientX, event.clientY);
        if (pos) {
          range = document.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.collapse(true);
        }
      }

      if (!range || !pillElement.contains(range.startContainer)) {
        range = document.createRange();
        range.selectNodeContents(pillElement);
        range.collapse(false);
      }

      selection.removeAllRanges();
      selection.addRange(range);
      autoSelectSuppressedUntilRef.current = Date.now() + 600;
    } catch {}
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
  }, [value, variables, isFocused, getVarValue, templateLanguage]);

  // Apply focused pill styling - IDENTICAL to SimplePillEditor
  useEffect(() => {
    applyFocusedPill(focusedVarName);
  }, [focusedVarName, variables, applyFocusedPill]);

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

  // Selection change handler - IDENTICAL to SimplePillEditor
  useEffect(() => {
    if (!isFocused || !editorRef.current) return;

    const handleSelectionChange = () => {
      const editor = editorRef.current;
      if (!editor) return;
      const docHasFocus = typeof document === 'undefined' || !document.hasFocus || document.hasFocus();
      if (!docHasFocus) {
        return;
      }
      const selection = document.getSelection?.();
      if (!selection) {
        emitFocusedVarChange(null);
        applyFocusedPill(null);
        autoSelectTrackerRef.current = { varName: null, timestamp: 0 };
        return;
      }

      const anchor = selection.anchorNode;
      if (!anchor || !editor.contains(anchor)) {
        emitFocusedVarChange(null);
        applyFocusedPill(null);
        autoSelectTrackerRef.current = { varName: null, timestamp: 0 };
        return;
      }

      const pillElement = anchor.nodeType === Node.ELEMENT_NODE
        ? anchor.closest?.('.var-pill')
        : anchor.parentElement?.closest?.('.var-pill');
      const varName = pillElement?.getAttribute('data-var') || null;
      emitFocusedVarChange(varName);
      applyFocusedPill(varName);

      if (varName && selection.isCollapsed) {
        if (Date.now() >= (autoSelectSuppressedUntilRef.current || 0)) {
          queueAutoSelectForPill(pillElement, varName);
        }
      }

      if (!varName) {
        autoSelectTrackerRef.current = { varName: null, timestamp: 0 };
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [isFocused, emitFocusedVarChange, applyFocusedPill, queueAutoSelectForPill]);

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