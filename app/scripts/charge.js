// Test de montée en charge sur une base temporaire générée : 200 sociétés, 5 000 salariés (dont une société de 500),
// 50 utilisateurs simultanés pendant 30 secondes, puis calcul de la paie de la plus grande société.
// Usage : npm run charge   (options : SOCIETES=200 SALARIES=5000 UTILISATEURS=50 DUREE=30)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const N_SOC = Number(process.env.SOCIETES) || 200, N_SAL = Number(process.env.SALARIES) || 5000;
const N_UTIL = Number(process.env.UTILISATEURS) || 50, DUREE = (Number(process.env.DUREE) || 30) * 1000;
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-rh-charge-'));
Object.assign(process.env, { SMART_RH_DB: path.join(dossier, 'charge.db'), SMART_RH_SAUVEGARDES: path.join(dossier, 'sauvegardes'), SMART_RH_DEMO: '0' });

const app = require('../server');
const { db, run, get, all, creerSociete, transaction } = require('../db');
const auth = require('../auth');
const paie = require('../paie');

// ---------- données ----------
const t0 = Date.now();
const GRANDE = 500, autres = Math.max(0, N_SAL - GRANDE), parSoc = Math.ceil(autres / Math.max(1, N_SOC - 1));
const NOMS = ['Mabiala', 'Nkounkou', 'Loemba', 'Samba', 'Ibara', 'Moukoko', 'Tchicaya', 'Goma', 'Pambou', 'Massamba', 'Ngoma', 'Bouanga'];
const PRENOMS = ['Grâce', 'Arsène', 'Prisca', 'Junior', 'Chancel', 'Brice', 'Merveille', 'Destin', 'Ruth', 'Exaucé', 'Divine', 'Gloire'];
transaction(() => {
  let n = 0;
  for (let k = 0; k < N_SOC; k++) {
    const sid = creerSociete({ nom: `Société ${String(k + 1).padStart(3, '0')}`, ville: k % 3 ? 'Brazzaville' : 'Pointe-Noire', convention: 'Commerce' });
    run("UPDATE societes SET convention_code='COMMERCE' WHERE id=?", sid);
    const dep = Number(run('INSERT INTO departements(societe_id,nom) VALUES(?,?)', sid, 'Général').lastInsertRowid);
    const cat = Number(run('INSERT INTO categories(societe_id,code,libelle,salaire_min,niveau) VALUES(?,?,?,?,?)', sid, 'C3', 'Employé', 90000, 3).lastInsertRowid);
    const poste = Number(run('INSERT INTO postes(societe_id,departement_id,categorie_id,intitule) VALUES(?,?,?,?)', sid, dep, cat, 'Employé').lastInsertRowid);
    const combien = k === 0 ? Math.min(GRANDE, N_SAL) : Math.min(parSoc, N_SAL - n);
    for (let i = 0; i < combien; i++, n++) {
      const id = Number(run('INSERT INTO salaries(societe_id,matricule,nom,prenom,sexe,date_naissance,situation,enfants,num_cnss,telephone,poste_id,date_embauche,statut) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        sid, `S${sid}-${i}`, NOMS[n % 12], PRENOMS[(n * 7) % 12], n % 2 ? 'M' : 'F', '1990-01-01', n % 3 ? 'Marié(e)' : 'Célibataire', n % 4, `${100000 + n}`, '', poste, `20${10 + (n % 15)}-0${1 + (n % 9)}-01`, 'Actif').lastInsertRowid);
      run('INSERT INTO contrats(salarie_id,type,date_debut,date_fin,fin_essai,salaire_base,sursalaire,prime_transport) VALUES(?,?,?,?,?,?,?,?)', id, n % 5 ? 'CDI' : 'CDD', '2020-01-01', n % 5 ? null : '2027-06-30', null, 120000 + (n % 40) * 15000, 10000, 25000);
    }
  }
  auth.creerUtilisateur({ email: 'charge@test.cg', nom: 'Test de charge', mdp: 'phrase de charge solide', role: 'admin' });
});
const nSal = get('SELECT COUNT(*) n FROM salaries').n;
console.log(`Base générée : ${get('SELECT COUNT(*) n FROM societes').n} sociétés, ${nSal} salariés en ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// paie de 6 mois pour toutes les sociétés, pour que les écrans aient de l'historique
const t1 = Date.now();
for (const s of all('SELECT id FROM societes')) for (const p of ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']) paie.calculerSociete(s.id, p);
console.log(`Historique : ${get('SELECT COUNT(*) n FROM bulletins').n} bulletins calculés en ${((Date.now() - t1) / 1000).toFixed(1)} s`);

// ---------- charge ----------
const PAGES = ['/', '/salaries', '/analyses', '/paie?periode=2026-09', '/conges', '/declarations', '/dotations', '/structure', '/regles', '/variables'];
const centile = (l, p) => l[Math.min(l.length - 1, Math.floor(l.length * p))];
const serveur = app.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${serveur.address().port}`;
  const ouvrir = async (societe) => {
    let r = await fetch(`${base}/connexion`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base }, body: 'email=charge%40test.cg&mdp=phrase+de+charge+solide' });
    const sid = r.headers.getSetCookie().find((c) => c.startsWith('sid=')).split(';')[0];
    const jeton = (await (await fetch(`${base}/compte`, { headers: { cookie: sid } })).text()).match(/name="_csrf" value="([0-9a-f]{64})"/)[1];
    r = await fetch(`${base}/societes/choisir`, { method: 'POST', redirect: 'manual', headers: { cookie: sid, 'content-type': 'application/x-www-form-urlencoded', origin: base }, body: `id=${societe}&_csrf=${jeton}` });
    return { sid, jeton };
  };
  // chaque utilisateur virtuel travaille sur une société différente ; le premier sur la grande société
  const sessions = [];
  for (let u = 0; u < N_UTIL; u++) sessions.push(await ouvrir(u === 0 ? 1 : 1 + (u % N_SOC)));
  const temps = [], parPage = {};
  let erreurs = 0, requetes = 0;
  const fin = Date.now() + DUREE;
  console.log(`Charge : ${N_UTIL} utilisateurs simultanés pendant ${DUREE / 1000} s…`);
  await Promise.all(sessions.map(async ({ sid }, u) => {
    let i = u;
    while (Date.now() < fin) {
      const p = PAGES[i++ % PAGES.length], d = performance.now();
      try {
        const r = await fetch(base + p, { headers: { cookie: sid }, redirect: 'manual' });
        await r.arrayBuffer();
        if (r.status !== 200) erreurs++;
      } catch { erreurs++; }
      const ms = performance.now() - d;
      temps.push(ms); (parPage[p] ||= []).push(ms); requetes++;
    }
  }));
  temps.sort((a, b) => a - b);
  console.log(`\n${requetes} pages servies, ${(requetes / (DUREE / 1000)).toFixed(0)} pages/s, ${erreurs} erreur(s)`);
  console.log(`Temps de réponse : médiane ${centile(temps, 0.5).toFixed(0)} ms, 95 % sous ${centile(temps, 0.95).toFixed(0)} ms, maximum ${temps[temps.length - 1].toFixed(0)} ms`);
  console.log('\nPar écran (médiane / 95 %) :');
  for (const [p, l] of Object.entries(parPage)) { l.sort((a, b) => a - b); console.log(`  ${p.padEnd(24)} ${centile(l, 0.5).toFixed(0).padStart(5)} ms / ${centile(l, 0.95).toFixed(0).padStart(5)} ms`); }

  // calcul de la paie de la grande société, pendant que les autres continuent de lire
  const { sid, jeton } = sessions[0];
  const lectures = [];
  let enCours = true;
  const lecteurs = sessions.slice(1, 11).map(async (s) => { while (enCours) { const d = performance.now(); await (await fetch(`${base}/salaries`, { headers: { cookie: s.sid } })).arrayBuffer(); lectures.push(performance.now() - d); } });
  const d = performance.now();
  const r = await fetch(`${base}/paie/calculer`, { method: 'POST', redirect: 'manual', headers: { cookie: sid, 'content-type': 'application/x-www-form-urlencoded', origin: base }, body: `periode=2026-10&_csrf=${jeton}` });
  const duree = performance.now() - d;
  enCours = false; await Promise.all(lecteurs);
  lectures.sort((a, b) => a - b);
  const nb = get("SELECT COUNT(*) n FROM bulletins b JOIN salaries e ON e.id=b.salarie_id WHERE e.societe_id=1 AND periode='2026-10'").n;
  console.log(`\nPaie de la grande société : ${nb} bulletins en ${(duree / 1000).toFixed(2)} s (statut ${r.status}) ; pendant ce temps, lectures à ${lectures.length ? centile(lectures, 0.95).toFixed(0) : '—'} ms (95 %)`);
  serveur.close(); db.close();
  try { fs.rmSync(dossier, { recursive: true, force: true }); } catch { /* nettoyé par le système */ }
  process.exit();
});
