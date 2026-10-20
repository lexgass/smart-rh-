// Gestion courante : modifier une fiche salarié (avenant tracé), informations légales de la société, annulation d'une absence.
const { run, all, get } = require('./db');

module.exports = (app, h) => {
  const { e, fcfa, dateFr, aujourdhui, page, carte, options, aide, interdit } = h;
  const SITUATIONS = ['Célibataire', 'Marié(e)', 'Mariée', 'Marié', 'Divorcé(e)', 'Veuf(ve)'];
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : null);
  const montant = (v) => Math.max(0, Math.round(Number(v) || 0));

  app.get('/salaries/:id/modifier', (req, res) => {
    const s = get(`SELECT e.*, k.id contrat_id, k.type, k.date_fin, k.fin_essai, k.salaire_base, k.sursalaire, k.prime_transport FROM salaries e JOIN contrats k ON k.salarie_id=e.id WHERE e.id=? AND e.societe_id=?`, Number(req.params.id), req.societe.id);
    if (!s) return res.redirect('/salaries');
    const postes = all('SELECT p.id, p.intitule, d.nom dep FROM postes p LEFT JOIN departements d ON d.id=p.departement_id WHERE p.societe_id=? ORDER BY p.intitule', req.societe.id);
    const sit = SITUATIONS.includes(s.situation) ? SITUATIONS : [s.situation, ...SITUATIONS];
    res.send(page(req, { titre: 'Modifier la fiche', fil: `Salariés / ${s.prenom} ${s.nom} / Modifier`, sous: 'Un changement de salaire, de poste ou de contrat est enregistré comme avenant dans l\'historique du salarié, à la date d\'effet indiquée.' }, `
    <form method="post" action="/salaries/${s.id}/modifier"><div class="disposition d-1-1">
      ${carte('Identité', `<div class="champs">
        <label>Nom<input name="nom" required value="${e(s.nom)}"></label><label>Prénom<input name="prenom" required value="${e(s.prenom)}"></label>
        <label>Sexe<select name="sexe"><option value="F"${s.sexe === 'F' ? ' selected' : ''}>Femme</option><option value="M"${s.sexe === 'M' ? ' selected' : ''}>Homme</option></select></label>
        <label>Date de naissance<input type="date" name="date_naissance" value="${e(s.date_naissance || '')}"></label>
        <label>Situation familiale ${aide('Modifie le nombre de parts fiscales à partir de la prochaine paie.')}<select name="situation">${sit.map((x) => `<option${x === s.situation ? ' selected' : ''}>${e(x)}</option>`).join('')}</select></label>
        <label>Enfants à charge<input type="number" min="0" name="enfants" value="${s.enfants}"></label>
        <label>Numéro CNSS<input name="num_cnss" value="${e(s.num_cnss || '')}"></label><label>Téléphone<input name="telephone" value="${e(s.telephone || '')}"></label></div>`)}
      ${carte('Poste et contrat', `<div class="champs">
        <label class="large">Poste<select name="poste_id">${options(postes, 'id', (p) => `${p.intitule} — ${p.dep}`, s.poste_id)}</select></label>
        <label>Type de contrat<select name="type"><option${s.type === 'CDI' ? ' selected' : ''}>CDI</option><option${s.type === 'CDD' ? ' selected' : ''}>CDD</option></select></label>
        <label>Fin du CDD<input type="date" name="date_fin" value="${e(s.date_fin || '')}"></label>
        <label>Fin de période d'essai<input type="date" name="fin_essai" value="${e(s.fin_essai || '')}"></label>
        <label>Salaire de base (FCFA)<input type="number" min="0" name="salaire_base" required value="${s.salaire_base}"></label>
        <label>Sursalaire (FCFA)<input type="number" min="0" name="sursalaire" value="${s.sursalaire}"></label>
        <label>Indemnité de transport (FCFA)<input type="number" min="0" name="prime_transport" value="${s.prime_transport}"></label>
        <label>Date d'effet de l'avenant ${aide('Date à laquelle les nouvelles conditions s\'appliquent. Elle figure dans l\'historique.')}<input type="date" name="effet" required value="${aujourdhui()}"></label></div>`)}
    </div><div class="actions"><a class="bouton fantome" href="/salaries/${s.id}">Annuler</a><button class="bouton">Enregistrer les modifications</button></div></form>`));
  });

  app.post('/salaries/:id/modifier', (req, res) => {
    const s = get(`SELECT e.*, k.id contrat_id, k.type, k.date_fin, k.fin_essai, k.salaire_base, k.sursalaire, k.prime_transport, p.intitule poste FROM salaries e JOIN contrats k ON k.salarie_id=e.id LEFT JOIN postes p ON p.id=e.poste_id WHERE e.id=? AND e.societe_id=?`, Number(req.params.id), req.societe.id);
    if (!s) return res.redirect('/salaries');
    const b = req.body;
    if (!b.nom || !b.prenom) return res.redirect(`/salaries/${s.id}/modifier`);
    const poste = get('SELECT * FROM postes WHERE id=? AND societe_id=?', Number(b.poste_id), req.societe.id) || { id: s.poste_id, intitule: s.poste };
    const n = { type: b.type === 'CDD' ? 'CDD' : 'CDI', salaire_base: montant(b.salaire_base), sursalaire: montant(b.sursalaire), prime_transport: montant(b.prime_transport) };
    n.date_fin = n.type === 'CDD' ? date(b.date_fin) : null;
    n.fin_essai = date(b.fin_essai);
    run('UPDATE salaries SET nom=?, prenom=?, sexe=?, date_naissance=?, situation=?, enfants=?, num_cnss=?, telephone=?, poste_id=? WHERE id=?',
      b.nom.trim(), b.prenom.trim(), b.sexe === 'M' ? 'M' : 'F', date(b.date_naissance), b.situation || s.situation, Math.max(0, Number(b.enfants) || 0), (b.num_cnss || '').trim(), (b.telephone || '').trim(), poste.id, s.id);
    run('UPDATE contrats SET type=?, date_fin=?, fin_essai=?, salaire_base=?, sursalaire=?, prime_transport=? WHERE id=?', n.type, n.date_fin, n.fin_essai, n.salaire_base, n.sursalaire, n.prime_transport, s.contrat_id);
    // avenant : on trace chaque changement des conditions de travail
    const changements = [];
    if (n.salaire_base !== s.salaire_base) changements.push(`salaire de base ${fcfa(s.salaire_base)} → ${fcfa(n.salaire_base)} FCFA`);
    if (n.sursalaire !== s.sursalaire) changements.push(`sursalaire ${fcfa(s.sursalaire)} → ${fcfa(n.sursalaire)} FCFA`);
    if (n.prime_transport !== s.prime_transport) changements.push(`transport ${fcfa(s.prime_transport)} → ${fcfa(n.prime_transport)} FCFA`);
    if (poste.id !== s.poste_id) changements.push(`poste ${s.poste} → ${poste.intitule}`);
    if (n.type !== s.type) changements.push(`contrat ${s.type} → ${n.type}`);
    if ((n.date_fin || '') !== (s.date_fin || '')) changements.push(`fin de contrat ${s.date_fin ? dateFr(s.date_fin) : 'aucune'} → ${n.date_fin ? dateFr(n.date_fin) : 'aucune'}`);
    if (changements.length) run('INSERT INTO evenements(salarie_id,date,type,detail) VALUES(?,?,?,?)', s.id, date(b.effet) || aujourdhui(), 'Avenant', changements.join(' ; '));
    res.redirect(`/salaries/${s.id}`);
  });

  // informations légales de la société (reprises sur les bulletins et documents)
  app.get('/societe/parametres', (req, res) => {
    const s = req.societe;
    res.send(page(req, { titre: 'Informations de la société', sous: 'Elles figurent sur les bulletins de paie, les déclarations, les certificats de travail et les fiches de remise.' }, carte('', `
      ${req.query.ok ? '<p class="succes-ligne">Informations enregistrées.</p>' : ''}
      <form method="post" action="/societe/parametres" class="champs">
        <label>Raison sociale<input name="nom" required value="${e(s.nom)}"></label><label>Ville<input name="ville" required value="${e(s.ville)}"></label>
        <label>NIU ${aide('Numéro d\'identification unique délivré par l\'administration fiscale.')}<input name="niu" value="${e(s.niu)}"></label>
        <label>RCCM ${aide('Numéro d\'immatriculation au registre du commerce et du crédit mobilier.')}<input name="rccm" value="${e(s.rccm)}"></label>
        <label>Numéro d'employeur CNSS<input name="cnss_employeur" value="${e(s.cnss_employeur)}"></label>
        <div class="actions large"><button class="bouton">Enregistrer</button></div></form>`)));
  });
  app.post('/societe/parametres', (req, res) => {
    const b = req.body, t = (v, n) => String(v ?? '').trim().slice(0, n);
    if (t(b.nom, 120) && t(b.ville, 80)) run('UPDATE societes SET nom=?, ville=?, niu=?, rccm=?, cnss_employeur=? WHERE id=?', t(b.nom, 120), t(b.ville, 80), t(b.niu, 40), t(b.rccm, 60), t(b.cnss_employeur, 40), req.societe.id);
    res.redirect('/societe/parametres?ok=1');
  });

  // droit d'accès (loi n° 29-2019 du 10 octobre 2019) : toutes les données enregistrées sur un salarié, dans un fichier lisible
  app.get('/salaries/:id/donnees', (req, res) => {
    const s = get('SELECT * FROM salaries WHERE id=? AND societe_id=?', Number(req.params.id), req.societe.id);
    if (!s) return res.redirect('/salaries');
    const de = (sql) => all(sql, s.id);
    const bulletins = de('SELECT * FROM bulletins WHERE salarie_id=? ORDER BY periode').map((b) => ({ ...b, lignes: all('SELECT code, libelle, sens, base, taux, montant FROM bulletin_lignes WHERE bulletin_id=? ORDER BY ordre', b.id) }));
    const donnees = {
      edite_le: new Date().toISOString(), employeur: { nom: req.societe.nom, ville: req.societe.ville, niu: req.societe.niu },
      salarie: s, poste: get('SELECT p.intitule, d.nom departement, c.code categorie FROM postes p LEFT JOIN departements d ON d.id=p.departement_id LEFT JOIN categories c ON c.id=p.categorie_id WHERE p.id=?', s.poste_id) || null,
      contrats: de('SELECT * FROM contrats WHERE salarie_id=? ORDER BY date_debut'), historique: de('SELECT date, type, detail FROM evenements WHERE salarie_id=? ORDER BY date'),
      absences: de('SELECT type, date_debut, date_fin, jours, statut, motif FROM conges WHERE salarie_id=? ORDER BY date_debut'), elements_variables: de('SELECT periode, type, quantite, montant, libelle FROM variables WHERE salarie_id=? ORDER BY periode'),
      materiel: de('SELECT m.designation, m.reference, d.quantite, d.etat, d.date_remise, d.date_retour FROM dotations d JOIN materiels m ON m.id=d.materiel_id WHERE d.salarie_id=? ORDER BY d.date_remise'),
      sorties: de('SELECT motif, date_notification, date_sortie, preavis, total FROM sorties WHERE salarie_id=?'), bulletins,
    };
    const nom = `donnees-${s.matricule}-${s.nom}`.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
    res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${nom}.json"` }).send(JSON.stringify(donnees, null, 2));
  });

  // annulation d'une absence (saisie par erreur) : supprimée du planning et de la paie au prochain calcul
  app.post('/conges/:id/annuler', (req, res) => {
    const a = get('SELECT c.* FROM conges c JOIN salaries e ON e.id=c.salarie_id WHERE c.id=? AND e.societe_id=?', Number(req.params.id), req.societe.id);
    if (a) {
      run('DELETE FROM conges WHERE id=?', a.id);
      run('INSERT INTO evenements(salarie_id,date,type,detail) VALUES(?,?,?,?)', a.salarie_id, aujourdhui(), 'Absence annulée', `Du ${dateFr(a.date_debut)} au ${dateFr(a.date_fin)}`);
    }
    res.redirect('/conges');
  });
};
