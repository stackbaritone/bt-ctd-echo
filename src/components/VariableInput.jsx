import { useState, useEffect, useRef, useCallback, memo } from 'react'

/**
 * Isolated textarea for variable input that manages its own local state
 * and ignores parent re-renders while user is typing
 */
const VariableInput = memo(function VariableInput({
  varName,
  initialValue,
  placeholder,
  sanitizedId,
  onValueChange,
  onFocus,
  onBlur,
  onKeyDown,
  inputRef
}) {
  const internalRef = useRef(null)
  const isInitializedRef = useRef(false)
  const lastExternalValueRef = useRef(initialValue)
  
  // Only initialize once on mount, then ignore parent updates
  useEffect(() => {
    if (!isInitializedRef.current && internalRef.current) {
      internalRef.current.value = initialValue || ''
      isInitializedRef.current = true
      lastExternalValueRef.current = initialValue
    }
  }, [])
  
  // Only sync from parent if value changed AND textarea is empty or matches last known value
  // This prevents overwriting user input but allows reset/clear operations
  useEffect(() => {
    if (isInitializedRef.current && internalRef.current) {
      const currentVal = internalRef.current.value
      const lastKnown = lastExternalValueRef.current
      
      // Only update if:
      // 1. Field is empty and parent has a value, OR
      // 2. Current value matches what we last synced from parent (meaning no user edit)
      if ((currentVal === '' && initialValue) || currentVal === lastKnown) {
        if (initialValue !== lastKnown) {
          internalRef.current.value = initialValue || ''
          lastExternalValueRef.current = initialValue
        }
      }
    }
  }, [initialValue])

  // Expose ref to parent
  useEffect(() => {
    if (inputRef && internalRef.current) {
      inputRef(internalRef.current)
    }
  }, [inputRef])

  const handleInput = useCallback((e) => {
    const newValue = e.target.value
    lastExternalValueRef.current = newValue
    
    // Notify parent (debounced effect on parent side)
    if (onValueChange) {
      onValueChange(varName, newValue)
    }
    
    // Auto-resize (max 2 lines)
    const lines = (newValue.match(/\n/g) || []).length + 1
    e.target.style.height = lines <= 2 ? (lines === 1 ? '32px' : '52px') : '52px'
  }, [varName, onValueChange])

  const handleFocus = useCallback(() => {
    if (onFocus) onFocus(varName)
  }, [varName, onFocus])

  const handleBlur = useCallback(() => {
    if (onBlur) onBlur(varName)
  }, [varName, onBlur])

  const handleKeyDown = useCallback((e) => {
    if (onKeyDown) {
      const currentValue = internalRef.current?.value || ''
      onKeyDown(e, varName, currentValue)
    }
  }, [varName, onKeyDown])

  return (
    <textarea
      ref={internalRef}
      id={sanitizedId}
      name={sanitizedId}
      defaultValue={initialValue || ''}
      onInput={handleInput}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
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
      className="w-full min-h-[32px] border-2 input-rounded border-[#e6eef5] resize-none transition-all duration-200 text-sm px-2 py-1 leading-5"
      style={{ 
        height: '32px',
        maxHeight: '52px',
        overflow: 'hidden'
      }}
    />
  )
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if varName or placeholder changes
  // Ignore initialValue changes to prevent re-renders while typing
  return prevProps.varName === nextProps.varName && 
         prevProps.placeholder === nextProps.placeholder &&
         prevProps.sanitizedId === nextProps.sanitizedId
})

export default VariableInput
