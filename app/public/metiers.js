// Choix du métier puis de la catégorie : quand le métier change, on charge les catégories qui lui correspondent
// et on reprend son libellé comme intitulé du poste (tant que l'utilisateur ne l'a pas modifié lui-même).
(() => {
  const fcfa = (n) => Number(n || 0).toLocaleString('fr-FR');
  for (const bloc of document.querySelectorAll('[data-bloc-metier]')) {
    const metier = bloc.querySelector('[data-metier]'), cats = bloc.querySelector('[data-categories]');
    const intitule = bloc.querySelector('[data-intitule]'), plage = bloc.querySelector('[data-plage]');
    let intituleAuto = true;
    intitule.addEventListener('input', () => { intituleAuto = intitule.value === ''; });
    metier.addEventListener('change', async () => {
      cats.innerHTML = '<option value="">Chargement…</option>';
      if (!metier.value) { cats.innerHTML = '<option value="">Choisissez d\'abord le métier</option>'; plage.hidden = true; return; }
      if (intituleAuto) intitule.value = metier.selectedOptions[0].textContent;
      try {
        const r = await (await fetch(`/metiers/categories?metier=${encodeURIComponent(metier.value)}`)).json();
        cats.innerHTML = r.categories.length
          ? r.categories.map((c) => `<option value="${c.id}" data-min="${c.salaire_min || 0}" data-essai="${c.essai}" data-niveau="${c.niveau || ''}">${c.code} · ${c.libelle} · minimum ${fcfa(c.salaire_min)} FCFA</option>`).join('')
          : '<option value="">Aucune catégorie : créez-en une dans Structure</option>';
        plage.hidden = false;
        plage.textContent = r.horsPlage
          ? `Aucune catégorie de la société n'est dans les niveaux habituels de ce métier (${r.metier.niveau_min} à ${r.metier.niveau_max}) : toutes les catégories sont proposées.`
          : `${r.categories.length} catégorie${r.categories.length > 1 ? 's' : ''} pour ce métier (niveaux ${r.metier.niveau_min} à ${r.metier.niveau_max}).`;
      } catch { cats.innerHTML = '<option value="">Catégories indisponibles, réessayez</option>'; }
      cats.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
})();
