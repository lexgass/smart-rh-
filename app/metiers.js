// Référentiel des métiers : chaque métier est rattaché à une plage de niveaux de catégorie (indicative, ajustable).
// Quand on choisit un métier, seules les catégories de la société dont le niveau est dans cette plage sont proposées.
// Les niveaux suivent l'échelle habituelle des conventions collectives congolaises :
//   1-2 manœuvres et employés débutants · 3-5 ouvriers et employés qualifiés · 5-7 techniciens et agents de maîtrise · 8-10 cadres
const { db, run, all, get } = require('./db');

db.exec('CREATE TABLE IF NOT EXISTS metiers(id INTEGER PRIMARY KEY, societe_id INTEGER, famille TEXT, libelle TEXT, niveau_min INTEGER, niveau_max INTEGER)');
db.exec('CREATE INDEX IF NOT EXISTS ix_metiers_soc ON metiers(societe_id, famille)');
if (!all('PRAGMA table_info(postes)').some((c) => c.name === 'metier_id')) db.exec('ALTER TABLE postes ADD COLUMN metier_id INTEGER');

// [famille, [libellé, niveau min, niveau max], ...]
const REFERENTIEL = [
  ['Direction', [['Directeur général', 9, 12], ['Directeur administratif et financier', 9, 12], ['Directeur des ressources humaines', 9, 12], ['Directeur commercial', 9, 12], ['Directeur technique', 9, 12], ['Directeur d\'agence', 8, 11], ['Directeur des opérations', 9, 12]]],
  ['Administration et ressources humaines', [['Assistant de direction', 4, 7], ['Secrétaire', 3, 5], ['Assistant administratif', 3, 5], ['Agent administratif', 2, 4], ['Réceptionniste', 2, 4], ['Standardiste', 2, 3], ['Chargé des ressources humaines', 6, 8], ['Responsable des ressources humaines', 8, 10], ['Gestionnaire de paie', 5, 7], ['Assistant ressources humaines', 4, 6], ['Juriste', 7, 9], ['Archiviste', 3, 5], ['Coursier', 1, 2]]],
  ['Comptabilité et finance', [['Aide-comptable', 3, 5], ['Comptable', 5, 7], ['Chef comptable', 7, 9], ['Responsable administratif et financier', 8, 10], ['Contrôleur de gestion', 7, 9], ['Trésorier', 6, 8], ['Caissier principal', 4, 6], ['Auditeur interne', 7, 9], ['Agent de recouvrement', 3, 5]]],
  ['Commerce et vente', [['Vendeur', 2, 4], ['Caissier', 2, 4], ['Chef de rayon', 4, 6], ['Responsable de magasin', 6, 8], ['Commercial terrain', 4, 6], ['Chargé de clientèle', 4, 6], ['Responsable commercial', 7, 9], ['Délégué commercial', 5, 7], ['Télévendeur', 3, 4], ['Marchandiseur', 2, 4], ['Chargé du marketing', 6, 8]]],
  ['Logistique et transport', [['Magasinier', 2, 4], ['Gestionnaire de stock', 4, 6], ['Responsable logistique', 7, 9], ['Chauffeur léger', 2, 4], ['Chauffeur poids lourd', 3, 5], ['Chauffeur de direction', 3, 5], ['Livreur', 2, 3], ['Cariste', 2, 4], ['Manutentionnaire', 1, 2], ['Agent de transit', 4, 6], ['Déclarant en douane', 4, 6], ['Dispatcheur', 3, 5]]],
  ['Bâtiment et travaux publics', [['Manœuvre', 1, 2], ['Maçon', 2, 5], ['Coffreur', 2, 5], ['Ferrailleur', 2, 5], ['Charpentier', 3, 5], ['Plombier', 3, 5], ['Électricien bâtiment', 3, 5], ['Peintre', 2, 4], ['Carreleur', 2, 4], ['Conducteur d\'engins', 4, 6], ['Chef d\'équipe', 5, 6], ['Chef de chantier', 6, 8], ['Conducteur de travaux', 7, 9], ['Topographe', 5, 7], ['Ingénieur génie civil', 8, 10], ['Dessinateur-projeteur', 5, 7]]],
  ['Industrie et maintenance', [['Ouvrier de production', 1, 3], ['Opérateur de machine', 2, 4], ['Conducteur de ligne', 3, 5], ['Mécanicien', 3, 6], ['Électromécanicien', 4, 6], ['Électricien industriel', 4, 6], ['Soudeur', 3, 5], ['Technicien de maintenance', 5, 7], ['Chef d\'atelier', 6, 8], ['Responsable de production', 7, 9], ['Contrôleur qualité', 5, 7], ['Responsable qualité, hygiène, sécurité et environnement', 7, 9], ['Ingénieur de production', 8, 10]]],
  ['Pétrole, mines et énergie', [['Opérateur de production pétrolière', 4, 6], ['Technicien instrumentiste', 5, 7], ['Technicien de forage', 5, 7], ['Superviseur de site', 7, 9], ['Ingénieur réservoir', 9, 11], ['Agent de sécurité industrielle', 4, 6], ['Mineur', 2, 4], ['Géologue', 8, 10]]],
  ['Hôtellerie et restauration', [['Femme ou valet de chambre', 1, 3], ['Gouvernante', 4, 6], ['Réceptionniste d\'hôtel', 3, 5], ['Concierge', 3, 5], ['Serveur', 2, 4], ['Barman', 2, 4], ['Commis de cuisine', 1, 3], ['Cuisinier', 3, 5], ['Chef de cuisine', 6, 8], ['Maître d\'hôtel', 5, 7], ['Plongeur', 1, 2], ['Directeur d\'hôtel', 9, 11]]],
  ['Banque et assurance', [['Guichetier', 3, 5], ['Chargé de clientèle bancaire', 5, 7], ['Conseiller financier', 6, 8], ['Analyste crédit', 6, 8], ['Gestionnaire de portefeuille', 7, 9], ['Chef d\'agence bancaire', 8, 10], ['Agent de microfinance', 4, 6], ['Gestionnaire de sinistres', 5, 7], ['Souscripteur en assurance', 6, 8], ['Agent général d\'assurance', 6, 8], ['Responsable de la conformité', 8, 10]]],
  ['Informatique et télécommunications', [['Technicien informatique', 4, 6], ['Technicien réseau', 5, 7], ['Administrateur systèmes et réseaux', 7, 9], ['Développeur', 6, 9], ['Chef de projet informatique', 8, 10], ['Responsable informatique', 8, 10], ['Technicien télécoms', 5, 7], ['Agent de centre d\'appels', 2, 4]]],
  ['Santé et social', [['Médecin', 9, 11], ['Infirmier', 5, 7], ['Aide-soignant', 3, 4], ['Sage-femme', 6, 8], ['Pharmacien', 9, 11], ['Préparateur en pharmacie', 4, 6], ['Technicien de laboratoire', 5, 7], ['Assistant social', 5, 7]]],
  ['Enseignement et formation', [['Enseignant', 6, 8], ['Formateur', 6, 8], ['Surveillant', 3, 4], ['Responsable pédagogique', 8, 10]]],
  ['Sécurité et services généraux', [['Agent de sécurité', 1, 3], ['Gardien', 1, 2], ['Chef de poste de sécurité', 3, 5], ['Agent d\'entretien', 1, 2], ['Jardinier', 1, 2], ['Agent de nettoyage', 1, 2], ['Responsable des services généraux', 6, 8], ['Planton', 1, 2]]],
  ['Agriculture, élevage et forêt', [['Ouvrier agricole', 1, 2], ['Conducteur de tracteur', 2, 4], ['Technicien agricole', 5, 7], ['Chef d\'exploitation', 7, 9], ['Abatteur', 2, 4], ['Scieur', 2, 4], ['Ingénieur des eaux et forêts', 8, 10]]],
];

