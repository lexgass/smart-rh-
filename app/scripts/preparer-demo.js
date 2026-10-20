// Prépare la base de démonstration : une installation de production ordinaire, remplie de sociétés et de salariés fictifs.
// Aucun raccourci : les comptes ont de vrais mots de passe et se connectent par l'écran de connexion, comme en production.
//
// Usage : npm run demo:preparer                       mots de passe générés
//         npm run demo:preparer -- --mot-de-passe "phrase de démonstration"   même mot de passe pour tous les comptes
//         npm run demo:preparer -- --remplacer        repart d'une base neuve (arrêter Smart RH d'abord : pm2 stop smart-rh)
// Base : demo/smart-rh-demo.db (ou SMART_RH_DB). Les comptes et mots de passe sont écrits dans demo/comptes-demo.txt,
// lisible seulement sur ce poste : il n'est jamais affiché par l'application ni copié dans le paquet livré.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MOTS = ['manioc', 'fleuve', 'baobab', 'safou', 'pirogue', 'mayombe', 'raphia', 'okoume', 'liboke', 'savane', 'congo', 'brazza', 'kouilou', 'plateau', 'tilapia', 'ndolo', 'saka', 'mangue', 'foret', 'lisanga', 'mbote', 'malebo', 'loango', 'tchimpa'];
const phrase = () => `${Array.from({ length: 4 }, () => MOTS[crypto.randomInt(MOTS.length)]).join('-')}-${crypto.randomInt(10, 100)}`;

// comptes créés selon le parcours de production : administrateur global, un administrateur par société, un utilisateur
const COMPTES = [
  { role: 'admin', email: 'admin@demo.smart-rh.cg', nom: 'Administrateur global' },
  { role: 'societe', email: 'responsable@exemple-sarl.cg', nom: 'Aimée Ngoulou', societe: 'Exemple SARL' },
  { role: 'societe', email: 'responsable@kouilou-services.cg', nom: 'Rodrigue Mavoungou', societe: 'Kouilou Services SA' },
  { role: 'utilisateur', email: 'paie@cabinet-demo.cg', nom: 'Gestionnaire de paie', societes: ['Exemple SARL', 'Kouilou Services SA'] },
];

// à appeler quand SMART_RH_DB désigne une base neuve ; renvoie les comptes avec leur mot de passe
function preparer({ motDePasse } = {}) {
  const { run, get, transaction, donneesFictives } = require('../db');
  const { appliquer, absencesFictives } = require('../migrations');
  const auth = require('../auth');
  const paie = require('../paie');
  if (get('SELECT COUNT(*) n FROM societes').n || get('SELECT COUNT(*) n FROM utilisateurs').n) throw new Error('La base n\'est pas vide : utilisez --remplacer pour repartir d\'une base neuve.');
  if (motDePasse && auth.motDePasseRefuse(motDePasse)) throw new Error('Mot de passe refusé : 12 caractères au moins, pas un mot de passe courant.');
  const comptes = COMPTES.map((c) => ({ ...c, mdp: motDePasse || phrase() }));
  transaction(() => {
    donneesFictives();
    appliquer();
    absencesFictives();
    const idDe = (nom) => get('SELECT id FROM societes WHERE nom=?', nom).id;
    // comptes déjà mis en service : la première connexion ne redemande pas de changer le mot de passe
    for (const c of comptes) auth.creerUtilisateur({ email: c.email, nom: c.nom, mdp: c.mdp, role: c.role, societeId: c.societe ? idDe(c.societe) : null, societes: (c.societes || []).map(idDe) });
    run("INSERT OR REPLACE INTO reglages(cle,valeur) VALUES('donnees_fictives', ?)", new Date().toISOString());
  });
  // deux mois de paie déjà calculés, pour que les tableaux de bord et les déclarations soient remplis
  const mois = new Date().toISOString().slice(0, 7), avant = new Date(Number(mois.slice(0, 4)), Number(mois.slice(5, 7)) - 2, 1);
  const precedent = `${avant.getFullYear()}-${String(avant.getMonth() + 1).padStart(2, '0')}`;
  for (const { id } of require('../db').all('SELECT id FROM societes')) for (const p of [precedent, mois]) paie.calculerSociete(id, p);
  return comptes;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--mot-de-passe');
  const motDePasse = i >= 0 ? args[i + 1] : null;
  const dossier = path.join(__dirname, '..', 'demo');
  process.env.SMART_RH_DB ||= path.join(dossier, 'smart-rh-demo.db');
  process.env.SMART_RH_SAUVEGARDES ||= path.join(path.dirname(process.env.SMART_RH_DB), 'sauvegardes');
  const base = process.env.SMART_RH_DB, fiche = path.join(path.dirname(base), 'comptes-demo.txt');
  fs.mkdirSync(path.dirname(base), { recursive: true });
  if (fs.existsSync(base)) {
    if (!args.includes('--remplacer')) { console.log(`La base de démonstration existe déjà : ${base}\nPour repartir de zéro : arrêtez Smart RH (pm2 stop smart-rh), puis npm run demo:preparer -- --remplacer`); process.exit(1); }
    try { for (const f of [base, `${base}-wal`, `${base}-shm`, fiche]) fs.rmSync(f, { force: true }); } catch { console.log('La base est encore ouverte : arrêtez d\'abord Smart RH (pm2 stop smart-rh).'); process.exit(1); }
  }
  try {
    const comptes = preparer({ motDePasse });
    const texte = ['Smart RH — comptes de la base de démonstration (données fictives)', `Préparée le ${new Date().toLocaleString('fr-FR')}. Ne pas diffuser ce fichier.`, '',
      ...comptes.map((c) => `${require('../auth').ROLES[c.role].padEnd(26)} ${c.email.padEnd(34)} ${c.mdp}${c.societe ? `   (${c.societe})` : c.societes ? `   (${c.societes.join(', ')})` : ''}`), ''].join('\n');
    fs.writeFileSync(fiche, texte, { mode: 0o600 });
    console.log(`${texte}\nBase : ${base}\nComptes enregistrés dans : ${fiche}\nDémarrer : npm run demo (ou pm2 start ecosystem.config.js)`);
    process.exit();
  } catch (err) { console.error(`Préparation impossible : ${err.message}`); process.exit(1); }
}

module.exports = { preparer, COMPTES };
