import { sanitizeHtml } from './html'

// Helper function to strip rich text formatting while preserving variable pills
export const stripRichTextForSync = (htmlText = '') => {
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
export const extractVariablesFromPills = (htmlText = '') => {
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
export const parseTemplateStructure = (tpl) => {
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
export const computeVarRangesInText = (text, tpl) => {
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

export const extractVariablesFromTemplate = (text = '', templateText = '', variableNames = []) => {
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

export const extractVariableWithAnchors = (text = '', templateText = '', varName = '') => {
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

export const normalizeForMatching = (value = '') => {
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
