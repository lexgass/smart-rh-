// Sauvegardes de la base : une copie cohérente par jour (VACUUM INTO), chiffrée (AES-256-GCM), conservée N jours, plus des copies à la demande.
// Une copie chiffrée est illisible sans la clé du fichier config.cleSauvegarde : copiez cette clé à part (coffre, papier), jamais avec les sauvegardes.
// Restauration : node scripts/restaurer.js <copie> <nouvelle-base> (voir DEPLOIEMENT.md).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, config } = require('./db');

const FORMAT = /^smart-rh-\d{8}-\d{6}(-manuelle)?\.db(\.chiffre)?$/;
const ENTETE = Buffer.from('SMARTRH1');
const horodatage = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

// clé de chiffrement : 32 octets en hexadécimal, créée au premier besoin, lisible par le seul compte qui fait tourner Smart RH
function cle(creer = true) {
  if (!fs.existsSync(config.cleSauvegarde)) {
    if (!creer) throw new Error(`Clé de sauvegarde introuvable : ${config.cleSauvegarde}`);
    fs.mkdirSync(path.dirname(config.cleSauvegarde), { recursive: true });
    fs.writeFileSync(config.cleSauvegarde, `${crypto.randomBytes(32).toString('hex')}\n`, { mode: 0o600, flag: 'wx' });
  }
  const k = Buffer.from(fs.readFileSync(config.cleSauvegarde, 'utf8').trim(), 'hex');
  if (k.length !== 32) throw new Error('Clé de sauvegarde invalide : 64 caractères hexadécimaux attendus.');
  return k;
}
const empreinteCle = () => crypto.createHash('sha256').update(cle()).digest('hex').slice(0, 12);

// format : SMARTRH1 | vecteur (12 octets) | étiquette d'authenticité (16 octets) | contenu chiffré
function chiffrer(clair, k = cle()) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const corps = Buffer.concat([c.update(clair), c.final()]);
  return Buffer.concat([ENTETE, iv, c.getAuthTag(), corps]);
}
function dechiffrer(donnees, k = cle(false)) {
  if (!donnees.subarray(0, 8).equals(ENTETE)) throw new Error('Ce fichier n\'est pas une sauvegarde chiffrée de Smart RH.');
  const d = crypto.createDecipheriv('aes-256-gcm', k, donnees.subarray(8, 20));
  d.setAuthTag(donnees.subarray(20, 36));
  try { return Buffer.concat([d.update(donnees.subarray(36)), d.final()]); } catch { throw new Error('Déchiffrement impossible : mauvaise clé ou fichier modifié.'); }
}

function lister() {
  if (!fs.existsSync(config.dossierSauvegardes)) return [];
  return fs.readdirSync(config.dossierSauvegardes).filter((f) => FORMAT.test(f)).map((nom) => {
    const st = fs.statSync(path.join(config.dossierSauvegardes, nom));
    return { nom, taille: st.size, date: st.mtime, chiffre: nom.endsWith('.chiffre') };
  }).sort((a, b) => b.date - a.date);
}

function sauvegarder(manuelle = false) {
  fs.mkdirSync(config.dossierSauvegardes, { recursive: true });
  const nom = `smart-rh-${horodatage()}${manuelle ? '-manuelle' : ''}.db.chiffre`;
  const cible = path.join(config.dossierSauvegardes, nom);
  const temporaire = `${cible}.tmp`;
  try {
    db.exec(`VACUUM INTO '${temporaire.replace(/'/g, "''")}'`);
    fs.writeFileSync(`${cible}.part`, chiffrer(fs.readFileSync(temporaire)), { mode: 0o600 });
    fs.renameSync(`${cible}.part`, cible);
  } finally { fs.rmSync(temporaire, { force: true }); fs.rmSync(`${cible}.part`, { force: true }); }
  // conservation : on supprime les copies plus anciennes que la durée choisie, en gardant toujours les 3 plus récentes
  const limite = Date.now() - config.joursConservation * 864e5;
  lister().slice(3).filter((s) => s.date.getTime() < limite).forEach((s) => fs.unlinkSync(path.join(config.dossierSauvegardes, s.nom)));
  return nom;
}

