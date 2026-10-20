// Calcule en direct le montant des heures supplémentaires et des primes de chaque ligne.
(() => {
  const f = (n) => Math.round(n).toLocaleString('fr-FR');
  const lignes = [...document.querySelectorAll('.saisie-variables tbody tr')];
  const limite = Number(document.querySelector('.alerte-hs')?.dataset.bulle.match(/Plus de (\d+)/)?.[1] || 87);
  const maj = () => {
    let total = 0;
    for (const tr of lignes) {
      const th = Number(tr.dataset.tauxHoraire);
      let heures = 0, montant = 0;
      for (const i of tr.querySelectorAll('.saisie-h')) { const q = Number(i.value) || 0; heures += q; montant += q * th * (1 + Number(i.dataset.maj) / 100); }
      montant += Number(tr.querySelector('.saisie-m').value) || 0;
      tr.querySelector('.total-ligne').textContent = montant ? `${f(montant)} FCFA` : '—';
      tr.querySelector('.alerte-hs').hidden = heures <= limite;
      total += montant;
    }
    document.getElementById('total-general').textContent = total ? `${f(total)} FCFA` : '—';
  };
  document.getElementById('form-variables').addEventListener('input', maj);
  maj();
})();
