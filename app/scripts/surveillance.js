// Surveillance (watchdog) de Smart RH : lance le serveur, vérifie qu'il répond, le relance s'il plante ou se fige.
// Usage : node scripts/surveillance.js [demo]   (demo : base de démonstration, comme scripts/demo.js)
// Tout est écrit dans logs/surveillance-AAAA-MM-JJ.log, y compris la sortie du serveur.
// Arrêt propre : créer le fichier « arret.demande » dans le dossier des logs (c'est ce que fait « Arrêter Smart RH.vbs »).
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const demo = process.argv.includes('demo');
if (demo) {
  const dossier = path.join(__dirname, '..', 'demo');
  process.env.SMART_RH_DB ||= path.join(dossier, 'smart-rh-demo.db');
  process.env.SMART_RH_SAUVEGARDES ||= path.join(path.dirname(process.env.SMART_RH_DB), 'sauvegardes');
}
const config = require('../config');
const { ecrire } = require('../journalisation');
const log = (niveau, message, details) => { ecrire('surveillance', niveau, message, details); if (process.stdout.isTTY) console.log(`${niveau} ${message}`); };

const CIBLE = path.join(__dirname, '..', demo ? 'scripts/demo.js' : 'server.js');
const INTERVALLE = 15e3, DELAI_REPONSE = 5e3, ECHECS_MAX = 3;       // figé = 3 contrôles ratés de suite (45 s)
const PAUSES = [2e3, 5e3, 10e3, 30e3, 60e3];                          // attente avant relance, croissante
const RELANCES_MAX = 10, FENETRE = 10 * 60e3;                          // au-delà : abandon (problème permanent)
const FICHIER_PID = path.join(config.dossierLogs, 'surveillance.pid');
const FICHIER_ARRET = path.join(config.dossierLogs, 'arret.demande');

fs.mkdirSync(config.dossierLogs, { recursive: true });
// une seule surveillance à la fois
try {
  const ancien = Number(fs.readFileSync(FICHIER_PID, 'utf8'));
  if (ancien && ancien !== process.pid) { process.kill(ancien, 0); log('WARN', 'Une surveillance tourne déjà : abandon de ce lancement', { pid: ancien }); process.exit(0); }
} catch { /* pas de surveillance active */ }
fs.writeFileSync(FICHIER_PID, String(process.pid));
fs.rmSync(FICHIER_ARRET, { force: true });

let enfant = null, echecs = 0, relances = [], arret = false, minuterie = null, demarreLe = 0;

function lancer() {
  if (arret) return;
  demarreLe = Date.now();
  enfant = spawn(process.execPath, ['--no-warnings', CIBLE], { cwd: path.join(__dirname, '..'), env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  log('INFO', 'Serveur lancé', { pid: enfant.pid, cible: path.relative(path.join(__dirname, '..'), CIBLE), port: config.port });
  const relayer = (niveau) => (buf) => String(buf).split(/\r?\n/).filter(Boolean).forEach((l) => log(niveau, `[serveur] ${l}`));
  enfant.stdout.on('data', relayer('INFO'));
  enfant.stderr.on('data', relayer('ERROR'));
  enfant.on('exit', (code, signal) => {
    const duree = Math.round((Date.now() - demarreLe) / 1000);
    enfant = null;
    if (arret) return;
    log('ERROR', 'Le serveur s\'est arrêté de lui-même', { code, signal, duree_s: duree });
    relancer('arrêt inattendu');
  });
}

function relancer(motif) {
  if (arret) return;
  const maintenant = Date.now();
  relances = relances.filter((t) => maintenant - t < FENETRE);
  relances.push(maintenant);
  if (relances.length > RELANCES_MAX) {
    log('ERROR', `Abandon : ${RELANCES_MAX} relances en 10 minutes, le problème est permanent. Consultez les erreurs ci-dessus.`, { motif });
    return terminer(1);
  }
  const pause = PAUSES[Math.min(relances.length - 1, PAUSES.length - 1)];
  log('WARN', `Relance dans ${pause / 1000} s`, { motif, relance_n: relances.length });
  setTimeout(lancer, pause);
}

// arrêt d'un serveur figé : sous Windows, on arrête le processus et ses éventuels enfants
function tuer(pid) {
  try { if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); else process.kill(pid, 'SIGKILL'); } catch { /* déjà arrêté */ }
}

// contrôle de santé : la page de connexion doit répondre (statut inférieur à 500) en moins de 5 secondes
async function controler() {
  if (fs.existsSync(FICHIER_ARRET)) { log('INFO', 'Arrêt demandé par « Arrêter Smart RH »'); return terminer(0); }
  if (!enfant || Date.now() - demarreLe < 8e3) return; // laisse le temps au serveur de démarrer
  const url = `${config.https ? 'https' : 'http'}://127.0.0.1:${config.port}/connexion`;
  const debut = Date.now();
  try {
    if (config.https) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // certificat auto-signé du poste
    const r = await fetch(url, { signal: AbortSignal.timeout(DELAI_REPONSE), redirect: 'manual' });
    if (r.status >= 500) throw new Error(`statut ${r.status}`);
    if (echecs) log('INFO', 'Le serveur répond de nouveau', { ms: Date.now() - debut, apres_echecs: echecs });
    echecs = 0;
  } catch (err) {
    echecs++;
    log('WARN', `Le serveur ne répond pas (${echecs}/${ECHECS_MAX})`, { erreur: err.name === 'TimeoutError' ? 'délai dépassé' : err.message });
    if (echecs >= ECHECS_MAX && enfant) {
      log('ERROR', 'Serveur figé : arrêt forcé puis relance', { pid: enfant.pid });
      const pid = enfant.pid; echecs = 0;
      tuer(pid); // l'événement « exit » déclenche la relance
    }
  }
}

function terminer(code) {
  if (arret) return;
  arret = true;
  clearInterval(minuterie);
  if (enfant) { log('INFO', 'Arrêt du serveur', { pid: enfant.pid }); tuer(enfant.pid); }
  fs.rmSync(FICHIER_PID, { force: true }); fs.rmSync(FICHIER_ARRET, { force: true });
  log('INFO', 'Surveillance arrêtée', { code });
  setTimeout(() => process.exit(code), 300);
}

for (const s of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(s, () => terminer(0));
log('INFO', 'Surveillance démarrée', { pid: process.pid, demonstration: demo, controle_toutes_s: INTERVALLE / 1000, logs: config.dossierLogs });
lancer();
minuterie = setInterval(controler, INTERVALLE);
setInterval(() => { if (fs.existsSync(FICHIER_ARRET)) controler(); }, 1000).unref(); // arrêt demandé : pris en compte en 1 s
