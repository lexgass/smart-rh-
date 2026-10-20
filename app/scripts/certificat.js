// Crée le certificat HTTPS de Smart RH pour le réseau local (certificat auto-signé, valable 3 ans).
// Usage : npm run certificat   (à lancer une fois à l'installation, puis tous les 3 ans)
// Il couvre le nom de l'ordinateur, « localhost » et les adresses IP de ses cartes réseau.
// Avec OpenSSL (Git pour Windows, Linux) : smart-rh.key + smart-rh.crt ; sinon, sous Windows : smart-rh.pfx créé par PowerShell.
// Ensuite : SMART_RH_HTTPS=1 dans ecosystem.config.js, puis approuver le certificat sur chaque poste (DEPLOIEMENT.md).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const config = require('../config');

const dossier = path.dirname(config.certificat);
fs.mkdirSync(dossier, { recursive: true });
const hote = os.hostname();
const ips = ['127.0.0.1', ...Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address)];
const noms = [...new Set([hote, `${hote}.local`, 'localhost'])];
console.log(`Certificat pour : ${noms.join(', ')}, ${ips.join(', ')}`);

const openssl = spawnSync('openssl', ['version'], { encoding: 'utf8' });
if (openssl.status === 0) {
  const san = [...noms.map((n) => `DNS:${n}`), ...ips.map((i) => `IP:${i}`)].join(',');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:3072', '-sha256', '-days', '1095', '-nodes', '-keyout', config.clePrivee, '-out', config.certificat,
    '-subj', `/CN=${hote}/O=Smart RH`, '-addext', `subjectAltName=${san}`, '-addext', 'extendedKeyUsage=serverAuth'], { stdio: 'inherit' });
  try { fs.chmodSync(config.clePrivee, 0o600); } catch { /* Windows : droits hérités du dossier */ }
  console.log(`Certificat créé : ${config.certificat}\nClé privée : ${config.clePrivee} (à ne jamais copier ailleurs)`);
} else if (process.platform === 'win32') {
  const pfx = config.certificat.replace(/\.crt$/i, '.pfx'), cer = config.certificat.replace(/\.crt$/i, '.cer');
  const mdp = crypto.randomBytes(18).toString('base64url');
  const ps = `$c = New-SelfSignedCertificate -DnsName ${noms.map((n) => `'${n}'`).join(',')} -TextExtension @('2.5.29.17={text}${[...noms.map((n) => `DNS=${n}`), ...ips.map((i) => `IPAddress=${i}`)].join('&')}') -CertStoreLocation Cert:\\CurrentUser\\My -NotAfter (Get-Date).AddYears(3) -KeyAlgorithm RSA -KeyLength 3072 -FriendlyName 'Smart RH';
$p = ConvertTo-SecureString -String '${mdp}' -Force -AsPlainText;
Export-PfxCertificate -Cert $c -FilePath '${pfx}' -Password $p | Out-Null; Export-Certificate -Cert $c -FilePath '${cer}' | Out-Null;
Remove-Item -Path ('Cert:\\CurrentUser\\My\\' + $c.Thumbprint)`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'inherit' });
  fs.writeFileSync(`${pfx}.mdp.txt`, mdp, { mode: 0o600 });
  console.log(`Certificat créé : ${pfx}\nCertificat à approuver sur les postes : ${cer}`);
} else {
  console.error('OpenSSL est introuvable. Installez-le, ou placez un certificat et sa clé aux chemins SMART_RH_CERTIFICAT et SMART_RH_CLE.');
  process.exit(1);
}
console.log('Activez ensuite SMART_RH_HTTPS=1 et redémarrez Smart RH.');
