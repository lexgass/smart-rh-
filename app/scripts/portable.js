// Fabrique la version portable de démonstration : livraison/SmartRH-portable (+ zip), à double-cliquer, sans rien installer.
// Contenu : node/node.exe (celui de ce poste), app/ (paquet + dépendances), « Smart RH.vbs », « Arrêter Smart RH.vbs », LISEZ-MOI.txt.
// Usage : npm run portable
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const racine = path.join(__dirname, '..');
const sortie = path.join(racine, '..', 'livraison', 'SmartRH-portable');
const zip = path.join(racine, '..', 'livraison', 'SmartRH-portable-demo.zip');

execFileSync(process.execPath, [path.join(__dirname, 'paquet.js')], { stdio: 'inherit' });
fs.rmSync(sortie, { recursive: true, force: true });
fs.mkdirSync(path.join(sortie, 'node'), { recursive: true });
fs.cpSync(path.join(racine, 'paquet', 'smart-rh'), path.join(sortie, 'app'), { recursive: true });
fs.cpSync(path.join(racine, 'node_modules'), path.join(sortie, 'app', 'node_modules'), { recursive: true });
fs.copyFileSync(process.execPath, path.join(sortie, 'node', 'node.exe'));

// lanceurs VBS en UTF-16 avec BOM : Windows Script Host lit ainsi correctement les accents des messages
for (const f of ['Smart RH.vbs', 'Arrêter Smart RH.vbs']) {
  const texte = fs.readFileSync(path.join(__dirname, 'portable', f), 'utf8').replace(/\r?\n/g, '\r\n');
  fs.writeFileSync(path.join(sortie, f), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(texte, 'utf16le')]));
}
const lisez = fs.readFileSync(path.join(__dirname, 'portable', 'LISEZ-MOI.txt'), 'utf8').replace(/\r?\n/g, '\r\n');
fs.writeFileSync(path.join(sortie, 'LISEZ-MOI.txt'), `\ufeff${lisez}`);

fs.rmSync(zip, { force: true });
execFileSync(process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'tar', ['-a', '-cf', zip, 'SmartRH-portable'], { cwd: path.dirname(sortie), stdio: 'inherit' });
console.log(`Version portable prête : ${sortie}\nArchive : ${zip} (${Math.round(fs.statSync(zip).size / 1048576)} Mo)`);
