// Prépare le dossier « paquet/smart-rh » à copier sur le poste ou le serveur de l'entreprise :
// le code et les fichiers publics, sans base de données, sans sauvegardes, sans clé ni certificat, sans dépendances (installées sur place).
const fs = require('node:fs');
const path = require('node:path');

const racine = path.join(__dirname, '..');
const cible = path.join(racine, 'paquet', 'smart-rh');
const exclus = new Set(['node_modules', 'paquet', 'sauvegardes', '.git', 'certificat', 'cle-sauvegarde.txt', 'demo']);
const exclu = (nom) => exclus.has(nom) || /\.db(-journal|-wal|-shm)?$/.test(nom);

fs.rmSync(cible, { recursive: true, force: true });
(function copier(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const nom of fs.readdirSync(src)) {
    if (exclu(nom)) continue;
    const s = path.join(src, nom), d = path.join(dst, nom);
    if (fs.statSync(s).isDirectory()) copier(s, d); else fs.copyFileSync(s, d);
  }
})(racine, cible);
const version = require('../package.json').version;
console.log(`Paquet Smart RH ${version} prêt : ${cible}`);
console.log('Copiez ce dossier sur la machine cible, puis suivez DEPLOIEMENT.md.');
