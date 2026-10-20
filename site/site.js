// Liens et coordonnées lus dans config.js, menu mobile.
(() => {
  const c = window.SMART_RH || {};
  const msg = encodeURIComponent('Bonjour, je souhaite une démonstration de Smart RH.');
  const liens = {
    whatsapp: c.whatsapp ? `https://wa.me/${c.whatsapp}?text=${msg}` : '',
    email: c.email ? `mailto:${c.email}?subject=${encodeURIComponent('Démonstration Smart RH')}` : '',
    cal: c.cal || '', video_fr: c.video_fr || '', video_ln: c.video_ln || '',
  };
  for (const a of document.querySelectorAll('[data-lien]')) {
    const url = liens[a.dataset.lien];
    if (url) a.href = url;
    else { a.removeAttribute('target'); a.href = '#contact'; a.classList.add('a-completer'); a.title = 'Lien à compléter dans config.js'; }
  }
  for (const el of document.querySelectorAll('[data-texte]')) { const v = c[el.dataset.texte]; if (v) el.textContent = v; }

  const bouton = document.querySelector('.burger'), menu = document.getElementById('menu');
  bouton?.addEventListener('click', () => {
    const ouvert = menu.classList.toggle('ouvert');
    bouton.setAttribute('aria-expanded', String(ouvert));
    bouton.setAttribute('aria-label', ouvert ? 'Fermer le menu' : 'Ouvrir le menu');
  });
  menu?.addEventListener('click', (ev) => { if (ev.target.closest('a')) { menu.classList.remove('ouvert'); bouton.setAttribute('aria-expanded', 'false'); } });
})();
