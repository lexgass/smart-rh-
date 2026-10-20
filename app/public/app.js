// Bulles d'aide au survol et au focus clavier, et filtre instantané des tableaux.
(() => {
  const bulle = document.createElement('div');
  bulle.className = 'bulle'; bulle.setAttribute('role', 'tooltip'); bulle.hidden = true;
  document.body.appendChild(bulle);
  let cible = null;
  const montrer = (el) => {
    cible = el; bulle.textContent = el.dataset.bulle; bulle.hidden = false;
    const r = el.getBoundingClientRect(), b = bulle.getBoundingClientRect();
    let x = r.left + r.width / 2 - b.width / 2;
    x = Math.max(8, Math.min(x, innerWidth - b.width - 8));
    const dessous = r.top - b.height - 10 < 8;
    bulle.style.left = `${x}px`;
    bulle.style.setProperty('--fleche', `${r.left + r.width / 2 - x}px`);
    bulle.style.top = `${dessous ? r.bottom + 10 : r.top - b.height - 10}px`;
    bulle.classList.toggle('dessous', dessous);
  };
  const cacher = () => { cible = null; bulle.hidden = true; };
  document.addEventListener('mouseover', (ev) => { const el = ev.target.closest('[data-bulle]'); if (el && el !== cible) montrer(el); else if (!el && cible) cacher(); });
  document.addEventListener('focusin', (ev) => { const el = ev.target.closest('[data-bulle]'); if (el) montrer(el); });
  document.addEventListener('focusout', cacher);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') cacher(); });
  addEventListener('scroll', cacher, true);

  // <input data-filtre="#idTableau"> filtre les lignes du tableau visé
  for (const champ of document.querySelectorAll('[data-filtre]')) {
    const corps = document.querySelector(`${champ.dataset.filtre} tbody`);
    const vide = document.querySelector(`${champ.dataset.filtre}-vide`);
    champ.addEventListener('input', () => {
      const q = champ.value.trim().toLowerCase(); let n = 0;
      for (const tr of corps.rows) { const ok = tr.innerText.toLowerCase().includes(q); tr.hidden = !ok; n += ok; }
      if (vide) vide.hidden = n > 0;
    });
  }
})();

// Recherche globale : Ctrl+K (ou « / ») ouvre une palette qui trouve salariés, sociétés et pages.
(() => {
  const ouvrirBtn = document.getElementById('ouvrir-recherche');
  if (!ouvrirBtn) return;
  const fond = document.createElement('div');
  fond.className = 'palette-fond'; fond.hidden = true;
  fond.innerHTML = `<div class="palette" role="dialog" aria-modal="true" aria-label="Recherche">
    <label class="palette-champ"><span class="visuellement-cache">Rechercher</span><input type="search" placeholder="Un salarié, une page, une action…" autocomplete="off" aria-controls="palette-liste"></label>
    <ul class="palette-liste" id="palette-liste" role="listbox"></ul>
    <p class="palette-aide"><kbd>↑</kbd><kbd>↓</kbd> pour choisir, <kbd>Entrée</kbd> pour ouvrir, <kbd>Échap</kbd> pour fermer</p></div>`;
  document.body.appendChild(fond);
  const champ = fond.querySelector('input'), liste = fond.querySelector('.palette-liste');
  let resultats = [], actif = 0, minuterie;
  const echapper = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const afficher = () => {
    liste.innerHTML = resultats.length ? resultats.map((r, i) => `<li role="option" id="pal-${i}" aria-selected="${i === actif}" data-url="${echapper(r.url)}"><span class="pal-type">${echapper(r.type)}</span><b>${echapper(r.titre)}</b>${r.detail ? `<small>${echapper(r.detail)}</small>` : ''}</li>`).join('')
      : '<li class="pal-vide">Aucun résultat. Essayez un nom, un matricule ou une page.</li>';
    champ.setAttribute('aria-activedescendant', resultats.length ? `pal-${actif}` : '');
    liste.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };
  const chercher = async () => {
    try { resultats = (await (await fetch(`/recherche?q=${encodeURIComponent(champ.value)}`)).json()).resultats; } catch { resultats = []; }
    actif = 0; afficher();
  };
  const ouvrir = () => { fond.hidden = false; champ.value = ''; chercher(); champ.focus(); };
  const fermer = () => { fond.hidden = true; ouvrirBtn.focus(); };
  ouvrirBtn.addEventListener('click', ouvrir);
  document.addEventListener('keydown', (ev) => {
    const saisie = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if ((ev.key === 'k' && (ev.ctrlKey || ev.metaKey)) || (ev.key === '/' && !saisie && fond.hidden)) { ev.preventDefault(); ouvrir(); }
  });
  champ.addEventListener('input', () => { clearTimeout(minuterie); minuterie = setTimeout(chercher, 120); });
  fond.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); fermer(); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); actif = Math.min(actif + 1, resultats.length - 1); afficher(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); actif = Math.max(actif - 1, 0); afficher(); }
    else if (ev.key === 'Enter' && resultats[actif]) { ev.preventDefault(); location.href = resultats[actif].url; }
  });
  liste.addEventListener('click', (ev) => { const li = ev.target.closest('li[data-url]'); if (li) location.href = li.dataset.url; });
  fond.addEventListener('mousedown', (ev) => { if (ev.target === fond) fermer(); });
})();

// Comportements déclarés dans le HTML, sans script écrit dans les pages (politique de sécurité du contenu) :
// data-envoi-auto : envoie le formulaire dès que la valeur change ; data-confirmer : demande confirmation avant l'envoi.
document.addEventListener('change', (ev) => { if (ev.target.matches('[data-envoi-auto]')) ev.target.form?.requestSubmit(); });
document.addEventListener('submit', (ev) => { const f = ev.target.closest('[data-confirmer]'); if (f && !confirm(f.dataset.confirmer)) ev.preventDefault(); });

// création d'un compte : les sociétés ne se choisissent pas pour un Admin (il les voit toutes)
(() => {
  const f = document.getElementById('nouveau-compte'), cases = f?.querySelector('[data-selon-role]');
  if (!cases) return;
  const maj = () => { cases.hidden = f.querySelector('input[name="role"]:checked')?.value === 'admin'; };
  f.addEventListener('change', maj); maj();
})();
