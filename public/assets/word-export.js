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
    border: 'E2E8F0'
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
    // Replace <br> and block elements with newlines
    temp.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    temp.querySelectorAll('p, div, li').forEach(el => {
      el.prepend(document.createTextNode('\n'));
    });
    return temp.textContent || temp.innerText || '';
  }

  /**
   * Parse HTML and create formatted text runs (for inline use in a single paragraph)
   */
  function parseHtmlToRuns(html, defaultOptions = {}) {
    if (!html) return [new docx.TextRun({ text: '', ...defaultOptions })];
    
    const runs = [];
    const temp = document.createElement('div');
    temp.innerHTML = html;

    function processNode(node, inherited = {}) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (text) {
          runs.push(new docx.TextRun({
            text: text,
            ...defaultOptions,
            ...inherited
          }));
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.tagName.toLowerCase();
      const newInherited = { ...inherited };

      // Handle formatting tags
      if (tag === 'strong' || tag === 'b') newInherited.bold = true;
      if (tag === 'em' || tag === 'i') newInherited.italics = true;
      if (tag === 'u') newInherited.underline = { type: docx.UnderlineType.SINGLE };
      if (tag === 'br') {
        runs.push(new docx.TextRun({ text: '', break: 1, ...defaultOptions }));
        return;
      }
      if (tag === 'p' || tag === 'div') {
        if (runs.length > 0) {
          runs.push(new docx.TextRun({ text: '', break: 1, ...defaultOptions }));
        }
      }

      // Process children
      node.childNodes.forEach(child => processNode(child, newInherited));

      // Add line break after block elements
      if (tag === 'p' || tag === 'div' || tag === 'li') {
        runs.push(new docx.TextRun({ text: '', break: 1, ...defaultOptions }));
      }
    }

    temp.childNodes.forEach(child => processNode(child));

    // Clean up: remove trailing empty breaks
    while (runs.length > 0 && runs[runs.length - 1].text === '' && runs[runs.length - 1].break) {
      runs.pop();
    }

    return runs.length > 0 ? runs : [new docx.TextRun({ text: '', ...defaultOptions })];
  }

  /**
   * Parse HTML and create multiple Word paragraphs (preserves block structure)
   * This creates proper separate paragraphs for each <p>, <div>, or double <br>
   */
  function parseHtmlToParagraphs(html, defaultOptions = {}, paragraphOptions = {}) {
    if (!html) return [new docx.Paragraph({ children: [new docx.TextRun({ text: '', ...defaultOptions })], ...paragraphOptions })];
    
    const paragraphs = [];
    let currentRuns = [];
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Flush current runs into a paragraph
    function flushParagraph() {
      // Remove trailing empty breaks from current runs
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

    function processNode(node, inherited = {}) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (text) {
          currentRuns.push(new docx.TextRun({
            text: text,
            ...defaultOptions,
            ...inherited
          }));
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.tagName.toLowerCase();
      const newInherited = { ...inherited };

      // Handle formatting tags
      if (tag === 'strong' || tag === 'b') newInherited.bold = true;
      if (tag === 'em' || tag === 'i') newInherited.italics = true;
      if (tag === 'u') newInherited.underline = { type: docx.UnderlineType.SINGLE };
      if (tag === 's' || tag === 'strike' || tag === 'del') newInherited.strike = true;
      
      // Handle line breaks
      if (tag === 'br') {
        currentRuns.push(new docx.TextRun({ text: '', break: 1, ...defaultOptions }));
        return;
      }

      // Block elements create new paragraphs
      if (tag === 'p' || tag === 'div') {
        flushParagraph();
        // Process children
        node.childNodes.forEach(child => processNode(child, newInherited));
        flushParagraph();
        return;
      }

      // List items
      if (tag === 'li') {
        flushParagraph();
        currentRuns.push(new docx.TextRun({ text: '• ', ...defaultOptions, ...newInherited }));
        node.childNodes.forEach(child => processNode(child, newInherited));
        flushParagraph();
        return;
      }

      // Unordered/ordered lists - process children
      if (tag === 'ul' || tag === 'ol') {
        flushParagraph();
        node.childNodes.forEach(child => processNode(child, newInherited));
        return;
      }

      // Process children for other elements
      node.childNodes.forEach(child => processNode(child, newInherited));
    }

    temp.childNodes.forEach(child => processNode(child));
    
    // Flush any remaining content
    flushParagraph();

    // Return at least one empty paragraph if nothing was generated
    if (paragraphs.length === 0) {
      paragraphs.push(new docx.Paragraph({ 
        children: [new docx.TextRun({ text: '', ...defaultOptions })],
        ...paragraphOptions 
      }));
    }

    return paragraphs;
  }

  /**
   * Create a styled heading
   */
  function createHeading(text, level = 1) {
    const sizes = { 1: 32, 2: 26, 3: 22, 4: 18 };
    const spacing = { 1: 400, 2: 300, 3: 200, 4: 150 };
    
    return new docx.Paragraph({
      children: [
        new docx.TextRun({
          text: text,
          bold: level <= 2,
          size: sizes[level] || 18,
          font: FONTS.heading,
          color: COLORS.primary
        })
      ],
      spacing: { before: spacing[level] || 150, after: 100 },
      heading: level === 1 ? docx.HeadingLevel.HEADING_1 : 
               level === 2 ? docx.HeadingLevel.HEADING_2 : 
               level === 3 ? docx.HeadingLevel.HEADING_3 : undefined
    });
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
   * Create a labeled section with content
   */
  function createLabeledSection(label, content, options = {}) {
    const elements = [];
    
    // Label
    elements.push(new docx.Paragraph({
      children: [
        new docx.TextRun({
          text: label,
          bold: true,
          size: 20,
          font: FONTS.body,
          color: COLORS.primary
        })
      ],
      spacing: { before: 150, after: 50 }
    }));

    // Content
    if (typeof content === 'string') {
      const runs = options.preserveHtml ? parseHtmlToRuns(content, { size: 20, font: FONTS.body }) : 
                   [new docx.TextRun({ text: content, size: 20, font: FONTS.body })];
      elements.push(new docx.Paragraph({
        children: runs,
        spacing: { after: 100 }
      }));
    } else if (Array.isArray(content)) {
      content.forEach(item => {
        elements.push(new docx.Paragraph({
          children: [new docx.TextRun({ text: `• ${item}`, size: 20, font: FONTS.body })],
          spacing: { after: 50 },
          indent: { left: 360 }
        }));
      });
    }

    return elements;
  }

  /**
   * Create a bilingual content box
   */
  function createBilingualBox(labelFr, labelEn, contentFr, contentEn, options = {}) {
    const elements = [];

    // French section
    elements.push(new docx.Paragraph({
      children: [
        new docx.TextRun({ text: '🇫🇷 ', size: 20 }),
        new docx.TextRun({ text: labelFr, bold: true, size: 20, font: FONTS.body, color: COLORS.primary })
      ],
      spacing: { before: 150, after: 50 },
      shading: { type: docx.ShadingType.SOLID, color: 'F0F9FF' }
    }));

    if (contentFr) {
      const runsFr = options.preserveHtml ? parseHtmlToRuns(contentFr, { size: 20, font: FONTS.body }) :
                     [new docx.TextRun({ text: contentFr, size: 20, font: FONTS.body })];
      elements.push(new docx.Paragraph({
        children: runsFr,
        spacing: { after: 150 },
        indent: { left: 360 }
      }));
    }

    // English section
    elements.push(new docx.Paragraph({
      children: [
        new docx.TextRun({ text: '🇬🇧 ', size: 20 }),
        new docx.TextRun({ text: labelEn, bold: true, size: 20, font: FONTS.body, color: COLORS.primary })
      ],
      spacing: { before: 100, after: 50 },
      shading: { type: docx.ShadingType.SOLID, color: 'FEF3C7' }
    }));

    if (contentEn) {
      const runsEn = options.preserveHtml ? parseHtmlToRuns(contentEn, { size: 20, font: FONTS.body }) :
                     [new docx.TextRun({ text: contentEn, size: 20, font: FONTS.body })];
      elements.push(new docx.Paragraph({
        children: runsEn,
        spacing: { after: 150 },
        indent: { left: 360 }
      }));
    }

    return elements;
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
      // Spacer
      new docx.Paragraph({ spacing: { before: 1000 } }),
      
      // Title
      new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: 'ECHO',
            bold: true,
            size: 72,
            font: 'Varela Round',
            color: COLORS.primary
          })
        ],
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 200 }
      }),
      
      // Decorative line
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

      // Main title
      new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: options.lang === 'en' ? 'EMAIL TEMPLATES CATALOG' : 'CATALOGUE DES GABARITS DE COURRIELS',
            bold: true,
            size: 36,
            font: FONTS.heading,
            color: COLORS.text
          })
        ],
        alignment: docx.AlignmentType.CENTER,
        spacing: { after: 600 }
      }),

      // Stats
      new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: `📧 ${templateCount} ${options.lang === 'en' ? 'templates available' : 'gabarits disponibles'}`,
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
        spacing: { after: 800 }
      }),

      // Decorative line
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

      // Date
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

      // Page break
      new docx.Paragraph({
        children: [],
        pageBreakBefore: true
      })
    ];
  }

  /**
   * Create a template section
   */
  function createTemplateSection(template, index, total, categoryLabel, data, options) {
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

    // Template title bar
    const titleFr = template.title?.fr || template.title || '';
    const titleEn = template.title?.en || template.title || '';
    const title = isBilingual ? titleFr : (lang === 'en' ? titleEn : titleFr);
    const titleSecondary = isBilingual ? titleEn : null;

    elements.push(createSeparator());

    elements.push(new docx.Paragraph({
      children: [
        new docx.TextRun({
          text: title,
          bold: true,
          size: 26,
          font: FONTS.heading,
          color: COLORS.primary
        })
      ],
      spacing: { before: 100, after: 50 }
    }));

    if (titleSecondary) {
      elements.push(new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: titleSecondary,
            italics: true,
            size: 22,
            font: FONTS.body,
            color: COLORS.muted
          })
        ],
        spacing: { after: 150 }
      }));
    }

    // Description (optional - only if present)
    const descFr = template.description?.fr || '';
    const descEn = template.description?.en || '';
    
    if (isBilingual && (descFr || descEn)) {
      elements.push(...createBilingualBox('Description', 'Description', descFr, descEn));
    } else {
      const desc = lang === 'en' ? descEn : descFr;
      if (desc) {
        elements.push(...createLabeledSection('📝 Description', desc));
      }
    }

    const vars = detectPlaceholders(template);
    if (vars.length > 0 && options.includeVariables) {
      elements.push(new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: lang === 'en' ? '📋 Variables used' : '📋 Variables utilisées',
            bold: true,
            size: 20,
            font: FONTS.body,
            color: COLORS.primary
          })
        ],
        spacing: { before: 200, after: 100 }
      }));

      // Create a table for variables
      const varLib = data.variables || {};
      const tableRows = [
        new docx.TableRow({
          children: [
            new docx.TableCell({
              children: [new docx.Paragraph({ 
                children: [new docx.TextRun({ text: 'Variable', bold: true, size: 18, font: FONTS.body })]
              })],
              shading: { type: docx.ShadingType.SOLID, color: COLORS.lightBg },
              width: { size: 2500, type: docx.WidthType.DXA }
            }),
            new docx.TableCell({
              children: [new docx.Paragraph({ 
                children: [new docx.TextRun({ text: 'Description', bold: true, size: 18, font: FONTS.body })]
              })],
              shading: { type: docx.ShadingType.SOLID, color: COLORS.lightBg },
              width: { size: 4500, type: docx.WidthType.DXA }
            }),
            new docx.TableCell({
              children: [new docx.Paragraph({ 
                children: [new docx.TextRun({ text: lang === 'en' ? 'Example' : 'Exemple', bold: true, size: 18, font: FONTS.body })]
              })],
              shading: { type: docx.ShadingType.SOLID, color: COLORS.lightBg },
              width: { size: 2000, type: docx.WidthType.DXA }
            })
          ]
        })
      ];

      vars.forEach(v => {
        const info = varLib[v] || {};
        const desc = info.description?.[lang === 'en' ? 'en' : 'fr'] || info.description?.fr || '';
        const example = info.example?.[lang === 'en' ? 'en' : 'fr'] || info.example?.fr || '';
        
        tableRows.push(new docx.TableRow({
          children: [
            new docx.TableCell({
              children: [new docx.Paragraph({ 
                children: [new docx.TextRun({ text: `<<${v}>>`, size: 18, font: FONTS.mono, color: COLORS.teal })]
              })]
            }),
            new docx.TableCell({
              children: [new docx.Paragraph({ 
                children: [new docx.TextRun({ text: desc, size: 18, font: FONTS.body })]
              })]
            }),
            new docx.TableCell({
              children: [new docx.Paragraph({ 
                children: [new docx.TextRun({ text: example, size: 18, font: FONTS.body, italics: true, color: COLORS.muted })]
              })]
            })
          ]
        }));
      });

      elements.push(new docx.Table({
        rows: tableRows,
        width: { size: 100, type: docx.WidthType.PERCENTAGE },
        borders: {
          top: { style: docx.BorderStyle.SINGLE, size: 1, color: COLORS.border },
          bottom: { style: docx.BorderStyle.SINGLE, size: 1, color: COLORS.border },
          left: { style: docx.BorderStyle.SINGLE, size: 1, color: COLORS.border },
          right: { style: docx.BorderStyle.SINGLE, size: 1, color: COLORS.border },
          insideHorizontal: { style: docx.BorderStyle.SINGLE, size: 1, color: COLORS.border },
          insideVertical: { style: docx.BorderStyle.SINGLE, size: 1, color: COLORS.border }
        }
      }));
    }

    // Subject
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
      elements.push(...createBilingualBox('Français', 'English', subjFr, subjEn));
    } else {
      const subj = lang === 'en' ? subjEn : subjFr;
      elements.push(new docx.Paragraph({
        children: [new docx.TextRun({ text: subj, size: 20, font: FONTS.body })],
        spacing: { after: 100 },
        shading: { type: docx.ShadingType.SOLID, color: COLORS.lightBg },
        indent: { left: 200, right: 200 }
      }));
    }

    // Body
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
      // French body with border
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
      
      // Use parseHtmlToParagraphs for proper paragraph separation with formatting
      const paragraphsFr = parseHtmlToParagraphs(bodyFr, { size: 20, font: FONTS.body }, {
        indent: { left: 400 },
        border: {
          left: { style: docx.BorderStyle.SINGLE, size: 6, color: COLORS.accent }
        }
      });
      elements.push(...paragraphsFr);

      // English body with border
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
      
      // Use parseHtmlToParagraphs for proper paragraph separation with formatting
      const paragraphsEn = parseHtmlToParagraphs(bodyEn, { size: 20, font: FONTS.body }, {
        indent: { left: 400 },
        border: {
          left: { style: docx.BorderStyle.SINGLE, size: 6, color: COLORS.teal }
        }
      });
      elements.push(...paragraphsEn);
    } else {
      const body = lang === 'en' ? bodyEn : bodyFr;
      // Use parseHtmlToParagraphs for proper paragraph separation with formatting
      const bodyParagraphs = parseHtmlToParagraphs(body, { size: 20, font: FONTS.body }, {
        indent: { left: 200 },
        border: {
          left: { style: docx.BorderStyle.SINGLE, size: 6, color: COLORS.accent }
        }
      });
      elements.push(...bodyParagraphs);
    }

    // Page break after EVERY template (one template per page)
    elements.push(new docx.Paragraph({
      children: [],
      pageBreakBefore: true
    }));

    return elements;
  }

  /**
   * Create Table of Contents
   */
  function createTableOfContents(templates, categoryLabels, options) {
    const elements = [];
    const lang = options.lang === 'en' ? 'en' : 'fr';
    const isBilingual = options.lang === 'both';

    // Page break before TOC
    elements.push(new docx.Paragraph({
      children: [],
      pageBreakBefore: true
    }));

    // TOC Title
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
      byCategory[cat].push({ template: t, index: index + 1 });
    });

    // Generate TOC entries by category
    Object.keys(byCategory).sort().forEach(catKey => {
      const catLabel = categoryLabels[catKey]?.[lang] || 
                       categoryLabels[catKey]?.fr || 
                       catKey;

      // Category heading
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

      // Templates in this category
      byCategory[catKey].forEach(({ template, index }) => {
        const titleFr = template.title?.fr || template.title || '';
        const titleEn = template.title?.en || template.title || '';
        const title = isBilingual ? titleFr : (options.lang === 'en' ? titleEn : titleFr);
        const titleSecondary = isBilingual ? ` / ${titleEn}` : '';

        elements.push(new docx.Paragraph({
          children: [
            new docx.TextRun({
              text: `${index}. `,
              bold: true,
              size: 20,
              font: FONTS.body,
              color: COLORS.muted
            }),
            new docx.TextRun({
              text: title,
              size: 20,
              font: FONTS.body,
              color: COLORS.text
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

    // Page break after TOC
    elements.push(new docx.Paragraph({
      children: [],
      pageBreakBefore: true
    }));

    return elements;
  }

  /**
   * Main export function
   */
  async function generateDocument(data, options = {}) {
    const defaultOptions = {
      lang: 'both', // 'fr', 'en', or 'both'
      includeVariables: true,
      includeAppendix: true
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

    // Build document sections
    const children = [];

    // Title page
    children.push(...createTitlePage(data, options));

    // Table of contents (after title page, before templates)
    children.push(...createTableOfContents(templates, categoryLabels, options));

    // Templates by category
    templates.forEach((template, index) => {
      const catKey = template.category || 'other';
      const catLabel = categoryLabels[catKey]?.[options.lang === 'en' ? 'en' : 'fr'] || 
                       categoryLabels[catKey]?.fr || 
                       catKey;
      children.push(...createTemplateSection(template, index, templates.length, catLabel, data, options));
    });

    // Create document
    const doc = new docx.Document({
      creator: 'ECHO Admin Console',
      title: options.lang === 'en' ? 'Email Templates Catalog' : 'Catalogue des gabarits de courriels',
      description: 'Auto-generated email templates catalog',
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
              top: 1440,    // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440
            }
          }
        },
        children: children
      }]
    });

    // Generate blob
    const blob = await docx.Packer.toBlob(doc);
    
    // Download
    const dateStr = new Date().toISOString().slice(0, 10);
    const langSuffix = options.lang === 'both' ? 'bilingue' : options.lang;
    const filename = `ECHO_Catalogue_Gabarits_${langSuffix}_${dateStr}.docx`;
    
    // Use FileSaver or native download
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