// sauvegarde automatique : au démarrage puis toutes les heures, si aucune copie n'existe encore pour la journée
function planifier() {
  const verifier = () => {
    const jour = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    if (!lister().some((s) => s.nom.startsWith(`smart-rh-${jour}`))) {
      try { console.log(`Sauvegarde automatique : ${sauvegarder()}`); } catch (err) { console.error('Sauvegarde automatique impossible :', err.message); }
    }
  };
  setTimeout(verifier, 5000).unref();
  setInterval(verifier, 3600e3).unref();
}

module.exports = (app, h) => {
  const { e, page, carte, tableau, aide, ic } = h;
  const taille = (o) => (o > 1048576 ? `${(o / 1048576).toFixed(1).replace('.', ',')} Mo` : `${Math.ceil(o / 1024)} Ko`);
  app.get('/sauvegardes', (req, res) => {
    const liste = lister(), ok = FORMAT.test(req.query.ok || '') ? req.query.ok : null;
    res.send(page(req, { titre: 'Sauvegardes', sous: `Une copie complète et chiffrée de la base est faite automatiquement chaque jour et conservée ${config.joursConservation} jours.`, action: `<form method="post" action="/sauvegardes"><button class="bouton">${ic('telecharger')}Sauvegarder maintenant</button></form>` }, `
      ${ok ? `<p class="succes-ligne">Sauvegarde créée : ${e(ok)}.</p>` : ''}
      <div class="disposition d-2-1">
      ${carte(`Copies disponibles <span class="compteur">${liste.length}</span>`, tableau(['Fichier', 'Date', '+Taille', ''], liste.map((s) => `<tr><td><b>${e(s.nom)}</b>${s.nom.includes('manuelle') ? ' <span class="et bleu">Manuelle</span>' : ''}${s.chiffre ? ' <span class="et vert">Chiffrée</span>' : ' <span class="et jaune" data-bulle="Copie faite avant le chiffrement des sauvegardes : lisible par quiconque la récupère." tabindex="0">Non chiffrée</span>'}</td><td>${s.date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td><td class="n">${taille(s.taille)}</td><td class="n"><a class="bouton fantome petit" href="/sauvegardes/${encodeURIComponent(s.nom)}">${ic('telecharger')}Télécharger</a></td></tr>`), 'Aucune sauvegarde pour le moment. La première est faite quelques secondes après le démarrage.'))}
      <div class="pile">
      ${carte(`Où sont les copies ?${aide('Copiez régulièrement ce dossier sur une clé USB ou un disque externe : une sauvegarde restée sur le même ordinateur ne protège pas d\'une panne de disque ou d\'un vol.')}`, `<p class="chemin">${e(config.dossierSauvegardes)}</p>
        <p class="discret petit-texte">Pour restaurer une copie : arrêter Smart RH, lancer <code>node scripts/restaurer.js</code> avec la copie choisie, puis redémarrer. La procédure détaillée figure dans le guide de déploiement.</p>`)}
      ${carte(`Clé de chiffrement${aide('Sans cette clé, aucune sauvegarde ne peut être restaurée. Conservez-en une copie hors de l\'ordinateur et hors du dossier des sauvegardes : coffre, papier sous enveloppe, gestionnaire de mots de passe.')}`, `<p class="chemin">${e(config.cleSauvegarde)}</p>
        <p class="discret petit-texte">Empreinte de la clé en service : <code>${empreinteCle()}</code>. Elle permet de vérifier, sans révéler la clé, que la copie que vous gardez à part est la bonne.</p>`)}
      </div></div>`));
  });
  app.post('/sauvegardes', (req, res) => {
    res.redirect(`/sauvegardes?ok=${encodeURIComponent(sauvegarder(true))}`);
  });
  app.get('/sauvegardes/:nom', (req, res) => {
    if (!FORMAT.test(req.params.nom)) return res.status(404).end();
    const f = path.join(config.dossierSauvegardes, req.params.nom);
    if (!fs.existsSync(f)) return res.status(404).end();
    res.download(f, req.params.nom);
  });
};
Object.assign(module.exports, { sauvegarder, planifier, lister, chiffrer, dechiffrer, cle });
