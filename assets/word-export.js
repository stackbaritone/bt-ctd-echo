/**
 * Word Document Export Module for ECHO Admin Console
 * Generates a professional Word document catalog of all email templates
 */

// Import docx library (loaded via CDN in admin-simple.html)
// Using global docx object from CDN

const WordExport = (function() {
  'use strict';

  // Color palette matching ECHO branding
  const COLORS = {
    primary: '2C3D50',      // Navy blue
    accent: 'ACA868',       // Gold/olive
    teal: '059669',         // Teal
    text: '1F2937',         // Dark gray
    muted: '64748B',        // Muted gray
    lightBg: 'F8FAFC',      // Light background
    white: 'FFFFFF',
    border: 'E2E8F0',
    highlight: 'FFFF00'     // Yellow highlight for variables
  };

  // Font configuration
  const FONTS = {
    heading: 'Calibri Light',
    body: 'Calibri',
    mono: 'Consolas'
  };

  /**
   * Strip HTML tags and convert to plain text
   */
  function stripHtml(html) {
    if (!html) return '';
    const temp = document.createElement('div');
    temp.innerHTML = html;
    temp.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    temp.querySelectorAll('p, div, li').forEach(el => {
      el.prepend(document.createTextNode('\n'));
    });
    return temp.textContent || temp.innerText || '';
  }

  /**
   * Create text runs with highlighted variables from text content
   * Variables like <<variable_name>> will be highlighted in yellow
   */
  function createRunsWithHighlightedVariables(text, defaultOptions = {}) {
    if (!text) return [new docx.TextRun({ text: '', ...defaultOptions })];
    
    // Decode HTML-encoded variables: &lt;&lt;var&gt;&gt; -> <<var>>
    const decodedText = text.replace(/&lt;&lt;([^&]+)&gt;&gt;/g, '<<$1>>');
    
    const runs = [];
    // Match <<variable_name>> patterns
    const regex = /<<([^>]+)>>/g;
    let lastIndex = 0;
    let match;
    
    while ((match = regex.exec(decodedText)) !== null) {
      // Add text before the variable
      if (match.index > lastIndex) {
        runs.push(new docx.TextRun({
          text: decodedText.slice(lastIndex, match.index),
          ...defaultOptions
        }));
      }
      
      // Add the variable with yellow highlight
      runs.push(new docx.TextRun({
        text: match[0], // Include << and >>
        ...defaultOptions,
        highlight: 'yellow'
      }));
      
      lastIndex = regex.lastIndex;
    }
    
    // Add remaining text after last variable
    if (lastIndex < decodedText.length) {
      runs.push(new docx.TextRun({
        text: decodedText.slice(lastIndex),
        ...defaultOptions
      }));
    }
    
    return runs.length > 0 ? runs : [new docx.TextRun({ text: '', ...defaultOptions })];
  }

  /**
   * Parse HTML and create multiple Word paragraphs with highlighted variables
   */
  function parseHtmlToParagraphsWithHighlight(html, defaultOptions = {}, paragraphOptions = {}) {
    if (!html) return [new docx.Paragraph({ children: [new docx.TextRun({ text: '', ...defaultOptions })], ...paragraphOptions })];
    
    const paragraphs = [];
    let currentRuns = [];
    const temp = document.createElement('div');
    
    // Pre-process: decode HTML entities for variables and convert line breaks to HTML
    let processed = html
      // Decode HTML-encoded variables: &lt;&lt;var&gt;&gt; -> <<var>>
      .replace(/&lt;&lt;([^&]+)&gt;&gt;/g, '<<$1>>')
      // Convert \r\n or \n\n (double line breaks) to paragraph breaks
      .replace(/\r\n\r\n|\n\n/g, '</p><p>')
      // Convert remaining single line breaks to <br>
      .replace(/\r\n|\n/g, '<br>');
    
    // Wrap in paragraph if we added </p><p> tags
    if (processed.includes('</p><p>')) {
      processed = '<p>' + processed + '</p>';
    }
    
    temp.innerHTML = processed;

    function flushParagraph() {
      while (currentRuns.length > 0 && currentRuns[currentRuns.length - 1].text === '' && currentRuns[currentRuns.length - 1].break) {
        currentRuns.pop();
      }
      
      if (currentRuns.length > 0) {
        paragraphs.push(new docx.Paragraph({
          children: currentRuns,
          spacing: { after: 120 },
          ...paragraphOptions
        }));
        currentRuns = [];
      }
    }

    function addTextWithHighlight(text, inherited = {}) {
      if (!text) return;
      const regex = /<<([^>]+)>>/g;
      let lastIndex = 0;
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          currentRuns.push(new docx.TextRun({
            text: text.slice(lastIndex, match.index),
            ...defaultOptions,
            ...inherited
          }));
        }
        currentRuns.push(new docx.TextRun({
          text: match[0],
          ...defaultOptions,
          ...inherited,
          highlight: 'yellow'
        }));
        lastIndex = regex.lastIndex;
      }
      
      if (lastIndex < text.length) {
        currentRuns.push(new docx.TextRun({
          text: text.slice(lastIndex),
          ...defaultOptions,
          ...inherited
        }));
      }
    }

    function processNode(node, inherited = {}) {
      if (node.nodeType === Node.TEXT_NODE) {
        addTextWithHighlight(node.textContent, inherited);
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.tagName.toLowerCase();
      const newInherited = { ...inherited };

      if (tag === 'strong' || tag === 'b') newInherited.bold = true;
      if (tag === 'em' || tag === 'i') newInherited.italics = true;
      if (tag === 'u') newInherited.underline = { type: docx.UnderlineType.SINGLE };
      if (tag === 's' || tag === 'strike' || tag === 'del') newInherited.strike = true;
      
      if (tag === 'br') {
        currentRuns.push(new docx.TextRun({ text: '', break: 1, ...defaultOptions }));
        return;
      }

      if (tag === 'p' || tag === 'div') {
        flushParagraph();
        node.childNodes.forEach(child => processNode(child, newInherited));
        flushParagraph();
        return;
      }

      if (tag === 'li') {
        flushParagraph();
        currentRuns.push(new docx.TextRun({ text: '• ', ...defaultOptions, ...newInherited }));
        node.childNodes.forEach(child => processNode(child, newInherited));
        flushParagraph();
        return;
      }

      if (tag === 'ul' || tag === 'ol') {
        flushParagraph();
        node.childNodes.forEach(child => processNode(child, newInherited));
        return;
      }

      node.childNodes.forEach(child => processNode(child, newInherited));
    }

    temp.childNodes.forEach(child => processNode(child));
    flushParagraph();

    if (paragraphs.length === 0) {
      paragraphs.push(new docx.Paragraph({ 
        children: [new docx.TextRun({ text: '', ...defaultOptions })],
        ...paragraphOptions 
      }));
    }

    return paragraphs;
  }

  /**
   * Detect placeholders in a template
   */
  function detectPlaceholders(t) {
    const parts = [];
    if (t.subject?.fr) parts.push(t.subject.fr);
    if (t.subject?.en) parts.push(t.subject.en);
    if (t.body?.fr) parts.push(t.body.fr);
    if (t.body?.en) parts.push(t.body.en);
    const combined = parts.join('\n')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const keys = [...combined.matchAll(/<<([^>]+)>>/g)]
      .map(m => m[1].replace(/_(FR|EN)$/i, ''))
      .filter(Boolean);
    return [...new Set(keys)].sort();
  }

  /**
   * Create a sanitized bookmark name from template id
   */
  function createBookmarkName(templateId, index) {
    // Bookmark names must start with letter, contain only letters/numbers/underscores
    const sanitized = String(templateId || `template_${index}`)
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^[^a-zA-Z]/, 'T');
    return `tpl_${sanitized}_${index}`;
  }

  /**
   * Create a horizontal rule/separator
   */
  function createSeparator() {
    return new docx.Paragraph({
      children: [
        new docx.TextRun({
          text: '━'.repeat(80),
          color: COLORS.border,
          size: 16
        })
      ],
      spacing: { before: 200, after: 200 }
    });
  }

  /**
   * Create the title page
   */
  function createTitlePage(data, options) {
    const templateCount = (data.templates || []).length;
    const categories = [...new Set((data.templates || []).map(t => t.category).filter(Boolean))];
    const categoryCount = categories.length;
    const dateStr = new Date().toLocaleDateString('fr-CA', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    return [
      new docx.Paragraph({ spacing: { before: 1500 } }),
      
      // Main title - changed from ECHO
      new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: 'Catalogue de modèles',
            bold: true,
            size: 72,
            font: FONTS.heading,
            color: COLORS.primary
          })
        ],
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 300 }
      }),
      
      new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: '━━━━━━━━━━━━━━━━━━━━━━━━━━',
            color: COLORS.accent,
            size: 24
          })
        ],
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 400 }
      }),

      // Subtitle - changed
      new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: 'Centre de traitement des demandes',
            bold: true,
            size: 32,
            font: FONTS.heading,
            color: COLORS.text
          })
        ],
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 100 }
      }),
      new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: 'Bureau de la traduction',
            bold: true,
            size: 28,
            font: FONTS.heading,
            color: COLORS.muted
          })
        ],
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 600 }
      }),

      // Stats
      new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: `📧 ${templateCount} ${options.lang === 'en' ? 'templates available' : 'modèles disponibles'}`,
            size: 24,
            font: FONTS.body,
            color: COLORS.muted
          })
        ],
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 100 }
      }),
      new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: `📁 ${categoryCount} ${options.lang === 'en' ? 'categories' : 'catégories'}`,
            size: 24,
            font: FONTS.body,
            color: COLORS.muted
          })
        ],
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 100 }
      }),
      
      // Audience indicator
      ...(options.audience && options.audience !== 'all' ? [
        new docx.Paragraph({
          children: [
            new docx.TextRun({
              text: options.audience === 'management' 
                ? (options.lang === 'en' ? '🔐 Management templates only' : '🔐 Modèles de gestion uniquement')
                : (options.lang === 'en' ? '👥 User templates only' : '👥 Modèles utilisateurs uniquement'),
              size: 22,
              font: FONTS.body,
              color: options.audience === 'management' ? 'D97706' : '059669',
              italics: true
            })
          ],
          alignment: docx.AlignmentType.CENTER,
          spacing: { after: 600 }
        })
      ] : [
        new docx.Paragraph({ spacing: { after: 600 } })
      ]),

      new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: '─────────────────────────────',
            color: COLORS.border,
            size: 20
          })
        ],
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 200 }
      }),

      new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: options.lang === 'en' ? `Generated on ${dateStr}` : `Généré le ${dateStr}`,
            size: 22,
            font: FONTS.body,
            color: COLORS.muted
          })
        ],
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 100 }
      }),
      new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: `Version: ${data.metadata?.version || '1.0'}`,
            size: 20,
            font: FONTS.body,
            color: COLORS.muted
          })
        ],
        alignment: docx.AlignmentType.CENTER
      }),

      new docx.Paragraph({
        children: [],
        pageBreakBefore: true
      })
    ];
  }

  /**
   * Create a template section with bookmark for TOC links
   */
  function createTemplateSection(template, index, total, categoryLabel, data, options, bookmarkName) {
    const elements = [];
    const lang = options.lang;
    const isBilingual = lang === 'both';

    // Category header (if first in category)
    if (template._isFirstInCategory) {
      elements.push(new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: categoryLabel.toUpperCase(),
            bold: true,
            size: 28,
            font: FONTS.heading,
            color: COLORS.white
          })
        ],
        shading: { type: docx.ShadingType.SOLID, color: COLORS.primary },
        spacing: { before: 300, after: 200 },
        indent: { left: 200, right: 200 }
      }));
    }

    // Template title with bookmark for TOC linking
    const titleFr = template.title?.fr || template.title || '';
    const titleEn = template.title?.en || template.title || '';
    const title = isBilingual ? titleFr : (lang === 'en' ? titleEn : titleFr);
    const titleSecondary = isBilingual ? titleEn : null;

    elements.push(createSeparator());

    // Title with bookmark and highlighted variables
    const titleRuns = createRunsWithHighlightedVariables(title, {
      bold: true,
      size: 26,
      font: FONTS.heading,
      color: COLORS.primary
    });

    elements.push(new docx.Paragraph({
      children: [
        new docx.Bookmark({
          id: bookmarkName,
          children: titleRuns
        })
      ],
      spacing: { before: 100, after: 50 }
    }));

    if (titleSecondary) {
      const titleEnRuns = createRunsWithHighlightedVariables(titleSecondary, {
        italics: true,
        size: 22,
        font: FONTS.body,
        color: COLORS.muted
      });
      elements.push(new docx.Paragraph({
        children: titleEnRuns,
        spacing: { after: 150 }
      }));
    }

    // Description (optional - only if present)
    const descFr = template.description?.fr || '';
    const descEn = template.description?.en || '';
    
    if (isBilingual && (descFr || descEn)) {
      if (descFr) {
        elements.push(new docx.Paragraph({
          children: [
            new docx.TextRun({ text: '🇫🇷 Description: ', bold: true, size: 20, font: FONTS.body, color: COLORS.primary }),
            new docx.TextRun({ text: descFr, size: 20, font: FONTS.body })
          ],
          spacing: { before: 100, after: 50 }
        }));
      }
      if (descEn) {
        elements.push(new docx.Paragraph({
          children: [
            new docx.TextRun({ text: '🇬🇧 Description: ', bold: true, size: 20, font: FONTS.body, color: COLORS.primary }),
            new docx.TextRun({ text: descEn, size: 20, font: FONTS.body })
          ],
          spacing: { before: 50, after: 100 }
        }));
      }
    } else {
      const desc = lang === 'en' ? descEn : descFr;
      if (desc) {
        elements.push(new docx.Paragraph({
          children: [
            new docx.TextRun({ text: '📝 Description: ', bold: true, size: 20, font: FONTS.body, color: COLORS.primary }),
            new docx.TextRun({ text: desc, size: 20, font: FONTS.body })
          ],
          spacing: { before: 100, after: 100 }
        }));
      }
    }

    // Subject with highlighted variables
    const subjFr = template.subject?.fr || '';
    const subjEn = template.subject?.en || '';
    
    elements.push(new docx.Paragraph({
      children: [
        new docx.TextRun({
          text: lang === 'en' ? '✉️ Email Subject' : '✉️ Objet du courriel',
          bold: true,
          size: 20,
          font: FONTS.body,
          color: COLORS.primary
        })
      ],
      spacing: { before: 250, after: 100 }
    }));

    if (isBilingual) {
      // French subject
      elements.push(new docx.Paragraph({
        children: [
          new docx.TextRun({ text: '🇫🇷 ', size: 20 }),
          ...createRunsWithHighlightedVariables(subjFr, { size: 20, font: FONTS.body })
        ],
        spacing: { after: 50 },
        shading: { type: docx.ShadingType.SOLID, color: 'F0F9FF' },
        indent: { left: 200, right: 200 }
      }));
      // English subject
      elements.push(new docx.Paragraph({
        children: [
          new docx.TextRun({ text: '🇬🇧 ', size: 20 }),
          ...createRunsWithHighlightedVariables(subjEn, { size: 20, font: FONTS.body })
        ],
        spacing: { after: 100 },
        shading: { type: docx.ShadingType.SOLID, color: 'FEF3C7' },
        indent: { left: 200, right: 200 }
      }));
    } else {
      const subj = lang === 'en' ? subjEn : subjFr;
      elements.push(new docx.Paragraph({
        children: createRunsWithHighlightedVariables(subj, { size: 20, font: FONTS.body }),
        spacing: { after: 100 },
        shading: { type: docx.ShadingType.SOLID, color: COLORS.lightBg },
        indent: { left: 200, right: 200 }
      }));
    }

    // Body with highlighted variables
    const bodyFr = template.body?.fr || '';
    const bodyEn = template.body?.en || '';
    
    elements.push(new docx.Paragraph({
      children: [
        new docx.TextRun({
          text: lang === 'en' ? '📄 Message Body' : '📄 Corps du message',
          bold: true,
          size: 20,
          font: FONTS.body,
          color: COLORS.primary
        })
      ],
      spacing: { before: 250, after: 100 }
    }));

    if (isBilingual) {
      // French body
      elements.push(new docx.Paragraph({
        children: [
          new docx.TextRun({ text: '🇫🇷 FRANÇAIS', bold: true, size: 18, color: COLORS.primary })
        ],
        spacing: { before: 150, after: 50 },
        border: {
          top: { style: docx.BorderStyle.SINGLE, size: 1, color: COLORS.accent },
          left: { style: docx.BorderStyle.SINGLE, size: 6, color: COLORS.accent }
        },
        indent: { left: 200 }
      }));
      
      const paragraphsFr = parseHtmlToParagraphsWithHighlight(bodyFr, { size: 20, font: FONTS.body }, {
        indent: { left: 400 },
        border: {
          left: { style: docx.BorderStyle.SINGLE, size: 6, color: COLORS.accent }
        }
      });
      elements.push(...paragraphsFr);

      // English body
      elements.push(new docx.Paragraph({
        children: [
          new docx.TextRun({ text: '🇬🇧 ENGLISH', bold: true, size: 18, color: COLORS.primary })
        ],
        spacing: { before: 150, after: 50 },
        border: {
          top: { style: docx.BorderStyle.SINGLE, size: 1, color: COLORS.teal },
          left: { style: docx.BorderStyle.SINGLE, size: 6, color: COLORS.teal }
        },
        indent: { left: 200 }
      }));
      
      const paragraphsEn = parseHtmlToParagraphsWithHighlight(bodyEn, { size: 20, font: FONTS.body }, {
        indent: { left: 400 },
        border: {
          left: { style: docx.BorderStyle.SINGLE, size: 6, color: COLORS.teal }
        }
      });
      elements.push(...paragraphsEn);
    } else {
      const body = lang === 'en' ? bodyEn : bodyFr;
      const bodyParagraphs = parseHtmlToParagraphsWithHighlight(body, { size: 20, font: FONTS.body }, {
        indent: { left: 200 },
        border: {
          left: { style: docx.BorderStyle.SINGLE, size: 6, color: COLORS.accent }
        }
      });
      elements.push(...bodyParagraphs);
    }

    // Page break after each template
    elements.push(new docx.Paragraph({
      children: [],
      pageBreakBefore: true
    }));

    return elements;
  }

  /**
   * Create Table of Contents with internal hyperlinks
   */
  function createTableOfContents(templates, categoryLabels, options, bookmarkNames) {
    const elements = [];
    const lang = options.lang === 'en' ? 'en' : 'fr';
    const isBilingual = options.lang === 'both';

    elements.push(new docx.Paragraph({
      children: [],
      pageBreakBefore: true
    }));

    elements.push(new docx.Paragraph({
      children: [
        new docx.TextRun({
          text: options.lang === 'en' ? 'TABLE OF CONTENTS' : 'TABLE DES MATIÈRES',
          bold: true,
          size: 32,
          font: FONTS.heading,
          color: COLORS.primary
        })
      ],
      spacing: { after: 300 }
    }));

    elements.push(createSeparator());

    // Group templates by category
    const byCategory = {};
    templates.forEach((t, index) => {
      const cat = t.category || 'other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push({ template: t, index: index, bookmarkName: bookmarkNames[index] });
    });

    // Generate TOC entries by category with clickable links
    Object.keys(byCategory).sort().forEach(catKey => {
      const catLabel = categoryLabels[catKey]?.[lang] || 
                       categoryLabels[catKey]?.fr || 
                       catKey;

      elements.push(new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: catLabel.toUpperCase(),
            bold: true,
            size: 22,
            font: FONTS.heading,
            color: COLORS.primary
          })
        ],
        spacing: { before: 250, after: 100 },
        shading: { type: docx.ShadingType.SOLID, color: COLORS.lightBg }
      }));

      byCategory[catKey].forEach(({ template, index, bookmarkName }) => {
        const titleFr = template.title?.fr || template.title || '';
        const titleEn = template.title?.en || template.title || '';
        const title = isBilingual ? titleFr : (options.lang === 'en' ? titleEn : titleFr);
        const titleSecondary = isBilingual ? ` / ${titleEn}` : '';

        // Create internal hyperlink to bookmark
        elements.push(new docx.Paragraph({
          children: [
            new docx.TextRun({
              text: `${index + 1}. `,
              bold: true,
              size: 20,
              font: FONTS.body,
              color: COLORS.muted
            }),
            new docx.InternalHyperlink({
              anchor: bookmarkName,
              children: [
                new docx.TextRun({
                  text: title,
                  size: 20,
                  font: FONTS.body,
                  color: '0563C1', // Blue link color
                  underline: { type: docx.UnderlineType.SINGLE, color: '0563C1' }
                })
              ]
            }),
            new docx.TextRun({
              text: titleSecondary,
              size: 18,
              font: FONTS.body,
              color: COLORS.muted,
              italics: true
            })
          ],
          spacing: { after: 60 },
          indent: { left: 360 }
        }));
      });
    });

    elements.push(new docx.Paragraph({
      children: [],
      pageBreakBefore: true
    }));

    return elements;
  }

  /**
   * Create keyword index appendix
   */
  function createKeywordIndex(templates, categoryLabels, options, bookmarkNames) {
    const elements = [];
    const lang = options.lang === 'en' ? 'en' : 'fr';
    const isBilingual = options.lang === 'both';

    elements.push(new docx.Paragraph({
      children: [],
      pageBreakBefore: true
    }));

    elements.push(new docx.Paragraph({
      children: [
        new docx.TextRun({
          text: options.lang === 'en' ? 'INDEX' : 'INDEX',
          bold: true,
          size: 32,
          font: FONTS.heading,
          color: COLORS.primary
        })
      ],
      spacing: { after: 100 }
    }));

    elements.push(new docx.Paragraph({
      children: [
        new docx.TextRun({
          text: options.lang === 'en' ? 'Keyword search reference' : 'Recherche par mot-clé',
          size: 20,
          font: FONTS.body,
          color: COLORS.muted,
          italics: true
        })
      ],
      spacing: { after: 300 }
    }));

    elements.push(createSeparator());

    // Build keyword index from template titles, descriptions, subjects
    const keywordMap = new Map();

    templates.forEach((template, index) => {
      const titleFr = template.title?.fr || '';
      const titleEn = template.title?.en || '';
      const descFr = template.description?.fr || '';
      const descEn = template.description?.en || '';
      const subjFr = template.subject?.fr || '';
      const subjEn = template.subject?.en || '';
      const catKey = template.category || 'other';
      const catLabel = categoryLabels[catKey]?.[lang] || categoryLabels[catKey]?.fr || catKey;

      // Extract keywords from various fields
      const textToIndex = [titleFr, titleEn, descFr, descEn, subjFr, subjEn, catLabel].join(' ');
      
      // Extract significant words (longer than 3 chars, not common words)
      const stopWords = new Set(['pour', 'avec', 'dans', 'from', 'with', 'that', 'this', 'have', 'been', 'will', 'your', 'être', 'avoir', 'fait', 'sont', 'nous', 'vous', 'leur', 'cette', 'tout', 'plus', 'elle', 'quel', 'quoi']);
      const words = textToIndex
        .toLowerCase()
        .replace(/[^\wÀ-ÿ\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w));

      words.forEach(word => {
        const normalizedWord = word.charAt(0).toUpperCase() + word.slice(1);
        if (!keywordMap.has(normalizedWord)) {
          keywordMap.set(normalizedWord, []);
        }
        const existing = keywordMap.get(normalizedWord);
        if (!existing.some(e => e.index === index)) {
          const title = isBilingual ? titleFr : (options.lang === 'en' ? titleEn : titleFr);
          existing.push({ index, title, bookmarkName: bookmarkNames[index] });
        }
      });
    });

    // Sort keywords alphabetically and create index entries
    const sortedKeywords = [...keywordMap.entries()]
      .filter(([_, refs]) => refs.length > 0)
      .sort((a, b) => a[0].localeCompare(b[0], 'fr'));

    let currentLetter = '';
    
    sortedKeywords.forEach(([keyword, refs]) => {
      const firstLetter = keyword.charAt(0).toUpperCase();
      
      // Add letter header
      if (firstLetter !== currentLetter) {
        currentLetter = firstLetter;
        elements.push(new docx.Paragraph({
          children: [
            new docx.TextRun({
              text: currentLetter,
              bold: true,
              size: 28,
              font: FONTS.heading,
              color: COLORS.primary
            })
          ],
          spacing: { before: 300, after: 100 },
          shading: { type: docx.ShadingType.SOLID, color: COLORS.lightBg }
        }));
      }

      // Keyword entry with links to templates
      const linkChildren = [];
      refs.slice(0, 5).forEach((ref, i) => { // Limit to 5 refs per keyword
        if (i > 0) {
          linkChildren.push(new docx.TextRun({ text: ', ', size: 18, font: FONTS.body }));
        }
        linkChildren.push(
          new docx.InternalHyperlink({
            anchor: ref.bookmarkName,
            children: [
              new docx.TextRun({
                text: ref.title.substring(0, 40) + (ref.title.length > 40 ? '...' : ''),
                size: 18,
                font: FONTS.body,
                color: '0563C1',
                underline: { type: docx.UnderlineType.SINGLE, color: '0563C1' }
              })
            ]
          })
        );
      });

      if (refs.length > 5) {
        linkChildren.push(new docx.TextRun({ 
          text: ` (+${refs.length - 5} autres)`, 
          size: 16, 
          font: FONTS.body,
          color: COLORS.muted,
          italics: true
        }));
      }

      elements.push(new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: `${keyword}: `,
            bold: true,
            size: 18,
            font: FONTS.body
          }),
          ...linkChildren
        ],
        spacing: { after: 60 },
        indent: { left: 200 }
      }));
    });

    return elements;
  }

  /**
   * Main export function
   */
  async function generateDocument(data, options = {}) {
    const defaultOptions = {
      lang: 'both'
    };
    options = { ...defaultOptions, ...options };

    // Sort templates by category
    const templates = [...(data.templates || [])];
    const categoryLabels = data.metadata?.categoryLabels || {};
    
    templates.sort((a, b) => {
      const catA = a.category || '';
      const catB = b.category || '';
      if (catA !== catB) return catA.localeCompare(catB);
      const titleA = a.title?.[options.lang === 'en' ? 'en' : 'fr'] || '';
      const titleB = b.title?.[options.lang === 'en' ? 'en' : 'fr'] || '';
      return titleA.localeCompare(titleB);
    });

    // Mark first template in each category
    let lastCategory = null;
    templates.forEach(t => {
      t._isFirstInCategory = t.category !== lastCategory;
      lastCategory = t.category;
    });

    // Create bookmark names for all templates
    const bookmarkNames = templates.map((t, i) => createBookmarkName(t.id, i));

    // Build document sections
    const children = [];

    // Title page
    children.push(...createTitlePage(data, options));

    // Table of contents with internal links
    children.push(...createTableOfContents(templates, categoryLabels, options, bookmarkNames));

    // Templates by category
    templates.forEach((template, index) => {
      const catKey = template.category || 'other';
      const catLabel = categoryLabels[catKey]?.[options.lang === 'en' ? 'en' : 'fr'] || 
                       categoryLabels[catKey]?.fr || 
                       catKey;
      children.push(...createTemplateSection(template, index, templates.length, catLabel, data, options, bookmarkNames[index]));
    });

    // Keyword index appendix
    children.push(...createKeywordIndex(templates, categoryLabels, options, bookmarkNames));

    // Create document with pagination
    const doc = new docx.Document({
      creator: 'ECHO Admin Console - Bureau de la traduction',
      title: options.lang === 'en' ? 'Email Templates Catalog' : 'Catalogue de modèles de courriels',
      description: 'Centre de traitement des demandes - Bureau de la traduction',
      styles: {
        paragraphStyles: [
          {
            id: 'Normal',
            name: 'Normal',
            basedOn: 'Normal',
            next: 'Normal',
            run: {
              font: FONTS.body,
              size: 22
            },
            paragraph: {
              spacing: { line: 276 }
            }
          }
        ]
      },
      sections: [{
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440
            }
          }
        },
        headers: {
          default: new docx.Header({
            children: [
              new docx.Paragraph({
                children: [
                  new docx.TextRun({
                    text: 'Catalogue de modèles – CTD – Bureau de la traduction',
                    size: 18,
                    font: FONTS.body,
                    color: COLORS.muted
                  })
                ],
                alignment: docx.AlignmentType.CENTER,
                border: {
                  bottom: { style: docx.BorderStyle.SINGLE, size: 1, color: COLORS.border }
                }
              })
            ]
          })
        },
        footers: {
          default: new docx.Footer({
            children: [
              new docx.Paragraph({
                children: [
                  new docx.TextRun({
                    text: 'Page ',
                    size: 18,
                    font: FONTS.body,
                    color: COLORS.muted
                  }),
                  new docx.TextRun({
                    children: [docx.PageNumber.CURRENT],
                    size: 18,
                    font: FONTS.body,
                    color: COLORS.muted
                  }),
                  new docx.TextRun({
                    text: ' / ',
                    size: 18,
                    font: FONTS.body,
                    color: COLORS.muted
                  }),
                  new docx.TextRun({
                    children: [docx.PageNumber.TOTAL_PAGES],
                    size: 18,
                    font: FONTS.body,
                    color: COLORS.muted
                  })
                ],
                alignment: docx.AlignmentType.CENTER
              })
            ]
          })
        },
        children: children
      }]
    });

    // Generate blob
    const blob = await docx.Packer.toBlob(doc);
    
    // Download
    const dateStr = new Date().toISOString().slice(0, 10);
    const langSuffix = options.lang === 'both' ? 'bilingue' : options.lang;
    const audienceSuffix = options.audience === 'management' ? '_gestion' : (options.audience === 'users' ? '_utilisateurs' : '');
    const filename = `CTD_Catalogue_Modeles_${langSuffix}${audienceSuffix}_${dateStr}.docx`;
    
    if (typeof saveAs === 'function') {
      saveAs(blob, filename);
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 1000);
    }

    return { success: true, filename };
  }

  // Public API
  return {
    generate: generateDocument
  };
})();

// Export for use
if (typeof window !== 'undefined') {
  window.WordExport = WordExport;
}
