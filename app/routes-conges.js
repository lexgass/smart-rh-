// Congés et absences : planning de l'équipe, demandes à valider, soldes, saisie.
const { run, all, get } = require('./db');
const droits = require('./droits');
const { iso, jour, decale, ferie, joursOuvrables } = require('./calendrier');

const TYPES = {
  conge_paye: ['Congé payé', 'Décompté du solde de congés annuels.'],
  permission: ['Permission exceptionnelle', 'Événement familial prévu par la convention ; payée et non décomptée dans la limite de 10 jours par an.'],
  maladie: ['Maladie', 'Absence justifiée par un certificat médical.'],
  maternite: ['Maternité', '15 semaines dont 9 après l\'accouchement ; la moitié du salaire est versée par l\'employeur, l\'autre par la CNSS.'],
  sans_solde: ['Absence non rémunérée', 'Retenue automatique sur la paie : 1/26 du salaire mensuel par jour ouvrable.'],
};
const STATUTS = { demande: ['En attente', 'jaune'], valide: ['Validée', 'vert'], refuse: ['Refusée', 'gris'] };
const JOURS_COURTS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

module.exports = (app, h) => {
  const { e, fcfa, nb, dateFr, aujourdhui, MOIS, page, carte, tableau, options, kpi, personne, aide, ic } = h;
  const moisFr = (p) => `${MOIS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
  const moisVoisin = (p, n) => { const d = new Date(Number(p.slice(0, 4)), Number(p.slice(5, 7)) - 1 + n, 1); return iso(d).slice(0, 7); };

  app.get('/conges', (req, res) => {
    const sid = req.societe.id, j = aujourdhui();
    const mois = /^\d{4}-\d{2}$/.test(req.query.mois || '') ? req.query.mois : j.slice(0, 7);
    const sal = all("SELECT e.*, p.intitule poste FROM salaries e LEFT JOIN postes p ON p.id=e.poste_id WHERE e.societe_id=? AND e.statut='Actif' ORDER BY e.nom", sid);
    const abs = all(`SELECT c.*, e.nom, e.prenom FROM conges c JOIN salaries e ON e.id=c.salarie_id WHERE e.societe_id=? ORDER BY c.date_debut DESC`, sid);
    const absentsAuj = abs.filter((a) => a.statut === 'valide' && a.date_debut <= j && a.date_fin >= j);
    const attente = abs.filter((a) => a.statut === 'demande');

    // planning du mois : une ligne par salarié, une colonne par jour
    const debut = jour(`${mois}-01`), nbJours = new Date(debut.getFullYear(), debut.getMonth() + 1, 0).getDate();
    const jours = Array.from({ length: nbJours }, (_, k) => iso(decale(debut, k)));
    const entete = jours.map((d) => { const dj = jour(d).getDay(), f = ferie(d); return `<div class="pl-jour${dj === 0 ? ' dim' : ''}${f ? ' fer' : ''}${d === j ? ' auj' : ''}"${f ? ` data-bulle="${e(f)}" tabindex="0"` : ''}><small>${JOURS_COURTS[dj]}</small><b>${Number(d.slice(8))}</b></div>`; }).join('');
    const lignes = sal.map((s) => {
      const siennes = abs.filter((a) => a.salarie_id === s.id && a.statut !== 'refuse' && a.date_fin >= jours[0] && a.date_debut <= jours[nbJours - 1]);
      const cases = jours.map((d) => {
        const a = siennes.find((x) => x.date_debut <= d && x.date_fin >= d);
        const dj = jour(d).getDay(), f = ferie(d);
        const cls = `pl-case${dj === 0 ? ' dim' : ''}${f ? ' fer' : ''}${d === j ? ' auj' : ''}`;
        if (!a || dj === 0 || f) return `<div class="${cls}"></div>`;
        const debutBloc = a.date_debut === d || d === jours[0] || decale(jour(d), -1).getDay() === 0;
        return `<div class="${cls}"><span class="pl-abs t-${a.type}${a.statut === 'demande' ? ' attente' : ''}${debutBloc ? ' debut' : ''}" tabindex="0" data-bulle="${e(`${s.prenom} ${s.nom} : ${TYPES[a.type][0].toLowerCase()} du ${dateFr(a.date_debut)} au ${dateFr(a.date_fin)} (${a.jours} j ouvrables). ${STATUTS[a.statut][0]}.`)}"></span></div>`;
      }).join('');
      return `<div class="pl-nom">${personne(s)}</div>${cases}`;
    }).join('');
    const planning = `<div class="planning" style="--jours:${nbJours}"><div class="pl-nom pl-titre">Salarié</div>${entete}${lignes}</div>
      <ul class="legende">${Object.entries(TYPES).map(([k, [l]]) => `<li><span class="pl-abs t-${k} statique"></span>${l}</li>`).join('')}<li><span class="pl-abs t-conge_paye attente statique"></span>En attente de validation</li><li><span class="pl-case fer statique"></span>Jour férié</li></ul>`;

    const soldes = sal.map((s) => ({ s, d: droits.soldeConges(s, j) }));
    const typeSel = req.query.salarie ? Number(req.query.salarie) : null;
    const peutValider = true;

    res.send(page(req, { titre: 'Congés et absences', sous: 'Planning de l\'équipe, demandes à valider et soldes de congés. Les absences non rémunérées validées sont retenues sur la paie.', action: `<a class="bouton" href="#nouvelle">${ic('plus')}Saisir une absence</a>` }, `
    <div class="kpis">
      ${kpi('soleil', absentsAuj.length, `absent${absentsAuj.length > 1 ? 's' : ''} aujourd'hui`, absentsAuj.length ? absentsAuj.map((a) => `${a.prenom} ${a.nom}`).join(', ') : 'Personne n\'est absent aujourd\'hui.')}
      ${kpi('horloge', attente.length, `demande${attente.length > 1 ? 's' : ''} à valider`, 'Demandes saisies, en attente de décision.', attente.length ? 'jaune' : '')}
      ${kpi('agenda', abs.filter((a) => a.statut === 'valide' && a.type === 'conge_paye' && a.date_debut.slice(0, 7) <= mois && a.date_fin.slice(0, 7) >= mois).length, `congés payés en ${moisFr(mois)}`, 'Congés payés validés qui touchent le mois affiché.')}
      ${kpi('equipe', `${nb(Math.round(soldes.reduce((a, x) => a + Math.max(0, x.d.disponible), 0)))} <small>jours</small>`, 'de congés disponibles dans l\'équipe', 'Total des soldes disponibles. Un solde élevé signale des congés à planifier avant leur prescription (3 ans).')}
    </div>
    ${carte(`Planning de ${moisFr(mois)}${aide('Chaque bande colorée est une absence. Survolez-la pour le détail. Les dimanches et jours fériés sont grisés.')}`, planning, { outil: `<div class="nav-mois"><a class="bouton fantome petit" href="/conges?mois=${moisVoisin(mois, -1)}" aria-label="Mois précédent">‹</a><a class="bouton fantome petit" href="/conges">Ce mois-ci</a><a class="bouton fantome petit" href="/conges?mois=${moisVoisin(mois, 1)}" aria-label="Mois suivant">›</a></div>` })}
    <div class="disposition d-2-1">
      <div class="pile">
      ${carte(`Demandes à valider <span class="compteur">${attente.length}</span>`, tableau(['Salarié', 'Absence', 'Période', '+Jours', ''], attente.map((a) => {
        const s = sal.find((x) => x.id === a.salarie_id), sol = s ? droits.soldeConges(s, j) : null;
        const depasse = a.type === 'conge_paye' && sol && a.jours > sol.disponible;
        return `<tr><td>${personne({ id: a.salarie_id, nom: a.nom, prenom: a.prenom, poste: s?.poste })}</td><td><span class="pastille-type t-${a.type}"></span>${TYPES[a.type][0]}<small class="discret bloc">${e(a.motif)}</small>${depasse ? `<span class="et rouge" data-bulle="Solde disponible : ${nb(sol.disponible)} jours." tabindex="0">Dépasse le solde</span>` : ''}</td><td>${dateFr(a.date_debut)} au ${dateFr(a.date_fin)}</td><td class="n">${a.jours}</td>
          <td class="n outils">${peutValider ? `<form method="post" action="/conges/${a.id}/valider"><button class="bouton petit">${ic('coche')}Valider</button></form><form method="post" action="/conges/${a.id}/refuser"><button class="bouton fantome petit">Refuser</button></form>` : ''}</td></tr>`;
      }), 'Aucune demande en attente.'))}
      ${carte(`Soldes de congés${aide('Droit annuel : 26 jours ouvrables, plus le supplément d\'ancienneté de la convention. Le solde disponible vient de la dernière période de 12 mois terminée ; la période en cours s\'acquiert mois par mois.')}`, tableau(['Salarié', '+Droit annuel', '+Disponible', '+Pris', `+En cours d'acquisition`], soldes.map(({ s, d }) => `<tr><td>${personne(s)}</td><td class="n">${d.annuels.total} j${d.annuels.supplement ? ` <small class="discret" data-bulle="Dont ${d.annuels.supplement} jours d'ancienneté (${e(d.annuels.source)})." tabindex="0">dont +${d.annuels.supplement}</small>` : ''}</td>
        <td class="n">${d.ouvert ? `<b class="${d.disponible < 0 ? 'negatif' : ''}">${nb(d.disponible)} j</b>` : `<span class="discret" data-bulle="Le droit au congé s'ouvre après 12 mois de service (Code du travail, art. 120)." tabindex="0">à partir du ${dateFr(d.ouvertLe)}</span>`}</td><td class="n">${nb(d.pris)} j</td><td class="n">${nb(d.enCours)} j</td></tr>`)))}
      </div>
      ${carte('Saisir une absence', `<form method="post" action="/conges" class="form-pile">
        <label>Salarié<select name="salarie_id" required>${options(sal, 'id', (s) => `${s.nom} ${s.prenom}`, typeSel)}</select></label>
        <label>Type d'absence ${aide(Object.values(TYPES).map(([l, d]) => `${l} : ${d}`).join(' '))}<select name="type">${Object.entries(TYPES).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <div class="champs"><label>Du<input type="date" name="date_debut" required value="${j}"></label><label>Au<input type="date" name="date_fin" required value="${j}"></label></div>
        <label>Motif<input name="motif" placeholder="Ex. : congé annuel, mariage, certificat médical"></label>
        <label class="case"><input type="checkbox" name="valider" value="1"> Valider directement</label>
        <button class="bouton">Enregistrer l'absence</button>
        <p class="discret petit-texte">Les jours ouvrables sont comptés du lundi au samedi, hors jours fériés.</p></form>`, { id: 'nouvelle', cls: 'collant' })}
    </div>
    ${carte('Historique des absences', tableau(['Salarié', 'Absence', 'Période', '+Jours', 'Statut', ''], abs.filter((a) => a.statut !== 'demande').map((a) => `<tr class="${a.statut === 'refuse' ? 'pale' : ''}"><td>${personne({ id: a.salarie_id, nom: a.nom, prenom: a.prenom })}</td><td><span class="pastille-type t-${a.type}"></span>${TYPES[a.type][0]}<small class="discret bloc">${e(a.motif)}</small></td><td>${dateFr(a.date_debut)} au ${dateFr(a.date_fin)}</td><td class="n">${a.jours}</td><td><span class="et ${STATUTS[a.statut][1]}">${STATUTS[a.statut][0]}</span></td><td class="n"><form method="post" action="/conges/${a.id}/annuler" data-confirmer="Annuler cette absence ? Elle sera retirée du planning et de la paie au prochain calcul."><button class="bouton fantome petit">Annuler</button></form></td></tr>`), 'Aucune absence enregistrée.'))}`));
  });

  app.post('/conges', (req, res) => {
    const b = req.body, sid = req.societe.id;
    const s = get('SELECT id FROM salaries WHERE id=? AND societe_id=?', Number(b.salarie_id), sid);
    const ok = /^\d{4}-\d{2}-\d{2}$/;
    if (!s || !TYPES[b.type] || !ok.test(b.date_debut || '') || !ok.test(b.date_fin || '') || b.date_fin < b.date_debut) return res.redirect('/conges#nouvelle');
    const statut = b.valider ? 'valide' : 'demande';
    run('INSERT INTO conges(salarie_id,type,date_debut,date_fin,jours,statut,motif,cree_le) VALUES(?,?,?,?,?,?,?,?)', s.id, b.type, b.date_debut, b.date_fin, joursOuvrables(b.date_debut, b.date_fin), statut, b.motif || '', aujourdhui());
    if (statut === 'valide') run('INSERT INTO evenements(salarie_id,date,type,detail) VALUES(?,?,?,?)', s.id, b.date_debut, TYPES[b.type][0], `Du ${dateFr(b.date_debut)} au ${dateFr(b.date_fin)}`);
    res.redirect(`/conges?mois=${b.date_debut.slice(0, 7)}`);
  });
  const decider = (statut) => (req, res) => {
    const a = get('SELECT c.* FROM conges c JOIN salaries e ON e.id=c.salarie_id WHERE c.id=? AND e.societe_id=?', Number(req.params.id), req.societe.id);
    if (a && a.statut === 'demande') {
      run('UPDATE conges SET statut=? WHERE id=?', statut, a.id);
      if (statut === 'valide') run('INSERT INTO evenements(salarie_id,date,type,detail) VALUES(?,?,?,?)', a.salarie_id, a.date_debut, TYPES[a.type][0], `Du ${dateFr(a.date_debut)} au ${dateFr(a.date_fin)}`);
    }
    res.redirect('/conges');
  };
  app.post('/conges/:id/valider', decider('valide'));
  app.post('/conges/:id/refuser', decider('refuse'));
};

module.exports.TYPES = TYPES;
