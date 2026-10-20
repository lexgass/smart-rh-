// Base de données locale (SQLite intégré à Node) : schéma et données de démonstration.
const { DatabaseSync } = require('node:sqlite');

const config = require('./config');

const db = new DatabaseSync(config.base);
// WAL : les lectures continuent pendant une écriture ; busy_timeout : attente au lieu d'une erreur si un autre processus écrit
db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS societes(id INTEGER PRIMARY KEY, nom TEXT, ville TEXT, convention TEXT, niu TEXT, rccm TEXT, cnss_employeur TEXT);
CREATE TABLE IF NOT EXISTS departements(id INTEGER PRIMARY KEY, societe_id INTEGER, nom TEXT);
CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY, societe_id INTEGER, code TEXT, libelle TEXT, salaire_min REAL);
CREATE TABLE IF NOT EXISTS postes(id INTEGER PRIMARY KEY, societe_id INTEGER, departement_id INTEGER, categorie_id INTEGER, intitule TEXT);
-- societe_id NULL = modèle pays ; une ligne de société prime sur le modèle
CREATE TABLE IF NOT EXISTS parametres(id INTEGER PRIMARY KEY, societe_id INTEGER, code TEXT, libelle TEXT, valeur REAL, unite TEXT, date_debut TEXT, source TEXT);
CREATE TABLE IF NOT EXISTS tranches_its(id INTEGER PRIMARY KEY, date_debut TEXT, borne_sup REAL, taux REAL, forfait REAL);
CREATE TABLE IF NOT EXISTS rubriques(id INTEGER PRIMARY KEY, societe_id INTEGER, code TEXT, libelle TEXT, sens TEXT, mode TEXT, assiette TEXT,
  taux_param TEXT, plafond_param TEXT, seuil_param TEXT, montant_param TEXT, cotisable INTEGER, imposable INTEGER, ordre INTEGER, actif INTEGER);
CREATE TABLE IF NOT EXISTS salaries(id INTEGER PRIMARY KEY, societe_id INTEGER, matricule TEXT, nom TEXT, prenom TEXT, sexe TEXT, date_naissance TEXT,
  situation TEXT, enfants INTEGER, num_cnss TEXT, telephone TEXT, poste_id INTEGER, date_embauche TEXT, statut TEXT);
CREATE TABLE IF NOT EXISTS contrats(id INTEGER PRIMARY KEY, salarie_id INTEGER, type TEXT, date_debut TEXT, date_fin TEXT, fin_essai TEXT,
  salaire_base REAL, sursalaire REAL, prime_transport REAL);
