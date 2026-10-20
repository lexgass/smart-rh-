// Éléments variables du mois : heures supplémentaires et primes ponctuelles, saisis en lot avant le calcul de la paie.
const { run, all, transaction } = require('./db');
const paie = require('./paie');

module.exports = (app, h) => {
  const { e, fcfa, nb, aujourdhui, MOIS, page, carte, aide, ic, personne } = h;
  const moisFr = (p) => `${MOIS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
  const TYPES_HS = Object.keys(paie.HEURES);

  app.get('/variables', (req, res) => {
    const sid = req.societe.id;
    const periode = /^\d{4}-\d{2}$/.test(req.query.periode || '') ? req.query.periode : aujourdhui().slice(0, 7);
    const date = `${periode}-28`;
    const sal = all(`SELECT e.*, p.intitule poste, k.salaire_base, k.sursalaire FROM salaries e LEFT JOIN postes p ON p.id=e.poste_id JOIN contrats k ON k.salarie_id=e.id
      WHERE e.societe_id=? AND e.statut='Actif' AND e.date_embauche<=? ORDER BY e.nom`, sid, `${periode}-31`);
    const vars = all('SELECT v.* FROM variables v JOIN salaries e ON e.id=v.salarie_id WHERE e.societe_id=? AND v.periode=?', sid, periode);
    const heures = paie.param('HEURES_MOIS', sid, date) || 173.33;
    const maj = Object.fromEntries(TYPES_HS.map((t) => [t, paie.param(paie.HEURES[t][0], sid, date) ?? 0]));
    const maxMois = Math.round((paie.param('HS_MAX_SEMAINE', sid, date) || 20) * 52 / 12);
    const val = (sid2, type, champ) => vars.find((v) => v.salarie_id === sid2 && v.type === type)?.[champ] ?? '';
    const entetes = [['hs1', 'De la 41e à la 45e heure'], ['hs2', 'À partir de la 46e heure'], ['hs_nuit', 'De nuit (20 h à 5 h)'], ['hs_repos', 'Jour de repos ou férié'], ['hs_nuit_repos', 'Nuit, repos ou férié']];
    const lignes = sal.map((s) => {
      const th = ((s.salaire_base || 0) + (s.sursalaire || 0)) / heures;
      return `<tr data-taux-horaire="${th}"><td>${personne(s)}<small class="discret bloc">Taux horaire ${fcfa(th)} FCFA</small></td>
        ${TYPES_HS.map((t) => `<td><input class="saisie-h" type="number" min="0" step="0.5" name="h_${s.id}_${t}" value="${val(s.id, t, 'quantite')}" aria-label="${e(`${s.prenom} ${s.nom}, heures ${entetes.find((x) => x[0] === t)[1]}`)}" data-maj="${maj[t]}"></td>`).join('')}
        <td><input class="saisie-m" type="number" min="0" step="500" name="p_${s.id}" value="${val(s.id, 'prime', 'montant')}" aria-label="${e(`${s.prenom} ${s.nom}, montant de la prime`)}"></td>
        <td><input name="l_${s.id}" value="${e(val(s.id, 'prime', 'libelle'))}" placeholder="Ex. : prime de rendement" aria-label="${e(`${s.prenom} ${s.nom}, libellé de la prime`)}"></td>
        <td class="n"><b class="total-ligne">—</b><span class="alerte-hs" hidden data-bulle="Plus de ${maxMois} heures supplémentaires dans le mois : au-delà de ${nb(paie.param('HS_MAX_SEMAINE', sid, date) || 20)} h par semaine, l'autorisation de l'inspecteur du travail est requise." tabindex="0">${ic('alerte')}</span></td></tr>`;
    }).join('');
    const prec = (n) => { const d = new Date(Number(periode.slice(0, 4)), Number(periode.slice(5, 7)) - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

    res.send(page(req, { titre: 'Éléments variables', sous: `Heures supplémentaires et primes ponctuelles de ${moisFr(periode)}. Elles s'ajoutent au bulletin au prochain calcul de la paie.` }, `
    <form method="get" action="/variables" class="barre-outils periode"><a class="bouton fantome petit" href="/variables?periode=${prec(-1)}" aria-label="Mois précédent">‹</a><label class="en-ligne">${ic('agenda')}Mois<input type="month" name="periode" value="${periode}" data-envoi-auto></label><a class="bouton fantome petit" href="/variables?periode=${prec(1)}" aria-label="Mois suivant">›</a></form>
    <form method="post" action="/variables" id="form-variables"><input type="hidden" name="periode" value="${periode}">
    ${carte(`Saisie de ${moisFr(periode)}${aide(`Taux horaire = (salaire de base + sursalaire) ÷ ${nb(heures)} heures. Majorations : +${maj.hs1} % de la 41e à la 45e heure, +${maj.hs2} % ensuite, +${maj.hs_nuit} % la nuit, +${maj.hs_repos} % le jour de repos ou férié, +${maj.hs_nuit_repos} % la nuit d'un jour de repos ou férié (décret 78/360).`)}`, `
      <div class="tab"><table class="saisie-variables"><thead><tr><th>Salarié</th>${entetes.map(([t, l]) => `<th class="n">${l}<small class="bloc">+${maj[t]} %</small></th>`).join('')}<th class="n">Prime (FCFA)</th><th>Libellé de la prime</th><th class="n">Total du mois</th></tr></thead>
      <tbody>${lignes}</tbody><tfoot><tr class="total"><td>Total</td>${TYPES_HS.map(() => '<td></td>').join('')}<td></td><td></td><td class="n"><b id="total-general">—</b></td></tr></tfoot></table></div>
      <div class="actions"><button class="bouton secondaire" name="calculer" value="0">Enregistrer</button><button class="bouton" name="calculer" value="1">${ic('calcul')}Enregistrer et recalculer la paie</button></div>`)}
    </form><script src="/variables.js"></script>`));
  });

  app.post('/variables', (req, res) => {
    const sid = req.societe.id, b = req.body;
    const periode = /^\d{4}-\d{2}$/.test(b.periode || '') ? b.periode : aujourdhui().slice(0, 7);
    const sal = all("SELECT id FROM salaries WHERE societe_id=? AND statut='Actif'", sid);
    transaction(() => {
      for (const { id } of sal) {
        run('DELETE FROM variables WHERE salarie_id=? AND periode=?', id, periode);
        for (const t of TYPES_HS) {
          const q = Number(b[`h_${id}_${t}`]);
          if (q > 0 && q <= 300) run('INSERT INTO variables(salarie_id,periode,type,quantite) VALUES(?,?,?,?)', id, periode, t, q);
        }
        const m = Number(b[`p_${id}`]);
        if (m > 0 && m < 1e10) run('INSERT INTO variables(salarie_id,periode,type,montant,libelle) VALUES(?,?,?,?,?)', id, periode, 'prime', m, String(b[`l_${id}`] || 'Prime exceptionnelle').slice(0, 80));
      }
    });
    if (b.calculer === '1') {
      paie.calculerSociete(sid, periode);
      return res.redirect(`/paie?periode=${periode}`);
    }
    res.redirect(`/variables?periode=${periode}`);
  });
};
