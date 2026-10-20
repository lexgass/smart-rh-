// Comptes, sessions et connexion (référentiel OWASP ASVS 5.0, niveau 2 : voir SECURITE.md).
// Mots de passe : scrypt + sel. Sessions : jeton aléatoire dont seule l'empreinte est stockée, fermées après inactivité.
// Chaque formulaire porte un jeton anti-falsification lié à la session.
const crypto = require('node:crypto');
const { db, run, all, get, config } = require('./db');
const acces = require('./acces');
const { noter, ipDe } = require('./journal');

db.exec(`
CREATE TABLE IF NOT EXISTS utilisateurs(id INTEGER PRIMARY KEY, email TEXT UNIQUE, nom TEXT, mot_de_passe TEXT, role TEXT, societe_id INTEGER, actif INTEGER DEFAULT 1, cree_le TEXT, derniere_connexion TEXT, demo INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions(id INTEGER PRIMARY KEY, empreinte TEXT UNIQUE, utilisateur_id INTEGER, expire TEXT, cree_le TEXT);
`);
const colonnes = (t) => all(`PRAGMA table_info(${t})`).map((c) => c.name);
for (const [t, def] of [['utilisateurs', 'echecs INTEGER DEFAULT 0'], ['utilisateurs', 'bloque_jusqua TEXT'], ['utilisateurs', 'changer_mdp INTEGER DEFAULT 0'], ['utilisateurs', 'preferences TEXT'],
  ['sessions', 'societe_id INTEGER'], ['sessions', 'csrf TEXT'], ['sessions', 'activite TEXT'], ['sessions', 'ip TEXT']]) if (!colonnes(t).includes(def.split(' ')[0])) db.exec(`ALTER TABLE ${t} ADD COLUMN ${def}`);
db.exec('CREATE INDEX IF NOT EXISTS ix_sessions_util ON sessions(utilisateur_id); CREATE INDEX IF NOT EXISTS ix_sessions_expire ON sessions(expire)');
acces.migrer();

const ROLES = Object.fromEntries(Object.entries(acces.PROFILS).map(([k, [l]]) => [k, l]));
const LONGUEUR_MIN = 12, LONGUEUR_MAX = 128;
const ADMINS_MAX = 2; // administrateurs globaux actifs
const ECHECS_COMPTE = 10, MINUTES_BLOCAGE = 15;

// mots de passe trop courants, refusés même s'ils sont assez longs
const COURANTS = new Set(['123456789012', '1234567890123', 'azertyuiopqs', 'motdepasse123', 'motdepasse1234', 'password1234', 'password12345', 'passwordpassword', 'qwertyuiopas', 'azerty123456',
  'administrateur', 'brazzaville2026', 'brazzaville2025', 'pointenoire2026', 'congobrazzaville', 'smartrh123456', 'smart-rh-2026', 'bienvenue1234', 'bienvenue2026', 'changeme1234', 'jesuisadmin1', 'iloveyou1234', '000000000000', '111111111111', 'aaaaaaaaaaaa']);
const REFUS = {
  court: `Le mot de passe doit contenir ${LONGUEUR_MIN} caractères au moins.`, long: `Le mot de passe ne doit pas dépasser ${LONGUEUR_MAX} caractères.`,
  courant: 'Ce mot de passe est trop courant. Choisissez une phrase de plusieurs mots.', email: 'Le mot de passe ne doit pas contenir votre adresse e-mail.',
  identique: 'Le nouveau mot de passe doit être différent de l\'actuel.', different: 'Les deux mots de passe ne sont pas identiques.', identite: 'Renseignez votre nom et une adresse e-mail valide.',
};
// renvoie le code du refus, ou null si le mot de passe est accepté (seuls des codes passent dans les adresses, jamais du texte libre)
function motDePasseRefuse(mdp, email = '') {
  const m = String(mdp || '');
  if (m.length < LONGUEUR_MIN) return 'court';
  if (m.length > LONGUEUR_MAX) return 'long';
  const bas = m.toLowerCase();
  if (COURANTS.has(bas) || /^(.)\1+$/.test(m)) return 'courant';
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && bas.includes(local)) return 'email';
  return null;
}

