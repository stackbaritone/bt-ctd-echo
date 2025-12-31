// Rich Text Toolbar for Admin Console
// Lightweight vanilla JS implementation similar to RichTextToolbar.jsx

class RichTextToolbar {
  constructor(editorElement, options = {}) {
    this.editor = editorElement;
    this.toolbar = null;
    this.options = {
      buttons: options.buttons || ['bold', 'italic', 'underline', 'strikethrough', 'fontSize', 'fontFamily', 'color', 'highlight', 'alignLeft', 'alignCenter', 'alignRight', 'ul', 'ol'],
      ...options
    };
    this.init();
  }

  init() {
    // Create toolbar
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'rich-text-toolbar';
    this.toolbar.innerHTML = this.generateToolbarHTML();
    
    // Insert before editor
    this.editor.parentNode.insertBefore(this.toolbar, this.editor);
    
    // Make editor contenteditable (don't override existing styles)
    this.editor.contentEditable = true;
    this.editor.classList.add('rich-text-editor-active');
    
    // Attach event listeners
    this.attachEvents();
    
    // Update state on selection change
    document.addEventListener('selectionchange', () => this.updateButtonStates());
  }

  generateToolbarHTML() {
    const buttons = [];
    
    if (this.options.buttons.includes('bold')) {
      buttons.push('<button type="button" class="toolbar-btn" data-command="bold" title="Gras (Ctrl+B)"><strong>B</strong></button>');
    }
    if (this.options.buttons.includes('italic')) {
      buttons.push('<button type="button" class="toolbar-btn" data-command="italic" title="Italique (Ctrl+I)"><em>I</em></button>');
    }
    if (this.options.buttons.includes('underline')) {
      buttons.push('<button type="button" class="toolbar-btn" data-command="underline" title="Souligné (Ctrl+U)"><u>U</u></button>');
    }
    if (this.options.buttons.includes('strikethrough')) {
      buttons.push('<button type="button" class="toolbar-btn" data-command="strikeThrough" title="Barré"><s>S</s></button>');
    }
    
    buttons.push('<span class="toolbar-separator"></span>');
    
    if (this.options.buttons.includes('fontSize')) {
      buttons.push(`
        <select class="toolbar-select toolbar-font-size" data-command="fontSize" title="Taille du texte">
          <option value="1">10pt (Très petit)</option>
          <option value="2">12pt (Petit)</option>
          <option value="3" selected>14pt (Normal)</option>
          <option value="4">16pt (Moyen)</option>
          <option value="5">18pt (Grand)</option>
          <option value="6">24pt (Très grand)</option>
          <option value="7">32pt (Énorme)</option>
        </select>
      `);
    }
    
    if (this.options.buttons.includes('fontFamily')) {
      buttons.push(`
        <select class="toolbar-select" data-command="fontName" title="Police">
          <option value="Arial">Arial</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Courier New">Courier New</option>
          <option value="Georgia">Georgia</option>
          <option value="Verdana">Verdana</option>
        </select>
      `);
    }
    
    buttons.push('<span class="toolbar-separator"></span>');
    
    if (this.options.buttons.includes('color')) {
      buttons.push(`
        <div class="toolbar-color-group">
          <button type="button" class="toolbar-btn toolbar-color-btn" data-type="text" title="Couleur du texte">
            <span class="color-icon">A</span>
            <span class="color-preview" data-color="#000000"></span>
          </button>
          <div class="color-picker-dropdown" data-type="text">
            <div class="color-preset-grid">
              <button class="color-preset" data-color="#000000" style="background: #000000" title="Noir"></button>
              <button class="color-preset" data-color="#dc2626" style="background: #dc2626" title="Rouge"></button>
              <button class="color-preset" data-color="#ea580c" style="background: #ea580c" title="Orange"></button>
              <button class="color-preset" data-color="#ca8a04" style="background: #ca8a04" title="Jaune"></button>
              <button class="color-preset" data-color="#16a34a" style="background: #16a34a" title="Vert"></button>
              <button class="color-preset" data-color="#0284c7" style="background: #0284c7" title="Bleu"></button>
              <button class="color-preset" data-color="#9333ea" style="background: #9333ea" title="Violet"></button>
              <button class="color-preset" data-color="#64748b" style="background: #64748b" title="Gris"></button>
            </div>
            <div class="color-custom">
              <input type="color" class="color-custom-input" value="#000000">
              <span class="color-custom-label">Personnalisé</span>
            </div>
          </div>
        </div>
      `);
    }
    
    if (this.options.buttons.includes('highlight')) {
      buttons.push(`
        <div class="toolbar-color-group">
          <button type="button" class="toolbar-btn toolbar-color-btn" data-type="highlight" title="Surlignage">
            <span class="color-icon">▐</span>
            <span class="color-preview" data-color="#ffeb3b"></span>
          </button>
          <div class="color-picker-dropdown" data-type="highlight">
            <div class="color-preset-grid">
              <button class="color-preset" data-color="transparent" style="background: white; border: 2px solid #e2e8f0" title="Aucun"></button>
              <button class="color-preset" data-color="#fef3c7" style="background: #fef3c7" title="Jaune clair"></button>
              <button class="color-preset" data-color="#ffeb3b" style="background: #ffeb3b" title="Jaune"></button>
              <button class="color-preset" data-color="#bfdbfe" style="background: #bfdbfe" title="Bleu clair"></button>
              <button class="color-preset" data-color="#bbf7d0" style="background: #bbf7d0" title="Vert clair"></button>
              <button class="color-preset" data-color="#fecaca" style="background: #fecaca" title="Rouge clair"></button>
              <button class="color-preset" data-color="#e9d5ff" style="background: #e9d5ff" title="Violet clair"></button>
              <button class="color-preset" data-color="#fed7aa" style="background: #fed7aa" title="Orange clair"></button>
            </div>
            <div class="color-custom">
              <input type="color" class="color-custom-input" value="#ffeb3b">
              <span class="color-custom-label">Personnalisé</span>
            </div>
          </div>
        </div>
      `);
      buttons.push('<button type="button" class="toolbar-btn toolbar-btn-small" data-command="removeFormat" title="Effacer format">✖</button>');
    }
    
    buttons.push('<span class="toolbar-separator"></span>');
    
    if (this.options.buttons.includes('alignLeft')) {
      buttons.push('<button type="button" class="toolbar-btn" data-command="justifyLeft" title="Aligner à gauche">⬅</button>');
    }
    if (this.options.buttons.includes('alignCenter')) {
      buttons.push('<button type="button" class="toolbar-btn" data-command="justifyCenter" title="Centrer">↔</button>');
    }
    if (this.options.buttons.includes('alignRight')) {
      buttons.push('<button type="button" class="toolbar-btn" data-command="justifyRight" title="Aligner à droite">➡</button>');
    }
    
    buttons.push('<span class="toolbar-separator"></span>');
    
    if (this.options.buttons.includes('ul')) {
      buttons.push('<button type="button" class="toolbar-btn" data-command="insertUnorderedList" title="Liste à puces">• List</button>');
    }
    if (this.options.buttons.includes('ol')) {
      buttons.push('<button type="button" class="toolbar-btn" data-command="insertOrderedList" title="Liste numérotée">1. List</button>');
    }
    
    return buttons.join('');
  }