CREATE TABLE IF NOT EXISTS evenements(id INTEGER PRIMARY KEY, salarie_id INTEGER, date TEXT, type TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS materiels(id INTEGER PRIMARY KEY, societe_id INTEGER, designation TEXT, reference TEXT, valeur REAL, stock INTEGER);
CREATE TABLE IF NOT EXISTS dotations(id INTEGER PRIMARY KEY, salarie_id INTEGER, materiel_id INTEGER, date_remise TEXT, quantite INTEGER, etat TEXT, date_retour TEXT);
CREATE TABLE IF NOT EXISTS bulletins(id INTEGER PRIMARY KEY, salarie_id INTEGER, periode TEXT, brut REAL, cotisable REAL, imposable REAL, retenues REAL, net REAL, patronal REAL, parts REAL, calcule_le TEXT);
CREATE TABLE IF NOT EXISTS bulletin_lignes(id INTEGER PRIMARY KEY, bulletin_id INTEGER, code TEXT, libelle TEXT, sens TEXT, base REAL, taux REAL, montant REAL, ordre INTEGER);
`);

// requêtes préparées une seule fois puis réutilisées
const cache = new Map();
const prep = (sql) => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); if (cache.size < 2000) cache.set(sql, s); } return s; };
const run = (sql, ...p) => prep(sql).run(...p);
const all = (sql, ...p) => prep(sql).all(...p);
const get = (sql, ...p) => prep(sql).get(...p);
// plusieurs écritures d'un bloc : tout ou rien, et une seule écriture disque
let enCours = false;
function transaction(fn) {
  if (enCours) return fn();
  db.exec('BEGIN IMMEDIATE'); enCours = true;
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (err) { db.exec('ROLLBACK'); throw err; } finally { enCours = false; }
}

// Modèle « Congo 2026 » : valeurs indicatives, à valider par l'expert-comptable.
const MODELE_PARAMS = [
  ['SMIG', 'SMIG mensuel', 50400, 'FCFA', '2009-01-01', 'Décret 2008-942'],
  ['SMIG', 'SMIG mensuel', 70400, 'FCFA', '2025-01-01', 'Décret de 2024 (publication à confirmer)'],
  ['HEURES_MOIS', 'Heures mensuelles de référence', 173.33, 'h', '1975-03-15', 'Code du travail, 40 h par semaine'],
  ['CNSS_RET_SAL', 'Retraite CNSS, part salarié', 4, '%', '2023-01-01', 'Barème CNSS'],
  ['CNSS_RET_PAT', 'Retraite CNSS, part employeur', 8, '%', '2023-01-01', 'Barème CNSS'],
  ['CNSS_PLAF_RET', 'Plafond retraite CNSS', 1200000, 'FCFA', '2023-01-01', 'Décret 1999-284'],
  ['CNSS_PF', 'Prestations familiales, employeur', 10.03, '%', '2023-01-01', 'Barème CNSS'],
  ['CNSS_AT', 'Accidents du travail, employeur', 2.25, '%', '2023-01-01', 'Barème CNSS'],
  ['CNSS_PLAF_PF', 'Plafond prestations familiales et accidents', 600000, 'FCFA', '2023-01-01', 'Décret 1999-284'],
  ['CAMU_SAL', 'Assurance maladie CAMU, part salarié', 2.27, '%', '2023-01-01', 'Barème CAMU'],
  ['CAMU_PAT', 'Assurance maladie CAMU, part employeur', 4.55, '%', '2023-01-01', 'Barème CAMU'],
  ['CAMU_PLAF', 'Plafond CAMU', 600000, 'FCFA', '2023-01-01', 'Barème CAMU'],
  ['CAMU_SOL_TAUX', 'Contribution de solidarité CAMU', 0.5, '%', '2023-01-01', 'À confirmer'],
  ['CAMU_SOL_SEUIL', 'Seuil de la contribution de solidarité', 500000, 'FCFA', '2023-01-01', 'À confirmer'],
  ['TOL', 'Taxe d\'occupation des locaux', 1000, 'FCFA', '2023-01-01', 'À confirmer'],
  ['TUS_TAUX', 'Taxe unique sur les salaires', 7.5, '%', '2012-01-01', 'Loi 36-2011, art. 6'],
  ['ITS_ABATTEMENT', 'ITS : abattement forfaitaire', 20, '%', '2026-01-01', 'CGI art. 116 (à confirmer)'],
  ['ITS_QUOTIENT', 'ITS : quotient familial (1 = oui, 0 = non)', 1, '', '2026-01-01', 'CGI art. 116 A et B (à confirmer)'],
  ['ITS_PARTS_MAX', 'ITS : nombre maximal de parts', 6.5, 'parts', '2026-01-01', 'CGI art. 116 B'],
  ['ANC_DEBUT_ANS', 'Ancienneté : années avant la prime', 2, 'ans', '2011-01-01', 'Convention du Commerce, art. 41'],
  ['ANC_TAUX_DEBUT', 'Ancienneté : taux de départ', 2, '%', '2011-01-01', 'Convention du Commerce, art. 41'],
  ['ANC_PAS', 'Ancienneté : points par année suivante', 1, '%', '2011-01-01', 'Convention du Commerce, art. 41'],
  ['ANC_PLAFOND', 'Ancienneté : taux maximal', 25, '%', '2011-01-01', 'Convention du Commerce, art. 41'],
  ['CONGES_AN', 'Congés payés par an', 26, 'jours', '1975-03-15', 'Code du travail, art. 119'],
];
// [borne supérieure annuelle par part, taux %, forfait]
const MODELE_ITS = [[615000, 0, 1200], [1500000, 10, 0], [3500000, 15, 0], [5000000, 20, 0], [null, 30, 0]];
// [code, libellé, sens, mode, assiette, taux, plafond, seuil, montant, cotisable, imposable, ordre]
const MODELE_RUBRIQUES = [
  ['SALBASE', 'Salaire de base', 'gain', 'contrat', 'salaire_base', null, null, null, null, 1, 1, 10],
  ['SURSAL', 'Sursalaire', 'gain', 'contrat', 'sursalaire', null, null, null, null, 1, 1, 20],
  ['ANCIEN', 'Prime d\'ancienneté', 'gain', 'anciennete', 'salaire_base', null, null, null, null, 1, 1, 30],
  ['TRANSP', 'Indemnité de transport', 'gain', 'contrat', 'prime_transport', null, null, null, null, 0, 0, 40],
  ['CNSS_SAL', 'Retraite CNSS', 'retenue', 'taux', 'COTISABLE', 'CNSS_RET_SAL', 'CNSS_PLAF_RET', null, null, 0, 0, 100],
  ['CAMU_SAL', 'Assurance maladie CAMU', 'retenue', 'taux', 'COTISABLE', 'CAMU_SAL', 'CAMU_PLAF', null, null, 0, 0, 110],
  ['CAMU_SOL', 'Contribution de solidarité CAMU', 'retenue', 'taux', 'IMPOSABLE_NET', 'CAMU_SOL_TAUX', null, 'CAMU_SOL_SEUIL', null, 0, 0, 120],
  ['TOL', 'Taxe d\'occupation des locaux', 'retenue', 'fixe', null, null, null, null, 'TOL', 0, 0, 130],
  ['ITS', 'Impôt sur les traitements et salaires', 'retenue', 'its', 'IMPOSABLE_NET', null, null, null, null, 0, 0, 140],
  ['CNSS_PAT', 'Retraite CNSS', 'patronale', 'taux', 'COTISABLE', 'CNSS_RET_PAT', 'CNSS_PLAF_RET', null, null, 0, 0, 200],
  ['CNSS_PF', 'Prestations familiales', 'patronale', 'taux', 'COTISABLE', 'CNSS_PF', 'CNSS_PLAF_PF', null, null, 0, 0, 210],
  ['CNSS_AT', 'Accidents du travail', 'patronale', 'taux', 'COTISABLE', 'CNSS_AT', 'CNSS_PLAF_PF', null, null, 0, 0, 220],
  ['CAMU_PAT', 'Assurance maladie CAMU', 'patronale', 'taux', 'COTISABLE', 'CAMU_PAT', 'CAMU_PLAF', null, null, 0, 0, 230],
  ['TUS', 'Taxe unique sur les salaires', 'patronale', 'taux', 'BRUT', 'TUS_TAUX', null, null, null, 0, 0, 240],
];

function creerSociete(s) {
  const id = run('INSERT INTO societes(nom,ville,convention,niu,rccm,cnss_employeur) VALUES(?,?,?,?,?,?)',
    s.nom, s.ville, s.convention, s.niu || '', s.rccm || '', s.cnss_employeur || '').lastInsertRowid;
  // chaque société reçoit sa propre copie des rubriques du modèle, qu'elle peut ensuite modifier
  for (const r of MODELE_RUBRIQUES) {
    run('INSERT INTO rubriques(societe_id,code,libelle,sens,mode,assiette,taux_param,plafond_param,seuil_param,montant_param,cotisable,imposable,ordre,actif) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1)', id, ...r);
  }
  return Number(id);
}

// Référentiel légal, chargé dans toute base neuve.
function initialiser() {
  if (get('SELECT COUNT(*) n FROM parametres').n > 0) return;
  for (const p of MODELE_PARAMS) run('INSERT INTO parametres(societe_id,code,libelle,valeur,unite,date_debut,source) VALUES(NULL,?,?,?,?,?,?)', ...p);
  for (const t of MODELE_ITS) run('INSERT INTO tranches_its(date_debut,borne_sup,taux,forfait) VALUES(?,?,?,?)', '2026-01-01', ...t);
}

// Données fictives de démonstration (deux sociétés et leurs salariés) : chargées seulement par scripts/preparer-demo.js.
function donneesFictives() {
  const demo = [
    { nom: 'Exemple SARL', ville: 'Brazzaville', convention: 'Commerce', niu: 'M2026000000001', rccm: 'CG-BZV-01-2019-B12-00001', cnss_employeur: '0100001' },
    { nom: 'Kouilou Services SA', ville: 'Pointe-Noire', convention: 'Commerce', niu: 'M2026000000002', rccm: 'CG-PNR-01-2021-B14-00002', cnss_employeur: '0200002' },
  ];
  const gens = [
    [['Mabiala', 'Grâce', 'F', '1990-04-12', 'Mariée', 2, 'Comptable', 'Finance', 'C5', 450000, 50000, 25000, 'CDI', '2019-03-01', null, null],
     ['Nkounkou', 'Arsène', 'M', '1985-09-30', 'Marié', 3, 'Responsable commercial', 'Commercial', 'C7', 900000, 150000, 25000, 'CDI', '2016-01-15', null, null],
     ['Loemba', 'Prisca', 'F', '1997-11-05', 'Célibataire', 0, 'Assistante administrative', 'Administration', 'C3', 180000, 0, 25000, 'CDI', '2026-08-17', null, '2026-11-17'],
     ['Samba', 'Junior', 'M', '1999-02-21', 'Célibataire', 1, 'Vendeur', 'Commercial', 'C2', 110000, 0, 25000, 'CDD', '2025-12-01', '2026-11-30', null],
     ['Ibara', 'Chancel', 'M', '1992-07-08', 'Marié', 1, 'Magasinier', 'Logistique', 'C3', 160000, 20000, 25000, 'CDI', '2022-06-01', null, null],
     ['Moukoko', 'Brice', 'M', '1996-05-09', 'Célibataire', 0, 'Agent d\'accueil', 'Administration', 'C2', 90000, 0, 25000, 'CDD', '2026-04-27', '2026-10-24', null]],
    [['Tchicaya', 'Merveille', 'F', '1988-01-19', 'Mariée', 4, 'Directrice d\'agence', 'Direction', 'C8', 1400000, 200000, 25000, 'CDI', '2021-05-03', null, null],
     ['Goma', 'Destin', 'M', '1995-06-14', 'Célibataire', 0, 'Technicien de maintenance', 'Technique', 'C4', 260000, 30000, 25000, 'CDI', '2023-09-11', null, null],
     ['Pambou', 'Ruth', 'F', '2000-10-02', 'Célibataire', 0, 'Agent d\'accueil', 'Administration', 'C2', 95000, 0, 25000, 'CDD', '2026-05-04', '2026-11-03', null]],
  ];
  const cats = [['C2', 'Employé qualifié', 80000], ['C3', 'Employé hautement qualifié', 120000], ['C4', 'Technicien', 180000], ['C5', 'Agent de maîtrise', 300000], ['C7', 'Cadre', 600000], ['C8', 'Cadre supérieur', 900000]];
  const mats = [['Ordinateur portable', 'PC-14', 450000, 6], ['Téléphone professionnel', 'TEL-A', 120000, 10], ['Casque de sécurité', 'EPI-01', 15000, 25], ['Badge d\'accès', 'BDG', 3000, 50], ['Chaussures de sécurité', 'EPI-02', 35000, 20]];

  demo.forEach((s, i) => {
    const sid = creerSociete(s);
    const catId = {}, depId = {};
    for (const c of cats) catId[c[0]] = run('INSERT INTO categories(societe_id,code,libelle,salaire_min,niveau) VALUES(?,?,?,?,?)', sid, ...c, Number(c[0].slice(1))).lastInsertRowid;
    for (const m of mats) run('INSERT INTO materiels(societe_id,designation,reference,valeur,stock) VALUES(?,?,?,?,?)', sid, ...m);
    gens[i].forEach((g, k) => {
      const [nom, prenom, sexe, naiss, situ, enf, poste, dep, cat, base, sur, transp, type, debut, fin, essai] = g;
      depId[dep] ??= run('INSERT INTO departements(societe_id,nom) VALUES(?,?)', sid, dep).lastInsertRowid;
      const pid = run('INSERT INTO postes(societe_id,departement_id,categorie_id,intitule) VALUES(?,?,?,?)', sid, depId[dep], catId[cat], poste).lastInsertRowid;
      const mat = `${s.nom.slice(0, 2).toUpperCase()}-${String(k + 1).padStart(3, '0')}`;
      const eid = run('INSERT INTO salaries(societe_id,matricule,nom,prenom,sexe,date_naissance,situation,enfants,num_cnss,telephone,poste_id,date_embauche,statut) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        sid, mat, nom, prenom, sexe, naiss, situ, enf, `19${k}${i}45${k}7${i}`, `06 5${k}0 00 0${i}`, pid, debut, 'Actif').lastInsertRowid;
      run('INSERT INTO contrats(salarie_id,type,date_debut,date_fin,fin_essai,salaire_base,sursalaire,prime_transport) VALUES(?,?,?,?,?,?,?,?)', eid, type, debut, fin, essai, base, sur, transp);
      run('INSERT INTO evenements(salarie_id,date,type,detail) VALUES(?,?,?,?)', eid, debut, 'Embauche', `${type} — ${poste}`);
    });
  });
}
initialiser();

module.exports = { db, run, all, get, transaction, creerSociete, initialiser, donneesFictives, config };
