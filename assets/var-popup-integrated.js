// Integrated transformation: take the existing variables collapsible section and render it inside a movable/resizable popup.
// Assumptions:
// - The compiled bundle renders a variables collapsible driven by a toggle button containing localized label (fr: 'Variables', en: 'Variables').
// - There is a banner containing the 'Éditez votre courriel' label (fr) or 'Edit your email' (en).
// Minimal script: only keeps the enhanced reset confirmation (popup feature removed during cleanup pass)
(function(){
  function log(...a){ try{ console.debug('[vars-clean]',...a);}catch(_){} }

  function enhanceResetButton(){
    if(!document.getElementById('reset-enhance-style')){
      const st=document.createElement('style'); st.id='reset-enhance-style';
      st.textContent=`button[data-reset-enhanced]{position:relative;transition:background .2s,filter .2s,transform .15s;}
button[data-reset-enhanced]:hover{filter:brightness(1.08);transform:translateY(-1px);}button[data-reset-enhanced]:active{transform:translateY(0);} 
.reset-confirm-overlay{position:fixed;inset:0;background:#0f172a99;backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:2147484500;animation:fadeIn .18s ease;}
.reset-confirm-modal{background:#ffffff;border-radius:18px;box-shadow:0 18px 48px -12px rgba(15,23,42,.5),0 6px 20px -8px rgba(15,23,42,.35);width:min(420px,90%);padding:0;overflow:hidden;font:14px/1.4 system-ui,Segoe UI,Roboto,Arial;}
.reset-confirm-head{background:var(--tb-teal,#0d8094);color:#fff;padding:14px 18px;font-weight:600;letter-spacing:.4px;display:flex;align-items:center;gap:8px;}
.reset-confirm-body{padding:18px 20px 6px;color:#334155;font-size:13px;}
.reset-confirm-actions{display:flex;gap:10px;padding:14px 18px 18px;background:#0d8094;border-top:1px solid #0b6a7c;}
.reset-confirm-actions button{flex:1 1 0;background:#ffffff;border:1px solid #0b6a7c;color:#0d4a58;font-weight:600;padding:10px 0;border-radius:10px;cursor:pointer;font-size:13px;letter-spacing:.4px;display:flex;align-items:center;justify-content:center;transition:background .18s, color .18s, transform .15s;}
.reset-confirm-actions button.primary{background:#0fa3c4;color:#fff;border-color:#0fa3c4;}
.reset-confirm-actions button:hover{filter:brightness(1.06);} .reset-confirm-actions button:active{transform:translateY(1px);} 
@keyframes fadeIn{from{opacity:0;transform:scale(.97);}to{opacity:1;transform:scale(1);}}
`; document.head.appendChild(st);
    }
    function showResetConfirm(onConfirm){
      if(document.querySelector('.reset-confirm-overlay')) return; // prevent duplicates
      const ov=document.createElement('div'); ov.className='reset-confirm-overlay';
      ov.innerHTML=`<div class="reset-confirm-modal" role="dialog" aria-modal="true" aria-label="Confirmer réinitialisation">
        <div class="reset-confirm-head">Réinitialiser</div>
        <div class="reset-confirm-body">Cette action va effacer le contenu actuel (Sujet, Corps, Résultat IA). Voulez-vous continuer ?</div>
        <div class="reset-confirm-actions">
          <button type="button" data-act="cancel">Annuler</button>
          <button type="button" class="primary" data-act="ok">Confirmer</button>
        </div>
      </div>`;
      document.body.appendChild(ov);
      const close=()=>{ ov.remove(); };
      ov.addEventListener('click',e=>{ if(e.target===ov) close(); });
      ov.querySelector('[data-act="cancel"]').onclick=close;
      ov.querySelector('[data-act="ok"]').onclick=()=>{ try{ onConfirm(); } finally { close(); } };
      // Focus primary
      setTimeout(()=>{ const p=ov.querySelector('[data-act="ok"]'); p && p.focus(); }, 30);
      document.addEventListener('keydown', function esc(e){ if(e.key==='Escape'){ close(); document.removeEventListener('keydown',esc); } });
    }
    const scan=()=>{
      const buttons=Array.from(document.querySelectorAll('button')); 
      buttons.forEach(btn=>{
        if(btn.dataset.resetEnhanced) return;
        const txt=(btn.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
        if(txt==='réinitialiser' || txt==='reinitialiser' || txt==='reset'){
          btn.dataset.resetEnhanced='1'; btn.title=btn.title||'Confirmer avant réinitialisation';
          // Capture original handlers by letting them run only after our confirm path triggers a synthetic click.
          btn.addEventListener('click', e=>{
            if(btn.dataset.resetBypass==='1') { delete btn.dataset.resetBypass; return; }
            e.stopImmediatePropagation(); e.preventDefault();
            showResetConfirm(()=>{ btn.dataset.resetBypass='1'; btn.click(); });
          }, true);
        }
      });
    };
    scan();
    const mo=new MutationObserver(()=>scan()); try{ mo.observe(document.body,{childList:true,subtree:true}); }catch(_){ }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', enhanceResetButton); else enhanceResetButton();
})();
