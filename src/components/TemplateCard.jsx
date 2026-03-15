import React from 'react'
import { Badge } from './ui/badge.jsx'

const TemplateCard = React.memo(function TemplateCard({
  template,
  templateLanguage,
  interfaceLanguage,
  t,
  badgeStyle,
  badgeLabel,
  isSelected = false,
  isPressed = false,
  isFavourite = false,
  onClick,
  onMouseDown,
  onMouseUp,
  onMouseLeave,
  onToggleFav,
  innerRef,
  renderHighlighted,
  getMatchRanges,
  getTemplateTypeStyle,
}) {
  const modes = Array.isArray(template.utilisateur)
    ? template.utilisateur
    : template.utilisateur
      ? [template.utilisateur]
      : ['conseillers']
  const restrictedModes = modes.filter(m =>
    ['gestion', 'equipe_admin', 'relations_fournisseurs'].includes(m)
  )

  const containerClass = [
    'w-full p-4 border cursor-pointer transition-all duration-150',
    isSelected
      ? 'shadow-lg transform scale-[1.02]'
      : 'border-[#e1eaf2] bg-white hover:border-[#2c3d50] hover:shadow-md hover:-translate-y-[1px]',
  ].join(' ')

  const containerStyle = isSelected
    ? { borderColor: '#2c3d50', background: '#e6f0ff', borderRadius: '14px', scrollMarginTop: 220 }
    : {
        borderRadius: '14px',
        scrollMarginTop: 220,
        transform: isPressed ? 'scale(0.995)' : undefined,
        boxShadow: isPressed ? 'inset 0 0 0 1px rgba(0,0,0,0.05)' : undefined,
      }

  return (
    <div
      key={template.id}
      ref={innerRef}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
      className={containerClass}
      style={containerStyle}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-gray-900 text-[13px]" title={template.title[templateLanguage]}>
              {renderHighlighted(
                template.title[templateLanguage],
                getMatchRanges(template.id, `title.${templateLanguage}`)
              )}
            </h3>
            {restrictedModes.map(mode => (
              <span
                key={mode}
                className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                  mode === 'gestion' ? 'bg-amber-100 text-amber-700' :
                  mode === 'equipe_admin' ? 'bg-blue-100 text-blue-700' :
                  'bg-purple-100 text-purple-700'
                }`}
                title={interfaceLanguage === 'fr'
                  ? (mode === 'gestion' ? 'Gestion' :
                     mode === 'equipe_admin' ? 'Équipe Admin' : 'Relations fournisseurs')
                  : (mode === 'gestion' ? 'Management' :
                     mode === 'equipe_admin' ? 'Admin Team' : 'Supplier Relations')}
              >
                {mode === 'gestion' ? '🔐' : mode === 'equipe_admin' ? '👔' : '🤝'}
              </span>
            ))}
          </div>
          <p className="text-[12px] text-gray-600 mb-2 leading-relaxed line-clamp-2" title={template.description[templateLanguage]}>
            {renderHighlighted(
              template.description[templateLanguage],
              getMatchRanges(template.id, `description.${templateLanguage}`)
            )}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge
              variant="outline"
              className="text-[11px] font-semibold px-3 py-1 border rounded-full shadow-sm"
              style={{ background: badgeStyle.bg, color: badgeStyle.text, borderColor: badgeStyle.border }}
            >
              {badgeLabel}
            </Badge>
            {template.type && template.type !== 'email' && (() => {
              const ts = getTemplateTypeStyle(template.type)
              return (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                  style={{ background: ts.bg, color: ts.text, borderColor: ts.border }}
                >
                  {ts.icon} {t.templateTypes?.[template.type] || template.type}
                </span>
              )
            })()}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav(template.id) }}
          className={`ml-3 text-xl transition-colors ${isFavourite ? 'text-[#8a8535]' : 'text-gray-200 hover:text-[#8a8535]'}`}
          title={isFavourite ? 'Unfavorite' : 'Favorite'}
          aria-label="Toggle favorite"
        >★</button>
      </div>
    </div>
  )
})

export default TemplateCard