// scrypt N=2^17, r=8, p=1 (recommandation OWASP) ; « scrypt$ » = ancien format N=2^14, recalculé à la connexion suivante
const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
function hacher(mdp) {
  const sel = crypto.randomBytes(16);
  return `scrypt17$${sel.toString('hex')}$${crypto.scryptSync(String(mdp), sel, 64, SCRYPT).toString('hex')}`;
}
function verifier(mdp, stocke) {
  const [algo, sel, h] = String(stocke || '').split('$');
  if (!['scrypt', 'scrypt17'].includes(algo) || !sel || !h) return false;
  const calcul = crypto.scryptSync(String(mdp).slice(0, LONGUEUR_MAX), Buffer.from(sel, 'hex'), 64, algo === 'scrypt17' ? SCRYPT : {});
  return crypto.timingSafeEqual(calcul, Buffer.from(h, 'hex'));
}
const aRecalculer = (stocke) => String(stocke || '').startsWith('scrypt$');
// à la connexion : calcul hors du fil principal, pour ne pas faire attendre les autres utilisateurs
const scryptAsync = require('node:util').promisify(crypto.scrypt);
async function verifierAsync(mdp, stocke) {
  const [algo, sel, h] = String(stocke || '').split('$');
  if (!['scrypt', 'scrypt17'].includes(algo) || !sel || !h) return false;
  const calcul = await scryptAsync(String(mdp).slice(0, LONGUEUR_MAX), Buffer.from(sel, 'hex'), 64, algo === 'scrypt17' ? SCRYPT : {});
  return crypto.timingSafeEqual(calcul, Buffer.from(h, 'hex'));
}
// comparaison à temps constant même quand le compte n'existe pas : on ne révèle pas quelles adresses existent
const LEURRE = hacher(crypto.randomBytes(12).toString('hex'));
const empreinte = (jeton) => crypto.createHash('sha256').update(jeton).digest('hex');
const maintenant = () => new Date().toISOString();
const dans = (ms) => new Date(Date.now() + ms).toISOString();

function creerUtilisateur({ email, nom, mdp, role, societeId = null, societes = [], demo = 0, changerMdp = 0 }) {
  const id = Number(run('INSERT INTO utilisateurs(email,nom,mot_de_passe,role,societe_id,actif,cree_le,demo,changer_mdp) VALUES(?,?,?,?,?,1,?,?,?)',
    String(email).trim().toLowerCase(), nom, hacher(mdp), role, role === 'societe' ? societeId : null, maintenant(), demo, changerMdp).lastInsertRowid);
  if (role === 'utilisateur') acces.rattacher(id, societes);
  return id;
}
function ouvrirSession(u, req) {
  const jeton = crypto.randomBytes(32).toString('hex');
  const liste = acces.societesDe(u);
  const societe = u.role === 'societe' ? u.societe_id : liste?.length === 1 ? liste[0] : null;
  run('INSERT INTO sessions(empreinte,utilisateur_id,expire,cree_le,societe_id,csrf,activite,ip) VALUES(?,?,?,?,?,?,?,?)', empreinte(jeton), u.id, dans(config.heuresSession * 3600e3), maintenant(), societe, crypto.randomBytes(32).toString('hex'), maintenant(), ipDe(req));
  run('UPDATE utilisateurs SET derniere_connexion=?, echecs=0, bloque_jusqua=NULL WHERE id=?', maintenant(), u.id);
  run('DELETE FROM sessions WHERE expire<? OR activite<?', maintenant(), new Date(Date.now() - config.minutesInactivite * 60e3).toISOString());
  return jeton;
}
function lireSession(jeton) {
  if (!jeton || !/^[0-9a-f]{64}$/.test(jeton)) return null;
  return get(`SELECT u.*, s.id session_id, s.societe_id session_societe, s.csrf, s.activite FROM sessions s JOIN utilisateurs u ON u.id=s.utilisateur_id
    WHERE s.empreinte=? AND s.expire>? AND u.actif=1`, empreinte(jeton), maintenant()) || null;
}
const fermerSessions = (utilisateurId) => run('DELETE FROM sessions WHERE utilisateur_id=?', utilisateurId);
function choisirSociete(req, societeId) {
  if (!req.user || !acces.accede(req.user, societeId)) return false;
  run('UPDATE sessions SET societe_id=? WHERE id=?', societeId, req.user.session_id);
  return true;
}

// limitation des tentatives : 8 échecs par adresse IP et par quart d'heure, et verrouillage temporaire du compte après 10 échecs
const echecs = new Map();
const bloque = (ip) => { const x = echecs.get(ip); if (!x || Date.now() - x.debut > 15 * 60e3) { echecs.delete(ip); return false; } return x.n >= 8; };
const noterEchec = (ip) => { const x = echecs.get(ip); if (!x || Date.now() - x.debut > 15 * 60e3) echecs.set(ip, { n: 1, debut: Date.now() }); else x.n++; if (echecs.size > 10000) echecs.clear(); };

const lireCookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((x) => x.trim().split('=')).filter((x) => x[0]).map(([k, ...v]) => { try { return [k, decodeURIComponent(v.join('='))]; } catch { return [k, '']; } }));
const cookie = (res, k, v, maxAgeSecondes) => res.append('Set-Cookie', `${k}=${encodeURIComponent(v)}; Path=/; HttpOnly; SameSite=Lax${config.https ? '; Secure' : ''}${maxAgeSecondes != null ? `; Max-Age=${Math.round(maxAgeSecondes)}` : ''}`);

