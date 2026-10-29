// Éditeur des modèles et des documents : barre de mise en forme, insertion de champs automatiques et de cases à remplir.
// Le texte (rédigé ou collé depuis Word) est recopié dans des champs cachés à l'envoi ; le serveur le nettoie ensuite.
(() => {
  const form = document.getElementById('editeur');
  if (!form) return;
  const zones = [...form.querySelectorAll('[data-zone]')];
  let active = zones.find((z) => z.dataset.zone === 'corps') || zones[0];
  let plage = null; // dernière position du curseur, pour insérer un champ au bon endroit

  const memoriser = () => {
    const sel = getSelection();
    if (sel.rangeCount && active.contains(sel.anchorNode)) plage = sel.getRangeAt(0).cloneRange();
  };
  for (const z of zones) {
    z.addEventListener('focus', () => { if (active !== z) plage = null; active = z; });
    z.addEventListener('keyup', memoriser);
    z.addEventListener('mouseup', memoriser);
    z.addEventListener('input', memoriser);
  }
  const restaurer = () => {
    active.focus();
    if (plage) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(plage); }
  };
  const inserer = (texte) => {
    restaurer();
    document.execCommand('insertText', false, texte);
    memoriser();
  };

  // la barre ne prend pas le focus : la sélection reste dans la zone de texte
  form.querySelectorAll('.barre-edition button').forEach((b) => b.addEventListener('mousedown', (ev) => ev.preventDefault()));
  form.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => {
    restaurer();
    document.execCommand(b.dataset.cmd, false, b.dataset.val ? `<${b.dataset.val}>` : null);
    memoriser();
  }));
  form.querySelector('[data-inserer]')?.addEventListener('change', (ev) => {
    if (ev.target.value) inserer(ev.target.value);
    ev.target.value = '';
  });
  form.querySelector('[data-saisie]')?.addEventListener('click', () => {
    const nom = prompt('Nom de la case à remplir à chaque document (par exemple : date d\'effet, motif, montant) :');
    const cle = (nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
    if (cle) inserer(`{{saisie.${cle}}}`);
  });

  form.addEventListener('submit', () => {
    for (const z of zones) form.elements[z.dataset.zone].value = z.innerHTML;
  });
})();
