/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.jsx'
import { Button } from './ui/button.jsx'
import { Textarea } from './ui/textarea.jsx'
import { Sparkles, Copy, CheckCircle, Lightbulb, Zap, Globe, ExternalLink, Info } from 'lucide-react'
import { resolveVariableValue as resolveCanonicalVar } from '../utils/variables'
import { sanitizeHtml } from '../utils/html'

const ACTIONS = {
  improve: { icon: Sparkles, color: 'from-slate-600 to-slate-700' },
  formal: { icon: Zap, color: 'from-slate-700 to-indigo-700' },
  friendly: { icon: Sparkles, color: 'from-emerald-600 to-teal-600' },
  concise: { icon: Zap, color: 'from-slate-500 to-slate-600' },
  grammar: { icon: CheckCircle, color: 'from-amber-600 to-orange-600' },
  translate: { icon: Globe, color: 'from-indigo-600 to-slate-600' },
  translateToEnglish: { icon: Globe, color: 'from-blue-600 to-slate-600' },
  emphasize: { icon: Sparkles, color: 'from-orange-600 to-red-600' },
  simplify: { icon: Lightbulb, color: 'from-green-600 to-teal-600' },
  persuasive: { icon: Zap, color: 'from-purple-600 to-indigo-600' },
  urgent: { icon: Zap, color: 'from-red-600 to-orange-600' },
  confident: { icon: Sparkles, color: 'from-blue-600 to-indigo-600' }
}

