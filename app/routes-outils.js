// Outils transverses : recherche globale (Ctrl+K) et ouverture directe d'une société.
const { all, get } = require('./db');
const acces = require('./acces');

// pages et actions proposées par la recherche, avec les mots qui les retrouvent
const DESTINATIONS = [
  ['Tableau de bord', '/', 'accueil paie du mois échéances'],
  ['Vue d\'ensemble', '/analyses', 'graphiques analyses statistiques effectif'],
  ['Salariés', '/salaries', 'personnel liste employés'],
  ['Embaucher un salarié', '/embauche', 'recrutement nouveau contrat cdi cdd'],
  ['Congés et absences', '/conges', 'vacances maladie permission planning'],
  ['Saisir une absence', '/conges#nouvelle', 'congé maladie permission absence'],
  ['Dotations matérielles', '/dotations', 'matériel équipement remise'],
  ['Éléments variables', '/variables', 'heures supplémentaires primes'],
  ['Paie du mois', '/paie', 'bulletins livre de paie calcul'],
  ['Déclarations CNSS', '/declarations?onglet=cnss', 'bordereau cotisations sécurité sociale'],
  ['Déclarations impôts et taxes', '/declarations?onglet=impots', 'its dgi tus tol camu'],
  ['Déclaration annuelle des salaires', '/declarations?onglet=annuel', 'das annuel'],
  ['Règles de paie', '/regles', 'taux plafonds barème paramètres smig'],
  ['Structure de la société', '/structure', 'départements postes catégories'],
  ['Convention collective', '/convention', 'préavis indemnité ancienneté essai barème'],
  ['Sociétés clientes', '/societes', 'cabinet dossiers clients changer'],
];
const normaliser = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

module.exports = (app, h) => {
  const { e, page, carte } = h;

  app.get('/recherche', (req, res) => {
    const q = normaliser(req.query.q).trim();
    if (!q) return res.json({ resultats: DESTINATIONS.slice(0, 8).map(([t, u]) => ({ type: 'Page', titre: t, url: u })) });
    const mots = q.split(/\s+/);
    const correspond = (texte) => { const n = normaliser(texte); return mots.every((m) => n.includes(m)); };
    const resultats = [];
    if (req.societe) {
      const sal = all(`SELECT e.id, e.nom, e.prenom, e.matricule, e.statut, p.intitule poste FROM salaries e LEFT JOIN postes p ON p.id=e.poste_id WHERE e.societe_id=?`, req.societe.id);
      for (const s of sal) if (correspond(`${s.prenom} ${s.nom} ${s.matricule} ${s.poste}`)) resultats.push({ type: s.statut === 'Actif' ? 'Salarié' : 'Salarié sorti', titre: `${s.prenom} ${s.nom}`, detail: `${s.poste || ''}, ${s.matricule}`, url: `/salaries/${s.id}` });
    }
    const ouvertes = req.societesOuvertes;
    if (ouvertes === null || ouvertes.length > 1) for (const s of all('SELECT id, nom, ville FROM societes')) if ((ouvertes === null || ouvertes.includes(s.id)) && correspond(`${s.nom} ${s.ville}`)) resultats.push({ type: 'Société', titre: s.nom, detail: s.ville, url: `/societes/ouvrir/${s.id}` });
    // pages : seulement celles ouvertes au mode d'accès du compte
    const visibles = DESTINATIONS.filter(([, u]) => { const d = acces.droitRequis({ method: 'GET', path: u.split(/[?#]/)[0] }); return !d || acces.peut(req, d); });
    for (const [t, u, mc] of visibles) if (correspond(`${t} ${mc}`)) resultats.push({ type: 'Page', titre: t, url: u });
    res.json({ resultats: resultats.slice(0, 12) });
  });

  // ouverture directe d'une société depuis la recherche : un lien ne modifie rien, il mène à une confirmation
  app.get('/societes/ouvrir/:id', (req, res) => {
    const s = get('SELECT id, nom FROM societes WHERE id=?', Number(req.params.id));
    if (!s || !acces.accede(req.user, s.id)) return res.redirect('/societes');
    res.send(page(req, { titre: 'Ouvrir une société' }, carte('', `<form method="post" action="/societes/choisir" class="etat-vide"><input type="hidden" name="id" value="${s.id}"><p>Travailler sur <b>${e(s.nom)}</b> ?</p><button class="bouton" autofocus>Ouvrir le dossier</button></form>`)));
  });
};