  attachEvents() {
    // Button clicks (except color buttons)
    this.toolbar.querySelectorAll('.toolbar-btn:not(.toolbar-color-btn)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const command = btn.dataset.command;
        this.execCommand(command);
      });
    });
    
    // Select changes
    this.toolbar.querySelectorAll('.toolbar-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const command = select.dataset.command;
        const value = select.value;
        this.execCommand(command, value);
        this.editor.focus();
      });
    });
    
    // Color picker dropdowns
    this.toolbar.querySelectorAll('.toolbar-color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const group = btn.closest('.toolbar-color-group');
        const dropdown = group.querySelector('.color-picker-dropdown');
        
        // Close other dropdowns
        this.toolbar.querySelectorAll('.color-picker-dropdown').forEach(d => {
          if (d !== dropdown) d.classList.remove('show');
        });
        
        dropdown.classList.toggle('show');
      });
    });
    
    // Color preset clicks
    this.toolbar.querySelectorAll('.color-preset').forEach(preset => {
      preset.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const color = preset.dataset.color;
        const dropdown = preset.closest('.color-picker-dropdown');
        const type = dropdown.dataset.type;
        
        this.applyColor(type, color);
        dropdown.classList.remove('show');
      });
    });
    
    // Custom color inputs
    this.toolbar.querySelectorAll('.color-custom-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const color = input.value;
        const dropdown = input.closest('.color-picker-dropdown');
        const type = dropdown.dataset.type;
        
        this.applyColor(type, color);
        dropdown.classList.remove('show');
      });
    });
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.toolbar-color-group')) {
        this.toolbar.querySelectorAll('.color-picker-dropdown').forEach(d => {
          d.classList.remove('show');
        });
      }
    });
  }
  
  applyColor(type, color) {
    const command = type === 'text' ? 'foreColor' : 'hiliteColor';
    this.execCommand(command, color);
    
    // Update preview
    const preview = this.toolbar.querySelector(`.toolbar-color-btn[data-type="${type}"] .color-preview`);
    if (preview) {
      preview.dataset.color = color;
      preview.style.background = color === 'transparent' ? 'white' : color;
    }
  }

  execCommand(command, value = null) {
    this.editor.focus();
    document.execCommand(command, false, value);
    this.updateButtonStates();
  }

  updateButtonStates() {
    if (!this.toolbar) return;
    
    // Update button active states
    const commands = ['bold', 'italic', 'underline', 'strikeThrough'];
    commands.forEach(cmd => {
      const btn = this.toolbar.querySelector(`[data-command="${cmd}"]`);
      if (btn) {
        const isActive = document.queryCommandState(cmd);
        btn.classList.toggle('active', isActive);
      }
    });
  }

  getHTML() {
    return this.editor.innerHTML;
  }

  setHTML(html) {
    this.editor.innerHTML = html;
  }

  destroy() {
    if (this.toolbar) {
      this.toolbar.remove();
    }
    this.editor.contentEditable = false;
  }
}

