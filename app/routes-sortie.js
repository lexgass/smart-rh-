// Sortie d'un salarié : simulation du solde de tout compte, confirmation, certificat de travail et reçu pour solde de tout compte.
const { run, all, get } = require('./db');
const paie = require('./paie');
const droits = require('./droits');
const { iso, jour, decale, joursOuvrables } = require('./calendrier');

const MOTIFS = {
  demission: ['Démission', 'Le salarié doit respecter le préavis de sa catégorie. Aucune indemnité de licenciement.'],
  licenciement: ['Licenciement', 'Préavis et indemnité de licenciement selon la convention. Le motif doit être légitime et prouvé par l\'employeur (art. 42).'],
  faute_lourde: ['Licenciement pour faute lourde', 'Ni préavis ni indemnité de licenciement. Le licenciement ne prend effet qu\'après la défense du salarié, dans un délai de 30 jours au plus (art. 41).'],
  fin_cdd: ['Fin de CDD', 'Le contrat prend fin à son échéance, sans préavis ni indemnité de licenciement (art. 37).'],
  commun_accord: ['Rupture d\'un commun accord', 'Les conditions, dont une éventuelle indemnité, sont fixées par écrit entre les parties.'],
  retraite: ['Départ à la retraite', 'L\'indemnité de départ dépend de la convention (exemple Commerce, art. 23 : 5 mois avant 10 ans d\'ancienneté, 7 mois après).'],
};
const PREAVIS = {
  effectue: 'Préavis effectué',
  dispense: 'Préavis non effectué à la demande de l\'employeur (indemnité compensatrice versée)',
  non_effectue: 'Préavis non effectué par le salarié (indemnité due à l\'employeur)',
};

