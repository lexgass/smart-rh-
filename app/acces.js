// Modes d'accès. Trois profils, une seule table des droits, vérifiée pour chaque requête avant d'atteindre l'écran.
// Deux niveaux d'administration : l'administrateur global (installation) et un administrateur par société.
//   admin       : administrateur global (deux au plus) : crée les sociétés et leur administrateur, sauvegardes, règles nationales
//   societe     : administrateur de société : sa société, ses règles, sa structure, ses comptes et les sorties de salariés
//   utilisateur : la saisie courante (salariés, congés, éléments variables, paie, dotations) dans les sociétés qui lui sont ouvertes
const { db, run, all, get } = require('./db');

db.exec('CREATE TABLE IF NOT EXISTS utilisateur_societes(utilisateur_id INTEGER, societe_id INTEGER, PRIMARY KEY(utilisateur_id, societe_id))');

const PROFILS = {
  admin: ['Administrateur global', 'Toute l\'installation : crée les sociétés et leur administrateur, gère les sauvegardes et les règles nationales. Deux comptes au plus, réservés à l\'administration.'],
  societe: ['Administrateur de société', 'Une seule société : crée et gère ses utilisateurs, ses règles, sa structure et les sorties de salariés.'],
  utilisateur: ['Utilisateur', 'La saisie courante dans les sociétés choisies : salariés, congés, éléments variables, paie, dotations. Ni règles, ni sorties, ni comptes.'],
};

const DROITS = {
  'societes.creer': ['admin'],
  'modele.modifier': ['admin'], // règles « Modèle Congo » et barèmes partagés des conventions
  sauvegardes: ['admin'],
  comptes: ['admin', 'societe'],
  journal: ['admin', 'societe'],
  regles: ['admin', 'societe'],
  'societe.infos': ['admin', 'societe'],
  convention: ['admin', 'societe'],
  structure: ['admin', 'societe'],
  sorties: ['admin', 'societe'],
  'donnees.personnelles': ['admin', 'societe'],
  modeles: ['admin', 'societe'], // modèles de documents (contrats, lettres) : création, modification, suppression
  'documents.supprimer': ['admin', 'societe'],
};
const peut = (req, droit) => Boolean(req.profil && DROITS[droit]?.includes(req.profil));

// [méthode, adresse, droit] ; une adresse absente de la liste demande seulement une session et l'accès à la société ouverte
const REGLES = [
  ['*', /^\/sauvegardes(\/|$)/, 'sauvegardes'],
  ['POST', /^\/societes$/, 'societes.creer'],
  ['*', /^\/utilisateurs(\/|$)/, 'comptes'],
  ['*', /^\/journal(\/|$)/, 'journal'],
  ['*', /^\/regles(\/|$)/, 'regles'],
  ['*', /^\/societe\/parametres$/, 'societe.infos'],
  ['POST', /^\/societe\/logo(\/|$)/, 'societe.infos'],
  ['POST', /^\/convention\/bareme\//, 'modele.modifier'],
  ['POST', /^\/convention\//, 'convention'],
  ['POST', /^\/structure\//, 'structure'],
  ['*', /^\/salaries\/\d+\/sortie$/, 'sorties'],
  ['*', /^\/salaries\/\d+\/donnees$/, 'donnees.personnelles'],
  ['GET', /^\/documents\/modeles\/(nouveau|\d+\/modifier)$/, 'modeles'],
  ['POST', /^\/documents\/modeles(\/|$)/, 'modeles'],
  ['POST', /^\/documents\/\d+\/supprimer$/, 'documents.supprimer'],
];
const droitRequis = (req) => REGLES.find(([m, motif]) => (m === '*' || m === req.method) && motif.test(req.path))?.[2] || null;

// sociétés ouvertes à un compte : null = toutes (admin)
function societesDe(u) {
  if (u.role === 'admin') return null;
  if (u.role === 'societe') return u.societe_id ? [u.societe_id] : [];
  return all('SELECT societe_id FROM utilisateur_societes WHERE utilisateur_id=? ORDER BY societe_id', u.id).map((x) => x.societe_id);
}
const accede = (u, societeId) => { const l = societesDe(u); return Boolean(societeId) && (l === null ? Boolean(get('SELECT id FROM societes WHERE id=?', societeId)) : l.includes(societeId)); };
function rattacher(utilisateurId, ids) {
  run('DELETE FROM utilisateur_societes WHERE utilisateur_id=?', utilisateurId);
  for (const id of new Set(ids)) run('INSERT INTO utilisateur_societes(utilisateur_id,societe_id) VALUES(?,?)', utilisateurId, id);
}
const listeSocietes = (u) => { const l = societesDe(u); return l === null ? all('SELECT * FROM societes ORDER BY nom') : l.length ? all(`SELECT * FROM societes WHERE id IN (${l.map(() => '?').join(',')}) ORDER BY nom`, ...l) : []; };

// anciens profils (avant les trois modes d'accès) : cabinet → admin, administrateur société → société, gestionnaire RH → utilisateur
// faite une seule fois (repère dans la table « reglages »), sinon un admin deviendrait « société » au démarrage suivant
function migrer() {
  db.exec('CREATE TABLE IF NOT EXISTS reglages(cle TEXT PRIMARY KEY, valeur TEXT)');
  if (get("SELECT valeur FROM reglages WHERE cle='modes_acces'")) return;
  const dejaNouveaux = get("SELECT COUNT(*) n FROM utilisateurs WHERE role IN ('societe','utilisateur')").n > 0;
  const anciens = get("SELECT COUNT(*) n FROM utilisateurs WHERE role IN ('cabinet','rh')").n > 0;
  db.exec('BEGIN');
  if (dejaNouveaux || !anciens) { run("INSERT INTO reglages(cle,valeur) VALUES('modes_acces', ?)", new Date().toISOString()); db.exec('COMMIT'); return; }
  try {
    for (const u of all("SELECT id, societe_id FROM utilisateurs WHERE role='rh'")) if (u.societe_id) run('INSERT OR IGNORE INTO utilisateur_societes(utilisateur_id,societe_id) VALUES(?,?)', u.id, u.societe_id);
    run("UPDATE utilisateurs SET role='utilisateur' WHERE role='rh'");
    run("UPDATE utilisateurs SET role='societe' WHERE role='admin'");
    run("UPDATE utilisateurs SET role='admin' WHERE role='cabinet'");
    run("INSERT INTO reglages(cle,valeur) VALUES('modes_acces', ?)", new Date().toISOString());
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
}

// base de démonstration : données fictives chargées par scripts/preparer-demo.js (affiché, ne change aucun droit)
const donneesFictives = () => Boolean(get("SELECT valeur FROM reglages WHERE cle='donnees_fictives'"));

module.exports = { donneesFictives, PROFILS, DROITS, REGLES, peut, droitRequis, societesDe, accede, rattacher, listeSocietes, migrer };
