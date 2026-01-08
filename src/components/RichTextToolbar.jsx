import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bold, Italic, Underline, Strikethrough, Type, AlignLeft, AlignCenter, AlignRight, AlignJustify, List, ListOrdered, Highlighter, Palette, Link as LinkIcon } from 'lucide-react';
import { Button } from './ui/button.jsx';
import FontSelector from './ui/font-selector.jsx';
import FontSizeSelector from './ui/font-size-selector.jsx';

const FONT_SIZE_OPTIONS = [
  { label: 'Small', value: '14px' },
  { label: 'Normal', value: '16px' },
  { label: 'Large', value: '18px' },
  { label: 'X-Large', value: '20px' }
];

const DEFAULT_FONT_SIZE = '16px';

const FONT_SIZE_COMMAND_MAP = {
  '14px': '2',
  '16px': '3',
  '18px': '4',
  '20px': '5'
};

const FONT_COMMAND_TO_PX = {
  '1': '12px',
  '2': '14px',
  '3': '16px',
  '4': '18px',
  '5': '20px',
  '6': '24px',
  '7': '28px'
};

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#ffeb3b' },
  { name: 'Green', value: '#c6f68d' },
  { name: 'Blue', value: '#90caf9' },
  { name: 'Pink', value: '#f48fb1' },
  { name: 'Orange', value: '#ffcc80' },
  { name: 'None', value: 'transparent' }
];

const TEXT_COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'Dark Gray', value: '#424242' },
  { name: 'Gray', value: '#757575' },
  { name: 'Red', value: '#f44336' },
  { name: 'Blue', value: '#2196f3' },
  { name: 'Green', value: '#4caf50' },
  { name: 'Orange', value: '#ff9800' },
  { name: 'Purple', value: '#9c27b0' }
];

const FONT_FAMILIES = [
  { name: 'Arial', value: 'Arial, sans-serif' },
  { name: 'Times New Roman', value: 'Times New Roman, serif' },
  { name: 'Courier New', value: 'Courier New, monospace' },
  { name: 'Georgia', value: 'Georgia, serif' },
  { name: 'Verdana', value: 'Verdana, sans-serif' },
  { name: 'Helvetica', value: 'Helvetica, sans-serif' },
  { name: 'Comic Sans', value: 'Comic Sans MS, cursive' },
  { name: 'Impact', value: 'Impact, fantasy' }
];