function charger() {
  if (get('SELECT COUNT(*) n FROM metiers WHERE societe_id IS NULL').n) return;
  for (const [famille, liste] of REFERENTIEL) for (const [libelle, mn, mx] of liste) run('INSERT INTO metiers(societe_id,famille,libelle,niveau_min,niveau_max) VALUES(NULL,?,?,?,?)', famille, libelle, mn, mx);
}
charger();

// métiers proposés à une société : le référentiel puis les métiers qu'elle a ajoutés
const liste = (societeId) => all('SELECT * FROM metiers WHERE societe_id IS NULL OR societe_id=? ORDER BY famille, libelle', societeId);
const metier = (societeId, id) => get('SELECT * FROM metiers WHERE id=? AND (societe_id IS NULL OR societe_id=?)', Number(id), societeId);

// catégories de la société correspondant au métier ; à défaut (aucune dans la plage), toutes, avec l'indication « hors plage »
function categoriesPour(societeId, m) {
  const cats = all('SELECT id, code, libelle, salaire_min, niveau FROM categories WHERE societe_id=? ORDER BY niveau, code', societeId);
  if (!m) return { categories: cats, horsPlage: false };
  const dedans = cats.filter((c) => (c.niveau || 1) >= m.niveau_min && (c.niveau || 1) <= m.niveau_max);
  return dedans.length ? { categories: dedans, horsPlage: false } : { categories: cats, horsPlage: true };
}