const TEXT = {
  fr: {
    headerTitle: 'Assistant de rédaction Copilot M365',
    headerSubtitle: 'Améliorez votre texte avec Copilot',
    quickStartTitle: 'Comment ça marche ?',
    quickStartSteps: [
      'Cliquez sur une action pour copier le prompt',
      'Ouvrez Copilot dans Edge, Word ou Outlook',
      'Collez et validez pour voir le résultat'
    ],
    edgeDetected: 'Edge détecté ! Ctrl+Shift+. pour Copilot',
    actionsTitle: 'Actions rapides',
    emptyState: "Sélectionnez un modèle pour utiliser Copilot",
    shortcutsTitle: 'Raccourcis utiles',
    shortcuts: [
      { label: 'Ouvrir Copilot (Edge)', combo: 'Ctrl+Shift+.' },
      { label: 'Copier le texte', combo: 'Ctrl+C' },
      { label: 'Coller le résultat', combo: 'Ctrl+V' }
    ],
    edgeButton: 'En savoir plus sur Edge Copilot',
    tip: 'Astuce : Les variables sont automatiquement conservées lorsque vous utilisez Copilot. Demandez des ajustements spécifiques si nécessaire.',
    copyAlertNoContent: "Veuillez d'abord sélectionner un modèle et saisir du contenu.",
    copyError: 'Impossible de copier dans le presse-papiers',
    edgeAlert: 'Appuyez sur Ctrl+Shift+. (Cmd+Shift+. sur Mac) pour ouvrir Copilot dans Edge',
    customPromptTitle: 'Instruction personnalisée',
    customPromptPlaceholder: 'Ajoutez ici une consigne spécifique (ex.: "Réduis à 80 mots en conservant un ton inspirant").',
    customPromptHelper: 'Copiée avec le contenu actuel.',
    customPromptButton: 'Copier avec ma consigne',
    customPromptFallback: 'Améliore ce texte selon la consigne suivante :',
    actions: {
      improve: { title: 'Améliorer', prompt: "Améliore ce texte pour le rendre plus professionnel et engageant sans modifier les variables existantes :" },
      formal: { title: 'Formel', prompt: "Rends ce texte plus formel et professionnel tout en conservant les variables :" },
      friendly: { title: 'Amical', prompt: "Rends ce texte plus chaleureux et amical tout en gardant un ton professionnel :" },
      concise: { title: 'Concis', prompt: "Rends ce texte plus concis et direct sans perdre d'information :" },
      grammar: { title: 'Corriger', prompt: "Corrige la grammaire, l'orthographe et la ponctuation sans modifier les variables :" },
      translate: { title: 'EN→FR', prompt: "Traduis ce texte de l'anglais vers le français en gardant un ton professionnel :" },
      translateToEnglish: { title: 'FR→EN', prompt: "Traduis ce texte du français vers l'anglais en gardant un ton professionnel :" },
      emphasize: { title: 'Emphase', prompt: "Réécris ce texte pour mettre en valeur les points clés de façon plus percutante :" },
      simplify: { title: 'Simplifier', prompt: "Simplifie ce texte pour le rendre plus clair et accessible :" },
      persuasive: { title: 'Persuasif', prompt: "Réécris ce texte pour le rendre plus convaincant et persuasif :" },
      urgent: { title: 'Urgent', prompt: "Réécris ce texte avec un ton urgent pour inciter à l'action :" },
      confident: { title: 'Confiant', prompt: "Réécris ce texte avec un ton plus confiant et assuré :" }
    }
  },
  en: {
    headerTitle: 'M365 Copilot Writing Assistant',
    headerSubtitle: 'Use Microsoft Copilot to enhance your email templates',
    quickStartTitle: 'How it works',
    quickStartSteps: [
      'Click an action below to copy the prompt',
      'Open Copilot in Edge, Word, or Outlook',
      'Paste the prompt and review the improved result'
    ],
    edgeDetected: 'Edge detected! Press Ctrl+Shift+. to open Copilot',
    actionsTitle: 'Quick actions',
    emptyState: 'Select a template and add content before using the Copilot assistant',
    shortcutsTitle: 'Helpful shortcuts',
    shortcuts: [
      { label: 'Open Copilot (Edge)', combo: 'Ctrl+Shift+.' },
      { label: 'Copy text', combo: 'Ctrl+C' },
      { label: 'Paste result', combo: 'Ctrl+V' }
    ],
    edgeButton: 'Learn more about Edge Copilot',
    tip: 'Tip: Your placeholders are preserved automatically. Feel free to ask Copilot for specific edits.',
    copyAlertNoContent: 'Select a template and add content before using the assistant.',
    copyError: 'Unable to copy to clipboard',
    edgeAlert: 'Press Ctrl+Shift+. (Cmd+Shift+. on Mac) to open Copilot in Edge',
    customPromptTitle: 'Custom instruction',
    customPromptPlaceholder: 'Add a specific instruction (e.g. “Rewrite in 80 words with a confident tone”).',
    customPromptHelper: 'Your instruction is copied along with the current email content.',
    customPromptButton: 'Copy with my instruction',
    customPromptFallback: 'Improve this text using the following instruction:',
    actions: {
      improve: { title: 'Improve tone', prompt: 'Improve this email so it sounds more professional and engaging without touching the placeholders:' },
      formal: { title: 'Make it formal', prompt: 'Rewrite this email with a formal, polished tone. Keep all placeholders intact:' },
      friendly: { title: 'Make it friendly', prompt: 'Make this email warmer and friendlier while staying professional:' },
      concise: { title: 'Make it concise', prompt: 'Tighten this email so it stays concise and to the point without losing key details:' },
      grammar: { title: 'Fix grammar', prompt: 'Fix grammar, spelling, and punctuation while leaving placeholders untouched:' },
      translate: { title: 'Translate EN→FR', prompt: 'Translate this English email into French with a professional tone:' },
      translateToEnglish: { title: 'Translate FR→EN', prompt: 'Translate this French email into English with a professional tone:' },
      emphasize: { title: 'Emphasize key points', prompt: 'Rewrite this email to emphasize key points more powerfully:' },
      simplify: { title: 'Simplify', prompt: 'Simplify this email to make it clearer and easier to understand:' },
      persuasive: { title: 'Make it persuasive', prompt: 'Rewrite this email to be more convincing and persuasive:' },
      urgent: { title: 'Urgent tone', prompt: 'Rewrite this email with an urgent tone to encourage action:' },
      confident: { title: 'Confident tone', prompt: 'Rewrite this email with a more confident and assertive tone:' }
    }
  }
}

