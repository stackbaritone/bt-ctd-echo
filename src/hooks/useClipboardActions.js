import { useCallback } from 'react'
import { resolveVariableValue } from '../utils/variables'
import { sanitizeHtml } from '../utils/html.js'

/**
 * Hook for clipboard operations: copy subject/body/all, copy link, export.
 * Reads from refs to guarantee latest values without stale closures.
 */
export function useClipboardActions({
  variablesRef,
  variables,
  finalSubjectRef,
  finalBodyRef,
  finalSubject,
  finalBody,
  bodyEditorRef,
  subjectEditorRef,
  templateLanguageRef,
  templateLanguage,
  selectedTemplate,
  setCopySuccess,
  toast,
}) {
  const toSimpleHtml = (plain = '') => String(plain ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n/g, '<br>')

  const replaceVariablesWithValues = useCallback((text, overrideValues) => {
    if (!text) return ''
    const sourceValues = overrideValues || variablesRef.current || {}
    const language = (templateLanguageRef.current || templateLanguage || 'fr')
    return String(text ?? '').replace(/<<([^>]+)>>/g, (match, varName) => {
      const resolved = resolveVariableValue(sourceValues, varName, language)
      if (resolved === '__DELETED__') return ''
      if (resolved && resolved.trim().length) return resolved
      const direct = sourceValues[varName]
      if (direct !== undefined && direct !== null) {
        const asString = String(direct)
        if (asString === '__DELETED__') return ''
        if (asString.trim().length) return asString
      }
      return match
    })
  }, [templateLanguage])

  const replaceVariablesInHTML = (htmlText, values, fallbackPlainText = '') => {
    if (!htmlText) {
      return { html: '', text: fallbackPlainText || '' }
    }

    const ensureHtmlString = (input = '') => {
      const raw = String(input ?? '')
      if (!raw.trim()) return ''
      if (/[<>&]/.test(raw) && /<\/?[a-z]/i.test(raw)) return raw
      return String(raw)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\r\n|\r/g, '\n')
        .replace(/\n/g, '<br>')
    }

    const wrapper = document.createElement('div')
    wrapper.innerHTML = ensureHtmlString(htmlText)

    const makeOutlookFriendly = (element) => {
      element.querySelectorAll('*').forEach((el) => {
        if (['BR', 'HR'].includes(el.tagName)) return
        const computedStyle = window.getComputedStyle(el)
        let newStyle = ''
        const fontSize = computedStyle.fontSize
        if (fontSize && fontSize !== '16px' && fontSize !== '14px') newStyle += `font-size: ${fontSize}; `
        const color = computedStyle.color
        const colorRgb = color.replace(/\s/g, '')
        if (color && colorRgb !== 'rgb(0,0,0)' && colorRgb !== 'rgba(0,0,0,1)') newStyle += `color: ${color}; `
        const bgColor = computedStyle.backgroundColor
        const bgColorRgb = bgColor.replace(/\s/g, '')
        if (bgColor && bgColorRgb !== 'rgba(0,0,0,0)' && bgColorRgb !== 'transparent' && bgColorRgb !== 'rgb(255,255,255)' && bgColorRgb !== 'rgba(255,255,255,1)') newStyle += `background-color: ${bgColor}; `
        const fontWeight = computedStyle.fontWeight
        if (fontWeight && (fontWeight === 'bold' || parseInt(fontWeight) >= 700)) newStyle += `font-weight: bold; `
        const fontStyle = computedStyle.fontStyle
        if (fontStyle === 'italic') newStyle += `font-style: italic; `
        const textDecoration = computedStyle.textDecoration
        if (textDecoration && !textDecoration.includes('none')) newStyle += `text-decoration: ${textDecoration}; `
        const fontFamily = computedStyle.fontFamily
        if (fontFamily && fontFamily !== 'Arial' && !fontFamily.startsWith('-apple-system')) newStyle += `font-family: ${fontFamily}; `
        if (newStyle) el.setAttribute('style', newStyle.trim())
      })
      element.querySelectorAll('ul, ol').forEach((list) => {
        const s = list.getAttribute('style') || ''
        list.setAttribute('style', s + ' margin: 0; padding-left: 40px;')
      })
      element.querySelectorAll('li').forEach((li) => {
        const s = li.getAttribute('style') || ''
        li.setAttribute('style', s + ' margin: 0; padding: 0;')
      })
    }

    makeOutlookFriendly(wrapper)

    wrapper.querySelectorAll('br[data-line-break]').forEach((node) => {
      node.removeAttribute('data-line-break')
    })

    const cssEscape = (value = '') => {
      try {
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
      } catch {}
      return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&')
    }

    const convertValueToHtml = (value = '') => {
      const raw = String(value ?? '')
      if (/<[a-z][\s\S]*>/i.test(raw)) return raw.replace(/\r\n|\r/g, '\n').replace(/\n/g, '<br>')
      return raw
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\r\n|\r/g, '\n')
        .replace(/\n/g, '<br>')
    }

    const stripPillMetadata = (element) => {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) return
      element.classList?.remove('var-pill', 'filled', 'empty', 'focused')
      if (element.classList && element.classList.length === 0) element.removeAttribute('class')
      const attrsToRemove = ['data-var', 'data-value', 'data-display', 'data-template', 'contenteditable', 'spellcheck']
      attrsToRemove.forEach(attr => element.removeAttribute(attr))
      Array.from(element.children || []).forEach(stripPillMetadata)
    }

    const setCloneContent = (target, htmlString = '') => {
      target.innerHTML = ''
      if (!htmlString) return
      const frag = document.createRange().createContextualFragment(htmlString)
      target.appendChild(frag)
    }

    const PILL_TEMPLATE_TOKEN = '__RT_PILL_VALUE__'

    Object.entries(values || {}).forEach(([varName, value]) => {
      const nodes = wrapper.querySelectorAll(`[data-var="${cssEscape(varName)}"]`)
      nodes.forEach((node) => {
        const replacementValue = (value !== undefined && value !== null && String(value).length)
          ? String(value)
          : `<<${varName}>>`
        const placeholder = `<<${varName}>>`
        const pillClone = node.cloneNode(false)
        const injectAndReplace = (htmlString) => {
          setCloneContent(pillClone, htmlString)
          stripPillMetadata(pillClone)
          node.replaceWith(pillClone)
        }
        const template = node.getAttribute('data-template') || node.dataset?.template
        if (template && replacementValue !== placeholder) {
          const sanitized = convertValueToHtml(replacementValue)
          const applied = template.replace(PILL_TEMPLATE_TOKEN, sanitized)
          injectAndReplace(applied)
        } else if (node.innerHTML && replacementValue !== placeholder) {
          injectAndReplace(node.innerHTML)
        } else {
          pillClone.textContent = replacementValue
          stripPillMetadata(pillClone)
          node.replaceWith(pillClone)
        }
      })
    })

    makeOutlookFriendly(wrapper)

    const htmlResult = wrapper.innerHTML
    if (fallbackPlainText) return { html: htmlResult, text: fallbackPlainText }
    const plainText = wrapper.innerText.replace(/\r\n/g, '\n')
    return { html: htmlResult, text: plainText }
  }

  const replaceVariables = (text) => replaceVariablesWithValues(text)

  // Resolve all refs to latest values
  const getLatest = () => {
    const latestVariables = variablesRef.current || variables || {}
    const subjectSource = finalSubjectRef.current ?? finalSubject
    const bodySource = finalBodyRef.current ?? finalBody
    const resolvedSubject = replaceVariablesWithValues(subjectSource, latestVariables)
    const resolvedBodyText = replaceVariablesWithValues(bodySource, latestVariables)
    const bodyHtmlSource = bodyEditorRef.current?.getHtml?.() ?? bodySource
    const subjectHtmlSource = subjectEditorRef.current?.getHtml?.() ?? toSimpleHtml(resolvedSubject)
    const bodyResult = replaceVariablesInHTML(bodyHtmlSource, latestVariables, resolvedBodyText)
    const subjectResult = replaceVariablesInHTML(subjectHtmlSource, latestVariables, resolvedSubject)
    return { latestVariables, resolvedSubject, resolvedBodyText, bodyResult, subjectResult }
  }

  const copyToClipboard = async (type = 'all') => {
    let htmlContent = ''
    let textContent = ''

    const { resolvedSubject, bodyResult, subjectResult } = getLatest()

    switch (type) {
      case 'subject':
        htmlContent = subjectResult.html || toSimpleHtml(resolvedSubject)
        textContent = resolvedSubject
        break
      case 'body':
        htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin: 0; padding: 0;"><div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #000000;">${bodyResult.html}</div></body></html>`
        textContent = bodyResult.text
        break
      case 'all':
      default:
        htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin: 0; padding: 0;"><div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #000000;"><div><strong>${subjectResult.html || toSimpleHtml(resolvedSubject)}</strong></div><br><div>${bodyResult.html}</div></div></body></html>`
        textContent = `${resolvedSubject}\n\n${bodyResult.text}`
        break
    }

    try {
      if (navigator.clipboard && window.isSecureContext) {
        const clipboardItem = new ClipboardItem({
          'text/html': new Blob([htmlContent], { type: 'text/html' }),
          'text/plain': new Blob([textContent], { type: 'text/plain' })
        })
        await navigator.clipboard.write([clipboardItem])
      } else {
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = sanitizeHtml(htmlContent)
        tempDiv.style.position = 'fixed'
        tempDiv.style.left = '-999999px'
        tempDiv.style.top = '-999999px'
        document.body.appendChild(tempDiv)
        const range = document.createRange()
        range.selectNodeContents(tempDiv)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
        document.execCommand('copy')
        selection.removeAllRanges()
        document.body.removeChild(tempDiv)
      }
      setCopySuccess(type)
      setTimeout(() => setCopySuccess(null), 2000)
    } catch (error) {
      console.error('Copy error:', error)
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(textContent)
        } else {
          const textArea = document.createElement('textarea')
          textArea.value = textContent
          textArea.style.position = 'fixed'
          textArea.style.left = '-999999px'
          textArea.style.top = '-999999px'
          document.body.appendChild(textArea)
          textArea.focus()
          textArea.select()
          document.execCommand('copy')
          textArea.remove()
        }
        setCopySuccess(type)
        setTimeout(() => setCopySuccess(null), 2000)
      } catch (finalError) {
        console.error('All copy methods failed:', finalError)
        alert('Copy failed. Please select the text manually and use Ctrl+C.')
      }
    }
  }

  const copyTemplateLink = async () => {
    if (!selectedTemplate) return
    const currentUrl = window.location.origin + window.location.pathname
    const templateUrl = `${currentUrl}?id=${selectedTemplate.id}&lang=${templateLanguage}`
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(templateUrl)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = templateUrl
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        document.execCommand('copy')
        textArea.remove()
      }
      setCopySuccess('link')
      setTimeout(() => setCopySuccess(null), 2000)
    } catch (error) {
      console.error('Link copy error:', error)
      alert('Link copy error. Please copy the URL manually from the address bar.')
    }
  }

  const exportAs = async (mode) => {
    const { resolvedSubject, resolvedBodyText, bodyResult, subjectResult } = getLatest()
    const cleanBodyHtml = bodyResult.html || ''

    if (mode === 'eml') {
      const boundary = '----=_NextPart_000_0000_01DA1234.56789ABC'
      const eml = [
        `Subject: ${resolvedSubject}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        bodyResult.text || '',
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin: 0; padding: 0;">${cleanBodyHtml}</body></html>`,
        '',
        `--${boundary}--`
      ].join('\r\n')
      const blob = new Blob([eml], { type: 'message/rfc822' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(resolvedSubject || 'email').replace(/[^a-z0-9]/gi, '_')}.eml`
      a.click()
      URL.revokeObjectURL(url)
      return
    }

    if (mode === 'html') {
      const htmlDoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${resolvedSubject || 'Document'}</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:2em auto;padding:2em;line-height:1.6}h1{color:#2c3d50;border-bottom:2px solid #2c3d50;padding-bottom:.5em}</style></head><body><h1>${subjectResult.html || resolvedSubject || 'Untitled'}</h1>${bodyResult.html}</body></html>`
      const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${resolvedSubject || 'email'}.html`
      a.click()
      URL.revokeObjectURL(url)
      return
    }

    if (mode === 'copy-html') {
      try {
        if (navigator.clipboard && navigator.clipboard.write) {
          const blob = new Blob([bodyResult.html], { type: 'text/html' })
          const item = new ClipboardItem({ 'text/html': blob })
          await navigator.clipboard.write([item])
        } else {
          await navigator.clipboard.writeText(bodyResult.html)
        }
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 1500)
      } catch (e) {
        console.error('Copy HTML failed', e)
        alert('Copy HTML failed. Please try again or use the HTML export option.')
      }
      return
    }

    if (mode === 'word') {
      const wordHtml = `<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${resolvedSubject || 'Document'}</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]--><style>body{font-family:'Calibri','Arial',sans-serif;font-size:11pt;line-height:1.5;margin:1in}h1{font-size:16pt;font-weight:bold;margin-bottom:12pt;color:#2c3d50;border-bottom:2px solid #2c3d50;padding-bottom:8pt}p{margin:0 0 10pt 0}strong,b{font-weight:bold!important}em,i{font-style:italic!important}u{text-decoration:underline!important}s,strike{text-decoration:line-through!important}ul,ol{margin:10pt 0;padding-left:40pt}li{margin:5pt 0}[style*="background-color"]{background-color:inherit!important}[style*="color"]{color:inherit!important}[style*="font-weight"]{font-weight:inherit!important}[style*="font-style"]{font-style:inherit!important}[style*="text-decoration"]{text-decoration:inherit!important}[style*="font-size"]{font-size:inherit!important}</style></head><body><h1>${resolvedSubject || 'Untitled'}</h1>${cleanBodyHtml}</body></html>`
      const blob = new Blob([wordHtml], { type: 'application/msword' })
      const url = URL.createObjectURL(blob)
      const filename = `${(resolvedSubject || 'document').replace(/[^a-z0-9]/gi, '_')}.doc`
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => {
        if (templateLanguage === 'fr') {
          toast.success(`📄 Fichier téléchargé: ${filename}\n\nOuvrez le fichier depuis vos Téléchargements pour l'ouvrir dans Word.`, 5000)
        } else {
          toast.success(`📄 File downloaded: ${filename}\n\nOpen the file from your Downloads folder to launch it in Word.`, 5000)
        }
        URL.revokeObjectURL(url)
      }, 500)
      return
    }

    if (mode === 'docx') {
      const mhtmlDoc = `MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="----=_NextPart_000_0000"\r\n\r\n------=_NextPart_000_0000\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: quoted-printable\r\nContent-Location: file:///C:/document.html\r\n\r\n<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset='utf-8'><title>${(resolvedSubject || 'Document').replace(/"/g, '&quot;')}</title><style>body{font-family:'Calibri','Arial',sans-serif;font-size:11pt;line-height:1.5;margin:1in}h1{font-size:16pt;font-weight:bold;margin-bottom:12pt;color:#2c3d50;border-bottom:2px solid #2c3d50;padding-bottom:8pt}p{margin:0 0 10pt 0}[style*="background-color"]{background-color:inherit!important}[style*="color"]{color:inherit!important}[style*="font-weight"]{font-weight:inherit!important}[style*="font-style"]{font-style:inherit!important}[style*="text-decoration"]{text-decoration:inherit!important}[style*="font-size"]{font-size:inherit!important}</style></head><body><h1>${resolvedSubject || 'Untitled'}</h1>${cleanBodyHtml}</body></html>\r\n\r\n------=_NextPart_000_0000--`
      const blob = new Blob([mhtmlDoc], { type: 'application/msword' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(resolvedSubject || 'document').replace(/[^a-z0-9]/gi, '_')}.doc`
      a.click()
      URL.revokeObjectURL(url)
      return
    }

    if (mode === 'pdf') {
      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        alert('Please allow pop-ups to export as PDF')
        return
      }
      const printHtml = `<!DOCTYPE html><html><head><meta charset='utf-8'><title>${resolvedSubject || 'Document'}</title><style>@media print{@page{margin:1in;size:letter}body{margin:0;padding:0}}body{font-family:'Calibri','Arial',sans-serif;font-size:11pt;line-height:1.6;color:#000;max-width:8.5in;margin:0 auto;padding:1in}h1{font-size:18pt;font-weight:bold;margin-bottom:16pt;color:#2c3d50;border-bottom:2px solid #2c3d50;padding-bottom:8pt}p{margin:0 0 12pt 0}strong,b{font-weight:bold!important}em,i{font-style:italic!important}u{text-decoration:underline!important}s,strike{text-decoration:line-through!important}ul,ol{margin:10pt 0;padding-left:40pt}li{margin:5pt 0}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}[style*="background-color"],[style*="background"],span[style],mark[style]{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}</style></head><body><h1>${resolvedSubject || 'Untitled Document'}</h1>${cleanBodyHtml}<script>window.onload=function(){window.print();setTimeout(function(){window.close()},100)}<\/script></body></html>`
      printWindow.document.write(printHtml)
      printWindow.document.close()
      return
    }

    if (mode === 'copy-text') {
      try {
        const plainText = `${resolvedSubject ? resolvedSubject + '\n\n' : ''}${bodyResult.text}`
        await navigator.clipboard.writeText(plainText)
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 1500)
      } catch (e) {
        console.error('Copy text failed', e)
        alert('Copy failed. Please try again.')
      }
      return
    }
  }

  return {
    replaceVariablesWithValues,
    replaceVariablesInHTML,
    replaceVariables,
    copyToClipboard,
    copyTemplateLink,
    exportAs,
  }
}