module.exports = (app, h) => {
  const { e, fcfa, nb, dateFr, aujourdhui, page, carte, tableau, options, aide, ic, imprimable, interdit } = h;
  const SQL = `SELECT e.*, p.intitule poste, c.code cat, c.libelle catlib, c.niveau, k.id contrat_id, k.type, k.date_debut, k.date_fin, k.salaire_base, k.sursalaire, k.prime_transport
    FROM salaries e LEFT JOIN postes p ON p.id=e.poste_id LEFT JOIN categories c ON c.id=p.categorie_id LEFT JOIN contrats k ON k.salarie_id=e.id WHERE e.id=? AND e.societe_id=?`;

  // durée du préavis en jours calendaires (mois ou jours ouvrables)
  const dureePreavis = (pr) => (pr.manquant ? 0 : pr.unite === 'mois' ? null : Math.round(pr.valeur * 7 / 6));
  const finPreavis = (debut, pr) => {
    if (pr.manquant) return debut;
    const d = jour(debut);
    if (pr.unite === 'mois') { d.setMonth(d.getMonth() + Math.floor(pr.valeur)); return iso(d); }
    return iso(decale(d, dureePreavis(pr)));
  };

  function simuler(s, o) {
    const sid = s.societe_id;
    const ans = paie.anneesEntre(s.date_embauche, o.sortie);
    const taux = paie.tauxAnciennete(ans, sid, o.sortie);
    const mensuel = Math.round((s.salaire_base || 0) * (1 + taux / 100) + (s.sursalaire || 0));
    const journalier = mensuel / 26;
    const lignes = [];
    // salaire du dernier mois, au prorata des jours ouvrables travaillés
    const debutMois = `${o.sortie.slice(0, 7)}-01`, finMois = iso(new Date(Number(o.sortie.slice(0, 4)), Number(o.sortie.slice(5, 7)), 0));
    const travailles = joursOuvrables(debutMois > s.date_embauche ? debutMois : s.date_embauche, o.sortie), ouvrables = joursOuvrables(debutMois, finMois);
    lignes.push(['Salaire du mois de sortie', `${travailles} jours ouvrables travaillés sur ${ouvrables}`, Math.round((mensuel + (s.prime_transport || 0)) * travailles / ouvrables)]);
    // congés acquis non pris (art. 120)
    const sol = droits.soldeConges(s, o.sortie);
    const jc = Math.max(0, (sol.ouvert ? sol.disponible : 0) + sol.enCours);
    lignes.push(['Indemnité compensatrice de congés payés', `${nb(Math.round(jc * 10) / 10)} jours acquis non pris × ${fcfa(journalier)} FCFA (1/26 du salaire mensuel)`, Math.round(jc * journalier)]);
    // préavis
    const pr = droits.preavis(sid, s.niveau || 1);
    const avecPreavis = ['demission', 'licenciement'].includes(o.motif);
    const alertes = [];
    if (avecPreavis && o.preavis !== 'effectue') {
      if (pr.manquant) alertes.push('Le préavis de cette catégorie n\'est pas renseigné dans la convention : l\'indemnité compensatrice n\'est pas calculée.');
      else {
        const montant = Math.round(pr.unite === 'mois' ? pr.valeur * mensuel : pr.valeur * journalier);
        const signe = o.motif === 'demission' && o.preavis === 'non_effectue' ? -1 : 1;
        lignes.push([signe > 0 ? 'Indemnité compensatrice de préavis' : 'Préavis non effectué, dû par le salarié', `${pr.texte} (${pr.source})`, signe * montant]);
      }
    }
    // indemnité de rupture
    if (o.motif === 'licenciement') {
      const ind = droits.indemnite(s, s, o.sortie);
      if (ind.montant) lignes.push(['Indemnité de licenciement', `Barème de la convention (${ind.source}), base ${fcfa(ind.salaireMoyen.montant)} FCFA, ${ind.salaireMoyen.source}`, ind.montant]);
      else alertes.push(`Indemnité de licenciement : ${ind.texte}.`);
    }
    if (['commun_accord', 'retraite'].includes(o.motif) && o.indemnite > 0) lignes.push([o.motif === 'retraite' ? 'Indemnité de départ à la retraite' : 'Indemnité de rupture convenue', 'Montant saisi', o.indemnite]);
    // matériel à restituer
    const materiel = all('SELECT d.*, m.designation, m.valeur FROM dotations d JOIN materiels m ON m.id=d.materiel_id WHERE d.salarie_id=? AND d.date_retour IS NULL', s.id);
    if (materiel.length) alertes.push(`${materiel.length} article${materiel.length > 1 ? 's' : ''} de matériel à récupérer avant le départ.`);
    return { lignes, total: lignes.reduce((a, l) => a + l[2], 0), mensuel, taux, ans, pr, alertes, materiel, sol };
  }

  const lireOptions = (s, q) => {
    const motif = MOTIFS[q.motif] ? q.motif : (s.type === 'CDD' ? 'fin_cdd' : 'demission');
    const notification = /^\d{4}-\d{2}-\d{2}$/.test(q.notification || '') ? q.notification : aujourdhui();
    const preavis = PREAVIS[q.preavis] ? q.preavis : 'effectue';
    const pr = droits.preavis(s.societe_id, s.niveau || 1);
    const parDefaut = motif === 'fin_cdd' && s.date_fin ? s.date_fin : ['demission', 'licenciement'].includes(motif) && preavis === 'effectue' ? finPreavis(notification, pr) : notification;
    const sortie = /^\d{4}-\d{2}-\d{2}$/.test(q.sortie || '') && q.sortie >= notification ? q.sortie : parDefaut;
    return { motif, notification, sortie, preavis, indemnite: Math.max(0, Number(q.indemnite) || 0) };
  };

  app.get('/salaries/:id/sortie', (req, res) => {
    const s = get(SQL, Number(req.params.id), req.societe.id);
    if (!s) return res.redirect('/salaries');
    if (s.statut !== 'Actif') return res.redirect(`/salaries/${s.id}`);
    const o = lireOptions(s, req.query), sim = simuler(s, o);
    const champsCaches = Object.entries(o).map(([k, v]) => `<input type="hidden" name="${k}" value="${e(v)}">`).join('');
    res.send(page(req, { titre: 'Sortie d\'un salarié', fil: `Salariés / ${s.prenom} ${s.nom} / Sortie`, sous: `${e(s.prenom)} ${e(s.nom)}, ${e(s.poste)}, entré le ${dateFr(s.date_embauche)}. Ajustez les paramètres : le solde de tout compte se met à jour.` }, `
    <div class="disposition d-1-2">
    ${carte('Paramètres de la sortie', `<form method="get" class="form-pile" id="form-sortie">
      <label>Motif ${aide(Object.values(MOTIFS).map(([l, d]) => `${l} : ${d}`).join(' '))}<select name="motif" data-envoi-auto>${Object.entries(MOTIFS).map(([k, [l]]) => `<option value="${k}"${k === o.motif ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <p class="discret petit-texte">${MOTIFS[o.motif][1]}</p>
      <label>Date de notification ${aide('Date de remise de la lettre de démission ou de licenciement. Le préavis court à partir de cette date.')}<input type="date" name="notification" value="${o.notification}" data-envoi-auto></label>
      ${['demission', 'licenciement'].includes(o.motif) ? `<label>Préavis : ${sim.pr.manquant ? 'à renseigner dans la convention' : e(sim.pr.texte)}<select name="preavis" data-envoi-auto>${Object.entries(PREAVIS).filter(([k]) => o.motif === 'demission' || k !== 'non_effectue').map(([k, l]) => `<option value="${k}"${k === o.preavis ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
      <label>Date de sortie ${aide('Dernier jour travaillé. Proposée automatiquement à la fin du préavis s\'il est effectué.')}<input type="date" name="sortie" value="${o.sortie}" min="${o.notification}" data-envoi-auto></label>
      ${['commun_accord', 'retraite'].includes(o.motif) ? `<label>Indemnité convenue (FCFA)<input type="number" min="0" step="1000" name="indemnite" value="${o.indemnite || ''}" data-envoi-auto></label>` : ''}
      <noscript><button class="bouton secondaire">Recalculer</button></noscript></form>`)}
    <div class="pile">
    ${carte(`Solde de tout compte${aide('Montants bruts. Ils restent soumis aux retenues habituelles ; l\'indemnité de licenciement n\'est exonérée d\'ITS que dans le cadre d\'un plan social (CGI, art. 114 A c).')}`, `
      ${sim.alertes.map((a) => `<p class="alerte-ligne">${ic('alerte')} ${e(a)}</p>`).join('')}
      ${tableau(['Élément', 'Calcul', '+Montant (FCFA)'], sim.lignes.map(([l, c, m]) => `<tr><td><b>${e(l)}</b></td><td class="discret">${e(c)}</td><td class="n ${m < 0 ? 'negatif' : ''}">${fcfa(m)}</td></tr>`).concat([`<tr class="total"><td>Total brut à verser</td><td></td><td class="n">${fcfa(sim.total)}</td></tr>`]))}
      <p class="discret petit-texte">Salaire mensuel de référence : ${fcfa(sim.mensuel)} FCFA (base, sursalaire et prime d'ancienneté de ${nb(sim.taux)} %), ${sim.ans} an${sim.ans > 1 ? 's' : ''} d'ancienneté à la date de sortie.</p>`)}
    ${sim.materiel.length ? carte('Matériel à récupérer', tableau(['Matériel', '+Qté', 'Remis le', '+Valeur'], sim.materiel.map((d) => `<tr><td>${e(d.designation)}</td><td class="n">${d.quantite}</td><td>${dateFr(d.date_remise)}</td><td class="n">${fcfa(d.valeur * d.quantite)}</td></tr>`))) : ''}
    ${carte('', `<form method="post" action="/salaries/${s.id}/sortie" class="confirmation-sortie">${champsCaches}
      <p><b>Confirmer la sortie de ${e(s.prenom)} ${e(s.nom)} le ${dateFr(o.sortie)} ?</b> Le salarié passera au statut « Sorti » et ne sera plus inclus dans les paies suivantes. Le certificat de travail et le reçu pour solde de tout compte seront prêts à imprimer.</p>
      <div class="actions"><a class="bouton fantome" href="/salaries/${s.id}">Annuler</a><button class="bouton danger">Confirmer la sortie</button></div></form>`)}
    </div></div>`));
  });

  app.post('/salaries/:id/sortie', (req, res) => {
    const s = get(SQL, Number(req.params.id), req.societe.id);
    if (!s || s.statut !== 'Actif') return res.redirect('/salaries');
    const o = lireOptions(s, req.body), sim = simuler(s, o);
    run('INSERT INTO sorties(salarie_id,motif,date_notification,date_sortie,preavis,detail,total,cree_le) VALUES(?,?,?,?,?,?,?,?)', s.id, o.motif, o.notification, o.sortie, o.preavis, JSON.stringify(sim.lignes), sim.total, aujourdhui());
    run("UPDATE salaries SET statut='Sorti' WHERE id=?", s.id);
    run('UPDATE contrats SET date_fin=? WHERE id=?', o.sortie, s.contrat_id);
    run('INSERT INTO evenements(salarie_id,date,type,detail) VALUES(?,?,?,?)', s.id, o.sortie, 'Sortie', `${MOTIFS[o.motif][0]}, solde de tout compte de ${fcfa(sim.total)} FCFA`);
    res.redirect(`/salaries/${s.id}`);
  });

  const sortieDe = (req) => {
    const s = get(SQL, Number(req.params.id), req.societe.id);
    const so = s && get('SELECT * FROM sorties WHERE salarie_id=? ORDER BY id DESC LIMIT 1', s.id);
    return so ? { s, so } : null;
  };
  const enteteSociete = (soc, titre, sous) => `<div class="entete"><div><b>${e(soc.nom)}</b><br>${e(soc.ville)}<br>NIU ${e(soc.niu)}, RCCM ${e(soc.rccm)}<br>CNSS employeur ${e(soc.cnss_employeur)}</div><div class="droite"><h1>${titre}</h1>${sous}</div></div>`;

  app.get('/salaries/:id/certificat', (req, res) => {
    const x = sortieDe(req); if (!x) return res.redirect('/salaries');
    const { s, so } = x, soc = req.societe;
    res.send(imprimable('Certificat de travail', `/salaries/${s.id}`, `${enteteSociete(soc, 'Certificat de travail', `Fait le ${dateFr(so.cree_le)}`)}
      <p class="corps-lettre">Je soussigné, représentant la société ${e(soc.nom)}, certifie que <b>${s.sexe === 'F' ? 'Madame' : 'Monsieur'} ${e(s.prenom)} ${e(s.nom)}</b>${s.date_naissance ? `, né${s.sexe === 'F' ? 'e' : ''} le ${dateFr(s.date_naissance)}` : ''}, immatriculé${s.sexe === 'F' ? 'e' : ''} à la CNSS sous le numéro ${e(s.num_cnss) || '…………'}, a été employé${s.sexe === 'F' ? 'e' : ''} dans notre société du <b>${dateFr(s.date_embauche)}</b> au <b>${dateFr(so.date_sortie)}</b>.</p>
      <table class="simple"><tr><th>Emploi occupé</th><th>Catégorie</th><th>Du</th><th>Au</th></tr><tr><td>${e(s.poste)}</td><td>${e(s.cat)}, ${e(s.catlib)}</td><td>${dateFr(s.date_embauche)}</td><td>${dateFr(so.date_sortie)}</td></tr></table>
      <p class="corps-lettre">${s.sexe === 'F' ? 'Elle' : 'Il'} nous quitte libre de tout engagement.</p>
      <p class="corps-lettre">Ce certificat est délivré pour servir et valoir ce que de droit (Code du travail, art. 46).</p>
      <div class="signatures"><div></div><div>Pour l'employeur<br><small>Nom, qualité, signature et cachet</small></div></div>`));
  });

  app.get('/salaries/:id/solde', (req, res) => {
    const x = sortieDe(req); if (!x) return res.redirect('/salaries');
    const { s, so } = x, soc = req.societe, lignes = JSON.parse(so.detail);
    res.send(imprimable('Reçu pour solde de tout compte', `/salaries/${s.id}`, `${enteteSociete(soc, 'Reçu pour solde de tout compte', `Sortie le ${dateFr(so.date_sortie)}`)}
      <table class="simple"><tr><th>Salarié</th><td>${e(s.prenom)} ${e(s.nom)} (${e(s.matricule)})</td><th>Motif</th><td>${MOTIFS[so.motif][0]}</td></tr>
      <tr><th>Entrée</th><td>${dateFr(s.date_embauche)}</td><th>Sortie</th><td>${dateFr(so.date_sortie)}</td></tr></table>
      <table class="simple"><tr><th>Élément</th><th>Calcul</th><th class="n">Montant brut (FCFA)</th></tr>${lignes.map(([l, c, m]) => `<tr><td>${e(l)}</td><td>${e(c)}</td><td class="n">${fcfa(m)}</td></tr>`).join('')}
      <tr class="total"><td>Total</td><td></td><td class="n">${fcfa(so.total)}</td></tr></table>
      <p class="corps-lettre">Je soussigné${s.sexe === 'F' ? 'e' : ''} ${e(s.prenom)} ${e(s.nom)} reconnais avoir reçu de la société ${e(soc.nom)} la somme de <b>${fcfa(so.total)} FCFA</b> brut, sous réserve des retenues légales, pour solde de tout compte, en paiement des salaires, accessoires et indemnités dus au titre de l'exécution et de la cessation de mon contrat de travail.</p>
      <p class="petit">Montants bruts calculés par Smart RH, taux indicatifs à faire valider. L'action en paiement des salaires se prescrit par un an (Code du travail, art. 99).</p>
      <div class="signatures"><div>L'employeur</div><div>Le salarié<br><small>Mention manuscrite « pour solde de tout compte », date et signature</small></div></div>`));
  });
};

module.exports.MOTIFS = MOTIFS;