const RichTextToolbar = ({ onCommand, className = '', disabled = false }) => {
  const [activeFormats, setActiveFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false
  });
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [fontFamily, setFontFamily] = useState('Arial, sans-serif');
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const toolbarRef = useRef(null);

  const normalizeFontSize = useCallback((computedSize) => {
    if (!computedSize) return DEFAULT_FONT_SIZE;
    const numeric = parseFloat(computedSize);
    if (!Number.isFinite(numeric)) return DEFAULT_FONT_SIZE;

    let closest = DEFAULT_FONT_SIZE;
    let delta = Number.POSITIVE_INFINITY;
    FONT_SIZE_OPTIONS.forEach(({ value }) => {
      const candidate = parseFloat(value);
      const diff = Math.abs(candidate - numeric);
      if (diff < delta) {
        delta = diff;
        closest = value;
      }
    });

    return closest;
  }, []);

  // Check current formatting state
  const updateFormatState = useCallback(() => {
    if (disabled) return;
    
    try {
      const selection = window.getSelection();
      if (!selection.rangeCount) return;

      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikethrough: document.queryCommandState('strikeThrough')
      });

      // Get font size from selection
      const range = selection.getRangeAt(0);
      let targetElement = null;

      if (range.startContainer.nodeType === Node.TEXT_NODE) {
        targetElement = range.startContainer.parentElement;
      } else if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
        targetElement = range.startContainer;
      }

      if (targetElement) {
        const computedStyle = window.getComputedStyle(targetElement);
        setFontSize(normalizeFontSize(computedStyle.fontSize));
      }
    } catch (error) {
      console.warn('Error updating format state:', error);
    }
  }, [disabled, normalizeFontSize]);

  // Handle selection changes to update toolbar state
  useEffect(() => {
    const handleSelectionChange = () => {
      // Small delay to ensure DOM is updated after selection change
      setTimeout(updateFormatState, 10);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [updateFormatState]);

  // Close color pickers when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target)) {
        setShowHighlightPicker(false);
        setShowColorPicker(false);
      }
    };

    if (showHighlightPicker || showColorPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showHighlightPicker, showColorPicker]);

  // Execute formatting command
  const executeCommand = useCallback((command, value = null) => {
    if (disabled) return;

    try {
      // Save the current selection before we lose focus
      const savedSelection = window.getSelection();
      let savedRange = null;
      if (savedSelection && savedSelection.rangeCount > 0) {
        savedRange = savedSelection.getRangeAt(0).cloneRange();
      }

      // For block-level commands, ensure the selection is not inside a var-pill
      const isBlockCommand = (
        command === 'insertUnorderedList' ||
        command === 'insertOrderedList' ||
        command === 'justifyLeft' ||
        command === 'justifyCenter' ||
        command === 'justifyRight' ||
        command === 'justifyFull'
      );

      if (isBlockCommand && savedRange) {
        const anchorNode = savedRange.startContainer;
        let el = anchorNode.nodeType === Node.ELEMENT_NODE
          ? anchorNode
          : anchorNode.parentElement;
        let pill = null;
        if (el && el.closest) {
          pill = el.closest('.var-pill');
        }

        if (pill) {
          // If caret is inside a pill, move it just after the pill so block command can apply
          const afterRange = document.createRange();
          afterRange.setStartAfter(pill);
          afterRange.collapse(true);
          savedRange = afterRange;
        }
      }

      // For non-block commands with selection, check if pills are included and format them too
      const isFormattingCommand = !isBlockCommand && savedRange && !savedRange.collapsed;
      const pillsToFormat = [];
      
      if (isFormattingCommand) {
        // Get the common ancestor container
        const container = savedRange.commonAncestorContainer;
        const parentElement = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
        
        if (parentElement && parentElement.querySelectorAll) {
          // Find all pills in the parent
          const allPills = parentElement.querySelectorAll('.var-pill');
          
          // Check which pills intersect with the selection range
          allPills.forEach(pill => {
            try {
              if (savedRange.intersectsNode(pill)) {
                pillsToFormat.push(pill);
              }
            } catch (e) {
              // intersectsNode might not be supported in all browsers
              // Fallback: check if pill is between start and end
              const range = document.createRange();
              range.selectNode(pill);
              if (savedRange.compareBoundaryPoints(Range.START_TO_END, range) > 0 &&
                  savedRange.compareBoundaryPoints(Range.END_TO_START, range) < 0) {
                pillsToFormat.push(pill);
              }
            }
          });
        }
      }

      // Restore selection before executing command
      if (savedRange) {
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(savedRange);
        }
      }

      // For color commands, enable styleWithCSS for better compatibility
      const isColorCommand = command === 'foreColor' || command === 'backColor' || command === 'hiliteColor';
      
      if (isColorCommand) {
        try {
          document.execCommand('styleWithCSS', false, true);
        } catch (e) {
          // Some browsers don't support this
        }
      }

      // Execute command immediately while we have selection
      document.execCommand(command, false, value);
      
      // Also apply formatting to pills that were in the selection
      if (pillsToFormat.length > 0) {
        pillsToFormat.forEach(pill => {
          // Select the pill's content
          const pillRange = document.createRange();
          pillRange.selectNodeContents(pill);
          const pillSelection = window.getSelection();
          pillSelection.removeAllRanges();
          pillSelection.addRange(pillRange);
          
          // Apply the command to the pill
          document.execCommand(command, false, value);
        });
        
        // Restore original selection
        if (savedRange) {
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(savedRange);
          }
        }
      }
      
      // Reset styleWithCSS
      if (isColorCommand) {
        try {
          document.execCommand('styleWithCSS', false, false);
        } catch (e) {
          // Ignore
        }
      }
      
      updateFormatState();
      
      // Then notify parent
      onCommand?.(command, value);
      
      // Trigger input event on the contentEditable element to sync with React state
      const activeElement = document.activeElement;
      if (activeElement && activeElement.isContentEditable) {
        const event = new Event('input', { bubbles: true });
        activeElement.dispatchEvent(event);
      }
    } catch (error) {
      console.warn('Error executing command:', command, error);
    }
  }, [disabled, onCommand, updateFormatState]);

  // Handle font size change
  const handleFontSizeChange = useCallback((newSize) => {
    if (disabled) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setFontSize(newSize);
      onCommand?.('fontSize', newSize);
      return;
    }

    const range = selection.getRangeAt(0);
    const commandValue = FONT_SIZE_COMMAND_MAP[newSize] || FONT_SIZE_COMMAND_MAP[DEFAULT_FONT_SIZE];

    try {
      document.execCommand('styleWithCSS', false, true);
    } catch (error) {
      // styleWithCSS not supported - continue with default behavior
    }

    document.execCommand('fontSize', false, commandValue);

    try {
      document.execCommand('styleWithCSS', false, false);
    } catch (error) {
      // Ignore if browser does not support toggling
    }

    const activeElement = document.activeElement?.isContentEditable
      ? document.activeElement
      : document.activeElement?.closest?.('[contenteditable="true"]');

    if (activeElement) {
      const fonts = activeElement.querySelectorAll('font[size]');
      fonts.forEach((fontEl) => {
        const span = document.createElement('span');
        const sizeAttr = fontEl.getAttribute('size');
        const mappedSize = FONT_COMMAND_TO_PX[sizeAttr] || newSize;
        span.style.fontSize = mappedSize;
        span.innerHTML = fontEl.innerHTML;
        fontEl.replaceWith(span);
      });
    }

    setFontSize(newSize);
    onCommand?.('fontSize', newSize);

    // Sync external state
    updateFormatState();

    if (document.activeElement && document.activeElement.isContentEditable) {
      const event = new Event('input', { bubbles: true });
      document.activeElement.dispatchEvent(event);
    }
  }, [disabled, onCommand, updateFormatState]);

  // Handle font family change
  const handleFontFamilyChange = useCallback((newFamily) => {
    if (disabled) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setFontFamily(newFamily);
      onCommand?.('fontName', newFamily);
      return;
    }

    try {
      document.execCommand('styleWithCSS', false, true);
    } catch (error) {
      // styleWithCSS not supported - continue with default behavior
    }

    document.execCommand('fontName', false, newFamily);

    try {
      document.execCommand('styleWithCSS', false, false);
    } catch (error) {
      // Ignore if browser does not support toggling
    }

    setFontFamily(newFamily);
    onCommand?.('fontName', newFamily);

    // Sync external state
    updateFormatState();

    if (document.activeElement && document.activeElement.isContentEditable) {
      const event = new Event('input', { bubbles: true });
      document.activeElement.dispatchEvent(event);
    }
  }, [disabled, onCommand, updateFormatState]);

  if (disabled) {
    return null;
  }

  return (
    <div 
      ref={toolbarRef}
      className={`flex flex-wrap items-center gap-1.5 p-2.5 bg-slate-50 border border-slate-200 rounded-lg ${className}`}
    >
      {/* Text Formatting */}
      <div className="flex items-center gap-1 pr-2 border-r border-slate-300">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-9 w-9 p-0 ${activeFormats.bold ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => executeCommand('bold')}
          title="Bold (Ctrl+B)"
        >
          <Bold className="h-5 w-5" />
        </Button>
        
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-9 w-9 p-0 ${activeFormats.italic ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => executeCommand('italic')}
          title="Italic (Ctrl+I)"
        >
          <Italic className="h-5 w-5" />
        </Button>
        
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-9 w-9 p-0 ${activeFormats.underline ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => executeCommand('underline')}
          title="Underline (Ctrl+U)"
        >
          <Underline className="h-5 w-5" />
        </Button>
        
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`h-9 w-9 p-0 ${activeFormats.strikethrough ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => executeCommand('strikeThrough')}
          title="Strikethrough"
        >
          <Strikethrough className="h-5 w-5" />
        </Button>
      </div>

      {/* Lists */}
      <div className="flex items-center gap-1 pr-2 border-r border-slate-300">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => executeCommand('insertUnorderedList')}
          title="Bullet List"
        >
          <List className="h-5 w-5" />
        </Button>
        
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => executeCommand('insertOrderedList')}
          title="Numbered List"
        >
          <ListOrdered className="h-5 w-5" />
        </Button>
      </div>

      {/* Highlighting & Colors */}
      <div className="flex items-center gap-1 pr-2 border-r border-slate-300 relative">
        {/* Highlight */}
        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setShowHighlightPicker(!showHighlightPicker);
              setShowColorPicker(false);
            }}
            title="Highlight Color"
          >
            <Highlighter className="h-5 w-5" />
          </Button>
          {showHighlightPicker && (
            <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg z-50 flex gap-1">
              {HIGHLIGHT_COLORS.map(color => (
                <button
                  key={color.value}
                  type="button"
                  className="color-swatch w-7 h-7 rounded border-2 border-slate-300 dark:border-slate-500 hover:border-slate-500 dark:hover:border-slate-300 transition-colors"
                  style={{ backgroundColor: color.value }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    executeCommand('backColor', color.value);
                    setShowHighlightPicker(false);
                  }}
                  title={color.name}
                />
              ))}
            </div>
          )}
        </div>

        {/* Text Color */}
        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setShowColorPicker(!showColorPicker);
              setShowHighlightPicker(false);
            }}
            title="Text Color"
          >
            <Palette className="h-5 w-5" />
          </Button>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg z-50 flex gap-1">
              {TEXT_COLORS.map(color => (
                <button
                  key={color.value}
                  type="button"
                  className="color-swatch w-7 h-7 rounded border-2 border-slate-300 dark:border-slate-500 hover:border-slate-500 dark:hover:border-slate-300 transition-colors"
                  style={{ backgroundColor: color.value }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    executeCommand('foreColor', color.value);
                    setShowColorPicker(false);
                  }}
                  title={color.name}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alignment */}
      <div className="flex items-center gap-1 pr-2 border-r border-slate-300">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => executeCommand('justifyLeft')}
          title="Align Left"
        >
          <AlignLeft className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => executeCommand('justifyCenter')}
          title="Align Center"
        >
          <AlignCenter className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => executeCommand('justifyRight')}
          title="Align Right"
        >
          <AlignRight className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => executeCommand('justifyFull')}
          title="Justify"
        >
          <AlignJustify className="h-5 w-5" />
        </Button>
      </div>

      {/* Font Size */}
      <div className="flex items-center gap-2">
        <Type className="h-5 w-5 text-slate-600" />
        <FontSizeSelector
          value={fontSize}
          onChange={handleFontSizeChange}
          sizes={FONT_SIZE_OPTIONS}
          disabled={disabled}
        />
      </div>

      {/* Font Family */}
      <div className="flex items-center gap-2">
        <FontSelector
          value={fontFamily}
          onChange={handleFontFamilyChange}
          fonts={FONT_FAMILIES}
          disabled={disabled}
        />
      </div>

      {/* Separator removed by request */}
    </div>
  );
};

export default RichTextToolbar;