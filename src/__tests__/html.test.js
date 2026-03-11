import { describe, it, expect } from 'vitest'
import { sanitizeHtml, escapeHtml, convertPlainTextToHtml, BLOCK_ELEMENTS } from '../utils/html'

describe('escapeHtml', () => {
  it('escapes all HTML special characters', () => {
    expect(escapeHtml('<div class="test">&\'hello\'')).toBe(
      '&lt;div class=&quot;test&quot;&gt;&amp;&#39;hello&#39;'
    )
  })

  it('returns empty string for undefined, coerces null to "null"', () => {
    expect(escapeHtml()).toBe('')
    expect(escapeHtml(null)).toBe('null')
    expect(escapeHtml(undefined)).toBe('')
  })

  it('coerces non-string to string', () => {
    expect(escapeHtml(42)).toBe('42')
  })

  it('passes through safe strings unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World')
  })
})

describe('sanitizeHtml', () => {
  it('strips dangerous script tags', () => {
    const result = sanitizeHtml('<p>Hello</p><script>alert("xss")</script>')
    expect(result).not.toContain('<script>')
    expect(result).toContain('<p>Hello</p>')
  })

  it('strips event handlers', () => {
    const result = sanitizeHtml('<div onload="alert(1)">test</div>')
    expect(result).not.toContain('onload')
    expect(result).toContain('test')
  })

  it('preserves pill data attributes', () => {
    const input = '<span class="var-pill" data-var="Name" data-value="<<Name>>" data-display="John" data-template="tmpl">John</span>'
    const result = sanitizeHtml(input)
    expect(result).toContain('data-var="Name"')
    expect(result).toContain('data-value="<<Name>>"')
    expect(result).toContain('data-display="John"')
    expect(result).toContain('data-template="tmpl"')
  })

  it('preserves contenteditable and spellcheck attributes', () => {
    const input = '<div contenteditable="false" spellcheck="false">text</div>'
    const result = sanitizeHtml(input)
    expect(result).toContain('contenteditable="false"')
    expect(result).toContain('spellcheck="false"')
  })

  it('allows mark tag', () => {
    const result = sanitizeHtml('<mark>highlighted</mark>')
    expect(result).toContain('<mark>highlighted</mark>')
  })

  it('returns empty string for empty input', () => {
    expect(sanitizeHtml()).toBe('')
    expect(sanitizeHtml('')).toBe('')
  })

  it('strips iframe tags', () => {
    const result = sanitizeHtml('<iframe src="https://evil.com"></iframe>safe')
    expect(result).not.toContain('<iframe')
    expect(result).toContain('safe')
  })
})

describe('convertPlainTextToHtml', () => {
  it('converts newlines to br tags', () => {
    expect(convertPlainTextToHtml('line1\nline2')).toBe(
      'line1<br data-line-break="true">line2'
    )
  })

  it('handles CRLF', () => {
    expect(convertPlainTextToHtml('a\r\nb')).toBe(
      'a<br data-line-break="true">b'
    )
  })

  it('escapes HTML in the text', () => {
    expect(convertPlainTextToHtml('<b>bold</b>')).toBe(
      '&lt;b&gt;bold&lt;/b&gt;'
    )
  })

  it('returns empty string for empty input', () => {
    expect(convertPlainTextToHtml()).toBe('')
    expect(convertPlainTextToHtml('')).toBe('')
  })
})

describe('BLOCK_ELEMENTS', () => {
  it('contains common block elements', () => {
    expect(BLOCK_ELEMENTS.has('DIV')).toBe(true)
    expect(BLOCK_ELEMENTS.has('P')).toBe(true)
    expect(BLOCK_ELEMENTS.has('H1')).toBe(true)
    expect(BLOCK_ELEMENTS.has('LI')).toBe(true)
    expect(BLOCK_ELEMENTS.has('TABLE')).toBe(true)
  })

  it('does not contain inline elements', () => {
    expect(BLOCK_ELEMENTS.has('SPAN')).toBe(false)
    expect(BLOCK_ELEMENTS.has('A')).toBe(false)
    expect(BLOCK_ELEMENTS.has('STRONG')).toBe(false)
  })
})
