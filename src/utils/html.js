/**
 * Common HTML utilities shared across editors
 * Centralized to avoid duplication between SimplePillEditor and RichTextPillEditor
 */
import DOMPurify from 'dompurify'

/**
 * Sanitize HTML string to prevent XSS attacks.
 * Allows safe formatting tags and data-* attributes used by pill editors.
 */
export const sanitizeHtml = (html = '') =>
  DOMPurify.sanitize(html, {
    ADD_ATTR: ['data-var', 'data-value', 'data-display', 'data-template', 'data-line-break', 'spellcheck', 'contenteditable'],
    ADD_TAGS: ['mark'],
    ALLOW_DATA_ATTR: true
  })

/**
 * Escape special HTML characters in a string
 */
export const escapeHtml = (input = '') =>
  String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/**
 * Block-level HTML elements that require special handling
 */
export const BLOCK_ELEMENTS = new Set([
  'DIV',
  'P',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
  'ASIDE',
  'NAV',
  'UL',
  'OL',
  'LI',
  'PRE',
  'BLOCKQUOTE',
  'TABLE',
  'TBODY',
  'THEAD',
  'TFOOT',
  'TR',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HR'
])

/**
 * Convert plain text to HTML, preserving line breaks
 */
export const convertPlainTextToHtml = (text = '') =>
  escapeHtml(text)
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n/g, '<br data-line-break="true">')

/**
 * Select entire content of a pill element
 */
export const selectEntirePill = (pill) => {
  if (!pill) return
  const selection = document.getSelection?.()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(pill)
  selection.removeAllRanges()
  selection.addRange(range)
}
