// Évolutions du schéma (appliquées à chaque démarrage, sans perte de données) et référentiel des conventions collectives.
const { db, run, all, get } = require('./db');

const colonnes = (table) => all(`PRAGMA table_info(${table})`).map((c) => c.name);
const ajouterColonne = (table, def) => { if (!colonnes(table).includes(def.split(' ')[0])) db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`); };

// appliquée au démarrage et après une réinitialisation de la démonstration
function appliquer() {

db.exec(`
CREATE TABLE IF NOT EXISTS conventions(code TEXT PRIMARY KEY, nom TEXT, annee TEXT, reference TEXT);
-- barèmes d'une convention : type = essai | preavis (par niveau de catégorie), indemnite | conges (par années d'ancienneté)
CREATE TABLE IF NOT EXISTS convention_baremes(id INTEGER PRIMARY KEY, convention TEXT, type TEXT, borne_min REAL, borne_max REAL, valeur REAL, unite TEXT, libelle TEXT, source TEXT);
CREATE TABLE IF NOT EXISTS conges(id INTEGER PRIMARY KEY, salarie_id INTEGER, type TEXT, date_debut TEXT, date_fin TEXT, jours REAL, statut TEXT, motif TEXT, cree_le TEXT);
`);
ajouterColonne('parametres', 'convention TEXT');
ajouterColonne('societes', 'convention_code TEXT');
ajouterColonne('categories', 'niveau INTEGER');

// niveau de catégorie déduit du code (C5 -> 5) quand il n'est pas encore renseigné
for (const c of all('SELECT id, code FROM categories WHERE niveau IS NULL')) {
  const n = Number((c.code.match(/\d+/) || [])[0]);
  if (n) run('UPDATE categories SET niveau=? WHERE id=?', n, c.id);
}

const CONVENTIONS = [
  ['COMMERCE', 'Commerce', '2011', 'Convention collective du Commerce'],
  ['BTP', 'BTP', '1992', 'Convention collective du Bâtiment et des travaux publics'],
  ['BANQUES', 'Banques et assurances', '2011', 'Convention collective des Banques et assurances'],
  ['HOTELLERIE', 'Hôtellerie', '', 'Convention collective de l\'Hôtellerie et assimilés'],
  ['INDUSTRIE', 'Industrie', '', 'Convention collective de l\'Industrie'],
];
// [convention, code, libellé, valeur, unité, source]
const PARAMS = [
  ['COMMERCE', 'ANC_DEBUT_ANS', 'Ancienneté : années avant la prime', 2, 'ans', 'art. 41'],
  ['COMMERCE', 'ANC_TAUX_DEBUT', 'Ancienneté : taux de départ', 2, '%', 'art. 41'],
  ['COMMERCE', 'ANC_PAS', 'Ancienneté : points par année suivante', 1, '%', 'art. 41'],
  ['COMMERCE', 'ANC_PLAFOND', 'Ancienneté : taux maximal', 25, '%', 'art. 41'],
  ['COMMERCE', 'ANC_PALIER_ANS', 'Ancienneté : années ouvrant le palier final', 30, 'ans', 'art. 41'],
  ['COMMERCE', 'ANC_PALIER_TAUX', 'Ancienneté : taux du palier final', 30, '%', 'art. 41'],
  ['COMMERCE', 'IND_MIN_MOIS', 'Indemnité de licenciement : ancienneté minimale', 18, 'mois', 'art. 21'],
  ['BTP', 'ANC_DEBUT_ANS', 'Ancienneté : années avant la prime', 2, 'ans', 'art. 51'],
  ['BTP', 'ANC_TAUX_DEBUT', 'Ancienneté : taux de départ', 2, '%', 'art. 51'],
  ['BTP', 'ANC_PAS', 'Ancienneté : points par année suivante', 1, '%', 'art. 51'],
  ['BTP', 'ANC_PLAFOND', 'Ancienneté : taux maximal', 28, '%', 'art. 51'],
  ['BTP', 'IND_MIN_MOIS', 'Indemnité de licenciement : ancienneté minimale', 24, 'mois', 'art. 21'],
  ['BANQUES', 'ANC_DEBUT_ANS', 'Ancienneté : années avant la prime', 2, 'ans', 'art. 50'],
  ['BANQUES', 'ANC_TAUX_DEBUT', 'Ancienneté : taux de départ', 7, '%', 'art. 50'],
  ['BANQUES', 'ANC_PAS', 'Ancienneté : points par année suivante', 1, '%', 'art. 50'],
  ['BANQUES', 'ANC_SEUIL2', 'Ancienneté : années à partir desquelles le pas augmente', 15, 'ans', 'art. 50'],
  ['BANQUES', 'ANC_PAS2', 'Ancienneté : points par année au-delà du seuil', 2, '%', 'art. 50'],
  ['BANQUES', 'ANC_PLAFOND', 'Ancienneté : taux maximal (non fixé par le texte)', 100, '%', 'art. 50, plafond à vérifier'],
  ['BANQUES', 'IND_MIN_MOIS', 'Indemnité de licenciement : ancienneté minimale', 12, 'mois', 'art. 27'],
  ['BANQUES', 'IND_PLAFOND_MOIS', 'Indemnité de licenciement : plafond', 40, 'mois', 'art. 27'],
  ['HOTELLERIE', 'ANC_DEBUT_ANS', 'Ancienneté : années avant la prime', 2, 'ans', 'art. 55'],
  ['HOTELLERIE', 'ANC_TAUX_DEBUT', 'Ancienneté : taux de départ', 5, '%', 'art. 55'],
  ['HOTELLERIE', 'ANC_PAS', 'Ancienneté : points par année suivante', 1, '%', 'art. 55'],
  ['HOTELLERIE', 'ANC_PLAFOND', 'Ancienneté : taux maximal', 30, '%', 'art. 55'],
  ['INDUSTRIE', 'ANC_DEBUT_ANS', 'Ancienneté : années avant la prime', 3, 'ans', 'art. 40'],
  ['INDUSTRIE', 'ANC_TAUX_DEBUT', 'Ancienneté : taux de départ', 3, '%', 'art. 40'],
  ['INDUSTRIE', 'ANC_PAS', 'Ancienneté : points par année suivante', 1, '%', 'art. 40'],
  ['INDUSTRIE', 'ANC_PLAFOND', 'Ancienneté : taux maximal', 25, '%', 'art. 40'],
];
// [convention, type, borne_min, borne_max, valeur, unité, libellé, source] ; valeur null = à renseigner
const BAREMES = [
  ['COMMERCE', 'essai', 1, 4, 1, 'mois', 'Catégories 1 à 4', 'art. 15'],
  ['COMMERCE', 'essai', 5, 7, 2, 'mois', 'Catégories 5 à 7', 'art. 15'],
  ['COMMERCE', 'essai', 8, 99, 3, 'mois', 'Catégorie 8 et au-delà', 'art. 15'],
  ['COMMERCE', 'preavis', 1, 4, 1, 'mois', 'Catégories 1 à 4', 'art. 20'],
  ['COMMERCE', 'preavis', 5, 7, 2, 'mois', 'Catégories 5 à 7', 'art. 20'],
  ['COMMERCE', 'preavis', 8, 99, 3, 'mois', 'Catégorie 8 et au-delà', 'art. 20'],
  ['COMMERCE', 'indemnite', 0, 6, 30, '%', 'De la 1re à la 6e année', 'art. 21'],
  ['COMMERCE', 'indemnite', 6, 12, 38, '%', 'De la 7e à la 12e année', 'art. 21'],
  ['COMMERCE', 'indemnite', 12, 20, 44, '%', 'De la 13e à la 20e année', 'art. 21'],
  ['COMMERCE', 'indemnite', 20, 99, 50, '%', 'À partir de la 21e année', 'art. 21'],
  ['COMMERCE', 'conges', 3, 5, 3, 'jours', 'Après 3 ans', 'art. 35'],
  ['COMMERCE', 'conges', 5, 10, 5, 'jours', 'Après 5 ans', 'art. 35'],
  ['COMMERCE', 'conges', 10, 15, 6, 'jours', 'Après 10 ans', 'art. 35'],
  ['COMMERCE', 'conges', 15, 20, 8, 'jours', 'Après 15 ans', 'art. 35'],
  ['COMMERCE', 'conges', 20, 25, 9, 'jours', 'Après 20 ans', 'art. 35'],
  ['COMMERCE', 'conges', 25, 30, 10, 'jours', 'Après 25 ans', 'art. 35'],
  ['COMMERCE', 'conges', 30, 99, 15, 'jours', 'Après 30 ans', 'art. 35'],
  ['BTP', 'preavis', 1, 4, null, 'jours ouvrables', 'Ouvriers et employés (21, 35 ou 40 jours selon la catégorie)', 'art. 20, correspondance à renseigner'],
  ['BTP', 'preavis', 5, 99, 3, 'mois', 'Maîtrise et cadres', 'art. 20'],
  ['BTP', 'indemnite', 0, 5, 35, '%', 'De la 1re à la 5e année', 'art. 21'],
  ['BTP', 'indemnite', 5, 10, 40, '%', 'De la 6e à la 10e année', 'art. 21'],
  ['BTP', 'indemnite', 10, 99, 45, '%', 'Au-delà de la 10e année', 'art. 21'],
  ['BANQUES', 'preavis', 1, 4, 1, 'mois', 'Personnel de service et employés', 'art. 26, correspondance des classes à vérifier'],
  ['BANQUES', 'preavis', 5, 6, 2, 'mois', 'Gradés', 'art. 26, correspondance des classes à vérifier'],
  ['BANQUES', 'preavis', 7, 99, 3, 'mois', 'Cadres', 'art. 26, correspondance des classes à vérifier'],
  ['BANQUES', 'indemnite', 0, 3, 1.5, 'mois', 'De la 1re à la 3e année', 'art. 27'],
  ['BANQUES', 'indemnite', 3, 10, 2.5, 'mois', 'De la 4e à la 10e année', 'art. 27'],
  ['BANQUES', 'indemnite', 10, 15, 3.5, 'mois', 'De la 11e à la 15e année', 'art. 27'],
  ['BANQUES', 'indemnite', 15, 99, 4.5, 'mois', 'Au-delà de la 15e année', 'art. 27'],
  ['HOTELLERIE', 'essai', 1, 4, 1, 'mois', 'Ouvriers et employés', 'art. 17'],
  ['HOTELLERIE', 'essai', 5, 6, 2, 'mois', 'Agents de maîtrise', 'art. 17'],
  ['HOTELLERIE', 'essai', 7, 99, 3, 'mois', 'Cadres', 'art. 17'],
];

if (get('SELECT COUNT(*) n FROM conventions').n === 0) {
  for (const c of CONVENTIONS) run('INSERT INTO conventions(code,nom,annee,reference) VALUES(?,?,?,?)', ...c);
  for (const [conv, code, lib, val, unite, src] of PARAMS) run('INSERT INTO parametres(societe_id,convention,code,libelle,valeur,unite,date_debut,source) VALUES(NULL,?,?,?,?,?,?,?)', conv, code, lib, val, unite, '2011-01-01', `Convention ${CONVENTIONS.find((c) => c[0] === conv)[1]}, ${src}`);
  for (const b of BAREMES) run('INSERT INTO convention_baremes(convention,type,borne_min,borne_max,valeur,unite,libelle,source) VALUES(?,?,?,?,?,?,?,?)', ...b);
}
// éléments variables du mois (heures supplémentaires, primes ponctuelles) et sorties des salariés
db.exec(`
CREATE TABLE IF NOT EXISTS variables(id INTEGER PRIMARY KEY, salarie_id INTEGER, periode TEXT, type TEXT, quantite REAL, montant REAL, libelle TEXT);
CREATE TABLE IF NOT EXISTS sorties(id INTEGER PRIMARY KEY, salarie_id INTEGER, motif TEXT, date_notification TEXT, date_sortie TEXT, preavis TEXT, detail TEXT, total REAL, cree_le TEXT);
`);
// majorations des heures supplémentaires : décret n°78/360 du 12 mai 1978, art. 20 (reprises par la convention du Commerce, art. 32)
for (const [code, lib, val, unite] of [
  ['HS_MAJ_1', 'Heures supplémentaires de la 41e à la 45e heure', 10, '%'],
  ['HS_MAJ_2', 'Heures supplémentaires à partir de la 46e heure', 25, '%'],
  ['HS_MAJ_NUIT', 'Heures supplémentaires de nuit (20 h à 5 h)', 50, '%'],
  ['HS_MAJ_REPOS', 'Heures supplémentaires le jour de repos ou un jour férié', 50, '%'],
  ['HS_MAJ_NUIT_REPOS', 'Heures supplémentaires de nuit un jour de repos ou férié', 100, '%'],
  ['HS_MAX_SEMAINE', 'Heures supplémentaires : maximum par semaine', 20, 'h'],
]) if (!get('SELECT id FROM parametres WHERE code=?', code)) run('INSERT INTO parametres(societe_id,code,libelle,valeur,unite,date_debut,source) VALUES(NULL,?,?,?,?,?,?)', code, lib, val, unite, '1978-05-12', 'Décret n°78/360, art. 20');

// répartition du recouvrement de la taxe unique sur les salaires depuis la loi de finances 2026
for (const [code, lib, val] of [['TUS_PART_CNSS', 'Taxe unique : part recouvrée par la CNSS', 5.475], ['TUS_PART_DGI', 'Taxe unique : part recouvrée par la DGI', 2.025]]) {
  if (!get('SELECT id FROM parametres WHERE code=?', code)) run('INSERT INTO parametres(societe_id,code,libelle,valeur,unite,date_debut,source) VALUES(NULL,?,?,?,?,?,?)', code, lib, val, '%', '2026-01-01', 'Loi n°42-2025 (loi de finances 2026), à confirmer');
}

// rattache chaque société à sa convention à partir du nom saisi
for (const s of all('SELECT id, convention FROM societes WHERE convention_code IS NULL')) {
  const c = get('SELECT code FROM conventions WHERE nom=?', s.convention);
  run('UPDATE societes SET convention_code=? WHERE id=?', c ? c.code : 'COMMERCE', s.id);
}

// index : chaque écran filtre par société, salarié ou période ; sans index, SQLite parcourt toute la table
db.exec(`
CREATE INDEX IF NOT EXISTS ix_departements_soc ON departements(societe_id);
CREATE INDEX IF NOT EXISTS ix_categories_soc ON categories(societe_id);
CREATE INDEX IF NOT EXISTS ix_postes_soc ON postes(societe_id);
CREATE INDEX IF NOT EXISTS ix_parametres_code ON parametres(code, date_debut);
CREATE INDEX IF NOT EXISTS ix_rubriques_soc ON rubriques(societe_id, ordre);
CREATE INDEX IF NOT EXISTS ix_salaries_soc ON salaries(societe_id, statut);
CREATE INDEX IF NOT EXISTS ix_contrats_sal ON contrats(salarie_id, date_debut);
CREATE INDEX IF NOT EXISTS ix_evenements_sal ON evenements(salarie_id, date);
CREATE INDEX IF NOT EXISTS ix_materiels_soc ON materiels(societe_id);
CREATE INDEX IF NOT EXISTS ix_dotations_sal ON dotations(salarie_id);
CREATE INDEX IF NOT EXISTS ix_dotations_mat ON dotations(materiel_id, date_retour);
CREATE UNIQUE INDEX IF NOT EXISTS ix_bulletins_sal_per ON bulletins(salarie_id, periode);
CREATE INDEX IF NOT EXISTS ix_bulletins_per ON bulletins(periode);
CREATE INDEX IF NOT EXISTS ix_lignes_bul ON bulletin_lignes(bulletin_id, ordre);
CREATE INDEX IF NOT EXISTS ix_conges_sal ON conges(salarie_id, date_debut);
CREATE INDEX IF NOT EXISTS ix_variables_sal_per ON variables(salarie_id, periode);
CREATE INDEX IF NOT EXISTS ix_sorties_sal ON sorties(salarie_id);
CREATE INDEX IF NOT EXISTS ix_baremes_conv ON convention_baremes(convention, type);
`);

}
appliquer();

// absences fictives de la démonstration : appelées seulement par scripts/preparer-demo.js
function absencesFictives() {
  const sal = (nom) => get('SELECT id FROM salaries WHERE nom=?', nom);
  const demo = [
    ['Mabiala', 'conge_paye', '2026-10-12', '2026-10-24', 'valide', 'Congé annuel'],
    ['Ibara', 'conge_paye', '2026-11-02', '2026-11-14', 'demande', 'Congé annuel'],
    ['Nkounkou', 'permission', '2026-10-08', '2026-10-08', 'valide', 'Mariage d\'un enfant'],
    ['Samba', 'sans_solde', '2026-10-05', '2026-10-06', 'valide', 'Convenance personnelle'],
    ['Loemba', 'maladie', '2026-10-19', '2026-10-21', 'demande', 'Arrêt maladie'],
  ];
  const { joursOuvrables } = require('./calendrier');
  for (const [nom, type, d1, d2, statut, motif] of demo) {
    const s = sal(nom);
    if (s) run('INSERT INTO conges(salarie_id,type,date_debut,date_fin,jours,statut,motif,cree_le) VALUES(?,?,?,?,?,?,?,?)', s.id, type, d1, d2, joursOuvrables(d1, d2), statut, motif, '2026-10-01');
  }
}

module.exports = { appliquer, absencesFictives };
