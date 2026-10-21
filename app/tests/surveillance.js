// Surveillance et journaux : démarrage, relance après un arrêt brutal du serveur, arrêt propre, contenu des fichiers de log.
// Usage : node tests/surveillance.js   (port 4397, base temporaire)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');
const { spawn, execFileSync } = require('node:child_process');

const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-rh-surveillance-'));
const env = { ...process.env, PORT: '4397', HOST: '127.0.0.1', SMART_RH_DB: path.join(dossier, 'demo.db'), SMART_RH_SAUVEGARDES: path.join(dossier, 'sauvegardes'), SMART_RH_LOGS: path.join(dossier, 'logs') };
const app = path.join(__dirname, '..');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const repond = async () => { try { return (await fetch('http://127.0.0.1:4397/connexion', { signal: AbortSignal.timeout(2000) })).status < 500; } catch { return false; } };
const attendre = async (cond, ms) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await cond()) return true; await pause(500); } return false; };
const lire = (prefixe) => fs.readdirSync(env.SMART_RH_LOGS).filter((f) => f.startsWith(prefixe)).map((f) => fs.readFileSync(path.join(env.SMART_RH_LOGS, f), 'utf8')).join('');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

(async () => {
  let surv;
  try {
    execFileSync(process.execPath, ['--no-warnings', 'scripts/preparer-demo.js'], { cwd: app, env, stdio: 'ignore' });
    surv = spawn(process.execPath, ['--no-warnings', 'scripts/surveillance.js', 'demo'], { cwd: app, env, stdio: 'ignore', windowsHide: true });
    ok(await attendre(repond, 20e3), 'la surveillance démarre le serveur');
    ok(fs.existsSync(path.join(env.SMART_RH_LOGS, 'surveillance.pid')), 'fichier de verrou de la surveillance créé');
    await fetch('http://127.0.0.1:4397/connexion'); await fetch('http://127.0.0.1:4397/page-inconnue');
    await pause(300);

    // arrêt brutal du serveur : la surveillance doit le relancer
    const pid = Number(/Serveur lancé \| \{"pid":(\d+)/.exec(lire('surveillance'))[1]);
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    await pause(1000);
    ok(await attendre(repond, 20e3), 'serveur relancé après un arrêt brutal');
    const s = lire('surveillance');
    ok(/arrêté de lui-même/.test(s) && (s.match(/Serveur lancé/g) || []).length >= 2, 'arrêt et relance inscrits dans le journal de surveillance');

    // contenu des journaux de l'application
    const a = lire('smart-rh'), r = lire('acces');
    ok(/\| INFO  \| Démarrage \| .*"version"/.test(a), 'démarrage tracé, avec version et configuration');
    ok(/GET \/connexion 200/.test(r) && /GET \/page-inconnue 302/.test(r), 'chaque requête tracée avec son statut');
    ok(!/mot_de_passe|_csrf|scrypt/.test(a + r + s), 'aucun secret dans les journaux');

    // arrêt propre, comme « Arrêter Smart RH.vbs »
    fs.writeFileSync(path.join(env.SMART_RH_LOGS, 'arret.demande'), 'arret');
    ok(await attendre(async () => !fs.existsSync(path.join(env.SMART_RH_LOGS, 'surveillance.pid')), 10e3), 'arrêt propre sur demande');
    ok(await attendre(async () => !(await repond()), 10e3), 'serveur arrêté avec la surveillance');
    ok(/Surveillance arrêtée/.test(lire('surveillance')), 'arrêt inscrit dans le journal');
    console.log(`OK  ${n} vérifications réussies (surveillance et journaux)`);
  } catch (err) {
    console.error(`ÉCHEC (surveillance) : ${err.message}`);
    process.exitCode = 1;
  } finally {
    if (surv && surv.exitCode === null) try { execFileSync('taskkill', ['/PID', String(surv.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* déjà arrêté */ }
    await pause(500);
    try { fs.rmSync(dossier, { recursive: true, force: true }); } catch { /* nettoyé par le système */ }
  }
})();
