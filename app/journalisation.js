// Fichiers de log de Smart RH, un par jour, dans config.dossierLogs (conservés config.joursLogs jours) :
//   smart-rh-AAAA-MM-JJ.log : démarrage, arrêt, erreurs, sécurité (connexions, refus), sauvegardes, santé (mémoire)
//   acces-AAAA-MM-JJ.log    : chaque requête (méthode, adresse sans paramètres, statut, durée, compte, adresse IP)
// Jamais de mot de passe, de jeton ni de contenu de formulaire dans les logs.
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

// date locale du poste (heure de Brazzaville), pour que le fichier du jour corresponde au calendrier de l'utilisateur
const jour = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fichier = (nom) => path.join(config.dossierLogs, `${nom}-${jour()}.log`);
let pret = false;
function preparer() {
  if (pret) return;
  try { fs.mkdirSync(config.dossierLogs, { recursive: true }); pret = true; } catch { /* dossier impossible à créer : logs désactivés */ }
}

// une ligne lisible : date | niveau | message | détails en JSON
function ecrire(nom, niveau, message, details) {
  preparer();
  if (!pret) return;
  const ligne = `${new Date().toISOString()} | ${niveau.padEnd(5)} | ${String(message).replace(/\s+/g, ' ')}${details && Object.keys(details).length ? ` | ${JSON.stringify(details)}` : ''}\n`;
  try { fs.appendFileSync(fichier(nom), ligne); } catch { /* le log ne doit jamais bloquer l'application */ }
}
const log = {
  info: (m, d) => ecrire('smart-rh', 'INFO', m, d),
  alerte: (m, d) => ecrire('smart-rh', 'WARN', m, d),
  erreur: (m, d) => ecrire('smart-rh', 'ERROR', m, d),
  securite: (m, d) => ecrire('smart-rh', 'SECU', m, d),
};

// suppression des logs plus anciens que la durée de conservation
function nettoyer() {
  preparer();
  if (!pret) return;
  const limite = Date.now() - config.joursLogs * 864e5;
  for (const f of fs.readdirSync(config.dossierLogs)) {
    if (!/\.log$/.test(f)) continue;
    try { if (fs.statSync(path.join(config.dossierLogs, f)).mtimeMs < limite) fs.unlinkSync(path.join(config.dossierLogs, f)); } catch { /* fichier déjà supprimé ou verrouillé */ }
  }
}

// log des requêtes, écrit quand la réponse est partie
function acces(req, res, next) {
  const debut = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - debut) / 1e6;
    const d = { m: req.method, p: req.path, s: res.statusCode, ms: Math.round(ms), ip: (require('./journal').ipDe(req)), u: req.user?.id || null, soc: req.societe?.id || null, o: Number(res.getHeader('content-length')) || null };
    ecrire('acces', res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO', `${req.method} ${req.path} ${res.statusCode}`, d);
    if (ms > 2000) log.alerte('Requête lente', { m: req.method, p: req.path, ms: Math.round(ms) });
  });
  next();
}

// démarrage, santé périodique et erreurs non rattrapées (le processus s'arrête alors, la surveillance le relance)
function installer() {
  nettoyer();
  setInterval(nettoyer, 864e5).unref();
  const memoire = () => { const m = process.memoryUsage(); return { rss_mo: Math.round(m.rss / 1048576), tas_mo: Math.round(m.heapUsed / 1048576) }; };
  setInterval(() => log.info('Santé', { ...memoire(), actif_depuis_min: Math.round(process.uptime() / 60) }), 10 * 60e3).unref();
  process.on('uncaughtException', (err) => { log.erreur('Erreur non rattrapée, arrêt du processus', { erreur: err.message, pile: err.stack?.split('\n').slice(0, 6).join(' / ') }); process.exit(1); });
  process.on('unhandledRejection', (err) => { log.erreur('Promesse rejetée non traitée', { erreur: String(err?.message || err) }); });
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { log.info(`Arrêt demandé (${s})`, { actif_depuis_min: Math.round(process.uptime() / 60) }); process.exit(0); });
  process.on('exit', (code) => { if (code) log.alerte('Processus terminé', { code }); });
  return memoire;
}

module.exports = { log, acces, installer, nettoyer, ecrire };