// la démonstration fonctionne comme la production : aucun compte sans mot de passe, aucune entrée en un clic.
// Les anciens comptes de démonstration (versions 1.0 et 1.1, sans mot de passe utilisable) sont retirés.
for (const ancien of all('SELECT id FROM utilisateurs WHERE demo=1')) { fermerSessions(ancien.id); run('DELETE FROM utilisateur_societes WHERE utilisateur_id=?', ancien.id); run('DELETE FROM utilisateurs WHERE id=?', ancien.id); }

const CHEMINS_PUBLICS = ['/connexion', '/installation'];
// pages accessibles sans société ouverte
const SANS_SOCIETE = ['/societes', '/compte', '/deconnexion', '/utilisateurs', '/journal', '/sauvegardes', '/recherche'];
const memeOrigine = (req) => { const o = req.headers.origin || req.headers.referer; if (!o) return false; try { return new URL(o).host === req.headers.host; } catch { return false; } };
const egal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function middleware(req, res, next) {
  const c = lireCookies(req);
  req.cookies = c;
  req.user = lireSession(c.sid);
  // fermeture après inactivité
  if (req.user && req.user.activite < new Date(Date.now() - config.minutesInactivite * 60e3).toISOString()) {
    run('DELETE FROM sessions WHERE id=?', req.user.session_id); req.user = null;
    cookie(res, 'sid', '', 0);
    if (!CHEMINS_PUBLICS.includes(req.path)) return res.redirect('/connexion?erreur=session');
  }
  if (req.user && req.user.activite < new Date(Date.now() - 60e3).toISOString()) run('UPDATE sessions SET activite=? WHERE id=?', maintenant(), req.user.session_id);
  req.profil = req.user ? req.user.role : null;
  req.csrf = req.user?.csrf || null;

  // envoi de formulaire : jeton de session obligatoire une fois connecté ; avant connexion, l'origine doit être Smart RH
  if (req.method === 'POST') {
    const valide = req.user ? egal(String(req.body?._csrf || ''), req.user.csrf || '') : memeOrigine(req);
    if (!valide) return res.status(403).send('Requête refusée : formulaire expiré ou envoyé depuis un autre site. Rechargez la page et recommencez.');
  }

  const aucunCompte = get('SELECT COUNT(*) n FROM utilisateurs').n === 0;
  if (aucunCompte && req.path !== '/installation') return res.redirect('/installation');
  if (CHEMINS_PUBLICS.includes(req.path) || req.path === '/deconnexion' || req.path.startsWith('/demo/entrer/')) return next();
  if (!req.user) return res.redirect(`/connexion${req.method === 'GET' && req.path !== '/' ? `?suite=${encodeURIComponent(req.originalUrl)}` : ''}`);
  // mot de passe provisoire donné par un administrateur : à changer avant toute autre action
  if (req.user.changer_mdp && !['/compte', '/deconnexion'].includes(req.path)) return res.redirect('/compte?m=changer');

  // société de travail : celle de la session, à condition que le compte y ait accès
  const sid = req.profil === 'societe' ? req.user.societe_id : req.user.session_societe;
  req.societe = sid && acces.accede(req.user, sid) ? get('SELECT * FROM societes WHERE id=?', sid) : null;
  req.societesOuvertes = acces.societesDe(req.user);

  const droit = acces.droitRequis(req);
  if (droit && !acces.peut(req, droit)) return res.locals.interdit ? res.locals.interdit(req, res) : res.status(403).send('Accès réservé.');
  if (!req.societe && !SANS_SOCIETE.some((p) => req.path.startsWith(p))) {
    if (req.profil === 'admin' || (req.societesOuvertes?.length || 0) > 1) return res.redirect('/societes');
    return res.status(403).send(res.locals.sansSociete ? res.locals.sansSociete(req) : 'Ce compte n\'est rattaché à aucune société. Contactez votre administrateur.');
  }
  next();
}

// ajoute le jeton anti-falsification dans chaque formulaire envoyé en POST
function jetonFormulaires(req, res, next) {
  if (!req.csrf) return next();
  const envoyer = res.send.bind(res);
  res.send = (corps) => envoyer(typeof corps === 'string' && corps.includes('<form') ? corps.replace(/<form\b[^>]*\bmethod="post"[^>]*>/gi, (f) => `${f}<input type="hidden" name="_csrf" value="${req.csrf}">`) : corps);
  next();
}

// préférences d'affichage d'un compte
const PREF_DEFAUT = { theme: 'auto', texte: '100', contraste: '0', mouvement: '0', police: 'marque' };
const PREF_VALEURS = { theme: ['auto', 'clair', 'sombre'], texte: ['100', '115', '130'], contraste: ['0', '1'], mouvement: ['0', '1'], police: ['marque', 'lisible'] };
const preferences = (u) => { let p = {}; try { p = JSON.parse(u?.preferences || '{}'); } catch { /* préférences illisibles : valeurs par défaut */ } return Object.fromEntries(Object.entries(PREF_DEFAUT).map(([k, d]) => [k, PREF_VALEURS[k].includes(p[k]) ? p[k] : d])); };

