import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LifeBuoy, Lightbulb, BookOpen, AlertTriangle, MessageCircle, ExternalLink, Mail, X, CheckCircle2, Loader2, Copy, Star, Shield, Sparkles, Settings, ArrowUp, FileText, Users } from 'lucide-react'
import { Button } from './ui/button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.jsx'
import { ScrollArea } from './ui/scroll-area.jsx'
import { Separator } from './ui/separator.jsx'
import { Input } from './ui/input.jsx'
import { Textarea } from './ui/textarea.jsx'
import { helpTranslations as translations } from '../constants/helpTranslations.js'

// Reusable section: filters bullet points by search query, renders with icon header
function FilteredBulletSection({ id, icon, title, points, query }) {
  if (!points?.length) return null
  const filtered = points.filter(p => !query || p.toLowerCase().includes(query.toLowerCase()))
  if (filtered.length === 0) return null
  return (
    <section id={id}>
      <SectionHeader icon={icon} title={title} />
      <ul className="mt-4 space-y-2 text-sm text-slate-700">
        {filtered.map((p, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#1f8a99]" aria-hidden="true" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function SectionHeader({ icon: Icon, title, description }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-lg border border-[#bfe7e3] bg-[#f0fbfb] text-[#145a64]">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-[#123a45]">{title}</h3>
        {description ? <p className="text-sm text-slate-600">{description}</p> : null}
      </div>
    </div>
  )
}

export default function HelpCenter({ language = 'fr', onClose, supportEmail = 'echo-info@bt-tb.ca', contactEndpoint }) {
  const strings = useMemo(() => translations[language] || translations.fr, [language])
  const contactOptions = strings.contact?.options || []
  const closeBtnRef = useRef(null)
  const contactFormRef = useRef(null)
  const scrollAreaRef = useRef(null)
  const [query, setQuery] = useState('')
  const [showBackToTop, setShowBackToTop] = useState(false)
  
  // Back to Top button text
  const backToTopText = language === 'fr' ? 'Retour en haut' : 'Back to top'

  // Check URL for initial category
  const initialCategory = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const cat = params.get('category')
      if (cat && contactOptions.some(opt => opt.value === cat)) {
        return cat
      }
    } catch {}
    return contactOptions[0]?.value || 'support'
  }, [contactOptions])

  // Direct-to-form mode: when opening directly to template submission, show only the form
  const formOnly = initialCategory === 'template'
  
  const [formData, setFormData] = useState(() => ({
    category: initialCategory,
    name: '',
    email: '',
    message: '',
    extra: ''
  }))
  const [templateDetails, setTemplateDetails] = useState({
    templateType: 'new', // 'new' | 'modify'
    existingId: '',
    languages: { fr: false, en: false },
    titleFr: '',
    titleEn: '',
    category: '',
    audience: '',
    context: '',
    variablePlan: '',
    examples: '',
    deadline: ''
  })
  const [status, setStatus] = useState('idle')
  const [errors, setErrors] = useState({})

  // Endpoint resolution chain:
  // 1. Explicit prop (contactEndpoint)
  // 2. Env variable VITE_SUPPORT_FORM_ENDPOINT
  // 3. Web3Forms with env key VITE_WEB3FORMS_KEY (free, 250/month)
  // If all fail we will offer a manual mailto fallback on error.
  const web3FormsKey = import.meta.env?.VITE_WEB3FORMS_KEY || ''
  const envEndpoint = (() => {
    try {
      const v = import.meta?.env?.VITE_SUPPORT_FORM_ENDPOINT
      if (typeof v === 'string' && v.trim()) return v.trim()
    } catch {}
    return null
  })()
  const activeEndpoint = contactEndpoint || envEndpoint || 'https://api.web3forms.com/submit'
  const submissionUrl = activeEndpoint
  const selectedCategory = contactOptions.find((option) => option.value === formData.category) || contactOptions[0] || null
  const isSubmitting = status === 'submitting'
  const feedbackMessage = status === 'success'
    ? strings.contact.form.successMessage
    : status === 'error'
      ? strings.contact.form.errorMessage()
      : ''

  useEffect(() => {
    if (!selectedCategory && contactOptions[0]) {
      setFormData((prev) => ({ ...prev, category: contactOptions[0].value }))
    }
  }, [selectedCategory, contactOptions])

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
      }
    }

    document.addEventListener('keydown', handleKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    requestAnimationFrame(() => {
      // If template category is pre-selected, scroll to contact form immediately
      if (initialCategory === 'template' && contactFormRef.current) {
        setTimeout(() => {
          contactFormRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' })
        }, 50)
      } else {
        closeBtnRef.current?.focus()
      }
    })

    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose, initialCategory])

  // Handle scroll tracking for Back to Top button
  const handleScroll = useCallback((e) => {
    const scrollTop = e?.target?.scrollTop || 0
    setShowBackToTop(scrollTop > 200)
  }, [])

  // Scroll to top function
  const scrollToTop = useCallback(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
    if (viewport) {
      viewport.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [])

  // Attach scroll listener to ScrollArea viewport
  useEffect(() => {
    const container = scrollAreaRef.current
    if (!container) return

    const viewport = container.querySelector('[data-radix-scroll-area-viewport]')
    if (!viewport) return

    viewport.addEventListener('scroll', handleScroll)
    return () => viewport.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const handleCategorySelect = (value) => {
    setFormData((prev) => ({ ...prev, category: value }))
    if (status !== 'idle') {
      setStatus('idle')
    }
  }

  const handleFieldChange = (field) => (event) => {
    const value = event.target.value
    setFormData((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
    if (status !== 'idle') {
      setStatus('idle')
    }
  }

  const resetAfterSuccess = () => {
    setStatus('idle')
    setErrors({})
    setFormData((prev) => ({
      ...prev,
      message: '',
      extra: ''
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (isSubmitting) return

    const validationErrors = {}
    if (!formData.name.trim()) {
      validationErrors.name = strings.contact.form.validation.nameRequired
    }
    const emailValue = formData.email.trim()
    if (!emailValue || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      validationErrors.email = strings.contact.form.validation.emailRequired
    }
    if (!formData.message.trim()) {
      validationErrors.message = strings.contact.form.validation.messageRequired
    }

    // Additional validation for template submissions
    if (formData.category === 'template') {
      if (!templateDetails.languages.fr && !templateDetails.languages.en) {
        validationErrors.languages = language === 'fr'
          ? 'Choisissez au moins une langue (FR ou EN).'
          : 'Choose at least one language (FR or EN).'
      }
      if (!templateDetails.templateType) {
        validationErrors.templateType = language === 'fr' ? 'Sélectionnez le type.' : 'Select the type.'
      }
      if (templateDetails.templateType === 'modify' && !templateDetails.existingId.trim()) {
        validationErrors.existingId = language === 'fr' ? 'Indiquez l’ID ou le nom du modèle existant.' : 'Provide the existing template ID or name.'
      }
    }

    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors)
      return
    }

    setStatus('submitting')

    try {
      const payload = {
        category: formData.category,
        categoryLabel: selectedCategory?.label || formData.category,
        name: formData.name.trim(),
        email: emailValue,
        message: formData.message.trim(),
        extra: formData.extra.trim(),
        language,
        submittedAt: new Date().toISOString(),
        product: 'ECHO-BT-CTD'
      }

      if (formData.category === 'template') {
        payload.templateDetails = {
          type: templateDetails.templateType,
          existingId: templateDetails.existingId || undefined,
          languages: Object.keys(templateDetails.languages).filter((k) => templateDetails.languages[k]),
          titleFr: templateDetails.titleFr || undefined,
          titleEn: templateDetails.titleEn || undefined,
          category: templateDetails.category || undefined,
          audience: templateDetails.audience || undefined,
          context: templateDetails.context || undefined,
          variablePlan: templateDetails.variablePlan || undefined,
          examples: templateDetails.examples || undefined,
          deadline: templateDetails.deadline || undefined
        }
      }

      // Try to submit via fetch (Web3Forms API)
      const response = await fetch(submissionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          access_key: web3FormsKey,
          ...payload,
          from_name: payload.name,
          subject: `ECHO Support: ${payload.category}`
        })
      })

      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`)
      }

      setStatus('success')
      setErrors({})
      setFormData((prev) => ({
        ...prev,
        message: '',
        extra: ''
      }))
      setTemplateDetails({
        templateType: 'new',
        existingId: '',
        languages: { fr: false, en: false },
        titleFr: '',
        titleEn: '',
        category: '',
        audience: '',
        context: '',
        variablePlan: '',
        examples: '',
        deadline: ''
      })
    } catch (error) {
      console.error('Contact form submission failed:', error)
      
      // Show error status without opening email client
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-centre-title"
        className="relative z-10 flex w-full max-w-4xl flex-col border-0 bg-white shadow-2xl"
        style={{ borderRadius: '0', height: '100vh', maxHeight: '100vh' }}
      >
        <CardHeader className="flex flex-row items-start justify-between m-0 p-0">
          <div className="m-0 p-0">
            <CardTitle id="help-centre-title" className="text-xl font-bold text-[#0f2c33] m-0 p-2">
              {strings.title}
            </CardTitle>
            <p className="text-xs text-slate-600 m-0 p-2 pt-0">{strings.subtitle}</p>
          </div>
          <Button
            ref={closeBtnRef}
            variant="ghost"
            onClick={onClose}
            className="h-9 w-9 rounded-sm m-0 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300"
            aria-label={strings.contact.close}
          >
            <span className="text-xl leading-none font-bold select-none" aria-hidden="true">×</span>
          </Button>
        </CardHeader>
        <CardContent className="flex-1 m-0 p-0" style={{ minHeight: 0 }}>
          <ScrollArea ref={scrollAreaRef} className="h-full w-full">
            <div className={formOnly ? "px-2 py-2 m-0" : "space-y-4 px-2 py-0 m-0"}>
              {formOnly ? null : (
              <>
              <div className="flex flex-col gap-2 border-b border-[#e6eef5] bg-transparent md:flex-row md:items-center md:justify-between m-0 p-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-700">
                  <a href="#quickstart" className="font-semibold text-[#145a64] hover:underline px-2 py-1">{strings.quickStart.heading}</a>
                  {strings.sections?.templateTypes ? (
                    <a href="#templateTypes" className="font-semibold text-[#145a64] hover:underline px-2 py-1">{strings.sections.templateTypes.heading}</a>
                  ) : null}
                  {strings.sections?.modes ? (
                    <a href="#modes" className="font-semibold text-[#145a64] hover:underline px-2 py-1">{strings.sections.modes.heading}</a>
                  ) : null}
                  {strings.sections?.copilot ? (
                    <a href="#copilot" className="font-semibold text-[#145a64] hover:underline px-2 py-1">{strings.sections.copilot.heading}</a>
                  ) : null}
                  {strings.sections?.variables ? (
                    <a href="#variables" className="font-semibold text-[#145a64] hover:underline px-2 py-1">{strings.sections.variables.heading}</a>
                  ) : null}
                  {strings.sections?.popout ? (
                    <a href="#popout" className="font-semibold text-[#145a64] hover:underline px-2 py-1">{strings.sections.popout.heading}</a>
                  ) : null}
                  {strings.sections?.copying ? (
                    <a href="#copying" className="font-semibold text-[#145a64] hover:underline px-2 py-1">{strings.sections.copying.heading}</a>
                  ) : null}
                  {strings.sections?.favorites ? (
                    <a href="#favorites" className="font-semibold text-[#145a64] hover:underline px-2 py-1">{strings.sections.favorites.heading}</a>
                  ) : null}
                  {strings.sections?.shortcuts ? (
                    <a href="#shortcuts" className="font-semibold text-[#145a64] hover:underline px-2 py-1">{strings.sections.shortcuts.heading}</a>
                  ) : null}
                  {strings.sections?.admin ? (
                    <a href="#admin" className="font-semibold text-[#145a64] hover:underline px-2 py-1">{strings.sections.admin.heading}</a>
                  ) : null}
                  {strings.sections?.privacy ? (
                    <a href="#privacy" className="font-semibold text-[#145a64] hover:underline px-2 py-1">{strings.sections.privacy.heading}</a>
                  ) : null}
                </div>
                <div className="md:w-60 flex items-center gap-2">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={language === 'fr' ? "Rechercher dans l'aide…" : 'Search the help…'}
                    className="h-7 text-xs px-2"
                  />
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      className="text-xs text-slate-500 hover:text-slate-700 whitespace-nowrap"
                      aria-label={language === 'fr' ? 'Effacer' : 'Clear'}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              {(() => {
                const filtered = strings.quickStart.bullets.filter((item) => !query || item.toLowerCase().includes(query.toLowerCase()))
                if (filtered.length === 0) return null
                return (
                  <section id="quickstart">
                    <SectionHeader
                      icon={Lightbulb}
                      title={strings.quickStart.heading}
                      description={strings.quickStart.description}
                    />
                    <ul className="mt-4 space-y-2 text-sm text-slate-700">
                      {filtered.map((item, index) => (
                        <li key={index} className="flex gap-3">
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#1f8a99]" aria-hidden="true" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })()}
              <FilteredBulletSection id="templateTypes" icon={FileText} title={strings.sections?.templateTypes?.heading} points={strings.sections?.templateTypes?.points} query={query} />
              <FilteredBulletSection id="modes" icon={Users} title={strings.sections?.modes?.heading} points={strings.sections?.modes?.points} query={query} />
              {(() => {
                if (!strings.sections?.copilot) return null
                const copilot = strings.sections.copilot
                // Check if any content matches the search query
                const introMatches = !query || (copilot.intro && copilot.intro.toLowerCase().includes(query.toLowerCase()))
                const stepsMatch = (copilot.steps || []).some(s => !query || s.toLowerCase().includes(query.toLowerCase()))
                const customStepsMatch = (copilot.customSteps || []).some(s => !query || s.toLowerCase().includes(query.toLowerCase()))
                const pointsMatch = (copilot.points || []).some(p => !query || p.toLowerCase().includes(query.toLowerCase()))
                if (!introMatches && !stepsMatch && !customStepsMatch && !pointsMatch) return null
                return (
                  <section id="copilot">
                    <SectionHeader icon={Sparkles} title={copilot.heading} />
                    <div className="mt-4 space-y-4 text-sm text-slate-700">
                      {/* Intro */}
                      {copilot.intro && (!query || copilot.intro.toLowerCase().includes(query.toLowerCase())) && (
                        <p className="text-slate-600">{copilot.intro}</p>
                      )}
                      
                      {/* Main steps */}
                      {copilot.stepsHeading && stepsMatch && (
                        <div className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-lg p-4 border border-teal-100">
                          <h4 className="font-semibold text-[#145a64] mb-3 flex items-center gap-2">
                            <span className="bg-[#1f8a99] text-white text-xs px-2 py-0.5 rounded">ÉTAPES</span>
                            {copilot.stepsHeading}
                          </h4>
                          <ol className="space-y-2 ml-1">
                            {(copilot.steps || []).map((step, i) => (
                              (!query || step.toLowerCase().includes(query.toLowerCase())) && (
                                <li key={i} className="flex gap-3 items-start">
                                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1f8a99] text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                                  <span className="pt-0.5">{step}</span>
                                </li>
                              )
                            ))}
                          </ol>
                        </div>
                      )}
                      
                      {/* Custom instruction steps */}
                      {copilot.customHeading && customStepsMatch && (
                        <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                          <h4 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
                            <Settings className="h-4 w-4" />
                            {copilot.customHeading}
                          </h4>
                          <ol className="space-y-2 ml-1">
                            {(copilot.customSteps || []).map((step, i) => (
                              (!query || step.toLowerCase().includes(query.toLowerCase())) && (
                                <li key={i} className="flex gap-3 items-start">
                                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center">{i + 1}</span>
                                  <span className="pt-0.5 text-amber-900">{step}</span>
                                </li>
                              )
                            ))}
                          </ol>
                        </div>
                      )}
                      
                      {/* Additional points */}
                      {pointsMatch && (
                        <ul className="space-y-2">
                          {(copilot.points || []).map((p, i) => (
                            (!query || p.toLowerCase().includes(query.toLowerCase())) && (
                              <li key={i} className="flex gap-3">
                                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#1f8a99]" aria-hidden="true" />
                                <span>{p}</span>
                              </li>
                            )
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>
                )
              })()}
              <FilteredBulletSection id="variables" icon={BookOpen} title={strings.sections?.variables?.heading} points={strings.sections?.variables?.points} query={query} />
              <FilteredBulletSection id="popout" icon={ExternalLink} title={strings.sections?.popout?.heading} points={strings.sections?.popout?.points} query={query} />
              <FilteredBulletSection id="copying" icon={Copy} title={strings.sections?.copying?.heading} points={strings.sections?.copying?.points} query={query} />
              <FilteredBulletSection id="favorites" icon={Star} title={strings.sections?.favorites?.heading} points={strings.sections?.favorites?.points} query={query} />

              {!query && <Separator className="bg-[#e6eef5]" />}

              {(() => {
                const filtered = strings.faq.items.filter((qa) => {
                  if (!query) return true
                  const q = query.toLowerCase()
                  return qa.question.toLowerCase().includes(q) || qa.answer.toLowerCase().includes(q)
                })
                if (filtered.length === 0) return null
                return (
                  <section>
                    <SectionHeader icon={BookOpen} title={strings.faq.heading} />
                    <div className="mt-4 space-y-4">
                      {filtered.map((item, index) => (
                        <div key={index} className="rounded-lg border border-[#e1eff4] bg-[#f9feff] p-4 shadow-sm">
                          <p className="font-semibold text-[#124a52]">{item.question}</p>
                          <p className="mt-2 text-sm text-slate-700">{item.answer}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )
              })()}

              {!query && <Separator className="bg-[#e6eef5]" />}
              {(() => {
                const filtered = strings.troubleshooting.items.filter((blk) => {
                  if (!query) return true
                  const q = query.toLowerCase()
                  return blk.title.toLowerCase().includes(q) || (blk.steps || []).some((s) => s.toLowerCase().includes(q))
                })
                if (filtered.length === 0) return null
                return (
                  <section>
                    <SectionHeader icon={AlertTriangle} title={strings.troubleshooting.heading} />
                    <div className="mt-4 space-y-5">
                      {filtered.map((block, index) => (
                        <div key={index} className="rounded-xl border border-[#fde68a] bg-[#fffbeb] p-4 shadow-sm">
                          <h4 className="text-sm font-semibold text-[#92400e]">{block.title}</h4>
                          <ul className="mt-3 space-y-1.5 text-sm text-[#78350f]">
                            {block.steps.map((step, stepIndex) => (
                              <li key={stepIndex} className="flex gap-2">
                                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#f59e0b]" aria-hidden="true" />
                                <span>{step}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </section>
                )
              })()}
              {!query && <Separator className="bg-[#e6eef5]" />}
              {(() => {
                if (!strings.sections?.shortcuts) return null
                const filtered = (strings.sections.shortcuts.items || []).filter(([combo, desc]) => {
                  if (!query) return true
                  const q = query.toLowerCase()
                  return combo.toLowerCase().includes(q) || desc.toLowerCase().includes(q)
                })
                if (filtered.length === 0) return null
                return (
                  <section id="shortcuts">
                    <SectionHeader icon={Lightbulb} title={strings.sections.shortcuts.heading} />
                    <div className="mt-3 overflow-hidden rounded-lg border border-[#e6eef5]">
                      <div className="grid grid-cols-1 divide-y divide-[#e6eef5] text-sm md:grid-cols-2 md:divide-x md:divide-y-0">
                        {filtered.map(([combo, desc], i) => (
                          <div key={i} className="flex items-center justify-between gap-3 p-3">
                            <span className="font-mono text-xs text-slate-700">{combo}</span>
                            <span className="text-slate-800">{desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                )
              })()}
              <FilteredBulletSection id="admin" icon={Settings} title={strings.sections?.admin?.heading} points={strings.sections?.admin?.points} query={query} />
              <FilteredBulletSection id="privacy" icon={Shield} title={strings.sections?.privacy?.heading} points={strings.sections?.privacy?.points} query={query} />
              {!query && (
                <>
                  <Separator className="bg-[#e6eef5]" />
                  <section>
                    {Array.isArray(strings.resources?.links) && strings.resources.links.length > 0 ? (
                      <>
                        <SectionHeader icon={MessageCircle} title={strings.resources.heading} />
                        <ul className="mt-4 grid gap-2 text-sm text-[#145a64] md:grid-cols-2">
                          {strings.resources.links.map((link) => (
                            <li key={link.href}>
                              <a
                                className="group inline-flex items-center gap-2 rounded-lg border border-transparent px-3 py-2 transition-colors duration-150 hover:border-[#bfe7e3] hover:bg-[#f0fbfb]"
                                href={link.href}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink className="h-3.5 w-3.5 text-[#1f8a99] transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                                <span>{link.label}</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </section>
                  {formOnly ? null : <Separator className="bg-[#e6eef5]" />}
                </>
              )}
              </>
              )}
              <section ref={contactFormRef} className={formOnly ? "bg-transparent pt-2" : "border-t border-[#bfe7e3] bg-transparent"}>
                <div className="flex items-center gap-2 text-[#145a64]">
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  <h3 className="text-sm font-semibold m-0 p-0">{strings.contact.heading}</h3>
                </div>
                <p className="mt-1 text-xs text-slate-600">{strings.contact.description}</p>

                <form onSubmit={handleSubmit} className="mt-2 space-y-3" noValidate>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {contactOptions.map((option) => {
                      const isActive = formData.category === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`group relative flex flex-col border text-left transition-all duration-200 p-2 rounded-lg ${isActive ? 'border-[#1f8a99] bg-white shadow-md ring-2 ring-[#1f8a99]/20' : 'border-transparent bg-white/60 hover:border-[#bfe7e3] hover:bg-white'}`}
                          aria-pressed={isActive}
                          onClick={() => handleCategorySelect(option.value)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <span className="font-semibold text-[#0f4c55] text-xs">{option.label}</span>
                              <span className="block mt-0.5 text-[10px] text-slate-500">{option.helper}</span>
                            </div>
                            {isActive && (
                              <CheckCircle2 className="h-4 w-4 text-[#1f8a99] flex-shrink-0" aria-hidden="true" />
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                      <span>{strings.contact.form.nameLabel}</span>
                      <Input
                        value={formData.name}
                        onChange={handleFieldChange('name')}
                        placeholder={strings.contact.form.namePlaceholder}
                        aria-invalid={Boolean(errors.name)}
                      />
                      {errors.name ? (
                        <span className="text-[10px] font-normal text-red-600">{errors.name}</span>
                      ) : null}
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                      <span>{strings.contact.form.emailLabel}</span>
                      <Input
                        type="email"
                        value={formData.email}
                        onChange={handleFieldChange('email')}
                        placeholder={strings.contact.form.emailPlaceholder}
                        aria-invalid={Boolean(errors.email)}
                      />
                      {errors.email ? (
                        <span className="text-[10px] font-normal text-red-600">{errors.email}</span>
                      ) : null}
                    </label>
                  </div>

                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                    <span>{selectedCategory?.messageLabel || strings.contact.form.messageLabelFallback}</span>
                    <Textarea
                      value={formData.message}
                      onChange={handleFieldChange('message')}
                      placeholder={selectedCategory?.placeholder || ''}
                      rows={5}
                      aria-invalid={Boolean(errors.message)}
                    />
                    {errors.message ? (
                      <span className="text-[10px] font-normal text-red-600">{errors.message}</span>
                    ) : null}
                  </label>

                  {formData.category === 'template' ? (
                    <div className="space-y-4 rounded-xl border border-[#e6eef5] bg-white p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                          <span>{language === 'fr' ? 'Type de demande' : 'Request type'}</span>
                          <select
                            className="h-9 rounded-md border border-slate-300 px-2 text-sm"
                            value={templateDetails.templateType}
                            onChange={(e) => setTemplateDetails((p) => ({ ...p, templateType: e.target.value }))}
                            aria-invalid={Boolean(errors.templateType)}
                          >
                            <option value="new">{language === 'fr' ? 'Nouveau modèle' : 'New template'}</option>
                            <option value="modify">{language === 'fr' ? 'Modification d\'un modèle' : 'Modification of existing'}</option>
                          </select>
                          {errors.templateType ? (
                            <span className="text-xs font-normal text-red-600">{errors.templateType}</span>
                          ) : null}
                        </label>

                        {templateDetails.templateType === 'modify' ? (
                          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                            <span>{language === 'fr' ? 'ID/nom du modèle existant' : 'Existing template ID/name'}</span>
                            <Input
                              value={templateDetails.existingId}
                              onChange={(e) => setTemplateDetails((p) => ({ ...p, existingId: e.target.value }))}
                              placeholder={language === 'fr' ? 'Ex. q002 – Avis de fermeture' : 'e.g. q002 – Closure notice'}
                              aria-invalid={Boolean(errors.existingId)}
                            />
                            {errors.existingId ? (
                              <span className="text-xs font-normal text-red-600">{errors.existingId}</span>
                            ) : null}
                          </label>
                        ) : null}
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <fieldset className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                          <span>{language === 'fr' ? 'Langue de votre soumission' : 'Submission language'}</span>
                          <div className="flex items-center gap-4 text-sm">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={templateDetails.languages.fr}
                                onChange={(e) => setTemplateDetails((p) => ({ ...p, languages: { ...p.languages, fr: e.target.checked } }))}
                              />
                              <span>FR</span>
                            </label>
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={templateDetails.languages.en}
                                onChange={(e) => setTemplateDetails((p) => ({ ...p, languages: { ...p.languages, en: e.target.checked } }))}
                              />
                              <span>EN</span>
                            </label>
                          </div>
                          {errors.languages ? (
                            <span className="text-xs font-normal text-red-600">{errors.languages}</span>
                          ) : (
                            <span className="text-xs font-normal text-slate-500">{language === 'fr' ? 'Envoyez au moins en français ou en anglais.' : 'Submit in English or French at minimum.'}</span>
                          )}
                        </fieldset>

                        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                          <span>{language === 'fr' ? 'Catégorie suggérée' : 'Suggested category'}</span>
                          <Input
                            value={templateDetails.category}
                            onChange={(e) => setTemplateDetails((p) => ({ ...p, category: e.target.value }))}
                            placeholder={language === 'fr' ? 'Ex. Traduction, Délais, Facturation' : 'e.g., Translation, Deadlines, Billing'}
                          />
                        </label>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                          <span>{language === 'fr' ? 'Titre FR' : 'Title (FR)'}</span>
                          <Input
                            value={templateDetails.titleFr}
                            onChange={(e) => setTemplateDetails((p) => ({ ...p, titleFr: e.target.value }))}
                            placeholder={language === 'fr' ? 'Intitulé côté FR (si connu)' : 'French title (if known)'}
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                          <span>{language === 'fr' ? 'Titre EN' : 'Title (EN)'}</span>
                          <Input
                            value={templateDetails.titleEn}
                            onChange={(e) => setTemplateDetails((p) => ({ ...p, titleEn: e.target.value }))}
                            placeholder={language === 'fr' ? 'Titre anglais (si connu)' : 'English title (if known)'}
                          />
                        </label>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                          <span>{language === 'fr' ? 'Public visé' : 'Audience'}</span>
                          <Input
                            value={templateDetails.audience}
                            onChange={(e) => setTemplateDetails((p) => ({ ...p, audience: e.target.value }))}
                            placeholder={language === 'fr' ? 'Ex. employés, gestionnaires, partenaires' : 'e.g., employees, managers, partners'}
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                          <span>{language === 'fr' ? 'Contexte' : 'Context'}</span>
                          <Input
                            value={templateDetails.context}
                            onChange={(e) => setTemplateDetails((p) => ({ ...p, context: e.target.value }))}
                            placeholder={language === 'fr' ? 'Ex. annonce, rappel, incident' : 'e.g., announcement, reminder, incident'}
                          />
                        </label>
                      </div>

                      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                        <span>{language === 'fr' ? 'Où insérer les variables ?' : 'Where should variables go?'}</span>
                        <Textarea
                          rows={4}
                          value={templateDetails.variablePlan}
                          onChange={(e) => setTemplateDetails((p) => ({ ...p, variablePlan: e.target.value }))}
                          placeholder={language === 'fr'
                            ? 'Ex.: <<date_evenement>> dans l\'objet, <<nom_client>> au début du message, etc.'
                            : 'e.g., <<event_date>> in Subject, <<client_name>> at start of body, etc.'}
                        />
                        <span className="text-xs font-normal text-slate-500">{language === 'fr' ? 'Ajoutez ce que vous savez; nous compléterons si nécessaire.' : 'Add what you know; we can fill in the rest.'}</span>
                      </label>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                          <span>{language === 'fr' ? 'Exemples (valeurs connues)' : 'Examples (known values)'}</span>
                          <Textarea
                            rows={3}
                            value={templateDetails.examples}
                            onChange={(e) => setTemplateDetails((p) => ({ ...p, examples: e.target.value }))}
                            placeholder={language === 'fr' ? 'Ex.: date_evenement = 10-17 juin 2025' : 'e.g., event_date = June 10–17, 2025'}
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                          <span>{language === 'fr' ? 'Échéance (facultatif)' : 'Deadline (optional)'}</span>
                          <Input
                            value={templateDetails.deadline}
                            onChange={(e) => setTemplateDetails((p) => ({ ...p, deadline: e.target.value }))}
                            placeholder={language === 'fr' ? 'Ex.: d\'ici le 15 juin' : 'e.g., by June 15'}
                          />
                        </label>
                      </div>
                    </div>
                  ) : null}

                  {selectedCategory?.extraField ? (
                    <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                      <span>
                        {selectedCategory.extraField.label}{' '}
                        <span className="font-normal text-slate-500">{strings.contact.form.optional}</span>
                      </span>
                      <Input
                        value={formData.extra}
                        onChange={handleFieldChange('extra')}
                        placeholder={selectedCategory.extraField.placeholder}
                      />
                    </label>
                  ) : null}

                  {selectedCategory?.extraField && strings.contact.form.extraHelp ? (
                    <p className="text-xs text-slate-500">{strings.contact.form.extraHelp}</p>
                  ) : null}

                  {feedbackMessage ? (
                    <div
                      className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${status === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}
                    >
                      {status === 'success' ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-4 w-4" aria-hidden="true" />
                      )}
                      <div>
                        <p className="font-semibold">
                          {status === 'success' ? strings.contact.form.successTitle : strings.contact.form.errorTitle}
                        </p>
                        <p className="mt-1">{feedbackMessage}</p>
                        {status === 'success' ? (
                          <button
                            type="button"
                            onClick={resetAfterSuccess}
                            className="mt-2 text-xs font-semibold uppercase tracking-wide text-[#166f7b] hover:text-[#0f4c55]"
                          >
                            {strings.contact.form.sendAnother}
                          </button>
                        ) : null}
                        {status === 'error' ? (
                          <div className="mt-2 text-xs">
                            <p className="font-semibold mb-1">{language === 'fr' ? 'Solutions de repli:' : 'Fallback options:'}</p>
                            <ul className="list-disc pl-4 space-y-1">
                              <li>{language === 'fr' ? 'Réessayez plus tard; l’endpoint peut être temporairement indisponible.' : 'Retry later; endpoint may be temporarily unavailable.'}</li>
                              <li>{language === 'fr' ? 'Envoyez un courriel direct:' : 'Send direct email:'} <a className="text-[#145a64] underline" href={`mailto:${supportEmail}?subject=ECHO%20Support%20(${encodeURIComponent(formData.category)})`}>{supportEmail}</a></li>
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <Button
                      type="submit"
                      className="inline-flex items-center gap-2 bg-[#1f8a99] px-5 py-2 text-white hover:bg-[#166f7b]"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                      <span>{isSubmitting ? strings.contact.form.submitting : strings.contact.form.submit}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={onClose}
                      className="text-[#145a64] hover:bg-[#f0fbfb]"
                    >
                      {strings.contact.close}
                    </Button>
                  </div>
                </form>
              </section>
            </div>
          </ScrollArea>
          
          {/* Floating Back to Top button */}
          {showBackToTop && !formOnly && (
            <button
              onClick={scrollToTop}
              className="absolute bottom-4 right-6 z-20 flex items-center gap-1.5 rounded-full bg-[#1f8a99] px-3 py-2 text-xs font-medium text-white shadow-lg transition-all duration-200 hover:bg-[#166f7b] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[#1f8a99]/50"
              aria-label={backToTopText}
              type="button"
            >
              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{backToTopText}</span>
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
