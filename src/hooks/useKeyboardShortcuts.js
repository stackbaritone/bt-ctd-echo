import { useEffect } from 'react'
import { buildInitialVariables, applyAssignments } from '../utils/template.js'

export function useKeyboardShortcuts({
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
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl/Cmd + Enter: Copy all (main quick action)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'Enter') {
        e.preventDefault()
        if (selectedTemplate) {
          copyToClipboard('all')
        }
        return
      }

      // Ctrl/Cmd + J: Copy subject only
      if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
        e.preventDefault()
        if (selectedTemplate) {
          copyToClipboard('subject')
        }
      }

      // Ctrl/Cmd + /: Focus on search
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault()
        if (searchRef.current) {
          searchRef.current.focus()
        }
      }

      // Variables popup keyboard shortcuts (only when popup is open)
      if (showVariablePopup && selectedTemplate) {
        if (e.key === 'Escape') {
          e.preventDefault()
          setVarsMinimized(true)
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          setShowVariablePopup(false)
        }

        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
          e.preventDefault()
          if (templatesData) {
            const initialVars = buildInitialVariables(selectedTemplate, templatesData, templateLanguage)
            setVariables(prev => {
              const next = applyAssignments(prev, initialVars)
              if (next !== prev) {
                variablesRef.current = next
              }
              return next
            })
          }
        }

        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'v') {
          e.preventDefault()
          const clip = (navigator.clipboard && navigator.clipboard.readText) ? navigator.clipboard.readText() : Promise.resolve('')
          clip.then(text => handleVarsSmartPaste(text || ''))
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedTemplate, showVariablePopup, templatesData, templateLanguage, copyToClipboard, searchRef, variablesRef, setVariables, setVarsMinimized, setShowVariablePopup, handleVarsSmartPaste])
}