module.exports = (app, h) => {
  const { e, dateFr, page, carte, tableau, options, aide, ic, interdit, marque } = h;
  const ecranMarque = (contenu) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connexion — Smart RH</title><link rel="icon" href="/logo.svg"><link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/style.css"></head>
<body class="connexion"><a class="evitement" href="#formulaire">Aller au formulaire</a><div class="ecran-connexion">
<div class="panneau-marque">${marque}
<div><h1>La paie et les RH des PME congolaises, enfin simples.</h1>
<ul class="atouts"><li>${ic('reglages')}<span><b>Règles paramétrables et datées</b>Une loi change : on ajoute une ligne, sans développeur.</span></li>
<li>${ic('societe')}<span><b>Plusieurs sociétés</b>Un cabinet gère tous ses clients, chacun cloisonné.</span></li>
<li>${ic('hors_ligne')}<span><b>Fonctionne sans internet</b>Installé sur votre poste ou votre serveur.</span></li></ul></div>
<small>${acces.donneesFictives() ? 'Base de démonstration : sociétés et salariés fictifs' : 'Smart RH'}</small></div><main id="formulaire">${contenu}</main></div></body></html>`;
  const suiteSure = (s) => (typeof s === 'string' && /^\/[a-z0-9/?=&%._-]*$/i.test(s) && !s.startsWith('//') ? s : '/');
  const entrer = (req, res, u, suite) => {
    // un ancien jeton de session n'est jamais réutilisé : nouvelle session à chaque connexion
    if (req.cookies?.sid) run('DELETE FROM sessions WHERE empreinte=?', empreinte(req.cookies.sid));
    cookie(res, 'sid', ouvrirSession(u, req), config.heuresSession * 3600);
    const plusieurs = u.role === 'admin' || (acces.societesDe(u)?.length || 0) > 1;
    res.redirect(plusieurs && suite === '/' ? '/societes' : suite);
  };

  app.get('/connexion', (req, res) => {
    const erreur = { identifiants: 'Adresse e-mail ou mot de passe incorrect.', bloque: 'Trop de tentatives. Réessayez dans un quart d\'heure.', session: 'Votre session a été fermée après une période d\'inactivité. Reconnectez-vous.' }[req.query.erreur];
    res.send(ecranMarque(`<form method="post" action="/connexion" class="formulaire-connexion"><h2>Connexion</h2><p>Entrez vos identifiants Smart RH.</p>
      ${erreur ? `<p class="alerte-ligne" role="alert">${erreur}</p>` : ''}
      <input type="hidden" name="suite" value="${e(suiteSure(req.query.suite))}">
      <label>Adresse e-mail<input type="email" name="email" autocomplete="username" required autofocus maxlength="200"></label>
      <label>Mot de passe<input type="password" name="mdp" autocomplete="current-password" required maxlength="${LONGUEUR_MAX}"></label>
      <button class="bouton large">Se connecter</button>${acces.donneesFictives() ? `<div class="bloc-demo"><p><b>Démonstration</b> : entrez directement dans un mode d'accès.</p>
      <div class="boutons-demo">${Object.entries(acces.PROFILS).map(([r, [l, d]]) => `<a class="bouton secondaire" href="/demo/entrer/${r}" data-bulle="${e(d)}">${l}</a>`).join('')}</div></div>` : ''}</form>`));
  });
  app.post('/connexion', async (req, res) => {
    const ip = ipDe(req), email = String(req.body.email || '').trim().toLowerCase().slice(0, 200);
    if (bloque(ip)) { noter(req, 'Connexion refusée : trop de tentatives depuis cette adresse', { utilisateur: null, qui: email, societeId: null }); return res.redirect('/connexion?erreur=bloque'); }
    const u = get('SELECT * FROM utilisateurs WHERE email=? AND actif=1 AND demo=0', email);
    const bon = await verifierAsync(req.body.mdp || '', u ? u.mot_de_passe : LEURRE);
    if (u && u.bloque_jusqua && u.bloque_jusqua > maintenant()) { noter(req, 'Connexion refusée : compte verrouillé', { utilisateur: u, societeId: null }); return res.redirect('/connexion?erreur=bloque'); }
    if (!u || !bon) {
      noterEchec(ip);
      if (u) {
        const n = (u.echecs || 0) + 1;
        run('UPDATE utilisateurs SET echecs=?, bloque_jusqua=? WHERE id=?', n >= ECHECS_COMPTE ? 0 : n, n >= ECHECS_COMPTE ? dans(MINUTES_BLOCAGE * 60e3) : null, u.id);
        if (n >= ECHECS_COMPTE) noter(req, `Compte verrouillé ${MINUTES_BLOCAGE} minutes après ${ECHECS_COMPTE} échecs`, { utilisateur: u, societeId: null });
      }
      noter(req, 'Échec de connexion', { utilisateur: null, qui: email, societeId: null });
      return res.redirect('/connexion?erreur=identifiants');
    }
    echecs.delete(ip);
    if (aRecalculer(u.mot_de_passe)) run('UPDATE utilisateurs SET mot_de_passe=? WHERE id=?', hacher(req.body.mdp), u.id);
    noter(req, 'Connexion', { utilisateur: u, societeId: null });
    entrer(req, res, u, suiteSure(req.body.suite));
  });

  // entrée directe dans un mode d'accès : uniquement sur une base de démonstration (préparée par npm run demo:preparer),
  // jamais sur une base de production. Provisoire, en attendant le choix du parcours de connexion.
  app.get('/demo/entrer/:role', (req, res) => {
    if (!acces.donneesFictives() || !ROLES[req.params.role]) return res.redirect('/connexion');
    const u = get('SELECT * FROM utilisateurs WHERE role=? AND actif=1 ORDER BY id LIMIT 1', req.params.role);
    if (!u) return res.redirect('/connexion');
    noter(req, 'Entrée directe de démonstration', { utilisateur: u, societeId: null });
    entrer(req, res, u, '/');
  });
  app.get('/deconnexion', (req, res) => {
    if (req.cookies.sid) run('DELETE FROM sessions WHERE empreinte=?', empreinte(req.cookies.sid));
    if (req.user) noter(req, 'Déconnexion', { societeId: null });
    cookie(res, 'sid', '', 0);
    res.redirect('/connexion');
  });

  // premier lancement : création du compte Admin
  app.get('/installation', (req, res) => {
    if (get('SELECT COUNT(*) n FROM utilisateurs').n > 0) return res.redirect('/connexion');
    const err = REFUS[req.query.erreur] ? `<p class="alerte-ligne" role="alert">${REFUS[req.query.erreur]}</p>` : '';
    res.send(ecranMarque(`<form method="post" action="/installation" class="formulaire-connexion"><h2>Bienvenue dans Smart RH</h2>
      <p>Créez le compte d'<b>administrateur global</b>. Il crée les sociétés et leur administrateur, et gère les sauvegardes. Gardez-le pour l'administration : le travail courant se fait avec les comptes des sociétés.</p>${err}
      <label>Votre nom<input name="nom" required autocomplete="name" maxlength="120"></label>
      <label>Adresse e-mail<input type="email" name="email" required autocomplete="username" maxlength="200"></label>
      <label>Mot de passe (${LONGUEUR_MIN} caractères au moins, une phrase de plusieurs mots est idéale)<input type="password" name="mdp" required minlength="${LONGUEUR_MIN}" maxlength="${LONGUEUR_MAX}" autocomplete="new-password"></label>
      <label>Confirmez le mot de passe<input type="password" name="mdp2" required minlength="${LONGUEUR_MIN}" maxlength="${LONGUEUR_MAX}" autocomplete="new-password"></label>
      <button class="bouton large">Créer le compte et commencer</button></form>`));
  });
  app.post('/installation', (req, res) => {
    if (get('SELECT COUNT(*) n FROM utilisateurs').n > 0) return res.redirect('/connexion');
    const b = req.body;
    const erreur = !b.nom || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email || '') ? 'identite' : motDePasseRefuse(b.mdp, b.email) || (b.mdp !== b.mdp2 ? 'different' : null);
    if (erreur) return res.redirect(`/installation?erreur=${erreur}`);
    const id = creerUtilisateur({ email: b.email, nom: String(b.nom).trim().slice(0, 120), mdp: b.mdp, role: 'admin' });
    entrer(req, res, get('SELECT * FROM utilisateurs WHERE id=?', id), '/');
  });

  // mon compte : mot de passe et affichage
  app.get('/compte', (req, res) => {
    const msg = { ok: ['succes-ligne', 'Mot de passe modifié. Les autres sessions ont été fermées.'], actuel: ['alerte-ligne', 'Le mot de passe actuel est incorrect.'], different: ['alerte-ligne', 'Les deux nouveaux mots de passe ne sont pas identiques.'],      changer: ['alerte-ligne', 'Votre mot de passe a été défini par un administrateur. Choisissez-en un nouveau pour continuer.'], affichage: ['succes-ligne', 'Préférences d\'affichage enregistrées.'], refuse: ['alerte-ligne', REFUS[req.query.detail] || 'Mot de passe refusé.'] }[req.query.m];
    const p = preferences(req.user);
    const choix = (nom, titre, liste, bulle) => `<fieldset class="choix-affichage"><legend>${titre}${bulle ? aide(bulle) : ''}</legend><div class="segments">${liste.map(([v, l]) => `<label><input type="radio" name="${nom}" value="${v}"${p[nom] === v ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div></fieldset>`;
    const lesSocietes = acces.listeSocietes(req.user);
    res.send(page(req, { titre: 'Mon compte', sous: `${e(req.user.nom)}, ${e(req.user.email)}. Mode d'accès : ${ROLES[req.user.role]}.` }, `
    ${msg ? `<p class="${msg[0]}" role="status">${msg[1]}</p>` : ''}
    <div class="disposition d-1-1">
    ${carte(`Affichage et accessibilité${aide('Ces réglages ne concernent que votre compte. Ils sont appliqués sur tous les postes où vous vous connectez.')}`, `<form method="post" action="/compte/affichage" class="form-pile">
      ${choix('theme', 'Thème', [['auto', 'Automatique'], ['clair', 'Clair'], ['sombre', 'Sombre']], 'Automatique suit le réglage de l\'ordinateur.')}
      ${choix('texte', 'Taille du texte', [['100', 'Normale'], ['115', 'Grande'], ['130', 'Très grande']])}
      ${choix('contraste', 'Contraste', [['0', 'Standard'], ['1', 'Renforcé']], 'Textes plus foncés, bordures plus marquées, liens toujours soulignés.')}
      ${choix('mouvement', 'Animations', [['0', 'Normales'], ['1', 'Réduites']], 'Supprime les transitions et les animations.')}
      ${choix('police', 'Police', [['marque', 'Smart RH'], ['lisible', 'Très lisible']], 'Police système plus large et plus espacée, plus confortable à la lecture.')}
      <button class="bouton">Enregistrer l'affichage</button></form>`)}
    <div class="pile">
    ${carte('Changer de mot de passe', `<form method="post" action="/compte" class="form-pile etroit">
      <label>Mot de passe actuel<input type="password" name="actuel" required autocomplete="current-password" maxlength="${LONGUEUR_MAX}"></label>
      <label>Nouveau mot de passe (${LONGUEUR_MIN} caractères au moins)${aide('Une phrase de plusieurs mots est plus sûre et plus facile à retenir qu\'un mot compliqué. Les mots de passe trop courants sont refusés.')}<input type="password" name="mdp" required minlength="${LONGUEUR_MIN}" maxlength="${LONGUEUR_MAX}" autocomplete="new-password"></label>
      <label>Confirmez le nouveau mot de passe<input type="password" name="mdp2" required minlength="${LONGUEUR_MIN}" maxlength="${LONGUEUR_MAX}" autocomplete="new-password"></label>
      <button class="bouton">Enregistrer le nouveau mot de passe</button></form>`)}
    ${carte('Mes accès', `<dl class="fiche une-col"><div><dt>Mode d'accès</dt><dd><b>${ROLES[req.user.role]}</b><small class="discret bloc">${acces.PROFILS[req.user.role][1]}</small></dd></div>
      <div><dt>Sociétés</dt><dd>${req.user.role === 'admin' ? 'Toutes' : lesSocietes.map((s) => e(s.nom)).join(', ') || '—'}</dd></div>
      <div><dt>Session</dt><dd>Fermée après ${config.minutesInactivite} minutes sans activité</dd></div></dl>`)}
    </div></div>`));
  });
  app.post('/compte', (req, res) => {
    const b = req.body, u = req.user;

    if (!verifier(b.actuel || '', u.mot_de_passe)) return res.redirect('/compte?m=actuel');
    const refus = motDePasseRefuse(b.mdp, u.email) || (b.mdp === b.actuel ? 'identique' : null);
    if (refus) return res.redirect(`/compte?m=refuse&detail=${refus}`);
    if (b.mdp !== b.mdp2) return res.redirect('/compte?m=different');
    run('UPDATE utilisateurs SET mot_de_passe=?, changer_mdp=0 WHERE id=?', hacher(b.mdp), u.id);
    fermerSessions(u.id);
    entrer(req, res, { ...u, changer_mdp: 0 }, '/compte?m=ok');
  });
  app.post('/compte/affichage', (req, res) => {
    const p = Object.fromEntries(Object.keys(PREF_DEFAUT).map((k) => [k, PREF_VALEURS[k].includes(req.body[k]) ? req.body[k] : PREF_DEFAUT[k]]));
    run('UPDATE utilisateurs SET preferences=? WHERE id=?', JSON.stringify(p), req.user.id);
    res.redirect('/compte?m=affichage');
  });

  // comptes : l'administrateur global gère tout le monde ; l'administrateur d'une société gère les comptes de sa société
  const adminsActifs = () => get("SELECT COUNT(*) n FROM utilisateurs WHERE role='admin' AND actif=1").n;
  const gerables = (req) => (req.profil === 'admin' ? all('SELECT * FROM utilisateurs WHERE demo=0 ORDER BY actif DESC, nom')
    : all(`SELECT DISTINCT u.* FROM utilisateurs u LEFT JOIN utilisateur_societes x ON x.utilisateur_id=u.id WHERE u.demo=0 AND u.role<>'admin' AND (u.societe_id=? OR x.societe_id=?) ORDER BY u.actif DESC, u.nom`, req.user.societe_id, req.user.societe_id));
  const peutGerer = (req, cible) => Boolean(cible && !cible.demo && cible.id !== req.user.id && (req.profil === 'admin'
    || (req.profil === 'societe' && cible.role !== 'admin' && (cible.role === 'societe' ? cible.societe_id === req.user.societe_id : acces.societesDe(cible).every((id) => id === req.user.societe_id)))));
  const nomsSocietes = (u) => { const l = acces.listeSocietes(u); return u.role === 'admin' ? '<span class="discret">Toutes</span>' : l.length ? l.map((s) => e(s.nom)).join(', ') : '<span class="et jaune">Aucune</span>'; };

  app.get('/utilisateurs', (req, res) => {
    const msg = { cree: 'Compte créé. Transmettez le mot de passe provisoire à la personne : il lui sera demandé de le changer à sa première connexion.', existe: 'Cette adresse e-mail est déjà utilisée.', invalide: 'Renseignez le nom, une adresse e-mail valide et au moins une société.', mdp: 'Mot de passe réinitialisé. Les sessions de ce compte ont été fermées ; un nouveau mot de passe lui sera demandé.', societes: 'Sociétés mises à jour.', admins: `Il y a déjà ${ADMINS_MAX} administrateurs globaux actifs : c'est le maximum. Désactivez-en un avant d'en ajouter ou d'en réactiver un autre.`, refuse: REFUS[req.query.detail] || 'Mot de passe refusé.' }[req.query.m];
    const socs = req.profil === 'admin' ? all('SELECT id, nom FROM societes ORDER BY nom') : all('SELECT id, nom FROM societes WHERE id=?', req.user.societe_id);
    const plein = adminsActifs() >= ADMINS_MAX;
    const roles = req.profil === 'admin' && !plein ? acces.PROFILS : { societe: acces.PROFILS.societe, utilisateur: acces.PROFILS.utilisateur };
    const cases = (u) => `<div class="cases-societes">${socs.map((s) => `<label><input type="checkbox" name="societes" value="${s.id}"${u && acces.societesDe(u)?.includes(s.id) ? ' checked' : ''}>${e(s.nom)}</label>`).join('')}</div>`;
    const lignes = gerables(req).map((u) => `<tr class="${u.actif ? '' : 'pale'}"><td><b>${e(u.nom)}</b><small class="discret bloc">${e(u.email)}</small></td><td><span class="et ${{ admin: 'bleu', societe: 'vert', utilisateur: 'gris' }[u.role]}">${ROLES[u.role]}</span></td><td>${nomsSocietes(u)}</td><td>${u.derniere_connexion ? dateFr(u.derniere_connexion.slice(0, 10)) : '<span class="discret">Jamais</span>'}</td><td>${u.actif ? (u.bloque_jusqua > maintenant() ? '<span class="et rouge">Verrouillé</span>' : '<span class="et vert">Actif</span>') : '<span class="et gris">Désactivé</span>'}</td>
      <td class="n outils">${peutGerer(req, u) ? `<details class="menu-actions"><summary class="bouton fantome petit">Gérer</summary><div>
        ${u.role === 'utilisateur' && req.profil === 'admin' ? `<form method="post" action="/utilisateurs/${u.id}/societes" class="form-pile"><b class="petit-titre">Sociétés ouvertes</b>${cases(u)}<button class="bouton secondaire petit">Enregistrer les sociétés</button></form>` : ''}
        <form method="post" action="/utilisateurs/${u.id}/mdp" class="form-mini"><input type="password" name="mdp" minlength="${LONGUEUR_MIN}" maxlength="${LONGUEUR_MAX}" required placeholder="Mot de passe provisoire" aria-label="Mot de passe provisoire pour ${e(u.nom)}" autocomplete="new-password"><button class="bouton secondaire petit">Réinitialiser</button></form>
        <form method="post" action="/utilisateurs/${u.id}/${u.actif ? 'desactiver' : 'activer'}"><button class="bouton ${u.actif ? 'fantome' : 'secondaire'} petit">${u.actif ? 'Désactiver le compte' : 'Réactiver le compte'}</button></form></div></details>` : u.id === req.user.id ? '<span class="discret">Vous</span>' : ''}</td></tr>`);
    res.send(page(req, { titre: 'Utilisateurs', sous: 'Les personnes qui ont accès à Smart RH, avec leur mode d\'accès et leurs sociétés.' }, `
    <div class="disposition d-2-1">
      <div class="pile">${carte('Comptes', `${msg ? `<p class="${['existe', 'invalide', 'refuse', 'admins'].includes(req.query.m) ? 'alerte-ligne' : 'succes-ligne'}" role="status">${msg}</p>` : ''}${tableau(['Personne', 'Mode d\'accès', 'Sociétés', 'Dernière connexion', 'État', ''], lignes, 'Aucun autre compte pour le moment.')}`)}
      ${carte('Les trois modes d\'accès', `<dl class="fiche une-col">${Object.values(acces.PROFILS).map(([l, d]) => `<div><dt>${l}</dt><dd>${d}</dd></div>`).join('')}</dl>`)}</div>
      ${carte('Ajouter un compte', `<form method="post" action="/utilisateurs" class="form-pile" id="nouveau-compte">
        <label>Nom<input name="nom" required maxlength="120"></label><label>Adresse e-mail<input type="email" name="email" required autocomplete="off" maxlength="200"></label>
        <fieldset class="choix-affichage"><legend>Mode d'accès</legend><div class="segments verticaux">${Object.entries(roles).map(([k, [l, d]]) => `<label><input type="radio" name="role" value="${k}"${k === 'utilisateur' ? ' checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('')}</div></fieldset>
        ${req.profil === 'admin' && plein ? `<p class="discret petit-texte">${ADMINS_MAX} administrateurs globaux actifs : c'est le maximum.</p>` : ''}
        ${req.profil === 'admin' ? `<fieldset class="choix-affichage" data-selon-role><legend>Sociétés ${aide('Administrateur de société : cochez une seule société. Utilisateur : une ou plusieurs. Administrateur global : toutes, rien à cocher.')}</legend>${cases(null)}</fieldset>` : `<p class="discret petit-texte">Le compte sera rattaché à ${e(req.user.societe_id ? get('SELECT nom FROM societes WHERE id=?', req.user.societe_id)?.nom : 'votre société')}.</p>`}
        <label>Mot de passe provisoire (${LONGUEUR_MIN} caractères au moins)${aide('La personne devra le changer à sa première connexion.')}<input type="password" name="mdp" required minlength="${LONGUEUR_MIN}" maxlength="${LONGUEUR_MAX}" autocomplete="new-password"></label>
        <button class="bouton">${ic('plus')}Créer le compte</button></form>`, { cls: 'collant' })}
    </div>`));
  });
  const societesChoisies = (req) => {
    if (req.profil !== 'admin') return [req.user.societe_id];
    const ids = [].concat(req.body.societes || []).map(Number).filter(Boolean);
    return ids.filter((id) => get('SELECT id FROM societes WHERE id=?', id));
  };
  app.post('/utilisateurs', (req, res) => {
    const b = req.body;
    const role = req.profil === 'admin' ? (ROLES[b.role] ? b.role : 'utilisateur') : (['societe', 'utilisateur'].includes(b.role) ? b.role : 'utilisateur');
    if (role === 'admin' && adminsActifs() >= ADMINS_MAX) return res.redirect('/utilisateurs?m=admins');
    const societes = role === 'admin' ? [] : societesChoisies(req);
    if (!b.nom || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email || '') || (role !== 'admin' && !societes.length) || (role === 'societe' && societes.length !== 1)) return res.redirect('/utilisateurs?m=invalide');
    const refus = motDePasseRefuse(b.mdp, b.email);
    if (refus) return res.redirect(`/utilisateurs?m=refuse&detail=${refus}`);
    if (get('SELECT id FROM utilisateurs WHERE email=?', String(b.email).trim().toLowerCase())) return res.redirect('/utilisateurs?m=existe');
    creerUtilisateur({ email: b.email, nom: String(b.nom).trim().slice(0, 120), mdp: b.mdp, role, societeId: societes[0] || null, societes, changerMdp: 1 });
    res.redirect('/utilisateurs?m=cree');
  });
  const action = (fn) => (req, res) => {
    const cible = get('SELECT * FROM utilisateurs WHERE id=?', Number(req.params.id));
    if (!peutGerer(req, cible)) return interdit(req, res);
    const m = fn(cible, req);
    res.redirect(`/utilisateurs${m ? `?${m}` : ''}`);
  };
  app.post('/utilisateurs/:id/desactiver', action((u) => { run('UPDATE utilisateurs SET actif=0 WHERE id=?', u.id); fermerSessions(u.id); }));
  app.post('/utilisateurs/:id/activer', action((u) => {
    if (u.role === 'admin' && !u.actif && adminsActifs() >= ADMINS_MAX) return 'm=admins';
    run('UPDATE utilisateurs SET actif=1, echecs=0, bloque_jusqua=NULL WHERE id=?', u.id);
  }));
  app.post('/utilisateurs/:id/mdp', action((u, req) => {
    const refus = motDePasseRefuse(req.body.mdp, u.email);
    if (refus) return `m=refuse&detail=${refus}`;
    run('UPDATE utilisateurs SET mot_de_passe=?, changer_mdp=1, echecs=0, bloque_jusqua=NULL WHERE id=?', hacher(req.body.mdp), u.id); fermerSessions(u.id);
    return 'm=mdp';
  }));
  app.post('/utilisateurs/:id/societes', action((u, req) => {
    if (u.role !== 'utilisateur' || req.profil !== 'admin') return 'm=invalide';
    const ids = societesChoisies(req);
    if (!ids.length) return 'm=invalide';
    acces.rattacher(u.id, ids);
    return 'm=societes';
  }));
};

Object.assign(module.exports, { middleware, jetonFormulaires, ROLES, ADMINS_MAX, creerUtilisateur, verifier, hacher, lireCookies,
 cookie, choisirSociete, preferences, motDePasseRefuse, LONGUEUR_MIN });
