// Minimal Admin Console (Simple Mode)
(function(){
  // ============================================
  // AUTHENTICATION SYSTEM
  // ============================================
  // SHA-256 hash of the admin password
  // To change the password, generate a new hash with:
  // crypto.subtle.digest('SHA-256', new TextEncoder().encode('YOUR_PASSWORD')).then(h => console.log(Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('')))
  const ADMIN_PASSWORD_HASH = 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3'; // "123" - CHANGE THIS!
  const AUTH_KEY = 'ea_admin_auth';
  
  async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  function isAuthenticated() {
    return localStorage.getItem(AUTH_KEY) === 'true';
  }
  
  function setAuthenticated(value) {
    if (value) {
      localStorage.setItem(AUTH_KEY, 'true');
    } else {
      localStorage.removeItem(AUTH_KEY);
    }
  }
  
  async function handleLogin() {
    const passwordInput = document.getElementById('admin-password');
    const errorEl = document.getElementById('login-error');
    const password = passwordInput?.value || '';
    
    if (!password) {
      errorEl.style.display = 'block';
      errorEl.textContent = 'Veuillez entrer un mot de passe';
      return;
    }
    
    const hash = await hashPassword(password);
    
    if (hash === ADMIN_PASSWORD_HASH) {
      setAuthenticated(true);
      showAdminContent();
    } else {
      errorEl.style.display = 'block';
      errorEl.textContent = 'Mot de passe incorrect';
      passwordInput.value = '';
      passwordInput.focus();
    }
  }
  
  function showAdminContent() {
    const loginScreen = document.getElementById('login-screen');
    const adminContent = document.getElementById('admin-content');
    
    if (loginScreen) loginScreen.style.display = 'none';
    if (adminContent) adminContent.classList.add('authenticated');
  }
  
  function showLoginScreen() {
    const loginScreen = document.getElementById('login-screen');
    const adminContent = document.getElementById('admin-content');
    
    if (loginScreen) loginScreen.style.display = 'flex';
    if (adminContent) adminContent.classList.remove('authenticated');
  }
  
  // Initialize authentication
  function initAuth() {
    const btnLogin = document.getElementById('btn-login');
    const passwordInput = document.getElementById('admin-password');
    
    if (btnLogin) {
      btnLogin.addEventListener('click', handleLogin);
    }
    
    if (passwordInput) {
      passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleLogin();
        }
      });
    }
    
    // Check if already authenticated
    if (isAuthenticated()) {
      showAdminContent();
    } else {
      showLoginScreen();
    }
  }
  
  // Run auth check immediately
  initAuth();
  
  // ============================================
  // MAIN ADMIN LOGIC (only runs if authenticated)
  // ============================================
  const DRAFT_KEY = 'ea_admin_simple_v1';
  let data = null; // { metadata, variables, templates }
  let selected = null; // template id
  let term = '';

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const notice = $('#notice');
  const list = $('#list');
  const search = $('#search');
  const file = $('#file');
  const btnXlsxTpl = $('#btn-dl-template-xlsx');
  const btnExportXlsx = $('#btn-export-xlsx');
  const btnHelp = $('#btn-help');
  const btnExportDownload = $('#btn-export-download');
  const btnReloadGithub = $('#btn-reload-github');
  const btnGimmeGithub = $('#btn-gimme-github');
  const btnCleanCategories = $('#btn-clean-categories');
  const hdr = $('#hdr');
  const btnDuplicate = $('#btn-duplicate');
  
  // Sync status tracking
  let lastPublishedHash = null;
  const syncStatus = $('#sync-status');
  const syncStatusText = $('#sync-status-text');
  
  // Dropdown menus
  const menuIO = $('#menu-io');
  const menuSettings = $('#menu-settings');
  const btnIODropdown = $('#btn-io-dropdown');
  const btnSettingsDropdown = $('#btn-settings-dropdown');
  
  // Setup dropdown toggles
  function setupDropdowns() {
    if (btnIODropdown && menuIO) {
      btnIODropdown.onclick = (e) => {
        e.stopPropagation();
        menuIO.classList.toggle('open');
        menuSettings?.classList.remove('open');
      };
    }
    if (btnSettingsDropdown && menuSettings) {
      btnSettingsDropdown.onclick = (e) => {
        e.stopPropagation();
        menuSettings.classList.toggle('open');
        menuIO?.classList.remove('open');
      };
    }
    // Close dropdowns when clicking outside
    document.addEventListener('click', () => {
      menuIO?.classList.remove('open');
      menuSettings?.classList.remove('open');
    });
  }
  setupDropdowns();
  
  // editor fields
  const idEl = $('#tpl-id');
  const catFrEl = $('#tpl-cat-fr');
  const catEnEl = $('#tpl-cat-en');
  const catFrSelectEl = $('#tpl-cat-fr-select');
  const catEnSelectEl = $('#tpl-cat-en-select');
  const titleFrEl = $('#tpl-title-fr');
  const titleEnEl = $('#tpl-title-en');
  const descFrEl = $('#tpl-desc-fr');
  const descEnEl = $('#tpl-desc-en');
  const subjFrEl = $('#tpl-subj-fr');
  const subjEnEl = $('#tpl-subj-en');
  const bodyFrEl = $('#tpl-body-fr');
  const bodyEnEl = $('#tpl-body-en');
  
  // Initialize rich text toolbars for body fields
  let bodyFrToolbar = null;
  let bodyEnToolbar = null;
  if (window.RichTextToolbar && bodyFrEl && bodyEnEl) {
    bodyFrToolbar = new RichTextToolbar(bodyFrEl);
    bodyEnToolbar = new RichTextToolbar(bodyEnEl);
  }
  
  // Helpers for getting/setting body content (works with both textarea and contenteditable)
  function getBodyValue(el) {
    if (el.contentEditable === 'true') {
      // Return HTML directly to preserve formatting
      return el.innerHTML || '';
    }
    return el.value;
  }
  function setBodyValue(el, val) {
    if (el.contentEditable === 'true') {
      const text = val || '';
      if (!text) {
        el.innerHTML = '';
        return;
      }
      // Check if already HTML (contains block tags or formatted inline tags)
      const hasHtmlTags = /<(br|p|div|strong|b|i|u|span|ul|ol|li|h[1-6])[>\s]/i.test(text);
      if (hasHtmlTags) {
        // Already HTML, use as-is
        el.innerHTML = text;
      } else {
        // Plain text - convert to HTML paragraphs preserving <<variables>>
        // First, normalize all line breaks to \n
        let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // Split on one or more consecutive blank lines to create paragraphs
        const paragraphs = normalized.split(/\n\n+/);
        
        const htmlParagraphs = paragraphs.map(para => {
          const trimmed = para.trim();
          if (!trimmed) return '';
          
          // Process the paragraph: escape everything EXCEPT <<variables>>
          let result = '';
          let lastIndex = 0;
          const varRegex = /<<[^>]+>>/g;
          let match;
          
          // Find and preserve all <<variables>>
          const matches = [];
          while ((match = varRegex.exec(trimmed)) !== null) {
            matches.push({ start: match.index, end: varRegex.lastIndex, text: match[0] });
          }
          
          // Build HTML by escaping regular text and preserving variables as HTML entities
          matches.forEach(m => {
            if (m.start > lastIndex) {
              const plainText = trimmed.substring(lastIndex, m.start);
              result += plainText
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
            }
            // For variables, we need to escape angle brackets so they display as text
            result += m.text
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
            lastIndex = m.end;
          });
          
          // Escape any remaining text after the last variable
          if (lastIndex < trimmed.length) {
            const remaining = trimmed.substring(lastIndex);
            result += remaining
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
          }
          
          // If no variables were found, escape the entire paragraph
          if (matches.length === 0) {
            result = trimmed
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
          }
          
          // Convert single newlines within the paragraph to <br>
          result = result.replace(/\n/g, '<br>');
          
          return `<p>${result}</p>`;
        }).filter(p => p);
        
        el.innerHTML = htmlParagraphs.join('');
      }
    } else {
      el.value = val || '';
    }
  }
  
  // Removed placeholders chip section (was #ph)
  const phBox = null;
  // variables chips container
  const varsBox = $('#vars');
  const varsEditorBox = $('#vars-editor');
  const varsSearchEl = $('#vars-search');
  const btnCopyVarsFr = $('#btn-copy-vars-fr');
  const btnCopyVarsEn = $('#btn-copy-vars-en');
  const btnValidateVars = $('#btn-validate-vars');
  const varsValidationBox = $('#vars-validation');
  const btnPreview = $('#btn-preview');

  function notify(msg){ if (!notice) return; notice.textContent = msg; notice.style.display='block'; clearTimeout(notify._t); notify._t=setTimeout(()=>notice.style.display='none', 2000); }
  
  // Save indicator system
  const saveIndicator = $('#save-indicator');
  const saveText = saveIndicator?.querySelector('.save-text');
  let saveIndicatorTimeout = null;
  
  function showSaveIndicator(status) {
    if (!saveIndicator) return;
    saveIndicator.classList.remove('saving', 'saved', 'visible');
    if (saveText) saveText.textContent = status === 'saving' ? 'Enregistrement…' : 'Sauvegardé ✓';
    saveIndicator.classList.add(status, 'visible');
    
    clearTimeout(saveIndicatorTimeout);
    if (status === 'saved') {
      saveIndicatorTimeout = setTimeout(() => {
        saveIndicator.classList.remove('visible');
      }, 2000);
    }
  }
  
  // Sync status indicator functions
  function computeDataHash(d) {
    // Simple hash of templates + variables for change detection
    const str = JSON.stringify({ templates: d?.templates || [], variables: d?.variables || {} });
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }
  
  function updateSyncStatus() {
    if (!syncStatus || !syncStatusText) return;
    const currentHash = computeDataHash(data);
    if (lastPublishedHash === null) {
      // First load - assume synced
      lastPublishedHash = currentHash;
    }
    if (currentHash === lastPublishedHash) {
      syncStatus.className = 'synced';
      syncStatusText.textContent = 'À jour';
      syncStatus.title = 'Toutes les modifications sont publiées';
    } else {
      syncStatus.className = 'pending';
      syncStatusText.textContent = 'Non publié';
      syncStatus.title = 'Des modifications n\'ont pas été publiées sur GitHub';
    }
  }
  
  function markAsPublished() {
    lastPublishedHash = computeDataHash(data);
    updateSyncStatus();
  }
  
  function ensureSchema(obj){
    obj = obj && typeof obj==='object' ? obj : {};
    obj.metadata = obj.metadata || { version:'1.0', totalTemplates:0, languages:['fr','en'], categories:[] };
    obj.metadata.categoryColors = obj.metadata.categoryColors || {};
    obj.metadata.categoryLabels = obj.metadata.categoryLabels || {};
    obj.variables = obj.variables || {};
    obj.templates = Array.isArray(obj.templates) ? obj.templates : [];
    return obj;
  }
  function saveDraft(){
    try {
      showSaveIndicator('saving');
      const serialized = JSON.stringify(data, null, 2);
      localStorage.setItem(DRAFT_KEY, serialized);
      // Publish for main app consumption
      localStorage.setItem('ea_admin_templates_data', serialized);
      showSaveIndicator('saved');
      updateSyncStatus();
    } catch {
      showSaveIndicator('saved'); // Still show saved to avoid stuck state
    }
  }
  function loadDraft(){ try{ const t = localStorage.getItem(DRAFT_KEY); return t ? ensureSchema(JSON.parse(t)) : null; }catch{ return null; } }
  async function fetchJson(url){ const r = await fetch(url, { cache:'no-cache' }); if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); }
  function buildJsonUrlCandidates(options={}){
    const { includeRemote=true, preferRemote=false } = options;
    const repoMeta = document.querySelector('meta[name="gh-repo"]')?.content || 'snarky1980/echo-bt-ctd-gestion';
    const rawBase = `https://raw.githubusercontent.com/${repoMeta}/main/complete_email_templates.json`;
    const ghPagesUrl = 'https://snarky1980.github.io/echo-bt-ctd-gestion/complete_email_templates.json';
    const origin = window.location.origin && window.location.origin !== 'null' ? window.location.origin.replace(/\/$/, '') : '';
    const pathRoot = (window.location.pathname || '').replace(/\/[^\/]*$/, '');
    const locals = ['.\/complete_email_templates.json', '.\/public/complete_email_templates.json'];
    if (origin) {
      if (pathRoot && pathRoot !== '') locals.push(`${origin}${pathRoot}/complete_email_templates.json`);
      locals.push(`${origin}/complete_email_templates.json`);
    }
    const remotes = includeRemote ? [rawBase, ghPagesUrl] : [];
    const ordered = preferRemote ? [...remotes, ...locals] : [...locals, ...remotes];
    const seen = new Set();
    return ordered.filter(url => {
      if (!url) return false;
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }
  async function loadInitial(){
    const draft = loadDraft(); if (draft) { data = draft; afterLoad(); return; }
    const urls = buildJsonUrlCandidates();
    let lastErr = null; for (const u of urls){ try{ data = ensureSchema(await fetchJson(u)); break; } catch(e){ lastErr=e; } }
    if (!data) { console.warn('No JSON found', lastErr); data = ensureSchema({}); }
    afterLoad();
  }
  function afterLoad(){
    // Normalize variable schema to support per-language defaults
    try {
      const lib = data.variables || {};
      Object.keys(lib).forEach(k => {
        const v = lib[k] || {};
        if (!v.description) v.description = { fr:'', en:'' };
        if (!v.example || typeof v.example === 'string') {
          const s = typeof v.example === 'string' ? v.example : '';
          v.example = { fr: s, en: s };
        } else {
          v.example.fr = v.example.fr || '';
          v.example.en = v.example.en || '';
        }
        if (!v.format) v.format = 'text';
        lib[k] = v;
      });
      data.variables = lib;
    } catch {}
    const categoryLabels = data.metadata.categoryLabels || {};
    (data.templates||[]).forEach(t => {
      const legacyValue = String(t.category || '').trim();
      if (!t.category_fr && !t.category_en && legacyValue){
        t.category_fr = legacyValue;
        t.category_en = legacyValue;
      } else {
        if (!t.category_fr && t.category_en) t.category_fr = t.category_en;
        if (!t.category_en && t.category_fr) t.category_en = t.category_fr;
      }
      const key = deriveCategoryKey(legacyValue, t.category_en, t.category_fr);
      if (key){
        t.category = key;
        if (!categoryLabels[key]) categoryLabels[key] = { fr:'', en:'' };
        if (t.category_fr && !categoryLabels[key].fr) categoryLabels[key].fr = t.category_fr;
        if (t.category_en && !categoryLabels[key].en) categoryLabels[key].en = t.category_en;
      } else {
        t.category = '';
      }
    });
    data.metadata.categoryLabels = categoryLabels;
    data.metadata.categories = Array.from(new Set((data.templates||[]).map(t=>t.category).filter(Boolean))).sort();
    data.metadata.totalTemplates = data.templates.length;
    if (!selected && data.templates.length) selected = data.templates[0].id;
    renderList(); renderEditor();
    // Initialize sync status after load (assume synced at load time)
    markAsPublished();
  }
  function syncLangButtons(){ /* no-op: both languages are shown */ }
  function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
  function sanitizeId(s){ const v=String(s||'').trim(); if (!v) return ''; return v.replace(/[^A-Za-z0-9_]+/g,'_'); }
  function stripDiacritics(value=''){ return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function toSnakeCase(value=''){
    const source = stripDiacritics(value)
      .replace(/([a-z0-9])([A-Z])/g,'$1_$2')
      .replace(/[-\s]+/g,'_')
      .replace(/[^A-Za-z0-9_]/g,'_')
      .replace(/_+/g,'_')
      .replace(/^_+|_+$/g,'');
    return source.toLowerCase();
  }
  function deriveCategoryKey(current='', labelEn='', labelFr=''){
    const candidates = [current, labelEn, labelFr]
      .map(v => String(v||'').trim())
      .filter(Boolean);
    if (!candidates.length) return '';
    for (const candidate of candidates){
      if (/^[a-z0-9_]+$/.test(candidate) && candidate === candidate.toLowerCase()) return candidate;
    }
    return toSnakeCase(candidates[0]);
  }
  function syncTemplateCategory(t){
    if (!t) return;
    const key = deriveCategoryKey(t.category, t.category_en, t.category_fr);
    t.category = key;
    const labels = data.metadata.categoryLabels || (data.metadata.categoryLabels = {});
    if (key){
      if (!labels[key]) labels[key] = { fr:'', en:'' };
      if (t.category_fr) labels[key].fr = t.category_fr;
      if (t.category_en) labels[key].en = t.category_en;
    }
    data.metadata.categories = Array.from(new Set((data.templates||[]).map(item => item.category).filter(Boolean))).sort();
  }
  function detectPlaceholders(t){
    const parts=[];
    if (t.subject?.fr) parts.push(t.subject.fr);
    if (t.subject?.en) parts.push(t.subject.en);
    if (t.body?.fr) parts.push(t.body.fr);
    if (t.body?.en) parts.push(t.body.en);
    // Join and decode HTML entities that might contain <<variable>> patterns
    const combined = parts.join('\n')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    const keys = [...combined.matchAll(/<<([^>]+)>>/g)]
      .map(m => canonicalVar(stripLangSuffix(m[1])))
      .filter(Boolean);
    return Array.from(new Set(keys)).sort();
  }
  // Map detected placeholders to known library keys (match ignoring underscores/case)
  function mapDetectedToKnown(keys){
    const lib = data?.variables || {};
    const libKeys = Object.keys(lib);
    if (!libKeys.length) return keys;
    const compact = (s) => String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
    const byCompact = new Map();
    libKeys.forEach(k => byCompact.set(compact(k), k));
    return keys.map(k => {
      if (lib[k]) return k;
      const c = compact(k);
      return byCompact.get(c) || k;
    });
  }
  function uniqueId(base){ let id = base || 'modele'; let i=1; const taken = new Set((data.templates||[]).map(x=>String(x.id||'').toLowerCase())); while(taken.has(id.toLowerCase())) id = `${base}_${i++}`; return id; }

  // Excel helpers (lazy-loaded)
  let _XLSX = null;
  async function getXLSX(){ if (_XLSX) return _XLSX; _XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm'); return _XLSX; }
  const toAscii = (s) => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const idSanitize = (s) => toAscii(String(s||'').toLowerCase())
    .replace(/[^a-z0-9_\s-]+/g,'_')
    .replace(/[\s-]+/g,'_')
    .replace(/_+/g,'_')
    .slice(0,80)
    .replace(/[^A-Za-z0-9_]/g,'');
  const normKey = (s) => String(s||'')
    .replace(/\uFEFF/g,'')
    .trim()
    .toLowerCase()
    .replace(/[_.:]/g,' ')
    .replace(/\s+/g,' ');
  const canonicalKey = (s) => normKey(s).replace(/\s+/g,'_');
  const H = new Map([
    ['id','id'],
    ['category en','category_en'], ['category fr','category_fr'], ['categorie en','category_en'], ['categorie fr','category_fr'], ['catégorie en','category_en'], ['catégorie fr','category_fr'],
    ['description en','description_en'], ['description fr','description_fr'],
    ['title en','title_en'], ['title fr','title_fr'], ['titre en','title_en'], ['titre fr','title_fr'],
    ['template en','template_en'], ['template fr','template_fr'],
    // Fix corrupted headers: accept common variants without accents as well
    ['modele en','template_en'], ['modele fr','template_fr'], ['modèle en','template_en'], ['modèle fr','template_fr'],
    ['variables description en','variables_description_en'], ['variables description fr','variables_description_fr'],
    ['variables_description_en','variables_description_en'], ['variables_description_fr','variables_description_fr']
  ]);
  const REQUIRED_KEYS = ['id','category_en','category_fr','description_en','description_fr','title_en','title_fr','template_en','template_fr','variables_description_en','variables_description_fr'];
  async function readXlsx(file){ const { read, utils } = await getXLSX(); return new Promise((resolve, reject)=>{ const fr = new FileReader(); fr.onerror=reject; fr.onload=()=>{ try{ const data=new Uint8Array(fr.result); const wb=read(data,{type:'array'}); const first=wb.SheetNames?.[0]; if(!first) throw new Error('Aucune feuille trouvee.'); const ws=wb.Sheets[first]; const rows = utils.sheet_to_json(ws, { header:1, raw:false }); resolve(rows); }catch(e){ reject(e);} }; fr.readAsArrayBuffer(file); }); }
  function rowsToObjects(rows){ if (!rows?.length) return []; let headIdx=-1, header=[]; const attempts=[]; for (let i=0;i<rows.length;i++){ const row=rows[i]; if (!Array.isArray(row) || !row.some(c=>String(c||'').trim()!=='')) continue; const raw=row.map(h=>String(h??'').trim()); const mapped=raw.map(h=>H.get(normKey(h)) || canonicalKey(h)); const set=new Set(mapped.map(canonicalKey)); const missing=REQUIRED_KEYS.filter(k=>!set.has(k)); attempts.push({index:i,missing}); if (!missing.length){ headIdx=i; header=mapped; break; } } if (headIdx<0){ const best = attempts.sort((a,b)=>a.missing.length-b.missing.length)[0]; const err = new Error('Colonnes Excel manquantes.'); err.missingColumns = best?.missing||[]; throw err; } const out=[]; for (let i=headIdx+1;i<rows.length;i++){ const r=rows[i]; if (!r || r.every(c=>String(c||'').trim()==='')) continue; const obj={}; for (let c=0;c<header.length;c++){ const k=header[c]; if (!k) continue; obj[k] = r[c]!=null ? String(r[c]).trim() : ''; } out.push(obj); } return out; }
  function extractPlaceholders(txt){ const t=String(txt||''); return Array.from(new Set([...(t.matchAll(/<<([^>]+)>>/g))].map(m=>m[1]))); }
  function canonicalVar(name){ const s = toAscii(String(name||'')).trim().toLowerCase(); if (!s) return ''; return s.replace(/[^A-Za-z0-9_]+/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,''); }
  function inferFormat(n){ if (/Montant|Nb|Nombre/i.test(n)) return 'number'; if (/Heure/i.test(n)) return 'time'; if (/(Date|Delai|D[ée]lai|NouvelleDate|DateInitiale)/i.test(n)) return 'date'; return 'text'; }
  function exampleFor(fmt){ return fmt==='number' ? '0' : fmt==='time' ? '17:00' : fmt==='date' ? '2025-01-01' : 'Exemple'; }
  function parseVariableDescriptionEntries(raw){ const map=new Map(); const text=String(raw||'').trim(); if (!text) return { map, issues:[] }; const chunks = text.split(/\r?\n/).flatMap(line=>line.split(/(?=<<)/)).map(p=>p.trim()).filter(Boolean); chunks.forEach(entry=>{ if(!entry.startsWith('<<')) return; const closeIdx = entry.indexOf('>>'); if (closeIdx===-1) return; const varNameRaw = entry.slice(2, closeIdx).trim(); let rest = entry.slice(closeIdx+2).trim(); if (!rest.startsWith(':')) return; rest = rest.slice(1).trim(); if (!rest) return; let description = rest; let defaultValue=''; const lo = rest.lastIndexOf('('); const lc = rest.lastIndexOf(')'); if (lo!==-1 && lc>lo && lc===rest.length-1){ defaultValue = rest.slice(lo+1, lc).trim(); description = rest.slice(0, lo).trim(); } const key = canonicalVar(varNameRaw); if (!key) return; if (!map.has(key)) map.set(key, { description, defaultValue }); }); return { map, issues:[] }; }
  // Strip language suffix _fr or _en (case-insensitive) to unify variable keys
  function stripLangSuffix(k){ return String(k||'').replace(/_(fr|en)$/i,''); }
  function parseVariableDescriptionEntries(raw){
    const map = new Map();
    const text = String(raw||'').trim();
    if (!text) return { map, issues:[] };
    const chunks = text.split(/\r?\n/)
      .flatMap(line => line.split(/(?=<<)/))
      .map(p => p.trim())
      .filter(Boolean);
    chunks.forEach(entry => {
      if (!entry.startsWith('<<')) return;
      const closeIdx = entry.indexOf('>>');
      if (closeIdx === -1) return;
      const varNameRaw = entry.slice(2, closeIdx).trim();
      let rest = entry.slice(closeIdx+2).trim();
      if (!rest.startsWith(':')) return;
      rest = rest.slice(1).trim();
      if (!rest) return;
      let description = rest;
      let defaultValue='';
      const lo = rest.lastIndexOf('(');
      const lc = rest.lastIndexOf(')');
      if (lo !== -1 && lc > lo && lc === rest.length - 1){
        defaultValue = rest.slice(lo+1, lc).trim();
        description = rest.slice(0, lo).trim();
      }
      // unify key by removing language suffix
      const baseName = stripLangSuffix(varNameRaw);
      const key = canonicalVar(baseName);
      if (!key) return;
      if (!map.has(key)) map.set(key, { description, defaultValue });
    });
    return { map, issues:[] };
  }
  function buildFromObjects(objs){
    const templates=[];
    const variables={};
    const categoryLabels={};
    const taken=new Set((data.templates||[]).map(t=>String(t.id||'').toLowerCase()));
    for (const row of objs){
      const rawId = String(row.id||'').trim();
      if (!rawId) continue;
      let id = idSanitize(rawId)||'modele';
      if (taken.has(id.toLowerCase())) id = uniqueId(id);
      taken.add(id.toLowerCase());

      const category_fr = String(row.category_fr||'').trim();
      const category_en = String(row.category_en||'').trim();
      const title_fr = String(row.title_fr||'').trim();
      const title_en = String(row.title_en||'').trim();
      const description_fr = String(row.description_fr||'').trim();
      const description_en = String(row.description_en||'').trim();
      const template_fr = String(row.template_fr||'').trim();
      const template_en = String(row.template_en||'').trim();
      const variablesDescFrRaw = row.variables_description_fr || '';
      const variablesDescEnRaw = row.variables_description_en || '';

      const categoryKey = deriveCategoryKey('', category_en, category_fr);
      const categoryLabelFr = category_fr || category_en || '';
      const categoryLabelEn = category_en || category_fr || '';
      if (categoryKey){
        if (!categoryLabels[categoryKey]) categoryLabels[categoryKey] = { fr:'', en:'' };
        if (categoryLabelFr && !categoryLabels[categoryKey].fr) categoryLabels[categoryKey].fr = categoryLabelFr;
        if (categoryLabelEn && !categoryLabels[categoryKey].en) categoryLabels[categoryKey].en = categoryLabelEn;
      }

      const { map: varDescEn } = parseVariableDescriptionEntries(variablesDescEnRaw);
      const { map: varDescFr } = parseVariableDescriptionEntries(variablesDescFrRaw);
      const varsFrSet = new Set(extractPlaceholders(template_fr).map(n=>canonicalVar(stripLangSuffix(n))).filter(Boolean));
      const varsEnSet = new Set(extractPlaceholders(template_en).map(n=>canonicalVar(stripLangSuffix(n))).filter(Boolean));
      const varsUnion = Array.from(new Set([...varsFrSet, ...varsEnSet])).sort();

      varsUnion.forEach(k=>{
        if(!k) return;
        if(!variables[k]) variables[k] = { description:{fr:'',en:''}, format:'text', example:{fr:'',en:''} };
        const metaFr = varDescFr.get(k);
        const metaEn = varDescEn.get(k);
        const fmt = inferFormat(k);
        variables[k].format = fmt;
        if (metaFr?.description && !variables[k].description.fr) variables[k].description.fr = metaFr.description;
        if (metaEn?.description && !variables[k].description.en) variables[k].description.en = metaEn.description;
        if (!variables[k].description.fr) variables[k].description.fr = `Valeur pour ${k}`;
        if (!variables[k].description.en) variables[k].description.en = `Value for ${k}`;
        if (metaFr?.defaultValue && !variables[k].example.fr) variables[k].example.fr = metaFr.defaultValue;
        if (metaEn?.defaultValue && !variables[k].example.en) variables[k].example.en = metaEn.defaultValue;
        if (!variables[k].example.fr && !variables[k].example.en){ const ex=exampleFor(fmt); variables[k].example.fr = ex; variables[k].example.en = ex; }
      });

      templates.push({
        id,
        category: categoryKey,
        category_fr: categoryLabelFr,
        category_en: categoryLabelEn,
        title:{fr:title_fr,en:title_en},
        description:{fr:description_fr,en:description_en},
        subject:{fr:title_fr,en:title_en},
        body:{fr:template_fr,en:template_en},
        variables: varsUnion
      });
    }
    return { templates, variables, categoryLabels };
  }
  async function handleXlsxImport(file, mode='merge'){
    try{
      const rows = await readXlsx(file);
      const objs = rowsToObjects(rows);
      const out = buildFromObjects(objs);
      if (mode === 'replace'){
        data = ensureSchema({});
        data.templates = out.templates;
        data.variables = out.variables;
        data.metadata.totalTemplates = data.templates.length;
        data.metadata.categories = Array.from(new Set(data.templates.map(t=>t.category).filter(Boolean))).sort();
        data.metadata.categoryLabels = out.categoryLabels;
        selected = data.templates[0]?.id || null;
        saveDraft(); renderList(); renderEditor();
        notify(`Import Excel (remplacement) effectué: ${data.templates.length} modèles, ${Object.keys(data.variables).length} variables.`);
        return;
      }
      // merge (default)
      let addedT=0, addedV=0; const existingVars = data.variables || (data.variables={});
      out.templates.forEach(t=>{ // ensure unique again vs current state
        if (data.templates.some(x=>x.id.toLowerCase()===t.id.toLowerCase())){ t.id = uniqueId(t.id); }
        data.templates.push(t); addedT++; });
      Object.entries(out.variables).forEach(([k,v])=>{ if (!existingVars[k]){ existingVars[k]=v; addedV++; } else {
          // fill missing descriptions/examples/format if empty
          existingVars[k].format ||= v.format;
          existingVars[k].example = existingVars[k].example || { fr:'', en:'' };
          if (v.example?.fr && !existingVars[k].example.fr) existingVars[k].example.fr = v.example.fr;
          if (v.example?.en && !existingVars[k].example.en) existingVars[k].example.en = v.example.en;
          existingVars[k].description = existingVars[k].description || {fr:'',en:''};
          if (!existingVars[k].description.fr && v.description?.fr) existingVars[k].description.fr = v.description.fr;
          if (!existingVars[k].description.en && v.description?.en) existingVars[k].description.en = v.description.en;
        }
      });
      // metadata
      data.metadata.totalTemplates = data.templates.length;
      data.metadata.categories = Array.from(new Set(data.templates.map(t=>t.category).filter(Boolean))).sort();
      data.metadata.categoryLabels = { ...(data.metadata.categoryLabels||{}), ...out.categoryLabels };
      saveDraft(); renderList(); selected = out.templates[0]?.id || selected; renderEditor(); notify(`Import Excel (fusion) effectué: ${addedT} modèles, ${addedV} variables.`);
    } catch(e){ console.error(e); notify('Import Excel invalide.'); }
  }

  function filtered(){
    const t = term.toLowerCase();
    return (data.templates||[]).filter(x=>{
      if (!t) return true;
      const hay=[x.id,x.category,getCategoryDisplay(x),x.title?.fr,x.title?.en,x.description?.fr,x.description?.en,x.subject?.fr,x.subject?.en,x.body?.fr,x.body?.en]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(t);
    });
  }
  function getCategoryDisplay(t){
    if (!t) return '';
    const labels = data.metadata?.categoryLabels?.[t.category];
    if (labels) return labels.fr || labels.en || '';
    return t.category_fr || t.category_en || t.category || '';
  }
  function renderList(){ const arr = filtered(); list.innerHTML = arr.map(x=>{ const ttl = x.title?.fr || x.title?.en || x.id; return `<div class="tile ${x.id===selected?'active':''}" data-id="${escapeHtml(x.id)}"><div class="tile-title">${escapeHtml(ttl)}</div><div class="tile-sub">${escapeHtml(getCategoryDisplay(x))}</div></div>`; }).join(''); $$('.tile', list).forEach(el=>{ el.onclick=()=>{ selected = el.dataset.id; renderList(); renderEditor(); }; }); }

  function populateCategorySelects(){
    // Only show categories that are actually used by templates
    const usedCategories = new Set((data.templates||[]).map(t=>t.category).filter(Boolean));
    const labels = data.metadata?.categoryLabels || {};
    const categories = Array.from(usedCategories).sort();
    
    if (catFrSelectEl) {
      const currentFr = catFrEl?.value || '';
      const currentTemplate = (data.templates||[]).find(x=>x.id===selected);
      const currentKey = currentTemplate?.category || '';
      
      catFrSelectEl.innerHTML = '<option value="">-- Nouvelle catégorie --</option>' + 
        categories.map(key => {
          const label = labels[key]?.fr || labels[key]?.en || key;
          const selected = (key === currentKey) ? ' selected' : '';
          return `<option value="${escapeHtml(key)}"${selected}>${escapeHtml(label)}</option>`;
        }).join('');
    }
    
    if (catEnSelectEl) {
      const currentEn = catEnEl?.value || '';
      const currentTemplate = (data.templates||[]).find(x=>x.id===selected);
      const currentKey = currentTemplate?.category || '';
      
      catEnSelectEl.innerHTML = '<option value="">-- New category --</option>' + 
        categories.map(key => {
          const label = labels[key]?.en || labels[key]?.fr || key;
          const selected = (key === currentKey) ? ' selected' : '';
          return `<option value="${escapeHtml(key)}"${selected}>${escapeHtml(label)}</option>`;
        }).join('');
    }
  }
  
  function renderEditor(){ const t = (data.templates||[]).find(x=>x.id===selected) || null; hdr.textContent = t ? `Éditeur – ${t.id}` : 'Éditeur'; if (!t) { idEl.value=''; if (catFrEl) catFrEl.value=''; if (catEnEl) catEnEl.value=''; titleFrEl.value=''; titleEnEl.value=''; descFrEl.value=''; descEnEl.value=''; subjFrEl.value=''; subjEnEl.value=''; setBodyValue(bodyFrEl, ''); setBodyValue(bodyEnEl, ''); if (varsBox) varsBox.innerHTML=''; if (varsValidationBox) varsValidationBox.style.display='none'; populateCategorySelects(); return; }
    idEl.value = t.id || '';
  if (catFrEl) catFrEl.value = t.category_fr || '';
  if (catEnEl) catEnEl.value = t.category_en || '';
    populateCategorySelects();
    titleFrEl.value = t.title?.fr || '';
    titleEnEl.value = t.title?.en || '';
    descFrEl.value = t.description?.fr || '';
    descEnEl.value = t.description?.en || '';
    subjFrEl.value = t.subject?.fr || '';
    subjEnEl.value = t.subject?.en || '';
    setBodyValue(bodyFrEl, t.body?.fr || '');
    setBodyValue(bodyEnEl, t.body?.en || '');
    // placeholders
  const ph = detectPlaceholders(t);
  // Only show detected placeholders, mapped to known library keys, and filter unknowns
  let all = Array.from(new Set(mapDetectedToKnown(ph))).filter(k => (data.variables||{})[k]).sort();
  // filter by search
  const q = (varsSearchEl?.value||'').trim().toLowerCase();
  const matches = (k) => !q || k.toLowerCase().includes(q) || (data.variables?.[k]?.description?.fr||'').toLowerCase().includes(q) || (data.variables?.[k]?.description?.en||'').toLowerCase().includes(q);
  const filteredKeys = all.filter(matches);
  if (varsBox){
    if (!filteredKeys.length){ varsBox.innerHTML = '<div class="chip muted">Aucune</div>'; }
    else {
      varsBox.innerHTML = filteredKeys.map(k=>{
        const v = data.variables?.[k];
        const title = `FR: ${escapeHtml(v?.description?.fr||'')} | EN: ${escapeHtml(v?.description?.en||'')} | Défaut FR: ${escapeHtml(v?.example?.fr||'')} | Défaut EN: ${escapeHtml(v?.example?.en||'')}`;
        return `<span class="chip" title="${title}">${escapeHtml(k)}</span>`;
      }).join('');
    }
  }
    renderVarsEditor();
  }
  
  function getTemplateVarKeys(){
    const t = (data.templates||[]).find(x=>x.id===selected);
    if (!t) return [];
    // Only detected placeholders mapped to known library keys
    const mapped = mapDetectedToKnown(detectPlaceholders(t));
    return Array.from(new Set(mapped)).filter(k => (data.variables||{})[k]).sort();
  }
  function renderVarsEditor(){
    if (!varsEditorBox) return;
    const keysAll = getTemplateVarKeys();
    const q = (varsSearchEl?.value||'').trim().toLowerCase();
    const keys = keysAll.filter(k => !q || k.toLowerCase().includes(q) || (data.variables?.[k]?.description?.fr||'').toLowerCase().includes(q) || (data.variables?.[k]?.description?.en||'').toLowerCase().includes(q));
    if (!keys.length){
      varsEditorBox.innerHTML = '<div class="vhead">Aucune variable dans ce modèle. Utilisez « Sync variables » après avoir ajouté des <<placeholders>>.</div>';
      return;
    }
    const rows = [];
    rows.push(`<div class="vgrid">
      <div class="vrow">
        <div class="vhead">Variable</div>
        <div class="vhead">Description (FR)</div>
        <div class="vhead">Description (EN)</div>
        <div class="vhead">Valeur par défaut (FR)</div>
        <div class="vhead">Valeur par défaut (EN)</div>
      </div>
    `);
    keys.forEach(k => {
      const v = (data.variables||{})[k] || { description:{fr:'',en:''}, example:{fr:'',en:''} };
      const fr = v?.description?.fr || '';
      const en = v?.description?.en || '';
      const defFr = v?.example?.fr || '';
      const defEn = v?.example?.en || '';
      rows.push(`
        <div class="vrow" data-key="${escapeHtml(k)}">
          <div class="vkey">&lt;&lt;${escapeHtml(k)}&gt;&gt;</div>
          <input class="vinput" data-role="fr" placeholder="ex: Valeur pour ${escapeHtml(k)}" value="${escapeHtml(fr)}" />
          <input class="vinput" data-role="en" placeholder="ex: Value for ${escapeHtml(k)}" value="${escapeHtml(en)}" />
          <input class="vinput" data-role="def-fr" placeholder="ex: Exemple FR" value="${escapeHtml(defFr)}" />
          <input class="vinput" data-role="def-en" placeholder="ex: Example EN" value="${escapeHtml(defEn)}" />
        </div>
      `);
    });
    rows.push('</div>');
    varsEditorBox.innerHTML = rows.join('');
    // Wire inputs with event delegation
    varsEditorBox.querySelectorAll('.vrow').forEach(row => {
      const key = row.getAttribute('data-key');
      row.querySelectorAll('input.vinput').forEach(inp => {
        inp.addEventListener('input', (e) => {
          const role = inp.getAttribute('data-role');
          data.variables = data.variables || {};
          data.variables[key] = data.variables[key] || { description:{fr:'',en:''}, format:'text', example:{fr:'',en:''} };
          const desc = data.variables[key].description || (data.variables[key].description = {fr:'',en:''});
          if (role === 'fr' || role === 'en') {
            desc[role] = inp.value;
          } else if (role === 'def-fr') {
            data.variables[key].example.fr = inp.value;
          } else if (role === 'def-en') {
            data.variables[key].example.en = inp.value;
          }
          saveDraft();
          // update chip titles live (both descriptions) – default value not embedded, but could be shown later
          if (varsBox) {
            const chips = varsBox.querySelectorAll('.chip');
            chips.forEach(c => { if (c.textContent === key) c.title = `FR: ${desc.fr || ''} | EN: ${desc.en || ''} | Défaut FR: ${data.variables[key].example.fr || ''} | Défaut EN: ${data.variables[key].example.en || ''}`; });
          }
        });
      });
    });
  }

  // Copy variable lines (FR/EN) to clipboard
  function buildVarLinesForTemplate(t, lang){
    const keys = getTemplateVarKeys();
    return keys.map(k => {
      const v = data.variables?.[k];
      const desc = (lang==='fr' ? (v?.description?.fr || `Valeur pour ${k}`) : (v?.description?.en || `Value for ${k}`));
      const defVal = lang==='fr' ? (v?.example?.fr || '') : (v?.example?.en || '');
      const def = defVal ? `(${defVal})` : '';
      const suff = lang==='fr' ? '_FR' : '_EN';
      return `<<${k}${suff}>>:${desc}${def}`;
    }).join('\n');
  }
  async function copyVarLines(lang){
    const t = data.templates.find(x=>x.id===selected); if (!t) return;
    const lines = buildVarLinesForTemplate(t, lang);
    try { await navigator.clipboard.writeText(lines); notify(`Lignes ${lang.toUpperCase()} copiées dans le presse-papiers.`); }
    catch(e){ console.warn('Clipboard failed', e); }
  }

  // Validation: list missing FR/EN/default for current template variables
  function validateTemplateVars(){
    const t = data.templates.find(x=>x.id===selected); if (!t || !varsValidationBox) return;
    const keys = getTemplateVarKeys();
    const missingFr = []; const missingEn = []; const missingDefFr = []; const missingDefEn = [];
    keys.forEach(k => { const v=data.variables?.[k]||{}; if(!v.description?.fr) missingFr.push(k); if(!v.description?.en) missingEn.push(k); if(!v.example?.fr) missingDefFr.push(k); if(!v.example?.en) missingDefEn.push(k); });
    const parts = [];
    if (missingFr.length) parts.push(`FR manquant: ${missingFr.join(', ')}`);
    if (missingEn.length) parts.push(`EN manquant: ${missingEn.join(', ')}`);
    if (missingDefFr.length) parts.push(`Défaut FR manquant: ${missingDefFr.join(', ')}`);
    if (missingDefEn.length) parts.push(`Défaut EN manquant: ${missingDefEn.join(', ')}`);
    varsValidationBox.textContent = parts.length ? parts.join(' | ') : 'Tout est complet pour ce modèle.';
    varsValidationBox.style.display = 'block';
  }

  // simple variable actions
  // Internal: detect placeholders, map to known keys, update template + library
  function performVariableSync({ silent = false } = {}){
    const t = data.templates.find(x=>x.id===selected); if (!t) return { changed:false };
    const detected = Array.from(new Set(detectPlaceholders(t)));
    const mapped = Array.from(new Set(mapDetectedToKnown(detected)));
    const lib = data.variables || (data.variables = {});
    // Track if library gets new keys
    let libAdded = 0;
    mapped.forEach(k => { if (!lib[k]) { lib[k] = { description:{fr:'',en:''}, format:'text', example:{fr:'',en:''} }; libAdded++; } });
    // Compare with existing template variables
    const prev = Array.isArray(t.variables) ? Array.from(new Set(t.variables)) : [];
    const prevKey = prev.join('|');
    const nextKey = mapped.join('|');
    const changed = (prevKey !== nextKey) || (libAdded > 0);
    if (changed){
      t.variables = mapped;
      saveDraft();
      renderEditor();
    }
    if (!silent){
      try {
        const varsEl = document.getElementById('vars');
        if (varsEl){ varsEl.classList.add('ea-highlight-pulse'); setTimeout(()=>varsEl.classList.remove('ea-highlight-pulse'), 1200); }
      } catch {}
      const total = mapped.length; const knownCount = mapped.filter(k=>!!lib[k]).length; const unknownCount = mapped.length - knownCount;
      if (total===0) notify('Aucune variable détectée.');
      else notify(`Variables synchronisées: ${total} détectée(s) • ${knownCount} reconnue(s) • ${unknownCount} inconnue(s)`);
    }
    return { changed };
  }
  function syncTemplateVariables(){ performVariableSync({ silent:false }); }
  let autoSyncTimer = null;
  function scheduleAutoSync(){ clearTimeout(autoSyncTimer); autoSyncTimer = setTimeout(()=>performVariableSync({ silent:true }), 600); }
  function addMissingVariablesToLibrary(){
    const t = data.templates.find(x=>x.id===selected); if (!t) return;
    const ph = Array.from(new Set(detectPlaceholders(t)));
    const lib = data.variables || (data.variables = {});
    let add = 0;
    ph.forEach(k => { if (!lib[k]) { lib[k] = { description:{fr:'',en:''}, format:'text', example:{fr:'',en:''} }; add++; } });
    if (add) { saveDraft(); renderEditor(); notify(`${add} variable(s) ajoutée(s).`); }
    else { notify('Aucune variable à ajouter.'); }
  }

  // wire events
  function exportJson(){
    (data.templates||[]).forEach(syncTemplateCategory);
    data.metadata.totalTemplates = data.templates.length;
    data.metadata.categories = Array.from(new Set((data.templates||[]).map(t=>t.category).filter(Boolean))).sort();
    // Update timestamp on export
    data.metadata.updatedAt = new Date().toISOString();
    const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='complete_email_templates.json'; document.body.appendChild(a); a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000); a.remove();
  }
  // Download JSON button
  if (btnExportDownload) btnExportDownload.onclick = exportJson;

  async function publishJsonToGitHub(showToast){
    (data.templates||[]).forEach(syncTemplateCategory);
    data.metadata.totalTemplates = data.templates.length;
    data.metadata.categories = Array.from(new Set((data.templates||[]).map(t=>t.category).filter(Boolean))).sort();
    // Update timestamp on publish
    data.metadata.updatedAt = new Date().toISOString();
    // Requires a classic repo-scoped token stored locally (NEVER hard-code): localStorage.setItem('ea_gh_token', 'ghp_...')
    const token = localStorage.getItem('ea_gh_token');
    if (!token){
      notify('Token GitHub manquant (localStorage key ea_gh_token). Téléchargement local à la place.');
      exportJson();
      return;
    }
    // Derive owner/repo from homepage or location
    const homepage = (data.metadata && data.metadata.homepage) || document.querySelector('meta[name="gh-repo"]')?.content || '';
    let owner='snarky1980', repo='echo-bt-ctd-gestion';
    try {
      const m = homepage.match(/github\.io\/([^/]+)\/?/); if (m) repo = m[1];
      const m2 = (document.location.href).match(/https:\/\/([^.]+)\.github\.io\//); if (m2) owner = m2[1];
      // Project pages path: /<repo>/...
      const pathSeg = (location.pathname||'').split('/').filter(Boolean)[0];
      if (pathSeg) repo = pathSeg;
    } catch{}
    // For safety allow override
    const override = localStorage.getItem('ea_gh_repo');
    if (override){ const parts = override.split('/'); if (parts.length===2){ owner = parts[0]; repo = parts[1]; } }
  if (showToast) notify('Publication GitHub (main)…');
    const path = 'complete_email_templates.json';
    const baseUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const contentB64 = btoa(unescape(encodeURIComponent(JSON.stringify(data,null,2))));

    // 1. Update main branch (source of truth)
    let shaMain = null;
    try {
      const getMain = await fetch(baseUrl+`?ref=main`, { headers:{ Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json' }});
      if (getMain.ok){ const j = await getMain.json(); shaMain = j.sha; }
    } catch(e){ console.warn('Unable to get main sha', e); }
    const bodyMain = { message: 'feat(admin): update complete_email_templates.json (main) via admin-simple', content: contentB64, branch: 'main' };
    if (shaMain) bodyMain.sha = shaMain;
    const putMain = await fetch(baseUrl, { method:'PUT', headers:{ Authorization:`Bearer ${token}`, Accept:'application/vnd.github+json', 'Content-Type':'application/json' }, body: JSON.stringify(bodyMain) });
    if (!putMain.ok){ const txt = await putMain.text(); throw new Error('GitHub API (main) error: '+txt); }

    // No mirror to gh-pages: main is the only source of truth
    if (showToast) notify('JSON mis à jour sur main.');
    markAsPublished();
  }

  // Gimme some GitHub: auto-configure if needed, then publish
  async function gimmeGithub(){
    const token = localStorage.getItem('ea_gh_token');
    if (!token) {
      const answer = prompt('GitHub Token manquant.\n\nPour publier sur GitHub, créez un token avec permissions "repo" ici:\nhttps://github.com/settings/tokens\n\nCollez votre token ci-dessous (il sera stocké localement):');
      if (!answer || !answer.trim()) {
        notify('Publication annulée: aucun token fourni.');
        return;
      }
      localStorage.setItem('ea_gh_token', answer.trim());
      notify('Token GitHub configuré!');
    }
    // Optional: check/configure repo
    const repo = localStorage.getItem('ea_gh_repo');
    if (!repo) {
      const repoAnswer = prompt('Owner/Repo GitHub (ex: snarky1980/echo-bt-ctd-gestion).\nLaissez vide pour auto-détection.', '');
      if (repoAnswer && repoAnswer.trim()) {
        localStorage.setItem('ea_gh_repo', repoAnswer.trim());
      }
    }
    await publishJsonToGitHub(true);
  }
  async function reloadFromGithub() {
    if (!confirm('Recharger depuis GitHub?\n\nCeci écrasera toutes les modifications non publiées du brouillon local.')) return;
    try {
      localStorage.removeItem(DRAFT_KEY);
      const urls = buildJsonUrlCandidates({ preferRemote: true });
      console.info('[admin] Reload depuis GitHub – tentatives', urls);
      let json = null;
      for (const url of urls) {
        try {
          json = await fetchJson(url);
          break;
        } catch {}
      }
      if (!json) throw new Error('Impossible de charger depuis GitHub');
      data = ensureSchema(json);
      selected = data.templates[0]?.id || null;
      saveDraft();
      markAsPublished(); // Reset sync status after reload
      loadInitialUI();
      notify('Rechargé depuis GitHub avec succès.');
    } catch (err) {
      console.error(err);
      notify('Erreur lors du rechargement: ' + err.message);
    }
  }
  if (btnReloadGithub) btnReloadGithub.onclick = reloadFromGithub;
  if (btnGimmeGithub) btnGimmeGithub.onclick = gimmeGithub;
  $('#btn-import').onclick = () => file.click();
  file.onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const isXlsx = /\.xlsx$/i.test(f.name) || /sheet|excel/i.test(f.type || '');
    try {
      if (isXlsx) {
        const mode = confirm('Fusionner avec les modèles existants?\n\n✓ OUI = Ajouter les nouveaux modèles (recommandé)\n✗ NON = Remplacer tout (efface les modèles actuels)') ? 'merge' : 'replace';
        await handleXlsxImport(f, mode);
      } else {
        const txt = await f.text();
        const json = ensureSchema(JSON.parse(txt));
        data = json;
        selected = data.templates[0]?.id || null;
        saveDraft();
        loadInitialUI();
        notify('Import effectué.');
      }
    } catch (err) {
      console.error(err);
      notify('Import invalide.');
    } finally { e.target.value=''; }
  };
  // Template downloads
  const TEMPLATE_HEADERS = ['ID','CATEGORY_EN','CATEGORY_FR','DESCRIPTION_EN','DESCRIPTION_FR','TITLE_EN','TITLE_FR','TEMPLATE_EN','TEMPLATE_FR','VARIABLES_DESCRIPTION_EN','VARIABLES_DESCRIPTION_FR'];
  const SAMPLE_ROW = [
    'welcome_email',
    'Customer Care',
    'Service client',
    'Welcome email for a new customer',
    'Courriel de bienvenue pour un nouveau client',
    'Welcome – New customer onboarding',
    'Bienvenue – Arrivée d’un nouveau client',
    'Hello <<customer_name_EN>>,\nThank you for joining us. Your account number is <<account_number_EN>>.',
    'Bonjour <<customer_name_FR>>,\nMerci de nous avoir rejoints. Votre numéro de compte est <<account_number_FR>>.',
    '<<customer_name_EN>>:Customer name(Emily)\n<<account_number_EN>>:Account number(AC-12345)',
    '<<customer_name_FR>>:Nom du client(Emily)\n<<account_number_FR>>:Numéro de compte(AC-12345)'
  ];
  async function downloadXlsxTemplate(){
    try {
      const XLSX = await getXLSX();
      const wb = XLSX.utils.book_new();
      const aoa = [TEMPLATE_HEADERS, SAMPLE_ROW];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, 'Templates');
      const wbout = XLSX.write(wb, { bookType:'xlsx', type:'array' });
      const blob = new Blob([wbout], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='template_email_assistant.xlsx'; document.body.appendChild(a); a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); a.remove();
    } catch(e){ console.error(e); notify('Impossible de générer XLSX'); }
  }
  if (btnXlsxTpl) btnXlsxTpl.onclick = downloadXlsxTemplate;
  async function exportCurrentToXlsx(){
    try {
      const XLSX = await getXLSX();
      const wb = XLSX.utils.book_new();
      // Single sheet matching template format exactly
      const header = ['ID','CATEGORY_EN','CATEGORY_FR','DESCRIPTION_EN','DESCRIPTION_FR','TITLE_EN','TITLE_FR','TEMPLATE_EN','TEMPLATE_FR','VARIABLES_DESCRIPTION_EN','VARIABLES_DESCRIPTION_FR'];
      const rows = [header];
      
      (data.templates||[]).forEach(t => {
        const id = t.id || '';
        const cat_en = t.category_en || '';
        const cat_fr = t.category_fr || '';
        const title_en = t.title?.en || '';
        const title_fr = t.title?.fr || '';
        const desc_en = t.description?.en || '';
        const desc_fr = t.description?.fr || '';
        
        // Transform bodies to suffixed placeholders for Excel model (<<var_EN>> / <<var_FR>>)
        const bodyEnOriginal = t.body?.en || '';
        const bodyFrOriginal = t.body?.fr || '';
        const tpl_en = bodyEnOriginal.replace(/<<([^>]+)>>/g,(m,name)=>{
          const base = stripLangSuffix(name.trim());
          return (t.variables||[]).includes(base) ? `<<${base}_EN>>` : m;
        });
        const tpl_fr = bodyFrOriginal.replace(/<<([^>]+)>>/g,(m,name)=>{
          const base = stripLangSuffix(name.trim());
          return (t.variables||[]).includes(base) ? `<<${base}_FR>>` : m;
        });
        
        // Variable description lines with default value in parentheses and suffixed names
        const vEnLines = (t.variables||[]).map(k=>{
          const v = data.variables?.[k];
          const desc = v?.description?.en || `Value for ${k}`;
          const def = v?.example?.en ? `(${v.example.en})` : '';
          return `<<${k}_EN>>:${desc}${def}`;
        });
        const vFrLines = (t.variables||[]).map(k=>{
          const v = data.variables?.[k];
          const desc = v?.description?.fr || `Valeur pour ${k}`;
          const def = v?.example?.fr ? `(${v.example.fr})` : '';
          return `<<${k}_FR>>:${desc}${def}`;
        });
        
        rows.push([
          id,
          cat_en,
          cat_fr,
          desc_en,
          desc_fr,
          title_en,
          title_fr,
          tpl_en,
          tpl_fr,
          vEnLines.join('\n'),
          vFrLines.join('\n')
        ]);
      });
      
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Templates');
      
      const wbout = XLSX.write(wb, { bookType:'xlsx', type:'array' });
      const blob = new Blob([wbout], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a'); 
      a.href = URL.createObjectURL(blob); 
      a.download = 'email_assistant_export.xlsx'; 
      document.body.appendChild(a); 
      a.click(); 
      setTimeout(() => URL.revokeObjectURL(a.href), 1000); 
      a.remove();
      notify('Export Excel généré.');
    } catch(e){ 
      console.error(e); 
      notify('Échec export Excel'); 
    }
  }
  if (btnExportXlsx) btnExportXlsx.onclick = exportCurrentToXlsx;
  // Help popout
  let helpWin = null;
  function openHelpModal(){
    const modal = document.getElementById('modal-help');
    if (modal) modal.style.display = 'flex';
  }
  if (btnHelp) btnHelp.onclick = openHelpModal;
  $('#btn-reset').onclick = () => { if (!confirm('Effacer le brouillon local et recharger le fichier d\'origine ?')) return; localStorage.removeItem(DRAFT_KEY); location.reload(); };
  $('#btn-new').onclick = () => { const id = uniqueId('modele'); const t={ id, category:'', title:{fr:'',en:''}, description:{fr:'',en:''}, subject:{fr:'',en:''}, body:{fr:'',en:''}, variables:[] }; data.templates.push(t); selected=id; saveDraft(); renderList(); renderEditor(); };
  
  // Duplicate template
  function duplicateTemplate() {
    const t = data.templates.find(x => x.id === selected);
    if (!t) { notify('Sélectionnez un modèle à dupliquer.'); return; }
    const newId = uniqueId(t.id + '_copie');
    const copy = JSON.parse(JSON.stringify(t));
    copy.id = newId;
    copy.title = { fr: (t.title?.fr || '') + ' (copie)', en: (t.title?.en || '') + ' (copy)' };
    data.templates.push(copy);
    selected = newId;
    saveDraft();
    renderList();
    renderEditor();
    notify('Modèle dupliqué : ' + newId);
  }
  if (btnDuplicate) btnDuplicate.onclick = duplicateTemplate;
  
  // Delete with modal confirmation
  const modalDelete = $('#modal-delete');
  const btnCancelDelete = $('#btn-cancel-delete');
  const btnConfirmDelete = $('#btn-confirm-delete');
  const deleteTemplateName = $('#delete-template-name');
  
  function showDeleteModal() {
    const t = data.templates.find(x => x.id === selected);
    if (!t) return;
    const name = t.title?.fr || t.title?.en || t.id || 'Modèle sans nom';
    if (deleteTemplateName) deleteTemplateName.textContent = name;
    if (modalDelete) modalDelete.style.display = 'flex';
  }
  
  function hideDeleteModal() {
    if (modalDelete) modalDelete.style.display = 'none';
  }
  
  function confirmDelete() {
    const i = data.templates.findIndex(x => x.id === selected);
    if (i >= 0) {
      data.templates.splice(i, 1);
      selected = data.templates[0]?.id || null;
      saveDraft();
      renderList();
      renderEditor();
      notify('Modèle supprimé.');
    }
    hideDeleteModal();
  }
  
  $('#btn-delete').onclick = showDeleteModal;
  if (btnCancelDelete) btnCancelDelete.onclick = hideDeleteModal;
  if (btnConfirmDelete) btnConfirmDelete.onclick = confirmDelete;
  
  // Close modal on backdrop click
  if (modalDelete) {
    modalDelete.onclick = (e) => {
      if (e.target === modalDelete) hideDeleteModal();
    };
  }
  
  // Category colors management
  // Clean unused categories
  function cleanUnusedCategories(){
    const usedCategories = new Set((data.templates||[]).map(t=>t.category).filter(Boolean));
    const allCategories = new Set(data.metadata?.categories || []);
    const unused = Array.from(allCategories).filter(c => !usedCategories.has(c));
    
    if (!unused.length) {
      notify('Aucune catégorie inutilisée.');
      return;
    }
    
    if (!confirm(`Supprimer ${unused.length} catégorie(s) non utilisée(s)?\n\n${unused.join(', ')}`)) return;
    
    // Remove from metadata
    data.metadata.categories = Array.from(usedCategories).sort();
    
    // Remove from categoryLabels
    unused.forEach(key => {
      if (data.metadata.categoryLabels?.[key]) {
        delete data.metadata.categoryLabels[key];
      }
      if (data.metadata.categoryColors?.[key]) {
        delete data.metadata.categoryColors[key];
      }
    });
    
    saveDraft();
    notify(`${unused.length} catégorie(s) supprimée(s).`);
  }
  
  if (btnCleanCategories) btnCleanCategories.onclick = cleanUnusedCategories;

  $('#btn-category-colors').onclick = () => {
    const modal = $('#modal-category-colors');
    const list = $('#category-colors-list');
    // Default styles mirrored from Web App (src/App.jsx CATEGORY_BADGE_STYLES)
    const CATEGORY_DEFAULTS = {
      quotes_and_approvals: { bg: '#ede9fe', border: '#c4b5fd', text: '#1c2f4a' },
      follow_ups_and_cancellations: { bg: '#ffe4e6', border: '#fecdd3', text: '#1c2f4a' },
      documents_and_formatting: { bg: '#e0f2fe', border: '#bae6fd', text: '#1c2f4a' },
      deadlines_and_delivery: { bg: '#ffedd5', border: '#fdba74', text: '#1c2f4a' },
      clarifications_and_client_instructions: { bg: '#fef3c7', border: '#fde68a', text: '#1c2f4a' },
      security_and_copyright: { bg: '#fee2e2', border: '#fecaca', text: '#1c2f4a' },
      quality_assurance: { bg: '#dcfce7', border: '#bbf7d0', text: '#1c2f4a' },
      terminology_and_glossaries: { bg: '#cffafe', border: '#a5f3fc', text: '#1c2f4a' },
      revisions_and_feedback: { bg: '#fae8ff', border: '#f0abfc', text: '#1c2f4a' },
      team_coordination: { bg: '#e0e7ff', border: '#c7d2fe', text: '#1c2f4a' },
      technical_issues: { bg: '#ccfbf1', border: '#99f6e4', text: '#1c2f4a' },
      general_inquiries: { bg: '#f1f5f9', border: '#cbd5e1', text: '#1c2f4a' },
      default: { bg: '#e6f0ff', border: '#c7dbff', text: '#1c2f4a' }
    };
    // Use canonical category keys to ensure web app consistency
    const keys = Array.from(new Set((data.metadata?.categories || []).filter(Boolean)));
    const labels = data.metadata?.categoryLabels || {};
    const cc = data.metadata?.categoryColors || {};
    const rows = keys.sort().map(key => {
      const labelFr = labels[key]?.fr || '';
      const labelEn = labels[key]?.en || '';
      const label = labelFr && labelEn ? `${labelFr} / ${labelEn}` : (labelFr || labelEn || key);
      // Prefer color by key; fall back to legacy label-based entries if present
      const defaults = CATEGORY_DEFAULTS[key] || CATEGORY_DEFAULTS.default;
      const fallbackColor = defaults.border; // show per-category default (matches app tone)
      const color = (cc[key] || cc[labelFr] || cc[labelEn] || fallbackColor);
      const isCustom = !!(cc[key] || cc[labelFr] || cc[labelEn]);
      return `<div class="cat-row">
        <label class="cat-label">${escapeHtml(label)}</label>
        <div class="cat-controls">
          <div title="Aperçu (Web App)" class="cat-preview" style="border:2px solid ${defaults.border}; background:${defaults.bg}; color:${defaults.text}">Aa</div>
          <input class="cat-color" type="color" value="${escapeHtml(color)}" data-key="${escapeHtml(key)}" data-source="${isCustom ? 'custom' : 'default'}" />
        </div>
      </div>`;
    }).join('');
    list.innerHTML = rows || '<div class="tile-sub">Aucune catégorie trouvée.</div>';
    modal.style.display = 'flex';

    // Mark inputs as custom when changed
    list.querySelectorAll('input[type="color"]').forEach(inp => {
      inp.addEventListener('input', () => { inp.dataset.source = 'custom'; });
    });
  };
  $('#btn-save-category-colors').onclick = () => {
    const inputs = document.querySelectorAll('#category-colors-list input[type="color"]');
    if (!data.metadata.categoryColors) data.metadata.categoryColors = {};
    inputs.forEach(inp => {
      const key = inp.dataset.key;
      const val = inp.value;
      // Only persist if it's a custom override or changed by the user
      if (key && (inp.dataset.source === 'custom')) data.metadata.categoryColors[key] = val;
    });
    saveDraft();
    notify('Couleurs des catégories enregistrées.');
    $('#modal-category-colors').style.display = 'none';
  };
  // variables buttons (optional, may be absent)
  const btnSyncVars = $('#btn-sync-vars');
  if (btnSyncVars) btnSyncVars.onclick = syncTemplateVariables;
  const btnAddMissing = $('#btn-add-missing');
  if (btnAddMissing) btnAddMissing.onclick = addMissingVariablesToLibrary;
  // Always visible variables editor; render after load

  // inputs update
  idEl.oninput = (e) => { const t = data.templates.find(x=>x.id===selected); if (!t) return; const v=sanitizeId(e.target.value); e.target.value=v; if (!v) return; if (v!==t.id && data.templates.some(x=>x.id===v)){ e.target.style.borderColor='#fecaca'; return; } e.target.style.borderColor=''; t.id=v; selected=v; saveDraft(); renderList(); hdr.textContent = `Éditeur – ${t.id}`; };
  
  // Category select dropdowns - populate text field from selection
  if (catFrSelectEl) catFrSelectEl.onchange = (e) => {
    const key = e.target.value;
    if (!key) { catFrEl.value = ''; return; }
    const labels = data.metadata?.categoryLabels || {};
    catFrEl.value = labels[key]?.fr || labels[key]?.en || key;
    const t = data.templates.find(x=>x.id===selected); 
    if (t) { t.category_fr = catFrEl.value; syncTemplateCategory(t); saveDraft(); renderList(); }
  };
  
  if (catEnSelectEl) catEnSelectEl.onchange = (e) => {
    const key = e.target.value;
    if (!key) { catEnEl.value = ''; return; }
    const labels = data.metadata?.categoryLabels || {};
    catEnEl.value = labels[key]?.en || labels[key]?.fr || key;
    const t = data.templates.find(x=>x.id===selected);
    if (t) { t.category_en = catEnEl.value; syncTemplateCategory(t); saveDraft(); renderList(); }
  };
  
  // Category text inputs - for manual entry or new categories
  if (catFrEl) catFrEl.oninput = (e) => { 
    const t=data.templates.find(x=>x.id===selected); 
    if (!t) return; 
    t.category_fr=e.target.value; 
    syncTemplateCategory(t); 
    saveDraft(); 
    renderList();
    // Reset select to "new category" option when typing manually
    if (catFrSelectEl) catFrSelectEl.value = '';
  };
  
  if (catEnEl) catEnEl.oninput = (e) => { 
    const t=data.templates.find(x=>x.id===selected); 
    if (!t) return; 
    t.category_en=e.target.value; 
    syncTemplateCategory(t); 
    saveDraft(); 
    renderList();
    // Reset select to "new category" option when typing manually
    if (catEnSelectEl) catEnSelectEl.value = '';
  };
  titleFrEl.oninput = (e) => { const t=data.templates.find(x=>x.id===selected); if (!t) return; t.title=t.title||{}; t.title.fr=e.target.value; saveDraft(); renderList(); };
  titleEnEl.oninput = (e) => { const t=data.templates.find(x=>x.id===selected); if (!t) return; t.title=t.title||{}; t.title.en=e.target.value; saveDraft(); renderList(); };
  descFrEl.oninput = (e) => { const t=data.templates.find(x=>x.id===selected); if (!t) return; t.description=t.description||{}; t.description.fr=e.target.value; saveDraft(); };
  descEnEl.oninput = (e) => { const t=data.templates.find(x=>x.id===selected); if (!t) return; t.description=t.description||{}; t.description.en=e.target.value; saveDraft(); };
  subjFrEl.oninput = (e) => { const t=data.templates.find(x=>x.id===selected); if (!t) return; t.subject=t.subject||{}; t.subject.fr=e.target.value; saveDraft(); renderEditor(); scheduleAutoSync(); };
  subjEnEl.oninput = (e) => { const t=data.templates.find(x=>x.id===selected); if (!t) return; t.subject=t.subject||{}; t.subject.en=e.target.value; saveDraft(); renderEditor(); scheduleAutoSync(); };
  bodyFrEl.oninput = (e) => { const t=data.templates.find(x=>x.id===selected); if (!t) return; t.body=t.body||{}; t.body.fr=getBodyValue(bodyFrEl); saveDraft(); scheduleAutoSync(); };
  bodyEnEl.oninput = (e) => { const t=data.templates.find(x=>x.id===selected); if (!t) return; t.body=t.body||{}; t.body.en=getBodyValue(bodyEnEl); saveDraft(); scheduleAutoSync(); };
  search.oninput = (e) => { term = e.target.value; renderList(); };
  if (varsSearchEl) varsSearchEl.oninput = () => renderEditor();
  if (btnCopyVarsFr) btnCopyVarsFr.onclick = () => copyVarLines('fr');
  if (btnCopyVarsEn) btnCopyVarsEn.onclick = () => copyVarLines('en');
  if (btnValidateVars) btnValidateVars.onclick = validateTemplateVars;
  if (btnPreview) btnPreview.onclick = () => {
    const t = data.templates.find(x=>x.id===selected); if(!t) return;
    const win = window.open('', 'tpl_preview', 'width=900,height=700,noopener');
    if(!win) return;
    // Build maps for FR/EN from union of declared variables and detected placeholders
    const unionKeys = Array.from(new Set([...(t.variables||[]), ...detectPlaceholders(t)])).sort();
    const phMapFR = {}; const phMapEN = {};
    unionKeys.forEach(k=>{ const ex = data.variables?.[k]?.example || {}; phMapFR[k] = ex.fr || ex.en || '…'; phMapEN[k] = ex.en || ex.fr || '…'; });
    function injectExamples(map, str){ return String(str||'').replace(/<<([^>]+)>>/g,(m,name)=>{
      const base = canonicalVar(stripLangSuffix(name));
      return map[base] != null ? map[base] : m; }); }
    const subjFR = injectExamples(phMapFR, t.subject?.fr);
    const subjEN = injectExamples(phMapEN, t.subject?.en);
    const bodyFR = injectExamples(phMapFR, t.body?.fr).replace(/\n/g,'<br/>');
    const bodyEN = injectExamples(phMapEN, t.body?.en).replace(/\n/g,'<br/>');
    win.document.write(`<!doctype html><html><head><title>Prévisualisation – ${t.id}</title><style>body{font-family:Inter,system-ui,sans-serif;margin:0;padding:20px;background:#f8fafc;color:#0f172a}h2{margin-top:30px} .pane{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-top:12px} code{background:#f1f5f9;padding:2px 4px;border-radius:6px;font-size:12px} .vars{font-size:12px;color:#64748b;margin-top:10px} .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px} @media(max-width:1000px){ .grid{grid-template-columns:1fr} }</style></head><body><h1>Prévisualisation modèle: ${t.id}</h1><div class="grid"><div class="pane"><h2>FR</h2><strong>Objet:</strong> ${subjFR || '<em>(vide)</em>'}<hr/><div>${bodyFR || '<em>(vide)</em>'}</div></div><div class="pane"><h2>EN</h2><strong>Subject:</strong> ${subjEN || '<em>(empty)</em>'}<hr/><div>${bodyEN || '<em>(empty)</em>'}</div></div></div><div class="vars"><strong>Variables:</strong> ${(t.variables||[]).join(', ')}</div></body></html>`);
    win.document.close();
  };
  // Removed language switch handler.

  function loadInitialUI(){ renderList(); renderEditor(); }
  loadInitial().catch(console.error);
})();
