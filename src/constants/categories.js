export const NAVY_TEXT = '#1c2f4a'

export const CATEGORY_BADGE_STYLES = {
  quotes_and_approvals: { bg: '#ede9fe', border: '#c4b5fd', text: NAVY_TEXT },
  follow_ups_and_cancellations: { bg: '#ffe4e6', border: '#fecdd3', text: NAVY_TEXT },
  documents_and_formatting: { bg: '#e0f2fe', border: '#bae6fd', text: NAVY_TEXT },
  deadlines_and_delivery: { bg: '#ffedd5', border: '#fdba74', text: NAVY_TEXT },
  clarifications_and_client_instructions: { bg: '#fef3c7', border: '#fde68a', text: NAVY_TEXT },
  security_and_copyright: { bg: '#fee2e2', border: '#fecaca', text: NAVY_TEXT },
  quality_assurance: { bg: '#dcfce7', border: '#bbf7d0', text: NAVY_TEXT },
  terminology_and_glossaries: { bg: '#cffafe', border: '#a5f3fc', text: NAVY_TEXT },
  revisions_and_feedback: { bg: '#fae8ff', border: '#f0abfc', text: NAVY_TEXT },
  team_coordination: { bg: '#e0e7ff', border: '#c7d2fe', text: NAVY_TEXT },
  technical_issues: { bg: '#ccfbf1', border: '#99f6e4', text: NAVY_TEXT },
  general_inquiries: { bg: '#f1f5f9', border: '#cbd5e1', text: NAVY_TEXT },
  default: { bg: '#e6f0ff', border: '#c7dbff', text: NAVY_TEXT }
}

// Template type definitions
export const TEMPLATE_TYPES = ['email', 'blurb', 'prompt']

export const TEMPLATE_TYPE_STYLES = {
  email:  { bg: '#e0f2fe', border: '#7dd3fc', text: '#0c4a6e', icon: '📧' },
  blurb:  { bg: '#fce7f3', border: '#f9a8d4', text: '#831843', icon: '📝' },
  prompt: { bg: '#f3e8ff', border: '#d8b4fe', text: '#581c87', icon: '🤖' },
}

export const getTemplateTypeStyle = (type = 'email') =>
  TEMPLATE_TYPE_STYLES[type] || TEMPLATE_TYPE_STYLES.email

export const getCategoryBadgeStyle = (category = '', customColors = {}) => {
  if (customColors[category]) {
    const baseColor = customColors[category]
    return {
      bg: baseColor + '20',
      border: baseColor + '80',
      text: baseColor
    }
  }
  return CATEGORY_BADGE_STYLES[category] || CATEGORY_BADGE_STYLES.default
}
