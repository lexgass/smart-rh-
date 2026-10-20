// Convention collective de la société : choix, barèmes modifiables, correspondance des catégories.
const { run, all, get } = require('./db');
const paie = require('./paie');
const droits = require('./droits');
const acces = require('./acces');

const TYPES_BAREME = {
  essai: ['Période d\'essai', 'Durée maximale selon le niveau de catégorie. Le Code du travail fixe un plafond de 6 mois, renouvellement compris.', 'Niveaux'],
  preavis: ['Préavis', 'Délai à respecter en cas de démission ou de licenciement, selon le niveau de catégorie. Pendant le préavis, le salarié dispose de 2 jours libres payés par semaine pour chercher un emploi.', 'Niveaux'],
  conges: ['Congés supplémentaires d\'ancienneté', 'Jours ouvrables ajoutés aux 26 jours légaux, selon l\'ancienneté.', 'Ancienneté (ans)'],
  indemnite: ['Indemnité de licenciement', 'Montant par année d\'ancienneté, en pourcentage ou en mois du salaire mensuel moyen des 12 derniers mois. Non due en cas de faute lourde.', 'Années'],
};

module.exports = (app, h) => {
  const { e, nb, dateFr, aujourdhui, page, carte, tableau, options, aide, ic, interdit } = h;
  // lecture seule pour le mode Utilisateur ; les barèmes de la convention sont partagés par toutes les sociétés : seul l'Admin les modifie
  const lecture = (req) => !acces.peut(req, 'convention');
  const baremeModifiable = (req) => acces.peut(req, 'modele.modifier');

  app.get('/convention', (req, res) => {
    const s = req.societe, j = aujourdhui();
    const conv = get('SELECT * FROM conventions WHERE code=?', paie.conventionDe(s.id));
    const convs = all('SELECT * FROM conventions ORDER BY nom');
    const ORDRE = ['ANC_DEBUT_ANS', 'ANC_TAUX_DEBUT', 'ANC_PAS', 'ANC_SEUIL2', 'ANC_PAS2', 'ANC_PLAFOND', 'ANC_PALIER_ANS', 'ANC_PALIER_TAUX', 'IND_MIN_MOIS', 'IND_PLAFOND_MOIS'];
    const params = all("SELECT * FROM parametres WHERE convention=? AND societe_id IS NULL ORDER BY code, date_debut DESC", conv.code)
      .filter((p, i, t) => t.findIndex((q) => q.code === p.code) === i)
      .sort((a, b) => ORDRE.indexOf(a.code) - ORDRE.indexOf(b.code));
    const cats = all('SELECT * FROM categories WHERE societe_id=? ORDER BY niveau, code', s.id);
    const ro = lecture(req);
    const valeurBareme = (b) => (b.valeur == null ? '<span class="et jaune">À renseigner</span>' : `<b>${nb(b.valeur)}</b> ${e(b.unite)}`);
    const roB = !baremeModifiable(req);
    const formBareme = (b) => (roB ? '' : `<form method="post" action="/convention/bareme/${b.id}" class="form-mini"><input type="number" step="any" name="valeur" value="${b.valeur ?? ''}" aria-label="Nouvelle valeur pour ${e(b.libelle)}" required><button class="bouton secondaire petit icone" aria-label="Enregistrer ${e(b.libelle)}" data-bulle="Enregistrer cette valeur">${ic('coche')}</button></form>`);
    const blocBareme = (type) => {
      const [titre, explication, colonne] = TYPES_BAREME[type];
      const lignes = droits.bareme(conv.code, type);
      return carte(`${titre}${aide(explication)}`, lignes.length
        ? tableau([colonne, 'Valeur', roB ? '' : `Modifier${aide('Ce barème est commun à toutes les sociétés de la convention : une modification les concerne toutes.')}`], lignes.map((b) => `<tr><td>${e(b.libelle)}<small class="discret bloc">${e(b.source)}</small></td><td class="valeur-bareme">${valeurBareme(b)}</td><td>${formBareme(b)}</td></tr>`))
        : `<div class="etat-vide">La convention ${e(conv.nom)} enregistrée ne fixe pas cette règle. ${type === 'essai' ? 'Le plafond légal de 6 mois s\'applique.' : type === 'preavis' ? 'Le préavis relève alors d\'un arrêté du ministre du travail.' : ''}</div>`);
    };
    // simulation de la prime d'ancienneté année par année
    const ans = [0, 1, 2, 3, 5, 10, 15, 20, 25, 30];
    const simulation = `<div class="simulation">${ans.map((a) => { const t = paie.tauxAnciennete(a, s.id, j); return `<div><b>${nb(t)} %</b><small>${a} an${a > 1 ? 's' : ''}</small></div>`; }).join('')}</div>`;

    res.send(page(req, { titre: 'Convention collective', sous: `Les règles de la convention s'appliquent automatiquement à la paie, à l'embauche et aux fiches salariés de ${e(s.nom)}. Une valeur propre à la société, saisie dans « Règles de paie », reste prioritaire.` }, `
    <section class="carte entete-convention"><div class="conv-titre"><span class="sceau">${ic('balance')}</span><div><h2>${e(conv.nom)}</h2><p>${e(conv.reference)}${conv.annee ? `, ${e(conv.annee)}` : ''}</p></div></div>
      ${ro ? '' : `<form method="post" action="/convention/choisir" class="form-mini large"><label class="en-ligne">Changer de convention<select name="code">${options(convs, 'code', 'nom', conv.code)}</select></label><button class="bouton secondaire">Appliquer</button></form>`}</section>
    <div class="disposition d-1-1">
      ${carte(`Prime d'ancienneté${aide('Pourcentage du salaire de base versé chaque mois selon l\'ancienneté. Elle entre dans les bases CNSS, ITS et TUS.')}`, `${simulation}
        ${tableau(['Paramètre', '+Valeur', 'Référence'], params.filter((p) => p.code.startsWith('ANC')).map((p) => `<tr><td>${e(p.libelle)}</td><td class="n"><b>${nb(p.valeur)}</b> ${e(p.unite)}</td><td class="discret">${e(p.source)}</td></tr>`), 'Aucun paramètre propre : le modèle national s\'applique.')}`)}
      ${blocBareme('indemnite')}
    </div>
    <div class="disposition d-1-1-1">${blocBareme('essai')}${blocBareme('preavis')}${blocBareme('conges')}</div>
    ${carte(`Correspondance des catégories${aide('Le niveau relie les catégories de la société aux barèmes de la convention (essai, préavis). Exemple : une catégorie de niveau 5 suit la ligne « catégories 5 à 7 ».')}`, tableau(['Code', 'Catégorie', 'Niveau', 'Essai prévu', 'Préavis', ro ? '' : 'Modifier le niveau'], cats.map((c) => {
      const es = droits.essai(s.id, c.niveau || 1), pr = droits.preavis(s.id, c.niveau || 1);
      return `<tr><td><span class="code">${e(c.code)}</span></td><td>${e(c.libelle)}</td><td><b>${c.niveau ?? '—'}</b></td><td>${nb(es.mois)} mois</td><td>${pr.manquant ? '<span class="et jaune">À renseigner</span>' : e(pr.texte)}</td>
        <td>${ro ? '' : `<form method="post" action="/convention/niveau/${c.id}" class="form-mini"><input type="number" min="1" max="20" name="niveau" value="${c.niveau ?? ''}" aria-label="Niveau de ${e(c.code)}" required><button class="bouton fantome petit">Enregistrer</button></form>`}</td></tr>`;
    })))}`));
  });

  app.post('/convention/choisir', (req, res) => {
    const c = get('SELECT * FROM conventions WHERE code=?', req.body.code);
    if (c) run('UPDATE societes SET convention_code=?, convention=? WHERE id=?', c.code, c.nom, req.societe.id);
    res.redirect('/convention');
  });
  app.post('/convention/bareme/:id', (req, res) => {
    const v = Number(req.body.valeur);
    if (Number.isFinite(v)) run('UPDATE convention_baremes SET valeur=?, source=source || \' (modifié le \' || ? || \')\' WHERE id=?', v, dateFr(aujourdhui()), Number(req.params.id));
    res.redirect('/convention');
  });
  app.post('/convention/niveau/:id', (req, res) => {
    const n = Number(req.body.niveau);
    if (Number.isInteger(n) && n >= 1 && n <= 20) run('UPDATE categories SET niveau=? WHERE id=? AND societe_id=?', n, Number(req.params.id), req.societe.id);
    res.redirect('/convention');
  });
};
