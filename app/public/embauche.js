// Assistant d'embauche en trois étapes, avec récapitulatif mis à jour en direct.
(() => {
  const form = document.querySelector('.assistant');
  const etapes = [...form.querySelectorAll('fieldset[data-pas]')];
  const pas = [...document.querySelectorAll('.pas li')];
  const prec = document.getElementById('prec'), suiv = document.getElementById('suiv'), fin = document.getElementById('fin');
  const f = (n) => Number(n || 0).toLocaleString('fr-FR');
  const v = (nom) => form.elements[nom].value;
  let i = 0;

  const recap = () => {
    const opt = form.elements.poste_id.selectedOptions[0];
    const brut = Number(v('salaire_base')) + Number(v('sursalaire')) + Number(v('prime_transport'));
    const smig = Number(document.getElementById('recap').dataset.smig);
    const min = Number(opt.dataset.min);
    document.getElementById('r-nom').textContent = `${v('prenom')} ${v('nom')}`.trim() || '—';
    document.getElementById('r-poste').textContent = opt.dataset.libelle;
    document.getElementById('r-contrat').textContent = `${v('type')} · entrée le ${v('date_debut') ? v('date_debut').split('-').reverse().join('/') : '—'}`;
    document.getElementById('r-essai').textContent = `${v('essai_mois')} mois`;
    document.getElementById('r-brut').textContent = `${f(brut)} FCFA`;
    document.getElementById('r-min').textContent = `${f(Math.max(smig, min))} FCFA`;
    const base = Number(v('salaire_base'));
    const alerte = document.getElementById('r-alerte');
    alerte.hidden = !(base && base < Math.max(smig, min));
    document.getElementById('date-fin').hidden = v('type') !== 'CDD';
  };
  const afficher = () => {
    etapes.forEach((e, k) => { e.hidden = k !== i; });
    pas.forEach((li, k) => { li.classList.toggle('actif', k === i); li.classList.toggle('fait', k < i); });
    prec.hidden = i === 0; suiv.hidden = i === etapes.length - 1; fin.hidden = i !== etapes.length - 1;
    etapes[i].querySelector('input,select')?.focus();
  };
  suiv.addEventListener('click', () => {
    const invalide = [...etapes[i].querySelectorAll('input,select')].find((c) => !c.checkValidity());
    if (invalide) return invalide.reportValidity();
    i++; afficher();
  });
  prec.addEventListener('click', () => { i--; afficher(); });
  // la période d'essai suit la convention du poste choisi, tant qu'elle n'a pas été modifiée à la main
  let essaiManuel = false;
  form.elements.essai_mois.addEventListener('input', () => { essaiManuel = true; });
  form.elements.poste_id.addEventListener('change', () => { if (!essaiManuel) form.elements.essai_mois.value = form.elements.poste_id.selectedOptions[0].dataset.essai; });
  form.addEventListener('input', recap);
  form.addEventListener('change', recap);
  recap();
})();
