// Restaure une sauvegarde dans un nouveau fichier de base, sans toucher à la base en service.
// Usage : node scripts/restaurer.js sauvegardes/smart-rh-AAAAMMJJ-HHMMSS.db.chiffre D:/SmartRH/donnees/smart-rh-restauree.db
// La clé est lue dans le fichier indiqué par SMART_RH_CLE_SAUVEGARDE (par défaut cle-sauvegarde.txt à côté de la base).
// Ensuite : arrêter Smart RH, remplacer la base par le fichier restauré (ou pointer SMART_RH_DB dessus), redémarrer.
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { dechiffrer } = require('../sauvegarde');

const [, , source, cible] = process.argv;
if (!source || !cible) { console.log('Usage : node scripts/restaurer.js <copie .db.chiffre> <nouveau fichier .db>'); process.exit(1); }
if (fs.existsSync(cible)) { console.log(`${cible} existe déjà : choisissez un autre nom, la restauration n'écrase jamais un fichier.`); process.exit(1); }
try {
  const donnees = fs.readFileSync(source);
  fs.writeFileSync(cible, source.endsWith('.chiffre') ? dechiffrer(donnees) : donnees, { flag: 'wx' });
  const verif = new DatabaseSync(cible, { readOnly: true });
  const ok = verif.prepare('PRAGMA integrity_check').get();
  const n = verif.prepare('SELECT (SELECT COUNT(*) FROM societes) societes, (SELECT COUNT(*) FROM salaries) salaries, (SELECT COUNT(*) FROM bulletins) bulletins').get();
  verif.close();
  console.log(`Base restaurée : ${cible} (contrôle d'intégrité : ${Object.values(ok)[0]}). ${n.societes} sociétés, ${n.salaries} salariés, ${n.bulletins} bulletins.`);
} catch (err) {
  fs.rmSync(cible, { force: true });
  console.error(`Restauration impossible : ${err.message}`);
  process.exit(1);
}
