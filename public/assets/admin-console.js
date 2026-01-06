// Admin Console for Email Assistant v6
(function () {
  try { window.__EA_SCRIPT_LOADED = Date.now(); } catch {}
  const JSON_PATH = './complete_email_templates.json';
  const DRAFT_KEY = 'ea_admin_draft_v2';

  // State
  let data = null;              // { metadata, variables, templates }
  let lang = (function(){ try { return localStorage.getItem('ea_admin_lang') || 'fr'; } catch { return 'fr'; } })(); // UI edit language toggle for localized fields
  let selectedTemplateId = null;
  let searchTerm = '';
  let filterCategory = 'all';
  let bulkMode = false;
  let selectedTemplateIds = new Set();
  // When true, the next sidebar render will focus and scroll the active tile into view
  let _revealActiveOnRender = false;

  // DOM
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const kpiTemplates = $('#kpi-templates');
  const kpiVariables = $('#kpi-variables');
  const warningsEl = $('#warnings');
  const noticeEl = $('#notice');
  // Modal elements (for previews/confirmations)
  const modal = $('#modal');
  const modalTitle = $('#modal-title');
  const modalBody = $('#modal-body');
  const modalConfirm = $('#modal-confirm');
  const modalCancel = $('#modal-cancel');
  const modalClose = $('#modal-close');

  // Global diagnostics: surface runtime errors in the UI, and log boot
  try {
    console.info('[Admin Console] Booting admin-console.js…');
    window.addEventListener('error', (e) => {
      try { notify('Erreur: ' + (e?.error?.message || e?.message || 'inconnue'), 'warn'); } catch {}
      console.error('[Admin Console] window.onerror', e?.error || e);
    });
    window.addEventListener('unhandledrejection', (e) => {
      try { notify('Erreur (promesse): ' + (e?.reason?.message || String(e?.reason) || 'inconnue'), 'warn'); } catch {}
      console.error('[Admin Console] unhandledrejection', e?.reason);
    });
  } catch {}

  const langSwitch = $('#lang-switch');
  const fileInput = $('#file-input');
  const btnImport = $('#btn-import');
  const btnExport = $('#btn-export');
  const btnReset = $('#btn-reset');
  const btnHelp = $('#btn-help');
  const btnGithub = document.getElementById('btn-github');

  const btnNewTemplate = $('#btn-new-template');
  const btnBulkImport = $('#btn-bulk-import');
  const searchInput = $('#search');
  const catFilterSel = $('#filter-category');
  const tplList = $('#template-list');
  const bulkFileInput = $('#bulk-file');

  const tabTemplates = $('#tab-templates');
  const tabVariables = $('#tab-variables');
  const tabMetadata = $('#tab-metadata');
  const viewTemplates = $('#view-templates');
  const viewVariables = $('#view-variables');
  const viewMetadata = $('#view-metadata');

  const btnDuplicate = $('#btn-duplicate');
  const btnDelete = $('#btn-delete');
  const btnSave = $('#btn-save');
  const btnPreview = $('#btn-preview');
  // Keep a short-lived snapshot of the last non-empty warnings
  let lastWarnSnapshot = { items: [], at: 0 };
  // Warnings-driven filtering/navigation helpers
  let warnFilterActive = false;
  let warnTplIds = new Set();

  function escapeReg(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

  // Utils
  const debounce = (fn, ms = 300) => {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  };
  const download = (filename, content) => {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    a.remove();
  };
  const saveDraft = debounce(() => {
    if (!data) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data, null, 2));
      notify('Brouillon enregistré localement.');
      renderWarnings();
    } catch (e) {
      notify('Erreur lors de l’enregistrement du brouillon.', 'warn');
      console.error(e);
    }
  }, 400);
  function showModal({ title, bodyHtml, confirmText = 'Confirmer', onConfirm }) {
    if (!modal) { alert('' + (bodyHtml?.replace?.(/<[^>]+>/g, '') || '')); if (onConfirm) onConfirm(); return; }
    modalTitle.textContent = title || 'Aperçu';
    modalBody.innerHTML = bodyHtml || '';
    if (modalConfirm) modalConfirm.textContent = confirmText;
    const close = () => { modal.style.display = 'none'; modalConfirm.onclick = null; };
    if (modalCancel) modalCancel.onclick = close;
    if (modalClose) modalClose.onclick = close;
    if (modalConfirm) modalConfirm.onclick = () => { try { onConfirm && onConfirm(); } finally { close(); } };
    modal.style.display = 'flex';
  }
  // Ephemeral notification (does not hide persistent warnings)
  const notify = (msg, type = 'info') => {
    if (!noticeEl) return;
    noticeEl.style.display = 'block';
    noticeEl.style.background = (type === 'warn') ? '#7c2d12' : '#111827';
    noticeEl.style.borderColor = (type === 'warn') ? '#fed7aa' : 'rgba(255,255,255,0.1)';
    noticeEl.textContent = msg;
    clearTimeout(notify._t);
    notify._t = setTimeout(() => { noticeEl.style.display = 'none'; }, 2500);
  };

  const stripDiacritics = (value = '') => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const toSnakeCase = (value = '') => stripDiacritics(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  const deriveCategoryKey = (current = '', labelEn = '', labelFr = '') => {
    const candidates = [current, labelEn, labelFr]
      .map(v => String(v || '').trim())
      .filter(Boolean);
    if (!candidates.length) return '';
    for (const candidate of candidates) {
      if (/^[a-z0-9_]+$/.test(candidate) && candidate === candidate.toLowerCase()) return candidate;
    }
    return toSnakeCase(candidates[0]);
  };
  const syncTemplateCategory = (template) => {
    if (!template || !data) return;
    const labels = data.metadata.categoryLabels || (data.metadata.categoryLabels = {});
    const key = deriveCategoryKey(template.category, template.category_en, template.category_fr);
    template.category = key;
    if (key) {
      if (!labels[key]) labels[key] = { fr: '', en: '' };
      if (template.category_fr) labels[key].fr = template.category_fr;
      if (template.category_en) labels[key].en = template.category_en;
    }
  };
  const getCategoryLabel = (key, fallback = '') => {
    if (!key) return fallback || '';
    const labels = data?.metadata?.categoryLabels?.[key];
    if (labels) {
      const primary = (lang === 'fr' ? labels.fr : labels.en) || '';
      if (primary.trim()) return primary;
      const secondary = (lang === 'fr' ? labels.en : labels.fr) || '';
      if (secondary.trim()) return secondary;
    }
    return fallback || key;
  };

  function ensureSchema(obj) {
    if (!obj || typeof obj !== 'object') obj = {};
    obj.metadata = obj.metadata || { version: '1.0', totalTemplates: 0, languages: ['fr', 'en'], categories: [] };
    obj.metadata.categoryColors = obj.metadata.categoryColors || {};
    obj.metadata.categoryLabels = obj.metadata.categoryLabels || {};
    obj.variables = obj.variables || {};
    obj.templates = Array.isArray(obj.templates) ? obj.templates : [];
    return obj;
  }

  function loadFromDraft() {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    try {
      return ensureSchema(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async function tryFetchJson(url) {
    const resp = await fetch(url, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }

  async function loadInitial() {
    const draft = loadFromDraft();
    if (draft) {
      data = draft;
      afterDataLoad();
      return;
    }
    const candidates = [
      '/complete_email_templates.json', // user confirmed this URL works
      JSON_PATH,
      './assets/complete_email_templates.json',
      '/assets/complete_email_templates.json',
      './public/complete_email_templates.json',
      '/public/complete_email_templates.json'
    ];
    let loaded = null, lastErr = null;
    for (const u of candidates) {
      try {
        const json = await tryFetchJson(u);
        loaded = ensureSchema(json);
        break;
      } catch (e) { lastErr = e; }
    }
    if (!loaded) {
      notify('Erreur de chargement du JSON (aucune source trouvée).', 'warn');
      console.error('Failed to load any template JSON from', candidates, lastErr);
      loaded = ensureSchema({});
    }
    data = loaded;
    afterDataLoad();
    try {
      const n = data?.templates?.length || 0;
      console.info('[Admin Console] Loaded templates:', n);
      notify(`${n} template(s) chargé(s)`);
    } catch {}
  }

  function afterDataLoad() {
    data.metadata.categoryLabels = data.metadata.categoryLabels || {};
    (data.templates || []).forEach(t => {
      if (t.category && !t.category_fr && !t.category_en) {
        t.category_fr = t.category_fr || t.category;
        t.category_en = t.category_en || t.category;
      } else {
        if (!t.category_fr && t.category_en) t.category_fr = t.category_en;
        if (!t.category_en && t.category_fr) t.category_en = t.category_fr;
      }
      syncTemplateCategory(t);
    });
    data.metadata.categories = Array.from(new Set((data.templates || []).map(t => t.category).filter(Boolean))).sort();
    // Update computed metadata
    data.metadata.totalTemplates = data.templates.length;
    if (!selectedTemplateId && data.templates.length) {
      selectedTemplateId = data.templates[0].id;
    }
    renderCategoryFilter();
    renderSidebar();
    renderMain();
    updateKpis();
    renderWarnings();
    if (!data.templates.length) {
      notify('Aucun template chargé. Utilisez « Importer JSON » ou « Réinitialiser ».', 'warn');
    }
  // Expose a stable getter for current data for dev tools
  try { window.__EA_DATA__ = () => JSON.parse(JSON.stringify(data)); } catch {}
    // Sync segmented toggle buttons
    if (langSwitch) {
      const btns = $$('button[data-lang]', langSwitch);
      btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    }
  }

  function updateKpis() {
    kpiTemplates.textContent = `${data.templates.length} templates`;
    kpiVariables.textContent = `${Object.keys(data.variables || {}).length} variables`;
  }

  function renderWarnings() {
    const issues = validateData();
    // Build a set of template IDs implicated in warnings (for filtering/jump)
    warnTplIds = new Set();
    for (const msg of issues) {
      const id = parseIssueTemplateId(msg);
      if (id) warnTplIds.add(id);
    }
    let pinStored = null; try { pinStored = localStorage.getItem('ea_pin_warnings'); } catch {}
    let pinned = (pinStored === 'true' || pinStored === null); // default to pinned if not set
    try { if (pinStored === null) localStorage.setItem('ea_pin_warnings', 'true'); } catch {}
    let collapsed = false; try { collapsed = localStorage.getItem('ea_warn_collapsed') === 'true'; } catch {}
    if (issues.length) {
      // store snapshot of current issues
      lastWarnSnapshot = { items: issues.slice(0, 50), at: Date.now() };
      warningsEl.style.display = 'block';
      warningsEl.className = 'warn';
      const itemsHtml = issues.map(i => {
        const id = parseIssueTemplateId(i);
        const safe = escapeHtml(i);
        return `<li ${id ? `data-tplid="${escapeAttr(id)}" class="warn-item"` : ''}>${safe}${id ? ` <button data-jump="${escapeAttr(id)}" title="Aller au template" style="margin-left:8px;">→</button>` : ''}</li>`;
      }).join('');
      warningsEl.innerHTML = `
        <div class="status-bar">
          <div><strong>Avertissements (${issues.length})</strong></div>
          <div class="status-actions">
            <button id="toggle-warn" title="Afficher/Masquer le détail">${collapsed ? 'Afficher' : 'Masquer'}</button>
            <label style="display:flex;align-items:center;gap:6px;font-weight:600;color:#9a3412;">
              <input type="checkbox" id="pin-warnings"> Garder affiché
            </label>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          <button id="btn-fix-add-vars" title="Créer les variables manquantes d’après les placeholders">Ajouter variables manquantes</button>
          <button id="btn-fix-sync-vars" title="Lister tous les placeholders dans chaque template">Synchroniser variables des templates</button>
          <button id="btn-orphan-add" title="Ajouter les placeholders orphelins au dictionnaire de variables">Ajouter placeholders orphelins</button>
          <button id="btn-orphan-remove" title="Supprimer des textes tous les placeholders orphelins">Supprimer placeholders orphelins</button>
          <label style="display:flex;align-items:center;gap:6px;font-weight:600;color:#9a3412;margin-left:auto;">
            <input type="checkbox" id="warn-filter-toggle" ${warnFilterActive ? 'checked' : ''}> Voir uniquement les modèles avec avertissements
          </label>
        </div>
        <div id="warn-details" style="margin-top:8px; ${collapsed ? 'display:none;' : ''}">
          <ul style="margin:6px 0 0 18px">${itemsHtml}</ul>
        </div>`;
      const pin = document.getElementById('pin-warnings');
      if (pin) {
        try { pin.checked = pinned; } catch {}
        pin.onchange = () => { try { localStorage.setItem('ea_pin_warnings', pin.checked ? 'true' : 'false'); } catch {} };
      }
      const tog = document.getElementById('toggle-warn');
      if (tog) {
        tog.onclick = () => {
          const box = document.getElementById('warn-details');
          if (!box) return;
          const hide = box.style.display !== 'none' ? true : false;
          box.style.display = hide ? 'none' : '';
          tog.textContent = hide ? 'Afficher' : 'Masquer';
          try { localStorage.setItem('ea_warn_collapsed', hide ? 'true' : 'false'); } catch {}
        };
      }
      // Wire quick fixes
      const fixAdd = document.getElementById('btn-fix-add-vars');
      if (fixAdd) fixAdd.onclick = () => { quickFixAddMissingVariables(); saveDraft(); renderWarnings(); notify('Variables ajoutées à partir des placeholders.'); };
      const fixSync = document.getElementById('btn-fix-sync-vars');
      if (fixSync) fixSync.onclick = () => { quickFixSyncTemplateVariables(); saveDraft(); renderWarnings(); renderSidebar(); renderTemplateEditor(); notify('Variables des templates synchronisées.'); };
      const orphanAdd = document.getElementById('btn-orphan-add');
      if (orphanAdd) orphanAdd.onclick = () => {
        const occ = computeOrphanPlaceholders();
        const names = Array.from(occ.keys());
        if (!names.length) { notify('Aucun placeholder orphelin détecté.'); return; }
        const added = orphanAddToLibrary(occ);
        quickFixSyncTemplateVariables();
        saveDraft(); renderWarnings(); renderSidebar(); renderTemplateEditor();
        notify(`${added} placeholder(s) ajoutés au dictionnaire.`);
      };
      const orphanRemove = document.getElementById('btn-orphan-remove');
      if (orphanRemove) orphanRemove.onclick = () => {
        const occ = computeOrphanPlaceholders();
        const names = Array.from(occ.keys());
        if (!names.length) { notify('Aucun placeholder orphelin détecté.'); return; }
        if (!confirm(`Supprimer des textes ${names.length} placeholder(s) orphelin(s) ?\n\n${names.slice(0,8).join(', ')}${names.length>8?'…':''}`)) return;
        const removed = orphanRemoveFromTexts(occ);
        saveDraft(); renderWarnings(); renderSidebar(); renderTemplateEditor();
        notify(`${removed} occurrence(s) supprimée(s).`);
      };
      const warnTog = document.getElementById('warn-filter-toggle');
      if (warnTog) warnTog.onchange = () => { warnFilterActive = warnTog.checked; renderSidebar(); };
      // Jump handlers
      warningsEl.addEventListener('click', (e) => {
        const jumpBtn = e.target.closest('[data-jump]');
        const id = jumpBtn?.getAttribute?.('data-jump') || e.target.closest('[data-tplid]')?.getAttribute?.('data-tplid');
        if (!id) return;
        const exists = data.templates.some(t => t.id === id);
        if (exists) {
          selectedTemplateId = id; _revealActiveOnRender = true; renderSidebar(); renderMain();
        } else {
          notify('Template introuvable: '+id, 'warn');
        }
      }, { once: true });
    } else {
      warningsEl.style.display = pinned ? 'block' : 'none';
      if (pinned) {
        warningsEl.className = 'ok';
        const showRecent = (Date.now() - (lastWarnSnapshot.at || 0)) < 5000 && (lastWarnSnapshot.items || []).length > 0;
        warningsEl.innerHTML = `
          <div class="status-bar">
            <div><strong>Aucun avertissement</strong></div>
            <div class="status-actions">
              <button id="toggle-warn" title="Afficher/Masquer le détail">${collapsed ? 'Afficher' : 'Masquer'}</button>
              <label style="display:flex;align-items:center;gap:6px;font-weight:600;color:#166534;">
                <input type="checkbox" id="pin-warnings" checked> Garder affiché
              </label>
            </div>
          </div>
          <div id="warn-details" style="margin-top:8px; ${collapsed ? 'display:none;' : ''}">
            ${showRecent ? `
              <div class="hint" style="margin-bottom:6px;">Avertissements récents (peuvent avoir été résolus automatiquement):</div>
              <ul style="margin:6px 0 0 18px">${lastWarnSnapshot.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
            ` : `<div class="hint">Tout est valide pour le moment.</div>`}
          </div>`;
        const pin = document.getElementById('pin-warnings');
        if (pin) pin.onchange = () => { try { localStorage.setItem('ea_pin_warnings', pin.checked ? 'true' : 'false'); if (!pin.checked) warningsEl.style.display = 'none'; } catch {} };
        const tog = document.getElementById('toggle-warn');
        if (tog) tog.onclick = () => {
          const box = document.getElementById('warn-details');
          if (!box) return;
          const hide = box.style.display !== 'none' ? true : false;
          box.style.display = hide ? 'none' : '';
          tog.textContent = hide ? 'Afficher' : 'Masquer';
          try { localStorage.setItem('ea_warn_collapsed', hide ? 'true' : 'false'); } catch {}
        };
      }
    }
  }

  function parseIssueTemplateId(msg) {
    // Try to extract template id from known patterns
    // e.g., "Template XYZ référence...", "Placeholder <<X>> ... (template XYZ, FR)", "ID en double: XYZ", "Catégorie inconnue pour XYZ:"
    const s = String(msg||'');
    let m = s.match(/\btemplate\s+([A-Za-z0-9_\-]+)/i); if (m) return m[1];
    m = s.match(/\bdu\s+template\s+([A-Za-z0-9_\-]+)/i); if (m) return m[1];
    m = s.match(/ID en double:\s*([A-Za-z0-9_\-]+)/i); if (m) return m[1];
    m = s.match(/Catégorie inconnue pour\s+([A-Za-z0-9_\-]+)/i); if (m) return m[1];
    return '';
  }

  function listAllPlaceholders() {
    const set = new Set();
    (data.templates || []).forEach(t => {
      extractPlaceholdersFromTemplate(t).forEach(ph => set.add(ph));
    });
    return set;
  }

  function quickFixAddMissingVariables() {
    const all = listAllPlaceholders();
    const lib = data.variables || (data.variables = {});
    let added = 0;
    all.forEach(v => { if (!lib[v]) { lib[v] = inferVariableMeta(v); added++; } });
    // Optional: notify count (already notifying outside)
    return added;
  }

  function quickFixSyncTemplateVariables() {
    (data.templates || []).forEach(t => {
      const ph = extractPlaceholdersFromTemplate(t);
      const current = Array.isArray(t.variables) ? t.variables : [];
      t.variables = Array.from(new Set([...(current||[]), ...ph]));
    });
  }

  function computeOrphanPlaceholders() {
    // Orphan = appears in texts but NOT listed in template.variables OR missing from library? Here we choose: not listed in template.variables.
    const occ = new Map(); // name -> { count, inTemplates: Set(ids) }
    (data.templates || []).forEach(t => {
      const ph = extractPlaceholdersFromTemplate(t);
      const listed = new Set(Array.isArray(t.variables) ? t.variables : []);
      ph.forEach(p => {
        if (!listed.has(p)) {
          const rec = occ.get(p) || { count:0, inTemplates:new Set() };
          rec.count++; rec.inTemplates.add(t.id);
          occ.set(p, rec);
        }
      });
    });
    return occ; // may include placeholders that are still present in variables library; this tool focuses on not-listed-in-template vars
  }

  function orphanAddToLibrary(orphanMap) {
    const lib = data.variables || (data.variables = {});
    let added = 0;
    for (const name of orphanMap.keys()) {
      if (!lib[name]) { lib[name] = inferVariableMeta(name); added++; }
    }
    return added;
  }

  function orphanRemoveFromTexts(orphanMap) {
    let removed = 0;
    (data.templates || []).forEach(t => {
      // Build regex set for orphan names found in this template
      const ph = extractPlaceholdersFromTemplate(t);
      const listed = new Set(Array.isArray(t.variables) ? t.variables : []);
      const toRemove = ph.filter(p => !listed.has(p) && orphanMap.has(p));
      if (!toRemove.length) return;
      const res = (txt) => {
        let s = String(txt||'');
        toRemove.forEach(n => {
          const re = new RegExp('<<'+escapeReg(n)+'>>','g');
          const before = s.length; s = s.replace(re, ''); const after = s.length; if (after !== before) removed++;
        });
        // Also collapse double spaces and tidy punctuation
        s = s.replace(/\s{2,}/g,' ').replace(/\s+([,.;:!?])/g,'$1');
        return s.trim();
      };
      if (t.subject) {
        if (typeof t.subject.fr === 'string') t.subject.fr = res(t.subject.fr);
        if (typeof t.subject.en === 'string') t.subject.en = res(t.subject.en);
      }
      if (t.body) {
        if (typeof t.body.fr === 'string') t.body.fr = res(t.body.fr);
        if (typeof t.body.en === 'string') t.body.en = res(t.body.en);
      }
    });
    return removed;
  }

  function renderCategoryFilter() {
    const cats = (data.metadata.categories || []);
    const options = cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(getCategoryLabel(c))}</option>`).join('');
    catFilterSel.innerHTML = `<option value="all">Toutes</option>${options}`;
    if (filterCategory !== 'all' && !cats.includes(filterCategory)) filterCategory = 'all';
    catFilterSel.value = filterCategory;
  }

  function renderSidebar() {
    const list = getFilteredTemplates();
    const cats = (data.metadata.categories || []);
    const bulkHeader = `
      <div id="bulk-header" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:6px;">
          <input type="checkbox" id="toggle-bulk" ${bulkMode ? 'checked' : ''}>
          <span>Sélection multiple</span>
        </label>
        ${bulkMode ? `
        <span style="color:var(--muted);">${selectedTemplateIds.size} sélectionné(s)</span>
        <button id="bulk-select-all">Tout sélectionner</button>
        <button id="bulk-clear">Effacer</button>
        <span style="margin-left:12px;">Définir catégorie:</span>
        <select id="bulk-cat">
          <option value="">(aucune)</option>
          ${cats.map(c => `<option value="${escapeAttr(c)}">${escapeHtml(getCategoryLabel(c))}</option>`).join('')}
        </select>
        <button id="bulk-apply" class="primary">Appliquer</button>
        ` : ''}
      </div>`;

    tplList.innerHTML = bulkHeader + list.map(t => {
      const title = (t.title && t.title[lang]) || t.id;
      const cat = getCategoryLabel(t.category, t.category || '-');
      const varsCount = (t.variables || []).length;
      const isActive = (t.id === selectedTemplateId);
      return `
        <div class="tile ${isActive ? 'active' : ''}" data-id="${escapeAttr(t.id)}" role="button" tabindex="0" style="position:relative;">
          ${bulkMode ? `<input type="checkbox" class="sel" data-sel="${escapeAttr(t.id)}" ${selectedTemplateIds.has(t.id)?'checked':''} style="position:absolute;left:8px;top:8px;">` : ''}
          <div class="title">${escapeHtml(title)}</div>
          <div class="meta">
            <span class="pill">${escapeHtml(cat)}</span>
            <span class="badge">${varsCount} vars</span>
          </div>
        </div>
      `;
    }).join('');

    // selection handle
    $$('.tile', tplList).forEach(el => {
      el.onclick = (e) => {
        if (bulkMode) return; // In bulk mode, clicking tiles won’t navigate
        selectedTemplateId = el.dataset.id;
        _revealActiveOnRender = true;
        renderSidebar(); // refresh highlight
        renderMain();
      };
      el.onkeypress = (e) => { if (!bulkMode && e.key === 'Enter') el.click(); };
    });
    // bulk selection checkboxes
    $$('.sel', tplList).forEach(cb => {
      cb.onclick = (e) => { e.stopPropagation(); };
      cb.onchange = (e) => {
        const id = e.target.dataset.sel;
        if (e.target.checked) selectedTemplateIds.add(id); else selectedTemplateIds.delete(id);
        // Update count without full rerender
        const hdr = $('#bulk-header');
        if (hdr) {
          const span = hdr.querySelector('span[style*="color"][style*="muted"]');
          if (span) span.textContent = `${selectedTemplateIds.size} sélectionné(s)`;
        }
      };
    });
    const toggle = $('#toggle-bulk');
    if (toggle) {
      toggle.onchange = () => {
        bulkMode = toggle.checked;
        if (!bulkMode) selectedTemplateIds.clear();
        renderSidebar();
      };
    }
    const selAll = $('#bulk-select-all');
    if (selAll) selAll.onclick = () => {
      list.forEach(t => selectedTemplateIds.add(t.id));
      renderSidebar();
    };
    const clearSel = $('#bulk-clear');
    if (clearSel) clearSel.onclick = () => { selectedTemplateIds.clear(); renderSidebar(); };
    const apply = $('#bulk-apply');
    if (apply) apply.onclick = () => {
      const newCat = $('#bulk-cat')?.value || '';
      if (selectedTemplateIds.size === 0) { notify('Aucun template sélectionné.', 'warn'); return; }
      data.templates.forEach(t => {
        if (selectedTemplateIds.has(t.id)) {
          t.category = newCat;
          if (newCat) {
            const labels = data.metadata.categoryLabels?.[newCat];
            if (labels) {
              if (labels.fr) t.category_fr = labels.fr;
              if (labels.en) t.category_en = labels.en;
            }
          }
          syncTemplateCategory(t);
        }
      });
      data.metadata.categories = Array.from(new Set((data.templates || []).map(t => t.category).filter(Boolean))).sort();
      saveDraft();
      renderSidebar();
      renderTemplateEditor();
      renderWarnings();
      notify('Catégorie appliquée aux éléments sélectionnés.');
    };

    // Optionally reveal the active tile after interactions like click/keyboard nav
    if (_revealActiveOnRender) {
      _revealActiveOnRender = false;
      const activeEl = document.querySelector('#template-list .tile.active');
      if (activeEl) {
        // Keep focus within list for accessibility, then scroll to nearest
        activeEl.focus({ preventScroll: true });
        activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  }

  function getFilteredTemplates() {
    const term = (searchTerm || '').toLowerCase();
    const cat = filterCategory;
    return data.templates.filter(t => {
      if (warnFilterActive && warnTplIds.size && !warnTplIds.has(t.id)) return false;
      const matchesCat = cat === 'all' || t.category === cat;
      if (!matchesCat) return false;
      if (!term) return true;
      const hay = [
        t.id,
        t.category,
        getCategoryLabel(t.category),
        t.title?.fr, t.title?.en,
        t.description?.fr, t.description?.en,
        t.subject?.fr, t.subject?.en,
        t.body?.fr, t.body?.en,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(term);
    });
  }

  function renderMain() {
    // Tabs
    viewTemplates.style.display = tabTemplates.classList.contains('active') ? '' : 'none';
    viewVariables.style.display = tabVariables.classList.contains('active') ? '' : 'none';
    viewMetadata.style.display = tabMetadata.classList.contains('active') ? '' : 'none';

    if (viewTemplates.style.display !== 'none') renderTemplateEditor();
    if (viewVariables.style.display !== 'none') renderVariablesEditor();
    if (viewMetadata.style.display !== 'none') renderMetadataEditor();
  }

  // Auto-detect helpers
  function getAutoDetect() {
    try { return localStorage.getItem('ea_vars_auto') !== 'false'; } catch { return true; }
  }
  function setAutoDetect(v) {
    try { localStorage.setItem('ea_vars_auto', v ? 'true' : 'false'); } catch {}
  }
  function extractPlaceholdersFromTemplate(t) {
    const parts = [];
    ['fr','en'].forEach(L => {
      if (t.subject && typeof t.subject[L] === 'string') parts.push(t.subject[L]);
      if (t.body && typeof t.body[L] === 'string') parts.push(t.body[L]);
    });
    const txt = parts.join('\n');
    const set = new Set([...txt.matchAll(/<<([^>]+)>>/g)].map(m => m[1]));
    return Array.from(set).sort();
  }

  // Heuristic inference for variable metadata
  function inferVariableMeta(name) {
    const n = String(name || '');
    let format = 'text';
    if (/Montant|Tarif|Nb(?![A-Za-zÀ-ÖØ-öø-ÿ]*[a-z])/i.test(n) || /Nombre/i.test(n)) format = 'number';
    if (/Heure|HeureLimite/i.test(n)) format = 'time';
    if (/Date|Délai|NouvelleDate|DateInitiale/i.test(n)) format = 'date';
    let example = '';
    if (format === 'number') example = '0';
    if (format === 'time') example = '17:00';
    if (format === 'date') example = '2025-01-01';
    return {
      description: { fr: '', en: '' },
      format,
      example
    };
  }

  function renderTemplateEditor() {
    const t = data.templates.find(x => x.id === selectedTemplateId) || data.templates[0];
    if (!t) {
      viewTemplates.innerHTML = `<div class="hint">Aucun modèle sélectionné. Cliquez sur “Nouveau” pour créer un template.</div>`;
      return;
    }
    selectedTemplateId = t.id;

    const cats = data.metadata.categories || [];
    const allVars = Object.keys(data.variables || {}).sort();

  viewTemplates.innerHTML = `
      <div class="row">
        <div class="field">
          <label>ID (unique, utilisé par l’application)</label>
          <input id="tpl-id" value="${escapeAttr(t.id)}" />
          <div class="hint">Utiliser des caractères simples (lettres, chiffres, _).</div>
        </div>
        <div class="field">
          <label>Catégorie</label>
          <select id="tpl-category">
            ${cats.map(c => `<option ${c===t.category?'selected':''} value="${escapeAttr(c)}">${escapeHtml(getCategoryLabel(c))}</option>`).join('')}
            ${!cats.includes(t.category||'') && t.category ? `<option selected value="${escapeAttr(t.category)}">${escapeHtml(getCategoryLabel(t.category, t.category))} (custom)</option>` : ''}
          </select>
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label>Titre (${lang.toUpperCase()})</label>
          <input id="tpl-title" value="${escapeAttr(t.title?.[lang]||'')}" />
        </div>
        <div class="field">
          <label>Description (${lang.toUpperCase()})</label>
          <input id="tpl-desc" value="${escapeAttr(t.description?.[lang]||'')}" />
        </div>
      </div>

      <div class="split">
        <div class="field">
          <label>Objet (${lang.toUpperCase()})</label>
          <input id="tpl-subject" value="${escapeAttr(t.subject?.[lang]||'')}" />
          <div class="hint">Utilisez les variables entre chevrons: &lt;&lt;NomVariable&gt;&gt;</div>
        </div>
        <div class="field">
          <label>Corps (${lang.toUpperCase()})</label>
          <textarea id="tpl-body">${escapeHtml(t.body?.[lang]||'')}</textarea>
        </div>
      </div>

      <div class="field">
        <label>Variables utilisées</label>
        <div id="vars-toolbar" style="display:flex;gap:8px;align-items:center;margin:6px 0 8px;flex-wrap:wrap;">
          <input id="vars-filter" placeholder="Filtrer les variables..." style="flex:1 1 220px;min-width:140px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;" />
          <button id="btn-vars-all" type="button">Tout</button>
          <button id="btn-vars-none" type="button">Aucun</button>
          <label style="display:inline-flex;align-items:center;gap:6px;margin-left:auto;">
            <input id="vars-auto" type="checkbox" ${getAutoDetect() ? 'checked' : ''}>
            <span>Auto-détecter</span>
          </label>
          <button id="btn-vars-detect" type="button">Détecter maintenant</button>
        </div>
        <div id="vars-missing" style="margin:6px 0 10px;"></div>
        <div id="vars-box" style="border:1px solid var(--border);padding:10px;border-radius:12px;max-height:240px;overflow-y:auto;overflow-x:hidden;"></div>
      </div>

      <div class="hint">Astuce: changez la langue en haut (FR/EN) pour éditer l’autre version.</div>
      <div style="margin-top:8px;border-top:1px solid var(--border);"></div>
      <div id="preview" style="margin-top:12px;display:none;">
        <div class="row">
          <div class="field">
            <label>Prévisualisation – Objet (${lang.toUpperCase()})</label>
            <div style="display:flex;gap:8px;align-items:center;">
              <input id="pv-subject" readonly />
              <button id="pv-copy-subject">Copier</button>
            </div>
          </div>
          <div class="field">
            <label>Remplacements de variables</label>
            <div id="pv-vars" class="chips"></div>
          </div>
        </div>
        <div class="field">
          <label>Prévisualisation – Corps (${lang.toUpperCase()})</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <textarea id="pv-body" readonly style="min-height:160px"></textarea>
            <button id="pv-copy-body">Copier</button>
          </div>
        </div>
      </div>
    `;

    // Wire handlers
    $('#tpl-id').oninput = (e) => {
      const v = e.target.value.trim();
      if (!/^[a-zA-Z0-9_]+$/.test(v)) { e.target.style.borderColor = '#fecaca'; return; }
      e.target.style.borderColor = '';
      if (v !== t.id && data.templates.some(x => x.id === v)) {
        e.target.style.borderColor = '#fecaca';
        notify('Un template avec cet ID existe déjà.', 'warn');
        return;
      }
      t.id = v;
      selectedTemplateId = v;
      saveDraft();
      renderSidebar();
    };

    $('#tpl-category').onchange = (e) => {
      const value = e.target.value;
      t.category = value;
      if (value) {
        const labels = data.metadata.categoryLabels?.[value];
        if (labels) {
          if (labels.fr) t.category_fr = labels.fr;
          if (labels.en) t.category_en = labels.en;
        }
      }
      syncTemplateCategory(t);
      data.metadata.categories = Array.from(new Set((data.templates || []).map(x => x.category).filter(Boolean))).sort();
      saveDraft();
      renderSidebar();
      renderMetadataEditor();
    };

    $('#tpl-title').oninput = (e) => {
      t.title = t.title || {};
      t.title[lang] = e.target.value;
      saveDraft();
      renderSidebar();
    };

    $('#tpl-desc').oninput = (e) => {
      t.description = t.description || {};
      t.description[lang] = e.target.value;
      saveDraft();
    };

    $('#tpl-subject').oninput = (e) => {
      t.subject = t.subject || {};
      t.subject[lang] = e.target.value;
      saveDraft();
      // Rerender variables list so detection follows current language content
      if (typeof renderVars === 'function') renderVars();
    };

    $('#tpl-body').oninput = (e) => {
      t.body = t.body || {};
      t.body[lang] = e.target.value;
      saveDraft();
      // Rerender variables list so detection follows current language content
      if (typeof renderVars === 'function') renderVars();
    };

    // If preview was active before rerender, rebuild preview contents
    if (window._eaPreviewActive) buildPreview();

    // Detect placeholders only from the current language body text
    function extractPlaceholdersFromCurrentBody() {
      const txt = (t.body && typeof t.body[lang] === 'string') ? t.body[lang] : '';
      const set = new Set([...String(txt).matchAll(/<<([^>]+)>>/g)].map(m => m[1]));
      return Array.from(set).sort();
    }

    const renderVars = () => {
      const auto = getAutoDetect();
      // Only consider placeholders present in the current language body
      const detected = extractPlaceholdersFromCurrentBody();
      if (auto) {
        t.variables = detected.slice();
        saveDraft();
      }
      // Missing in library block
      const missing = detected.filter(v => !data.variables || !data.variables[v]);
      const missingBox = document.getElementById('vars-missing');
      if (missingBox) {
        if (!missing.length) {
          missingBox.innerHTML = '';
        } else {
          missingBox.innerHTML = `
            <div class="warn" style="display:flex;flex-direction:column;gap:8px;">
              <div><strong>${missing.length}</strong> variable(s) utilisée(s) dans ce modèle ne sont pas dans la bibliothèque.</div>
              <div class="chips">
                ${missing.map(m => `<span class="chip">${escapeHtml(m)} <button data-add-missing="${escapeAttr(m)}" title="Ajouter à la bibliothèque">+</button></span>`).join('')}
              </div>
              <div><button id="btn-add-all-missing" class="primary">Tout ajouter à la bibliothèque</button></div>
            </div>`;
          // Wire individual add buttons
          $$('#vars-missing [data-add-missing]').forEach(btn => {
            btn.onclick = () => {
              const key = btn.getAttribute('data-add-missing');
              if (!key) return;
              if (!data.variables) data.variables = {};
              if (!data.variables[key]) data.variables[key] = inferVariableMeta(key);
              saveDraft();
              updateKpis();
              renderVars();
              renderVariablesEditor();
              renderWarnings();
              notify(`Variable « ${key} » ajoutée à la bibliothèque.`);
            };
          });
          // Wire add all
          const addAll = document.getElementById('btn-add-all-missing');
          if (addAll) addAll.onclick = () => {
            if (!data.variables) data.variables = {};
            let count = 0;
            missing.forEach(k => {
              if (!data.variables[k]) { data.variables[k] = inferVariableMeta(k); count++; }
            });
            if (count > 0) {
              saveDraft();
              updateKpis();
              renderVars();
              renderVariablesEditor();
              renderWarnings();
              notify(`${count} variable(s) ajoutée(s) à la bibliothèque.`);
            }
          };
        }
      }
      const term = ($('#vars-filter')?.value || '').trim().toLowerCase();
      // Always show only placeholders present in the current body text
      const source = detected;
      const list = source.filter(v => v.toLowerCase().includes(term));
      const cells = (name) => name ? `
        <td style=\"vertical-align:top;width:50%;padding:4px 6px;\">
          <label class=\"var-item\" title=\"${escapeAttr(name)}\" style=\"display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none;white-space:nowrap;\">
            <input type=\"checkbox\" value=\"${escapeAttr(name)}\" ${Array.isArray(t.variables) && t.variables.includes(name) ? 'checked':''} ${auto ? 'disabled' : ''}>
            <span class=\"var-name\" style=\"line-height:1.3;\">${escapeHtml(name)}</span>
          </label>
        </td>` : `<td style=\"width:50%\"></td>`;
      if (!list.length) {
        const baseEmpty = source.length ? 'Aucune variable ne correspond au filtre.' : 'Aucun placeholder <<NomVariable>> trouvé dans le corps.';
        $('#vars-box').innerHTML = `<div class=\"hint\">${baseEmpty}</div>`;
      } else {
        const rows = [];
        for (let i = 0; i < list.length; i += 2) {
          const v1 = list[i];
          const v2 = list[i+1];
          rows.push(`<tr>${cells(v1)}${cells(v2)}</tr>`);
        }
        $('#vars-box').innerHTML = `<table style=\"width:100%;border-collapse:separate;border-spacing:8px 6px;\">${rows.join('')}</table>`;
      }
      if (!auto) $$('#vars-box input[type=\"checkbox\"]').forEach(cb => {
        cb.onchange = () => {
          t.variables = Array.isArray(t.variables) ? t.variables : [];
          if (cb.checked) {
            if (!t.variables.includes(cb.value)) t.variables.push(cb.value);
          } else {
            t.variables = t.variables.filter(x => x !== cb.value);
          }
          saveDraft();
          renderWarnings();
          renderSidebar();
        };
      });
    };
    renderVars();
    const getFilteredList = () => {
      const term = ($('#vars-filter')?.value || '').trim().toLowerCase();
      return extractPlaceholdersFromCurrentBody().filter(v => v.toLowerCase().includes(term));
    };
    const btnAll = $('#btn-vars-all');
    const btnNone = $('#btn-vars-none');
    if (btnAll) btnAll.onclick = () => {
      if (getAutoDetect()) return; // disabled in auto mode
      const visible = getFilteredList();
      t.variables = Array.isArray(t.variables) ? t.variables : [];
      visible.forEach(v => { if (!t.variables.includes(v)) t.variables.push(v); });
      saveDraft();
      renderVars();
      renderWarnings();
      renderSidebar();
    };
    if (btnNone) btnNone.onclick = () => {
      if (getAutoDetect()) return; // disabled in auto mode
      const visible = getFilteredList();
      t.variables = Array.isArray(t.variables) ? t.variables : [];
      t.variables = t.variables.filter(v => !visible.includes(v));
      saveDraft();
      renderVars();
      renderWarnings();
      renderSidebar();
    };
    const inpFilter = $('#vars-filter');
    if (inpFilter) inpFilter.oninput = renderVars;
    const chkAuto = $('#vars-auto');
    if (chkAuto) chkAuto.onchange = () => {
      setAutoDetect(chkAuto.checked);
      renderVars();
      renderWarnings();
      renderSidebar();
    };
    const btnDetect = $('#btn-vars-detect');
    if (btnDetect) btnDetect.onclick = () => {
      const detected = extractPlaceholdersFromCurrentBody();
      if (getAutoDetect()) {
        t.variables = detected.slice();
      } else {
        t.variables = Array.isArray(t.variables) ? t.variables : [];
        detected.forEach(v => { if (!t.variables.includes(v)) t.variables.push(v); });
      }
      saveDraft();
      renderVars();
      renderWarnings();
      renderSidebar();
    };

    // Duplicate/Delete toolbar
    btnDuplicate.onclick = () => {
      const dup = structuredClone(t);
      dup.id = uniqueId(t.id + '_copy');
      data.templates.push(dup);
      selectedTemplateId = dup.id;
      saveDraft();
      afterDataLoad();
    };

    btnDelete.onclick = () => {
      if (!confirm('Supprimer ce template ?')) return;
      data.templates = data.templates.filter(x => x.id !== t.id);
      selectedTemplateId = data.templates[0]?.id || null;
      saveDraft();
      afterDataLoad();
    };

    function buildPreview() {
      const pv = document.getElementById('preview');
      if (!pv) return;
      pv.style.display = '';
      window._eaPreviewActive = true;
      const vars = Array.from(new Set([...(t.variables||[]), ...extractPlaceholdersFromTemplate(t)]));
      const pvVars = document.getElementById('pv-vars');
      pvVars.innerHTML = '';
      const values = {};
      vars.forEach(name => {
        const wrap = document.createElement('div');
        wrap.className = 'chip';
        wrap.style.display = 'inline-flex';
        wrap.style.alignItems = 'center';
        wrap.style.gap = '6px';
        const label = document.createElement('span');
        label.textContent = name;
        const input = document.createElement('input');
        input.placeholder = (data.variables && data.variables[name] && data.variables[name].example) || '';
        input.style.border = '1px solid var(--border)';
        input.style.borderRadius = '10px';
        input.style.padding = '4px 6px';
        input.oninput = () => { values[name] = input.value; updatePreview(); };
        wrap.appendChild(label);
        wrap.appendChild(input);
        pvVars.appendChild(wrap);
      });
      function replacePlaceholders(txt) {
        return String(txt||'').replace(/<<([^>]+)>>/g, (m, g1) => {
          if (values[g1] !== undefined) return values[g1];
          const v = data.variables && data.variables[g1];
          const byLang = v && v.examples && v.examples[lang];
          const fallback = v && v.example;
          return byLang || fallback || m;
        });
      }
      function updatePreview() {
        const subj = replacePlaceholders((t.subject && t.subject[lang]) || '');
        const body = replacePlaceholders((t.body && t.body[lang]) || '');
        const ps = document.getElementById('pv-subject');
        const pb = document.getElementById('pv-body');
        if (ps) ps.value = subj;
        if (pb) pb.value = body;
      }
      updatePreview();
      const c1 = document.getElementById('pv-copy-subject');
      if (c1) c1.onclick = () => { const v = document.getElementById('pv-subject')?.value || ''; navigator.clipboard && navigator.clipboard.writeText(v); notify('Objet copié.'); };
      const c2 = document.getElementById('pv-copy-body');
      if (c2) c2.onclick = () => { const v = document.getElementById('pv-body')?.value || ''; navigator.clipboard && navigator.clipboard.writeText(v); notify('Corps copié.'); };
    }

    if (btnPreview) btnPreview.onclick = () => {
      const pv = document.getElementById('preview');
      if (!pv) return;
      if (pv.style.display === 'none' || pv.style.display === '') {
        buildPreview();
      } else {
        pv.style.display = 'none';
        window._eaPreviewActive = false;
      }
    };
  }

  function uniqueId(base) {
    let i = 1;
    let id = base;
    while (data.templates.some(t => t.id === id)) {
      id = `${base}_${i++}`;
    }
    return id;
  }

  function renderVariablesEditor() {
    const vars = data.variables || {};
    const keys = Object.keys(vars).sort();
    // Compute variables used across all templates (via placeholders and explicit t.variables)
    const used = new Set();
    (data.templates || []).forEach(t => {
      extractPlaceholdersFromTemplate(t).forEach(v => used.add(v));
      if (Array.isArray(t.variables)) t.variables.forEach(v => used.add(v));
    });
    const unusedKeys = keys.filter(k => !used.has(k));

    // Compute variables used in the currently selected template only
    const currentTpl = (data.templates || []).find(x => x.id === selectedTemplateId) || null;
    const usedInSelected = new Set();
    if (currentTpl) {
      extractPlaceholdersFromTemplate(currentTpl).forEach(v => usedInSelected.add(v));
      if (Array.isArray(currentTpl.variables)) currentTpl.variables.forEach(v => usedInSelected.add(v));
    }
    // Preference: show only variables from selected template (default true)
    const getOnlySelected = () => { try { return localStorage.getItem('ea_vars_only_selected') !== 'false'; } catch { return true; } };
    const onlySelected = getOnlySelected();
    const displayKeys = (onlySelected && currentTpl) ? keys.filter(k => usedInSelected.has(k)) : keys;

    viewVariables.innerHTML = `
      <div class="row-3">
        <div class="field"><label>Clé</label><input id="var-new-key" placeholder="e.g. NuméroProjet" /></div>
        <div class="field"><label>Format</label>
          <select id="var-new-format">
            <option value="text">text</option>
            <option value="number">number</option>
            <option value="date">date</option>
            <option value="time">time</option>
          </select>
        </div>
        <div class="field"><label>Exemple</label><input id="var-new-example" placeholder="ex: 123-456456-789" /></div>
      </div>
      <div class="row">
        <div class="field"><label>Description FR</label><input id="var-new-desc-fr" /></div>
        <div class="field"><label>Description EN</label><input id="var-new-desc-en" /></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="btn-add-var" class="primary">Ajouter</button>
        <button id="btn-import-vars" style="background:#6366f1;color:white;">Importer variables (CSV)</button>
        <input type="file" id="vars-file-input" accept=".csv,.json" style="display:none;" />
      </div>

      <div style="margin-top:12px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <span class="hint">Variables inutilisées: <strong>${unusedKeys.length}</strong></span>
        <button id="btn-clean-unused" ${unusedKeys.length ? '' : 'disabled'}>Supprimer les variables inutilisées</button>
        <label style="display:inline-flex;align-items:center;gap:6px;margin-left:auto;">
          <input type="checkbox" id="vars-only-selected" ${onlySelected ? 'checked' : ''} ${currentTpl ? '' : 'disabled'}>
          <span>Seulement celles du modèle sélectionné</span>
        </label>
      </div>

      <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;"></div>

      <div style="display:grid;gap:10px;">
        ${displayKeys.length ? displayKeys.map(k => {
          const v = vars[k];
          return `
            <div class="tile" data-k="${escapeAttr(k)}" style="display:grid;gap:8px;">
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <div class="title">${escapeHtml(k)}</div>
                <div class="chips">
                  <span class="badge">${escapeHtml(v.format || 'text')}</span>
                  <span class="pill">ex: ${escapeHtml((v.examples && v.examples[lang]) || v.example || '')}</span>
                </div>
              </div>
              <div class="row">
                <div class="field"><label>Description FR</label><input data-edit="fr" value="${escapeAttr(v.description?.fr || '')}" /></div>
                <div class="field"><label>Description EN</label><input data-edit="en" value="${escapeAttr(v.description?.en || '')}" /></div>
              </div>
              <div class="row-3">
                <div class="field"><label>Format</label>
                  <select data-edit="format">
                    ${['text','number','date','time'].map(opt => `<option ${opt===(v.format||'text')?'selected':''} value="${opt}">${opt}</option>`).join('')}
                  </select>
                </div>
                <div class="field"><label>Exemple</label><input data-edit="example" value="${escapeAttr(v.example || '')}" /></div>
                  <div class="field"><label>&nbsp;</label>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                      <button data-action="rename">Renommer</button>
                      <button data-action="delete" class="danger">Supprimer</button>
                    </div>
                  </div>
              </div>
            </div>
          `;
        }).join('') : `<div class="hint">${(onlySelected && currentTpl) ? 'Aucune variable utilisée par le modèle sélectionné.' : 'Aucune variable pour l’instant.'}</div>`}
      </div>
    `;

    // Wire filter toggle
    const onlySelToggle = document.getElementById('vars-only-selected');
    if (onlySelToggle) {
      onlySelToggle.onchange = () => {
        try { localStorage.setItem('ea_vars_only_selected', onlySelToggle.checked ? 'true' : 'false'); } catch {}
        renderVariablesEditor();
      };
    }

    $('#btn-add-var').onclick = () => {
      const key = $('#var-new-key').value.trim();
      if (!key || !/^[A-Za-zÀ-ÖØ-öø-ÿ0-9_]+$/.test(key)) {
        notify('Clé invalide. Utilisez des lettres/chiffres/underscore.', 'warn'); return;
      }
      if (data.variables[key]) { notify('Cette clé existe déjà.', 'warn'); return; }
      const fmt = $('#var-new-format').value;
      const ex = $('#var-new-example').value.trim();
      const dfr = $('#var-new-desc-fr').value.trim();
      const den = $('#var-new-desc-en').value.trim();
      data.variables[key] = {
        description: { fr: dfr, en: den },
        format: fmt,
        example: ex
      };
      saveDraft();
      renderVariablesEditor();
      renderTemplateEditor();
      renderWarnings();
      updateKpis();
    };

    // Wire up variables CSV import
    const btnImportVars = document.getElementById('btn-import-vars');
    const varsFileInput = document.getElementById('vars-file-input');
    if (btnImportVars && varsFileInput) {
      btnImportVars.onclick = () => varsFileInput.click();
      varsFileInput.onchange = async (e) => {
        const f = e.target.files?.[0];
        if (f) await window.importVariablesFromFile(f);
        e.target.value = '';
      };
    }

    // Cleanup unused variables
    const cleanBtn = document.getElementById('btn-clean-unused');
    if (cleanBtn) cleanBtn.onclick = () => {
      if (!unusedKeys.length) return;
      const listHtml = `<div class="hint" style="margin-bottom:8px;">Les variables suivantes seront supprimées (${unusedKeys.length}) :</div>
        <div style="border:1px solid var(--border); border-radius:10px; padding:8px; max-height:40vh; overflow:auto;">
          <ul style="margin:0 0 0 18px;">${unusedKeys.map(k => `<li>${escapeHtml(k)}</li>`).join('')}</ul>
        </div>`;
      showModal({
        title: 'Supprimer les variables inutilisées',
        bodyHtml: listHtml,
        confirmText: 'Supprimer',
        onConfirm: () => {
          unusedKeys.forEach(k => { delete data.variables[k]; });
          saveDraft();
          updateKpis();
          renderVariablesEditor();
          renderTemplateEditor();
          renderWarnings();
          notify(`${unusedKeys.length} variable(s) supprimée(s).`);
        }
      });
    };

    // edits
    $$('.tile[data-k]').forEach(tile => {
      const name = tile.dataset.k;
      tile.querySelector('[data-edit="fr"]').oninput = (e) => {
        data.variables[name].description = data.variables[name].description || {};
        data.variables[name].description.fr = e.target.value;
        saveDraft();
      };
      tile.querySelector('[data-edit="en"]').oninput = (e) => {
        data.variables[name].description = data.variables[name].description || {};
        data.variables[name].description.en = e.target.value;
        saveDraft();
      };
      tile.querySelector('[data-edit="format"]').onchange = (e) => {
        data.variables[name].format = e.target.value;
        saveDraft();
      };
      tile.querySelector('[data-edit="example"]').oninput = (e) => {
        data.variables[name].example = e.target.value;
        saveDraft();
      };
      tile.querySelector('[data-action="delete"]').onclick = () => {
        if (!confirm(`Supprimer la variable ${name} ?`)) return;
        // remove from templates
        data.templates.forEach(t => {
          if (Array.isArray(t.variables)) {
            t.variables = t.variables.filter(x => x !== name);
          }
        });
        delete data.variables[name];
        saveDraft();
        renderVariablesEditor();
        renderTemplateEditor();
        renderWarnings();
        updateKpis();
      };
        const btnRen = tile.querySelector('[data-action="rename"]');
        if (btnRen) {
          btnRen.onclick = () => {
            const oldName = name;
            const next = prompt('Nouveau nom de la variable :', oldName);
            if (!next || next === oldName) return;
            const key = next.trim();
            if (!/^[A-Za-zÀ-ÖØ-öø-ÿ0-9_]+$/.test(key)) { notify('Nom invalide. Lettres/chiffres/underscore uniquement.', 'warn'); return; }
            if (data.variables[key]) { notify('Une variable avec ce nom existe déjà.', 'warn'); return; }
            data.variables[key] = data.variables[oldName];
            delete data.variables[oldName];
            data.templates.forEach(t => {
              if (Array.isArray(t.variables)) {
                t.variables = t.variables.map(v => v === oldName ? key : v);
              }
              ['fr','en'].forEach(L => {
                if (t.subject && typeof t.subject[L] === 'string') {
                  t.subject[L] = t.subject[L].split(`<<${oldName}>>`).join(`<<${key}>>`);
                }
                if (t.body && typeof t.body[L] === 'string') {
                  t.body[L] = t.body[L].split(`<<${oldName}>>`).join(`<<${key}>>`);
                }
              });
            });
            saveDraft();
            renderVariablesEditor();
            renderTemplateEditor();
            renderWarnings();
            updateKpis();
          };
        }
    });
  }

  function renderMetadataEditor() {
    const m = data.metadata || {};
    const cats = m.categories || [];
    // Detect orphan (unused) categories
    const usedCats = new Set((data.templates || []).map(t => t.category).filter(Boolean));
    const orphanCats = cats.filter(c => !usedCats.has(c));
    viewMetadata.innerHTML = `
      <div class="row">
        <div class="field">
          <label>Version</label>
          <input id="meta-version" value="${escapeAttr(m.version || '')}" />
        </div>
        <div class="field">
          <label>Langues</label>
          <input value="${escapeAttr((m.languages || ['fr','en']).join(', '))}" disabled />
          <div class="hint">Les langues fr/en sont fixées par l’application.</div>
        </div>
      </div>

      <div class="field">
        <label>Catégories</label>
        <div id="cat-list" style="display:grid;gap:8px;">
          ${cats.length ? cats.map((c, i) => `
            <div class="row" data-cat-row>
              <div class="field">
                <label>Nom</label>
                <input data-cat-input value="${escapeAttr(c)}" />
              </div>
              <div class="field">
                <label>&nbsp;</label>
                <div style="display:flex;gap:8px;">
                  <button data-cat-up data-idx="${i}" ${i===0?'disabled':''}>↑</button>
                  <button data-cat-down data-idx="${i}" ${i===cats.length-1?'disabled':''}>↓</button>
                  <button class="primary" data-cat-save data-orig="${escapeAttr(c)}">Enregistrer</button>
                  <button class="danger" data-cat-delete data-orig="${escapeAttr(c)}">Supprimer</button>
                </div>
              </div>
            </div>
          `).join('') : `<div class="hint">Aucune catégorie. Ajoutez-en ci-dessous.</div>`}
        </div>
        <div style="margin-top:10px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <span class="hint">Catégories vides: <strong>${orphanCats.length}</strong></span>
          <button id="cat-clean-orphans" ${orphanCats.length ? '' : 'disabled'}>Supprimer les catégories vides</button>
        </div>
        <div class="row">
          <div class="field"><input id="cat-new" placeholder="Ajouter une catégorie…" /></div>
          <div class="field"><button id="cat-add" class="primary">Ajouter</button></div>
        </div>
        <div class="hint">Les catégories alimentent le filtre et la liste déroulante dans Templates.</div>
      </div>
    `;

    $('#meta-version').oninput = (e) => { m.version = e.target.value; saveDraft(); };

    $('#cat-add').onclick = () => {
      const v = $('#cat-new').value.trim();
      if (!v) return;
      if (!(m.categories||[]).includes(v)) {
        m.categories = m.categories || [];
        m.categories.push(v);
      }
      $('#cat-new').value = '';
      saveDraft();
      renderCategoryFilter();
      renderMetadataEditor();
      renderTemplateEditor();
    };

    // Save (rename) and delete handlers for each row
    $$('#cat-list [data-cat-save]').forEach(btn => {
      btn.onclick = () => {
        const orig = btn.dataset.orig;
        const row = btn.closest('[data-cat-row]');
        const input = row?.querySelector('[data-cat-input]');
        const next = (input?.value || '').trim();
        if (!next) { notify('Nom de catégorie vide.', 'warn'); return; }
        if (orig === next) { notify('Aucun changement à enregistrer.'); return; }
        const exists = (m.categories || []).some(c => c === next);
        if (exists) { notify('Cette catégorie existe déjà.', 'warn'); return; }
        // Replace in metadata
        m.categories = (m.categories || []).map(c => c === orig ? next : c);
        // Propagate to templates
        data.templates.forEach(t => { if (t.category === orig) t.category = next; });
        // Update active filter if needed
        if (typeof filterCategory === 'string' && filterCategory === orig) filterCategory = next;
        saveDraft();
        renderCategoryFilter();
        renderMetadataEditor();
        renderTemplateEditor();
        renderSidebar();
        notify('Catégorie renommée.');
      };
    });

    $$('#cat-list [data-cat-delete]').forEach(btn => {
      btn.onclick = () => {
        const c = btn.dataset.orig;
        if (!confirm(`Supprimer la catégorie \"${c}\" ?`)) return;
    m.categories = (m.categories || []).filter(x => x !== c);
    // Unset category on templates that used it
    data.templates.forEach(t => { if (t.category === c) t.category = ''; });
    // Reset filter if pointing to deleted category
    if (filterCategory === c) filterCategory = 'all';
    saveDraft();
    renderCategoryFilter();
    renderMetadataEditor();
    renderTemplateEditor();
    renderSidebar();
  };
});

    // Reorder up/down
    $$('#cat-list [data-cat-up]').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx, 10);
        if (isNaN(idx) || idx <= 0) return;
        const arr = m.categories || [];
        [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]];
        saveDraft();
        renderCategoryFilter();
        renderMetadataEditor();
        renderTemplateEditor();
        renderSidebar();
      };
    });
    $$('#cat-list [data-cat-down]').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const arr = m.categories || [];
        if (isNaN(idx) || idx >= arr.length - 1) return;
        [arr[idx], arr[idx+1]] = [arr[idx+1], arr[idx]];
        saveDraft();
        renderCategoryFilter();
        renderMetadataEditor();
        renderTemplateEditor();
        renderSidebar();
      };
    });

    // Cleanup orphan categories handler
    const btnClean = document.getElementById('cat-clean-orphans');
    if (btnClean) btnClean.onclick = () => {
      if (!orphanCats.length) return;
      const names = orphanCats.join(', ');
      if (!confirm(`Supprimer ${orphanCats.length} catégorie(s) sans modèle ?\n\n${names}`)) return;
      m.categories = (m.categories || []).filter(c => !orphanCats.includes(c));
      // Reset filter if pointing to a removed category
      if (orphanCats.includes(filterCategory)) filterCategory = 'all';
      saveDraft();
      renderCategoryFilter();
      renderMetadataEditor();
      renderTemplateEditor();
      renderSidebar();
      notify(`${orphanCats.length} catégorie(s) supprimée(s).`);
    };
  }

  function validateData() {
    const issues = [];
    // Unique IDs
    const ids = new Set();
    for (const t of data.templates) {
      if (!t.id) issues.push('Template sans ID.');
      else if (ids.has(t.id)) issues.push(`ID en double: ${t.id}`);
      else ids.add(t.id);

      // Category exists
      if (t.category && !(data.metadata.categories || []).includes(t.category)) {
        issues.push(`Catégorie inconnue pour ${t.id}: ${t.category}`);
      }

      // Variables referenced should exist
      for (const v of (t.variables || [])) {
        if (!data.variables[v]) issues.push(`Template ${t.id} référence une variable inexistante: ${v}`);
      }

      // Placeholders in subject/body consistent with variables
      (['fr', 'en']).forEach(L => {
        const subj = t.subject?.[L] || '';
        const body = t.body?.[L] || '';
        const placeholders = new Set([...subj.matchAll(/<<([^>]+)>>/g), ...body.matchAll(/<<([^>]+)>>/g)].map(m => m[1]));
        placeholders.forEach(ph => {
          if (!data.variables[ph]) issues.push(`Placeholder <<${ph}>> manquant dans variables (template ${t.id}, ${L}).`);
          if (!Array.isArray(t.variables) || !t.variables.includes(ph)) {
            issues.push(`Placeholder <<${ph}>> non listé dans variables du template ${t.id} (${L}).`);
          }
        });
      });
    }
    return issues;
  }

  // Import/Export/Reset/Help
  function readFileAsText(file) {
    if (file?.text) return file.text();
    // Fallback for older browsers
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('File read error'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsText(file);
    });
  }

  async function handleImportedFile(f) {
    if (!f) return;
    notify('Import en cours…');
    let txt;
    try {
      txt = await readFileAsText(f);
    } catch (e) {
      notify('Erreur de lecture du fichier.', 'warn');
      console.error('readFile error', e);
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(txt);
    } catch (pe) {
      notify('JSON invalide: impossible d\'analyser le fichier.', 'warn');
      console.error('JSON parse error', pe);
      return;
    }
    const json = ensureSchema(parsed);
    const tplCount = Array.isArray(json.templates) ? json.templates.length : 0;
    const varCount = json.variables ? Object.keys(json.variables).length : 0;
    const catCount = Array.isArray(json.metadata?.categories) ? json.metadata.categories.length : 0;

    showModal({
      title: 'Importer ce JSON ? ',
      bodyHtml: `
        <div class="hint">Le brouillon local sera remplacé par le contenu du fichier.</div>
        <ul style="margin:8px 0 0 18px">
          <li><strong>Templates:</strong> ${tplCount}</li>
          <li><strong>Variables:</strong> ${varCount}</li>
          <li><strong>Catégories:</strong> ${catCount}</li>
        </ul>
      `,
      confirmText: 'Importer',
      onConfirm: () => {
        try {
          data = json;
          selectedTemplateId = data.templates[0]?.id || null;
          saveDraft();
          afterDataLoad();
          notify('Fichier importé et brouillon mis à jour.');
        } catch (e2) {
          notify('Échec lors de l\'application des données importées.', 'warn');
          console.error(e2);
        }
      }
    });
  }

  function startImportFlow() {
    // Most reliable: create an ephemeral input and click it
    const tmp = document.createElement('input');
    tmp.type = 'file';
    tmp.accept = '.json,application/json';
    tmp.style.position = 'fixed';
    tmp.style.left = '-9999px';
    tmp.onchange = async (e) => {
      const f = e.target.files?.[0];
      await handleImportedFile(f);
      tmp.remove();
    };
    document.body.appendChild(tmp);
    try {
      if (typeof tmp.showPicker === 'function') tmp.showPicker(); else tmp.click();
    } catch {
      // Fallbacks to existing hidden input/label if the ephemeral input is blocked
      const lbl = document.getElementById('file-input-label');
      if (lbl) lbl.click(); else try { (document.getElementById('file-input')||{}).click?.(); } catch {}
      tmp.remove();
    }
  }

  if (btnImport && fileInput) {
    btnImport.onclick = () => startImportFlow();
    fileInput.onchange = async (e) => {
      const f = e.target.files?.[0];
      await handleImportedFile(f);
      // allow re-importing the same file by resetting the input
      fileInput.value = '';
    };
  }

  btnExport.onclick = () => {
    data.metadata.totalTemplates = data.templates.length;
    if (!selectedTemplateId && data.templates.length) {
      selectedTemplateId = data.templates[0].id;
    }
    const issues = validateData();
    if (issues.length) {
      const detail = issues.slice(0, 10).map((i, idx) => `${idx+1}. ${i}`).join('\n');
      const more = issues.length > 10 ? `\n...et ${issues.length-10} autres.` : '';
      if (!confirm(`Des avertissements existent (${issues.length}).\n\n${detail}${more}\n\nExporter quand même ?`)) return;
    }
    const pretty = JSON.stringify(data, null, 2);
    download('complete_email_templates.json', pretty);
  };

  async function githubPublishFlow() {
    try {
      if (!data) { notify('Aucune donnée à publier.', 'warn'); return; }
      const repo = 'snarky1980/bt-ctd-echo'; // adjust if forked
      const rootPath = 'complete_email_templates.json';
      const publicPath = 'public/complete_email_templates.json';
      const owner = repo.split('/')[0];
      const repoName = repo.split('/')[1];
      const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));

      const bodyHtml = `
  <div class="hint" style="margin-bottom:8px;">Cette action va créer une <strong>branche</strong> depuis <code>main</code>, y mettre à jour <code>${rootPath}</code> et <code>${publicPath}</code>, puis ouvrir une <strong>Pull Request</strong> vers <code>main</code>.</div>
        <div style="display:grid; gap:8px;">
          <label>GitHub Token (PAT – minimum repo:contents write):<br>
            <input id="gh-token" type="password" placeholder="ghp_..." style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;">
          </label>
          <label>Message de commit:<br>
            <input id="gh-message" type="text" value="chore(admin): update complete_email_templates.json" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;">
          </label>
          <label>Titre de la PR:<br>
            <input id="gh-pr-title" type="text" value="feat(templates): update complete_email_templates.json" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;">
          </label>
        </div>`;
      showModal({ title: 'Publier sur GitHub', bodyHtml, confirmText: 'Publier', onConfirm: async () => {
        const token = (document.getElementById('gh-token')||{}).value || '';
        const message = (document.getElementById('gh-message')||{}).value || 'update templates';
        const prTitle = (document.getElementById('gh-pr-title')||{}).value || 'Update templates';
        if (!token) { notify('Token requis.', 'warn'); return; }
        try {
          const headers = { 'Accept':'application/vnd.github+json', 'Authorization': `Bearer ${token}` };
          const baseBranch = 'main';
          const now = new Date();
          const pad = (n) => String(n).padStart(2, '0');
          const branchName = `chore/templates-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

          async function getJson(url) {
            const res = await fetch(url, { headers });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          }

          // 1) Get base branch SHA
          const refInfo = await getJson(`https://api.github.com/repos/${owner}/${repoName}/git/refs/heads/${encodeURIComponent(baseBranch)}`);
          const baseSha = refInfo?.object?.sha;
          if (!baseSha) throw new Error('Base branch SHA introuvable');

          // 2) Create new branch from base
          let createdBranch = branchName;
          async function tryCreateBranch(name) {
            const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/refs`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({ ref: `refs/heads/${name}`, sha: baseSha })
            });
            if (res.ok) return name;
            const err = await res.json().catch(()=>({}));
            if (res.status === 422 && /already exists/i.test(err?.message||'')) {
              // fallback suffix
              return null;
            }
            throw new Error(err?.message || 'Échec création de branche');
          }
          let attempt = 0;
          while (attempt < 3) {
            const name = attempt === 0 ? branchName : `${branchName}-${attempt}`;
            const okName = await tryCreateBranch(name);
            if (okName) { createdBranch = okName; break; }
            attempt++;
          }

          // helper: get current sha for path on the new branch
          async function getSha(path) {
            try {
              const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(createdBranch)}`, { headers });
              if (res.ok) {
                const j = await res.json();
                return j.sha;
              }
            } catch {}
            return undefined;
          }

          async function putFile(path, sha) {
            const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${encodeURIComponent(path)}`, {
              method: 'PUT',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({ message, content, branch: createdBranch, sha })
            });
            if (!res.ok) {
              const err = await res.json().catch(()=>({message:'Erreur inconnue'}));
              throw new Error(`${path}: ${err.message || 'Échec GitHub'}`);
            }
            return res.json().catch(()=>({}));
          }

          // 3) Update both files on the branch
          const [rootSha, publicSha] = await Promise.all([getSha(rootPath), getSha(publicPath)]);
          const [rootRes, pubRes] = await Promise.all([
            putFile(rootPath, rootSha),
            putFile(publicPath, publicSha)
          ]);

          // 4) Open Pull Request
          const prBody = `This PR updates the templates JSON files.\n\n- Templates: ${Array.isArray(data.templates)?data.templates.length:0}\n- Variables: ${data.variables?Object.keys(data.variables).length:0}\n- Categories: ${Array.isArray(data.metadata?.categories)?data.metadata.categories.length:0}`;
          const prRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/pulls`, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: prTitle || message, head: createdBranch, base: baseBranch, body: prBody })
          });
          if (!prRes.ok) {
            const err = await prRes.json().catch(()=>({message:'Erreur inconnue'}));
            throw new Error(`PR: ${err.message || 'Échec création PR'}`);
          }
          const pr = await prRes.json();
          notify(`PR créée: ${pr.html_url}`);
        } catch (e) {
          console.error('GitHub publish failed', e);
          notify('Échec de la publication GitHub: ' + (e?.message || e), 'warn');
        }
      }});
    } catch (e) {
      console.error(e);
      notify('Erreur dans le flux GitHub.', 'warn');
    }
  }

  if (btnGithub) {
    btnGithub.onclick = githubPublishFlow;
  }

  btnReset.onclick = () => {
    if (!confirm('Effacer le brouillon local et recharger le fichier original ?')) return;
    localStorage.removeItem(DRAFT_KEY);
    location.reload();
  };

  if (btnHelp) btnHelp.onclick = () => {
    try { window.open('./help.html', '_blank', 'noopener'); } catch {}
    const code = (s) => `<pre style="background:#0b1020;color:#e5e7eb;padding:10px;border-radius:10px;overflow:auto;"><code>${escapeHtml(s)}</code></pre>`;
    const copyBtn = (s) => `<button data-copy="${escapeAttr(s)}" style="margin-top:6px;">Copier</button>`;
    const body = `
      <div style="display:grid; gap:12px;">
        <section>
          <div class="hint" style="font-weight:800;color:#334155">1) Vue d’ensemble</div>
          <ul style="margin:6px 0 0 18px;">
            <li>Barre latérale: liste des modèles avec recherche et filtre par catégorie.</li>
            <li>Onglets: Templates / Variables / Métadonnées.</li>
            <li>Barre d’outils: Dupliquer, Supprimer, Prévisualiser, Enregistrer le brouillon.</li>
          </ul>
        </section>
        <section>
          <div class="hint" style="font-weight:800;color:#334155">2) Langues (FR/EN)</div>
          <ul style="margin:6px 0 0 18px;">
            <li>Utilisez le commutateur FR/EN pour éditer les champs localisés.</li>
            <li>Le choix est mémorisé localement.</li>
          </ul>
        </section>
        <section>
          <div class="hint" style="font-weight:800;color:#334155">3) Import / Export / Brouillon</div>
          <ul style="margin:6px 0 0 18px;">
            <li>Importer JSON: charge un fichier local dans le brouillon (aucune écriture serveur).</li>
            <li>Import (lot): CSV / JSON / NDJSON. Colonne Variables/Vars acceptée (séparateurs ; ou ,). ID auto, catégories ajoutées, placeholders <<NomVariable>> auto-détectés, variables manquantes ajoutées à la bibliothèque.</li>
            <li>Exporter JSON: télécharge un fichier complet.</li>
            <li>Enregistrer le brouillon / Réinitialiser disponibles en haut.</li>
          </ul>
        </section>
        <section>
          <div class="hint" style="font-weight:800;color:#334155">4) Convertir un .docx en JSON d’import</div>
          <div>Placez le .docx dans imports/ puis exécutez:</div>
          ${code('npm run convert:docx -- imports/monclient.docx > imports/monclient.json')}
          ${copyBtn('npm run convert:docx -- imports/monclient.docx > imports/monclient.json')}
          <div class="hint">Reconnaît: titres (H1–H6), “EN – Subject:”, “EN – Message body:”, “FR – Objet:”, “FR – Corps:”, et “Category: …”.</div>
        </section>
        <section>
          <div class="hint" style="font-weight:800;color:#334155">5) Édition de templates</div>
          <ul style="margin:6px 0 0 18px;">
            <li>Champs: ID, Catégorie, Titre, Description, Objet, Corps selon la langue.</li>
            <li>Variables utilisées: auto-détection, “Détecter maintenant”, Tout/Aucun (mode manuel), ajout des manquantes.</li>
            <li>Prévisualiser: remplacements d’exemple et copier Objet/Corps.</li>
          </ul>
        </section>
        <section>
          <div class="hint" style="font-weight:800;color:#334155">6) Variables (bibliothèque)</div>
          <ul style="margin:6px 0 0 18px;">
            <li>Ajouter/éditer: descriptions FR/EN, format, exemple.</li>
            <li>Renommer: met à jour les références et placeholders.</li>
            <li>Supprimer: enlève la variable et la retire des modèles.</li>
            <li>Nettoyer: aperçu des variables inutilisées puis suppression confirmée.</li>
          </ul>
        </section>
        <section>
          <div class="hint" style="font-weight:800;color:#334155">7) Métadonnées (catégories)</div>
          <div>Ajouter, Renommer (propagation), Supprimer, Réordonner. Alimente le filtre.
          </div>
        </section>
        <section>
          <div class="hint" style="font-weight:800;color:#334155">8) Sélection multiple</div>
          <div>Tout sélectionner / Effacer, appliquer une catégorie en masse.</div>
        </section>
        <section>
          <div class="hint" style="font-weight:800;color:#334155">9) Navigation & accessibilité</div>
          <div>↑/↓ pour naviguer la liste, Entrée pour ouvrir; défilement automatique sur l’élément actif.</div>
        </section>
        <section>
          <div class="hint" style="font-weight:800;color:#334155">10) Avertissements</div>
          <div>Panneau épinglable; incohérences listées; export possible avec confirmation.</div>
        </section>
        <section>
          <div class="hint" style="font-weight:800;color:#334155">Bonnes pratiques</div>
          <ul style="margin:6px 0 0 18px;">
            <li>Placeholders: utilisez <<NomVariable>> et documentez-les.</li>
            <li>ID modèle: lettres/chiffres/_ et unique.</li>
            <li>Le brouillon est local; exportez pour partager et versionner.</li>
          </ul>
        </section>
      </div>`;
    showModal({ title: 'Aide – Console d’administration', bodyHtml: body, confirmText: 'Fermer', onConfirm: () => {} });
  };

  // Delegated copy handler for modal content
  if (modal) {
    modal.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-copy]');
      if (!btn) return;
      const txt = btn.getAttribute('data-copy') || '';
      if (!txt) return;
      navigator.clipboard && navigator.clipboard.writeText(txt);
      notify('Commande copiée.');
    });
  }

  // Bulk import (CSV / JSON array / NDJSON) for many templates
  if (btnBulkImport && bulkFileInput) {
    btnBulkImport.onclick = () => bulkFileInput.click();
    bulkFileInput.onchange = async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        const txt = await f.text();
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        const items = parseBulkTemplates(txt, ext);
        if (!Array.isArray(items) || !items.length) { notify('Aucun template détecté dans le fichier.', 'warn'); return; }
        const added = mergeImportedTemplates(items);
        if (added > 0) {
          saveDraft();
          afterDataLoad();
          notify(`${added} modèle(s) importé(s).`);
        } else {
          notify('Aucun modèle ajouté (doublons potentiels).', 'warn');
        }
      } catch (err) {
        console.error(err);
        notify('Import en lot échoué: format non reconnu ou contenu invalide.', 'warn');
      } finally {
        e.target.value = '';
      }
    };
  }

  // Bulk import for variables (CSV / JSON)
  window.importVariablesFromFile = async (file) => {
    if (!file) return;
    try {
      const txt = await file.text();
      const variables = parseVariablesCsv(txt);
      if (!variables || !Object.keys(variables).length) { 
        notify('Aucune variable détectée dans le fichier.', 'warn'); 
        return; 
      }
      const added = mergeImportedVariables(variables);
      if (added > 0) {
        saveDraft();
        updateKpis();
        renderVariablesEditor();
        renderTemplateEditor();
        renderWarnings();
        notify(`${added} variable(s) importée(s).`);
      } else {
        notify('Aucune variable ajoutée (toutes existaient déjà).', 'warn');
      }
    } catch (err) {
      console.error(err);
      notify('Import de variables échoué: format non reconnu ou contenu invalide.', 'warn');
    }
  };

  function parseVariablesCsv(csvText) {
    // Expected headers: name, description_fr, description_en, format, example_fr, example_en (or example)
    const vars = {};
    const lines = csvText.split(/\r?\n/);
    if (!lines.length) return vars;
    const header = lines.shift();
    if (!header) return vars;
    const sep = header.includes(';') && !header.includes(',') ? ';' : ',';
    const keys = header.split(sep).map(s => s.trim().toLowerCase());

    for (const line of lines) {
      if (!line.trim()) continue;
      const cells = splitCsvLine(line, sep);
      const obj = {};
      keys.forEach((k, i) => obj[k] = cells[i] ?? '');

      const name = (obj.name || obj.variable || obj.var || obj.key || '').trim();
      if (!name) continue;

      const desc_fr = (obj.description_fr || obj.desc_fr || obj.descriptionfr || '').trim();
      const desc_en = (obj.description_en || obj.desc_en || obj.descriptionen || '').trim();
      const format = (obj.format || 'text').trim();
      const example_fr = (obj.example_fr || obj.exemple_fr || obj.exemple || '').trim();
      const example_en = (obj.example_en || '').trim();
      const example = (obj.example || example_fr || example_en || '').trim();

      const meta = {
        description: { fr: desc_fr, en: desc_en },
        format: format,
        example: example
      };
      if (example_fr || example_en) meta.examples = { fr: example_fr || '', en: example_en || '' };
      vars[name] = meta;
    }
    return vars;
  }

  function mergeImportedVariables(newVars) {
    let added = 0;
    const lib = data.variables || (data.variables = {});
    for (const [name, meta] of Object.entries(newVars)) {
      if (!lib[name]) {
        lib[name] = meta;
        added++;
      } else {
        // Update existing variable metadata
        lib[name].description = meta.description || lib[name].description;
        lib[name].format = meta.format || lib[name].format;
        lib[name].example = meta.example || lib[name].example;
        if (meta.examples) {
          lib[name].examples = Object.assign({}, lib[name].examples || {}, meta.examples);
          // Keep example in sync if empty
          if (!lib[name].example) lib[name].example = lib[name].examples.fr || lib[name].examples.en || '';
        }
      }
    }
    return added;
  }

  function parseBulkTemplates(text, extHint) {
    const t = text.trim();
    if (!t) return [];
    // Try JSON array
    try {
      if (t.startsWith('[')) {
        const arr = JSON.parse(t);
        if (Array.isArray(arr)) return arr.map(normalizeIncomingTemplate).filter(Boolean);
      }
    } catch {}
    // Try NDJSON
    const lines = t.split(/\r?\n/).filter(Boolean);
    let ndjsonOk = true; const nd = [];
    for (const line of lines) {
      try { nd.push(normalizeIncomingTemplate(JSON.parse(line))); } catch { ndjsonOk = false; break; }
    }
    if (ndjsonOk && nd.length) return nd.filter(Boolean);
    // Fallback: CSV
    return parseCsvTemplates(t).map(normalizeIncomingTemplate).filter(Boolean);
  }

  function parseCsvTemplates(csvText) {
    // Simple CSV parser for comma or semicolon separators with header
    // Expected headers (case-insensitive): id, category, title_fr, title_en, description_fr, description_en, subject_fr, subject_en, body_fr, body_en
    const rows = [];
    const lines = csvText.split(/\r?\n/);
    if (!lines.length) return rows;
    const header = lines.shift();
    if (!header) return rows;
    const sep = header.includes(';') && !header.includes(',') ? ';' : ',';
    const keys = header.split(sep).map(s => s.trim().toLowerCase());
    for (const line of lines) {
      if (!line.trim()) continue;
      const cells = splitCsvLine(line, sep);
      const obj = {};
      keys.forEach((k, i) => obj[k] = cells[i] ?? '');
      rows.push(obj);
    }
    return rows;
  }

  function splitCsvLine(line, sep) {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i+1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === sep && !inQ) {
        out.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map(s => s.trim());
  }

  function normalizeIncomingTemplate(raw) {
    if (!raw || typeof raw !== 'object') return null;
    // Support multiple field names, map into our schema
    const id = sanitizeId(raw.id || raw.ID || raw.slug || raw.key || '');
    const category = String(raw.category || raw.categorie || raw.cat || '').trim();
    const title_fr = (raw.title_fr ?? raw.titre_fr ?? raw.titleFR ?? raw.titleFr ?? raw.title?.fr) || '';
    const title_en = (raw.title_en ?? raw.titre_en ?? raw.titleEN ?? raw.titleEn ?? raw.title?.en) || '';
    const desc_fr = (raw.description_fr ?? raw.desc_fr ?? raw.descriptionFR ?? raw.descriptionFr ?? raw.description?.fr) || '';
    const desc_en = (raw.description_en ?? raw.desc_en ?? raw.descriptionEN ?? raw.descriptionEn ?? raw.description?.en) || '';
    const subj_fr = (raw.subject_fr ?? raw.objet_fr ?? raw.subjectFR ?? raw.subjectFr ?? raw.subject?.fr) || '';
    const subj_en = (raw.subject_en ?? raw.objet_en ?? raw.subjectEN ?? raw.subjectEn ?? raw.subject?.en) || '';
    const body_fr = (raw.body_fr ?? raw.corps_fr ?? raw.bodyFR ?? raw.bodyFr ?? raw.body?.fr) || '';
    const body_en = (raw.body_en ?? raw.corps_en ?? raw.bodyEN ?? raw.bodyEn ?? raw.body?.en) || '';
    let variables = Array.isArray(raw.variables) ? raw.variables.slice() : undefined;
    // CSV support: a 'variables' or 'vars' column as a delimited string
    const rawVars = raw.variables ?? raw.vars;
    if (!variables && typeof rawVars === 'string') {
      variables = rawVars.split(/[;,]/).map(s => s.trim()).filter(Boolean);
    }
    return {
      id: id || undefined,
      category,
      title: { fr: String(title_fr), en: String(title_en) },
      description: { fr: String(desc_fr), en: String(desc_en) },
      subject: { fr: String(subj_fr), en: String(subj_en) },
      body: { fr: String(body_fr), en: String(body_en) },
      variables,
    };
  }

  function sanitizeId(s) {
    const v = String(s || '').trim();
    if (!v) return '';
    return v.replace(/[^A-Za-z0-9_]+/g, '_');
  }

  function mergeImportedTemplates(items) {
    let added = 0;
    const cats = new Set(data.metadata.categories || []);
    items.forEach(src => {
      if (!src) return;
      // Generate ID from title if missing
      let id = src.id || sanitizeId(src.title?.fr || src.title?.en || 'modele');
      if (!id) id = 'modele';
      id = uniqueId(id);
      const t = {
        id,
        category: src.category || '',
        title: { fr: src.title?.fr || '', en: src.title?.en || '' },
        description: { fr: src.description?.fr || '', en: src.description?.en || '' },
        subject: { fr: src.subject?.fr || '', en: src.subject?.en || '' },
        body: { fr: src.body?.fr || '', en: src.body?.en || '' },
        variables: Array.isArray(src.variables) ? Array.from(new Set(src.variables)) : [],
      };
      // Add category if new
      if (t.category && !cats.has(t.category)) {
        cats.add(t.category);
      }
      // Auto-detect placeholders and union with provided variables
      const ph = extractPlaceholdersFromTemplate(t);
      t.variables = Array.from(new Set([...(t.variables || []), ...ph]));
      data.templates.push(t);
      added++;
    });
    // Update categories in metadata
    data.metadata.categories = Array.from(cats);
    // Optionally add missing variables to library with inferred meta
    const lib = data.variables || (data.variables = {});
    const allPlaceholders = new Set();
    data.templates.forEach(t => (t.variables || []).forEach(v => allPlaceholders.add(v)));
    for (const v of allPlaceholders) {
      if (!lib[v]) lib[v] = inferVariableMeta(v);
    }
    return added;
  }

  // Sidebar/search/filter
  btnNewTemplate.onclick = () => {
    const id = uniqueId('nouveau_modele');
    const t = {
      id,
      category: (data.metadata.categories || [])[0] || '',
      title: { fr: '', en: '' },
      description: { fr: '', en: '' },
      subject: { fr: '', en: '' },
      body: { fr: '', en: '' },
      variables: []
    };
    data.templates.unshift(t);
    selectedTemplateId = id;
    saveDraft();
    afterDataLoad();
  };

  searchInput.oninput = debounce((e) => {
    searchTerm = e.target.value;
    renderSidebar();
  }, 200);

  catFilterSel.onchange = (e) => {
    filterCategory = e.target.value;
    renderSidebar();
  };

  // Segmented toggle handler
  if (langSwitch) {
    langSwitch.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-lang]');
      if (!btn) return;
      const next = btn.dataset.lang;
      if (!next || next === lang) return;
      lang = next;
      try { localStorage.setItem('ea_admin_lang', lang); } catch {}
      const btns = $$('button[data-lang]', langSwitch);
      btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
      renderSidebar();
      renderMain();
    });
  }

  // Keyboard navigation in sidebar: Up/Down to change selection, Enter to open
  document.addEventListener('keydown', (e) => {
    if (bulkMode) return; // disable nav in bulk mode
    const ae = document.activeElement;
    const withinList = ae && typeof ae.closest === 'function' && ae.closest('#template-list');
    if (!withinList) return; // only when focus is inside the templates list

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const list = getFilteredTemplates();
      if (!list.length) return;
      let idx = list.findIndex(t => t.id === selectedTemplateId);
      if (idx < 0) idx = 0;
      if (e.key === 'ArrowDown') idx = (idx + 1) % list.length; else idx = (idx - 1 + list.length) % list.length;
      selectedTemplateId = list[idx].id;
      _revealActiveOnRender = true;
      renderSidebar();
      renderMain();
    } else if (e.key === 'Enter') {
      // Let tile handler manage Enter key; ensure we target the active tile if focus is on the list container
      const targetTile = document.querySelector('#template-list .tile.active');
      if (targetTile && ae === document.getElementById('template-list')) {
        e.preventDefault();
        targetTile.click();
      }
    }
  });

  // Tabs
  function setTab(active) {
    [tabTemplates, tabVariables, tabMetadata].forEach(b => b.classList.remove('active'));
    active.classList.add('active');
    renderMain();
  }
  tabTemplates.onclick = () => setTab(tabTemplates);
  tabVariables.onclick = () => setTab(tabVariables);
  tabMetadata.onclick = () => setTab(tabMetadata);

  // Save
  btnSave.onclick = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data, null, 2));
      notify('Brouillon enregistré.');
    } catch (e) {
      notify('Erreur lors de l’enregistrement du brouillon.', 'warn');
    }
  };

  // Esc helpers
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  // Init
  loadInitial().catch(err => {
    notify('Erreur de chargement du JSON.', 'warn');
    console.error(err);
  });
  // Visible boot signal
  try { notify('Console admin prête'); } catch {}

  // Event delegation safety net: ensures core buttons work even if direct bindings failed
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;
    const resetBtn = t.closest && t.closest('#btn-reset');
    if (resetBtn) {
      e.preventDefault();
      if (confirm('Effacer le brouillon local et recharger le fichier original ?')) {
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
        location.reload();
      }
      return;
    }
    const importBtn = t.closest && t.closest('#btn-import');
    if (importBtn) {
      e.preventDefault();
      startImportFlow();
      return;
    }
    const helpBtn = t.closest && t.closest('#btn-help');
    if (helpBtn) {
      e.preventDefault();
      if (typeof btnHelp?.onclick === 'function') {
        try { btnHelp.onclick(); } catch {}
      } else {
        try { window.open('./help.html', '_blank', 'noopener'); } catch {}
      }
      return;
    }
  }, { capture: true });

  // Drag-and-drop import fallback
  try {
    window.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
        e.preventDefault();
      }
    });
    window.addEventListener('drop', async (e) => {
      if (!e.dataTransfer) return;
      const files = Array.from(e.dataTransfer.files || []);
      if (!files.length) return;
      const f = files[0];
      if (!/\.json$/i.test(f.name)) {
        // Allow non-.json too, but warn
        notify('Fichier sans extension .json – tentative d\'import…');
      }
      e.preventDefault();
      await handleImportedFile(f);
    });
  } catch {}
})();