// liste déroulante des métiers, regroupés par famille
function options(societeId, choisi) {
  const groupes = new Map();
  for (const m of liste(societeId)) { if (!groupes.has(m.famille)) groupes.set(m.famille, []); groupes.get(m.famille).push(m); }
  const e = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return [...groupes].map(([f, ms]) => `<optgroup label="${e(f)}">${ms.map((m) => `<option value="${m.id}" data-min="${m.niveau_min}" data-max="${m.niveau_max}"${String(m.id) === String(choisi) ? ' selected' : ''}>${e(m.libelle)}</option>`).join('')}</optgroup>`).join('');
}

function routes(app) {
  // catégories proposées pour un métier (appelé par le formulaire quand on choisit le métier)
  app.get('/metiers/categories', (req, res) => {
    const m = metier(req.societe.id, req.query.metier);
    const r = categoriesPour(req.societe.id, m);
    // la période d'essai proposée dépend du niveau de la catégorie (convention collective de la société)
    const droits = require('./droits');
    const categories = r.categories.map((c) => ({ ...c, essai: droits.essai(req.societe.id, c.niveau || 1).mois }));
    res.json({ metier: m ? { libelle: m.libelle, niveau_min: m.niveau_min, niveau_max: m.niveau_max } : null, horsPlage: r.horsPlage, categories });
  });
  // métier propre à la société, absent du référentiel
  app.post('/structure/metier', (req, res) => {
    const libelle = String(req.body.libelle || '').trim().slice(0, 120), famille = String(req.body.famille || '').trim().slice(0, 80) || 'Métiers de la société';
    const mn = Math.max(1, Math.min(20, Number(req.body.niveau_min) || 1)), mx = Math.max(mn, Math.min(20, Number(req.body.niveau_max) || mn));
    if (libelle && !get('SELECT id FROM metiers WHERE (societe_id IS NULL OR societe_id=?) AND lower(libelle)=lower(?)', req.societe.id, libelle)) run('INSERT INTO metiers(societe_id,famille,libelle,niveau_min,niveau_max) VALUES(?,?,?,?,?)', req.societe.id, famille, libelle, mn, mx);
    res.redirect('/structure#metiers');
  });
}

module.exports = { REFERENTIEL, liste, metier, categoriesPour, options, routes };