const AISidebar = ({ emailText, onResult, variables, interfaceLanguage = 'fr', templateLanguage = 'fr' }) => {
  const [copiedPrompt, setCopiedPrompt] = useState(null)
  const [customPrompt, setCustomPrompt] = useState('')
  const [customCopied, setCustomCopied] = useState(false)
  const [isEdgeDetected, setIsEdgeDetected] = useState(false)

  const locale = interfaceLanguage?.toLowerCase() === 'en' ? 'en' : 'fr'
  const t = TEXT[locale]

  useEffect(() => {
    // Detect if user is on Microsoft Edge
    const userAgent = navigator.userAgent
    setIsEdgeDetected(userAgent.includes('Edg/'))
  }, [])

  const decodeHtmlEntities = (value = '') => String(value ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  const sanitizeResolvedValue = (value = '') => {
    const decoded = decodeHtmlEntities(value)
    const trimmed = decoded.trim()
    if (!trimmed) return ''
    return trimmed.replace(/[<>]/g, '')
  }

  const stripResidualAngleBrackets = (input = '') => {
    if (!input) return ''
    const htmlTagPattern = /^\/?\s*(?:div|p|br|span|strong|b|em|i|u|ul|ol|li|h[1-6]|table|tbody|thead|tr|td|th|a|img|section|article|header|footer)\b/i
    return String(input).replace(/<([^<>]+)>/g, (match, inner) => {
      if (htmlTagPattern.test(inner)) return match
      return inner
    })
  }

  const resolveVariableValue = (varName = '') => {
    if (!varName) return ''
    const resolved = resolveCanonicalVar(variables || {}, varName, templateLanguage) || ''
    if (resolved && resolved.trim().length) return sanitizeResolvedValue(resolved)
    const direct = variables?.[varName]
    if (direct && String(direct).trim().length) return sanitizeResolvedValue(direct)
    const lower = variables?.[String(varName).toLowerCase()]
    if (lower && String(lower).trim().length) return sanitizeResolvedValue(lower)
    return ''
  }

  const injectVariableValues = (text = '') => {
    if (!text) return ''
    return text.replace(/<<\s*([^<>]+?)\s*>>/g, (_, name) => {
      const value = resolveVariableValue(name)
      return value || `<<${name.trim()}>>`
    })
  }

  // Convert HTML with pills to plain text with variable markers
  const convertPillsToText = (htmlText) => {
    if (!htmlText) return ''

    const decodeHtml = decodeHtmlEntities

    const decodedRaw = decodeHtml(htmlText)

    // Normalize placeholders that use single angle brackets (e.g., <variable_name_FR>)
    const normalizedPlaceholders = decodedRaw.replace(/<([A-Za-z0-9-]*_[A-Za-z0-9-]*)>/g, '<<$1>>')

    // If text now contains properly formed <<placeholder>> tokens, preserve them as-is
    if (/<<\s*[^<>]+\s*>>/.test(normalizedPlaceholders)) {
      const cleaned = normalizedPlaceholders
        .replace(/<<\s*>>/g, '')
        .replace(/\s+\n/g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim()
      return stripResidualAngleBrackets(injectVariableValues(cleaned))
    }

    // Fallback: parse HTML and replace spans with data-var attributes
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = sanitizeHtml(htmlText)

    const normalizeValue = (value) => sanitizeResolvedValue(value)

    const toPlainText = (node) => {
      let text = ''
      if (!node) return text

      node.childNodes.forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
          text += child.textContent
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const varName = child.getAttribute('data-var')
          if (varName) {
            const resolvedValue = resolveVariableValue(varName)
            const pillValue = normalizeValue(child.getAttribute('data-display'))
              || normalizeValue(child.getAttribute('data-value'))
              || normalizeValue(child.textContent)
            const rendered = resolvedValue || pillValue || `<<${varName}>>`
            text += rendered
          } else if (child.tagName === 'BR') {
            text += '\n'
          } else {
            text += toPlainText(child)
          }
        }
      })

      return text
    }

    const fallbackText = toPlainText(tempDiv).replace(/\s+\n/g, '\n').replace(/\n{2,}/g, '\n').trim()
    return stripResidualAngleBrackets(injectVariableValues(fallbackText))
  }

  // Generate prompts with localized instructions
  const getPrompts = () => {
    const plainText = convertPillsToText(emailText)
    const prompts = {}
    Object.entries(ACTIONS).forEach(([key, meta]) => {
      const actionText = t.actions[key]
      if (!actionText) return
      prompts[key] = {
        title: actionText.title,
        icon: meta.icon,
        color: meta.color,
        prompt: `${actionText.prompt}\n\n${plainText}`
      }
    })
    return prompts
  }

  const copyPromptToClipboard = async (promptKey) => {
    if (!emailText || emailText.trim() === '') {
      alert(t.copyAlertNoContent)
      return
    }

    const prompts = getPrompts()
    const promptData = prompts[promptKey]
    try {
      await navigator.clipboard.writeText(promptData.prompt)
      setCopiedPrompt(promptKey)
      setTimeout(() => setCopiedPrompt(null), 2000)
    } catch (error) {
      console.error('Erreur de copie:', error)
      alert(t.copyError)
    }
  }

  const copyCustomPrompt = async () => {
    if (!emailText || emailText.trim() === '') {
      alert(t.copyAlertNoContent)
      return
    }

    const plainText = convertPillsToText(emailText)
    const instruction = customPrompt.trim() || t.customPromptFallback
    const payload = `${instruction}\n\n${plainText}`

    try {
      await navigator.clipboard.writeText(payload)
      setCustomCopied(true)
      setTimeout(() => setCustomCopied(false), 2000)
    } catch (error) {
      console.error('Erreur de copie:', error)
      alert(t.copyError)
    }
  }

  const openEdgeCopilot = () => {
    // This will attempt to open Edge Copilot sidebar (works in Edge browser)
    if (isEdgeDetected) {
      alert(t.edgeAlert)
    } else {
      window.open('https://www.microsoft.com/edge/features/copilot', '_blank')
    }
  }

  return (
    <div className="h-full flex flex-col space-y-3">
      {/* Header */}
      <Card className="bg-white/98 border border-slate-100 rounded-lg shadow-sm">
        <CardHeader className="p-3">
          <CardTitle className="text-sm font-semibold text-gray-800 flex items-center">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-700 mr-2.5">
              <Sparkles className="h-4 w-4 text-slate-600" />
            </div>
            <div>
              <div className="leading-tight">{t.headerTitle}</div>
              <p className="text-xs font-normal text-gray-500 mt-0.5">
                {t.headerSubtitle}
              </p>
            </div>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Quick Start Guide */}
      <Card className="bg-white/98 border border-slate-100 rounded-lg shadow-sm">
        <CardContent className="p-3 flex items-center">
          <div className="flex items-start space-x-2.5">
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center mt-3">
              <Lightbulb className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-xs text-gray-800 mb-1.5 mt-3">{t.quickStartTitle}</h3>
              <ol className="text-xs text-gray-600 space-y-1">
                {t.quickStartSteps.map((step, index) => (
                  <li key={step} className="flex items-start">
                    <span className="font-semibold text-blue-600 mr-1.5 text-xs">{index + 1}.</span>
                    <span className="text-xs">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {isEdgeDetected && (
            <div className="mt-2.5 p-2 bg-green-50 border border-green-200 rounded-lg flex items-start space-x-2">
              <CheckCircle className="h-3.5 w-3.5 text-green-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-green-800">{t.edgeDetected}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Card className="bg-white/98 border border-slate-100 rounded-lg shadow-sm flex-1 overflow-hidden">
        <CardContent className="p-3 h-full overflow-y-auto">
          <h3 className="font-semibold text-xs text-gray-800 mb-2.5 pt-2 flex items-center">
            <Zap className="h-3.5 w-3.5 mr-1.5 text-slate-600" />
            {t.actionsTitle}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(getPrompts()).map(([key, data]) => {
              const Icon = data.icon
              const isCopied = copiedPrompt === key
              return (
                <Button
                  key={key}
                  onClick={() => copyPromptToClipboard(key)}
                  className={`h-10 w-full rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 justify-center group hover:bg-slate-50 transition-colors transition-transform transform hover:-translate-y-0.5 hover:shadow-sm`}
                  disabled={!emailText || emailText.trim() === ''}
                >
                  <div className="flex items-center">
                    <Icon className="h-4 w-4 mr-2 text-slate-500 group-hover:text-slate-700" />
                    <span>{data.title}</span>
                  </div>
                  <div className="flex items-center absolute right-2">
                    {isCopied ? (
                      <>
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-emerald-600 text-xs ml-2">Copied</span>
                      </>
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </Button>
              )
            })}
          </div>

          {(!emailText || emailText.trim() === '') && (
            <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start space-x-2">
                <Info className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800">{t.emptyState}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Custom Prompt */}
      <Card className="bg-white/98 border border-slate-100 rounded-lg shadow-sm">
        <CardContent className="p-3 space-y-2.5">
          <h3 className="font-semibold text-xs text-gray-800 pt-2 flex items-center">
            <Sparkles className="h-3.5 w-3.5 mr-1.5 text-slate-600" />
            {t.customPromptTitle}
          </h3>
          <Textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder={t.customPromptPlaceholder}
            className="min-h-[50px] text-xs resize-none"
          />
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span className="text-xs">{t.customPromptHelper}</span>
            <span className="text-xs text-gray-400">{customPrompt.length}/280</span>
          </div>
          <Button
            onClick={copyCustomPrompt}
            disabled={!emailText || emailText.trim() === ''}
            className="w-full h-9 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs flex items-center justify-center gap-2 transition-transform transform hover:-translate-y-0.5 hover:shadow-sm"
          >
            {customCopied ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {t.customPromptButton}
          </Button>
        </CardContent>
      </Card>


    </div>
  )
}

export default AISidebar