// CSS for toolbar (inject into page)
const toolbarStyles = `
  .rich-text-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    border-bottom: none;
    border-radius: 10px 10px 0 0;
    align-items: center;
    margin-bottom: -1px;
  }
  
  .toolbar-btn {
    padding: 6px 10px;
    border: 1px solid #e2e8f0;
    background: white;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
    min-width: 32px;
    text-align: center;
  }
  
  .toolbar-btn:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }
  
  .toolbar-btn.active {
    background: #059669;
    color: white;
    border-color: #059669;
  }
  
  .toolbar-btn-small {
    padding: 4px 8px;
    font-size: 11px;
    min-width: 24px;
  }
  
  .toolbar-select {
    padding: 5px 8px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    font-size: 13px;
    font-family: inherit;
  }
  
  .toolbar-font-size {
    min-width: 160px;
  }
  
  .toolbar-select:focus {
    outline: 2px solid #0ea5e9;
    outline-offset: 1px;
  }
  
  .toolbar-color-group {
    position: relative;
  }
  
  .toolbar-color-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
    position: relative;
  }
  
  .color-icon {
    font-size: 14px;
    font-weight: bold;
  }
  
  .color-preview {
    width: 16px;
    height: 16px;
    border: 1px solid #cbd5e1;
    border-radius: 3px;
    display: inline-block;
  }
  
  .color-preview[data-color="#000000"] {
    background: #000000;
  }
  
  .color-preview[data-color="#ffeb3b"] {
    background: #ffeb3b;
  }
  
  .color-picker-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 8px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    display: none;
    min-width: 200px;
  }
  
  .color-picker-dropdown.show {
    display: block;
  }
  
  .color-preset-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-bottom: 8px;
  }
  
  .color-preset {
    width: 40px;
    height: 40px;
    border: 2px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .color-preset:hover {
    transform: scale(1.1);
    border-color: #0ea5e9;
  }
  
  .color-custom {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid #e2e8f0;
  }
  
  .color-custom-input {
    width: 40px;
    height: 32px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    cursor: pointer;
  }
  
  .color-custom-label {
    font-size: 12px;
    color: #64748b;
  }
  
  .toolbar-separator {
    width: 1px;
    height: 20px;
    background: #e2e8f0;
    margin: 0 2px;
  }
  
  .rich-text-toolbar + .rich-text-editor {
    border-top-left-radius: 0 !important;
    border-top-right-radius: 0 !important;
  }
  
  .rich-text-editor-active {
    border-top-left-radius: 0 !important;
    border-top-right-radius: 0 !important;
  }
  
  /* Dark mode support */
  .dark .rich-text-toolbar,
  html.dark .rich-text-toolbar {
    background: #1e293b;
    border-color: #334155;
  }
  
  .dark .toolbar-btn,
  html.dark .toolbar-btn {
    background: #334155;
    border-color: #475569;
    color: #e2e8f0;
  }
  
  .dark .toolbar-btn:hover,
  html.dark .toolbar-btn:hover {
    background: #475569;
    border-color: #64748b;
  }
  
  .dark .toolbar-btn.active,
  html.dark .toolbar-btn.active {
    background: #059669;
    color: white;
    border-color: #059669;
  }
  
  .dark .toolbar-select,
  html.dark .toolbar-select {
    background: #334155;
    border-color: #475569;
    color: #e2e8f0;
  }
  
  .dark .toolbar-select option,
  html.dark .toolbar-select option {
    background: #1e293b;
    color: #e2e8f0;
  }
  
  .dark .toolbar-separator,
  html.dark .toolbar-separator {
    background: #475569;
  }
  
  .dark .color-picker-dropdown,
  html.dark .color-picker-dropdown {
    background: #1e293b;
    border-color: #334155;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
  }
  
  .dark .color-custom,
  html.dark .color-custom {
    border-top-color: #334155;
  }
  
  .dark .color-custom-label,
  html.dark .color-custom-label {
    color: #94a3b8;
  }
  
  .dark .color-preview,
  html.dark .color-preview {
    border-color: #475569;
  }
`;

// Auto-inject styles
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = toolbarStyles;
  document.head.appendChild(styleEl);
}

// Export for use in admin-simple.js
if (typeof window !== 'undefined') {
  window.RichTextToolbar = RichTextToolbar;
}
