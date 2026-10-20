// Tests de bout en bout sur une base temporaire. Usage : node tests/integration.js demo | production
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');

const mode = process.argv[2] === 'production' ? 'production' : 'demo';
const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-rh-test-'));
process.env.SMART_RH_DB = path.join(dossier, 'test.db');
process.env.SMART_RH_SAUVEGARDES = path.join(dossier, 'sauvegardes');
process.env.SMART_RH_PROXY = '1'; // pour simuler des adresses IP différentes (X-Forwarded-For)

// démonstration : base préparée par le script de démonstration, puis utilisée exactement comme en production
const MDP_DEMO = 'phrase de démonstration';
const comptesDemo = mode === 'demo' ? require('../scripts/preparer-demo').preparer({ motDePasse: MDP_DEMO }) : [];
const app = require('../server');
const { get, run } = require('../db');

let base, reussis = 0, jeton = '';
const pot = {};
const cookies = () => Object.entries(pot).map(([k, v]) => `${k}=${v}`).join('; ');
// comme un navigateur : cookies conservés, en-tête Origin sur les envois, jeton anti-falsification repris des pages
async function req(methode, chemin, corps, entetes = {}) {
  if (methode === 'POST') corps = { _csrf: jeton, ...(corps || {}) };
  const r = await fetch(base + chemin, {
    method: methode, redirect: 'manual',
    headers: { cookie: cookies(), ...(corps ? { 'content-type': 'application/x-www-form-urlencoded', origin: base } : {}), ...entetes },
    body: corps ? new URLSearchParams(corps).toString() : undefined,
  });
  for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, ...v] = kv.split('='); pot[k] = v.join('='); }
  const texte = await r.text();
  const m = texte.match(/name="_csrf" value="([0-9a-f]{64})"/); if (m) jeton = m[1];
  return { statut: r.status, lieu: r.headers.get('location'), texte, entetes: r.headers };
}
// après une connexion, le jeton change : on le reprend sur « Mon compte »
async function jetonFrais() { const r = await fetch(`${base}/compte`, { headers: { cookie: cookies() }, redirect: 'manual' }); const m = (await r.text()).match(/name="_csrf" value="([0-9a-f]{64})"/); jeton = m ? m[1] : ''; }
// connexion par l'écran de connexion, avec le mot de passe du compte (aucune entrée sans mot de passe)
let ipTest = 0;
const connecter = async (email, mdp) => { const r = await req('POST', '/connexion', { email, mdp, suite: '/' }, { 'x-forwarded-for': `10.1.0.${++ipTest}` }); await jetonFrais(); return r; };
const entrer = (role) => connecter(comptesDemo.find((c) => c.role === role).email, MDP_DEMO);
const ok = (cond, message) => { assert.ok(cond, message); reussis++; };
const page200 = async (chemin) => {
  const r = await req('GET', chemin);
  ok(r.statut === 200, `${chemin} : statut ${r.statut} au lieu de 200`);
  ok(!/\bundefined\b|\bNaN\b|\[object Object\]/.test(r.texte.replace(/<script[\s\S]*?<\/script>/g, '')), `${chemin} : valeur non définie affichée`);
  ok(!/ on(click|change|submit)=/.test(r.texte), `${chemin} : script écrit dans la page`);
  return r;
};

async function testsDemo() {
  ok((await req('GET', '/')).lieu?.startsWith('/connexion'), 'sans session, redirection vers la connexion');
  ok((await req('GET', '/connexion')).texte.includes('/demo/entrer/utilisateur'), 'démonstration : entrée directe proposée dans les trois modes');
  ok((await req('GET', '/demo/entrer/societe')).lieu === '/' && (await req('GET', '/salaries')).statut === 200, 'démonstration : entrée directe en administrateur de société');
  await req('GET', '/deconnexion');
  ok((await connecter('admin@demo.smart-rh.cg', 'mauvais mot de passe')).lieu.includes('erreur=identifiants'), 'démonstration : mauvais mot de passe refusé');
  ok((await entrer('admin')).lieu === '/societes', 'démonstration : connexion de l\'administrateur global par mot de passe');
  await req('POST', '/societes/choisir', { id: '1' });
  const en = (await req('GET', '/')).entetes;
  ok(/script-src 'self';/.test(en.get('content-security-policy')) && en.get('cache-control') === 'no-store', 'en-têtes : aucun script dans les pages, pas de cache');
  const pages = ['/', '/analyses', '/salaries', '/salaries/1', '/salaries/1/modifier', '/salaries/2/sortie?motif=licenciement&preavis=dispense', '/embauche', '/conges', '/dotations',
    '/variables', '/paie', '/declarations', '/declarations?onglet=impots', '/declarations?onglet=annuel', '/regles', '/regles?onglet=rubriques', '/regles?onglet=bareme',
    '/structure', '/convention', '/societe/parametres', '/societes', '/utilisateurs', '/journal', '/sauvegardes', '/compte'];
  for (const p of pages) await page200(p);

  // éléments variables puis paie
  ok((await req('POST', '/variables', { periode: '2026-10', h_5_hs1: '5', p_5: '15000', l_5: 'Prime test', calculer: '1' })).statut === 302, 'saisie des éléments variables');
  const b = get("SELECT b.id, b.brut FROM bulletins b WHERE salarie_id=5 AND periode='2026-10'");
  ok(b && get("SELECT montant FROM bulletin_lignes WHERE bulletin_id=? AND code='HS1'", b.id)?.montant === 5712, 'heures supplémentaires : 5 h à +10 % = 5 712 FCFA');
  await page200(`/paie/bulletin/${b.id}`);
  ok((await req('GET', '/declarations/export?type=cnss&periode=2026-10&annee=2026')).texte.includes('Retraite salarié'), 'export du bordereau CNSS');

  // avenant tracé
  await req('POST', '/salaries/5/modifier', { nom: 'Ibara', prenom: 'Chancel', sexe: 'M', situation: 'Marié', enfants: '1', poste_id: String(get('SELECT poste_id FROM salaries WHERE id=5').poste_id), type: 'CDI', salaire_base: '170000', sursalaire: '20000', prime_transport: '25000', effet: '2026-11-01' });
  ok(get("SELECT detail FROM evenements WHERE salarie_id=5 AND type='Avenant'")?.detail.includes('170 000'), 'avenant enregistré dans l\'historique');

  // absence : saisie puis annulation
  await req('POST', '/conges', { salarie_id: '5', type: 'permission', date_debut: '2026-11-05', date_fin: '2026-11-05', motif: 'Test' });
  const abs = get("SELECT id FROM conges WHERE motif='Test'");
  ok(abs, 'absence saisie');
  await req('POST', `/conges/${abs.id}/annuler`);
  ok(!get("SELECT id FROM conges WHERE motif='Test'"), 'absence annulée');

  // structure : un poste ne peut pas pointer vers le département d'une autre société
  const depAutre = get('SELECT id FROM departements WHERE societe_id=2'), cat = get('SELECT id FROM categories WHERE societe_id=1');
  await req('POST', '/structure/poste', { intitule: 'Poste croisé', departement_id: String(depAutre.id), categorie_id: String(cat.id) });
  ok(!get("SELECT id FROM postes WHERE intitule='Poste croisé'"), 'poste refusé avec un département d\'une autre société');
  ok((await req('POST', '/structure/categorie', { libelle: 'Sans code' })).statut === 302, 'catégorie sans code : refusée sans erreur');

  // journal et sauvegarde chiffrée
  ok((await req('GET', '/journal')).texte.includes('Calcul de la paie') || (await req('GET', '/journal')).texte.includes('Saisie des éléments variables'), 'actions inscrites au journal');
  await req('POST', '/sauvegardes');
  const copie = fs.readdirSync(process.env.SMART_RH_SAUVEGARDES).find((f) => f.endsWith('-manuelle.db.chiffre'));
  ok(copie, 'sauvegarde manuelle créée et chiffrée');
  const brut = fs.readFileSync(path.join(process.env.SMART_RH_SAUVEGARDES, copie));
  ok(!brut.includes('SQLite format') && !brut.includes('Mabiala'), 'la sauvegarde chiffrée ne laisse rien lire');
  ok(require('../sauvegarde').dechiffrer(brut).subarray(0, 15).toString() === 'SQLite format 3', 'la sauvegarde se déchiffre avec la clé');
  brut[brut.length - 1] ^= 1;
  ok((() => { try { require('../sauvegarde').dechiffrer(brut); return false; } catch { return true; } })(), 'une sauvegarde modifiée est détectée');

  // sécurité : formulaire sans jeton ou venant d'un autre site, injection dans un lien, export Excel, page inconnue
  ok((await req('POST', '/paie/calculer', { periode: '2026-10', _csrf: '' })).statut === 403, 'envoi sans jeton anti-falsification refusé');
  ok((await req('POST', '/paie/calculer', { periode: '2026-10' }, { origin: 'http://site-malveillant.example' })).statut === 302, 'le jeton seul suffit (même origine déclarée autrement)');
  ok((await req('POST', '/paie/calculer', { periode: '2026-10', _csrf: 'a'.repeat(64) })).statut === 403, 'faux jeton refusé');
  ok(!(await req('GET', '/declarations/imprimer?type=cnss&periode=%22%3E%3Cscript%3Ealert(1)%3C/script%3E')).texte.includes('<script>alert'), 'paramètre d\'adresse jamais recopié tel quel dans la page');
  run("UPDATE salaries SET nom='=HYPERLINK(1)' WHERE id=1");
  await req('POST', '/paie/calculer', { periode: '2026-10' });
  ok(!(await req('GET', '/declarations/export?type=cnss&periode=2026-10')).texte.includes(';"=HYPERLINK'), 'export Excel : formule neutralisée');
  run("UPDATE salaries SET nom='Mabiala' WHERE id=1");
  const donnees = await req('GET', '/salaries/1/donnees');
  ok(donnees.statut === 200 && JSON.parse(donnees.texte).salarie.nom === 'Mabiala', 'export des données personnelles d\'un salarié');
  ok((await req('GET', '/page-inexistante')).statut === 404, 'page inconnue : 404');
  const bareme = get('SELECT id, valeur FROM convention_baremes WHERE valeur IS NOT NULL LIMIT 1');
  await req('GET', '/deconnexion');
  ok((await req('GET', '/paie')).lieu?.startsWith('/connexion'), 'déconnexion effective');

  // mode Société : sa société seulement ; règles oui ; barème partagé, sauvegardes et autres sociétés non
  await entrer('societe');
  await page200('/regles');
  await page200('/utilisateurs');
  ok((await req('GET', '/sauvegardes')).statut === 403, 'Société : pas d\'accès aux sauvegardes');
  ok((await req('GET', '/societes')).lieu === '/', 'Société : pas de liste des sociétés');
  await req('POST', `/convention/bareme/${bareme.id}`, { valeur: '99' });
  ok(get('SELECT valeur FROM convention_baremes WHERE id=?', bareme.id).valeur === bareme.valeur, 'Société : le barème partagé de la convention reste intact');
  await req('POST', '/societes/choisir', { id: '2' });
  ok(!(await req('GET', '/salaries')).texte.includes('Tchicaya'), 'Société : impossible d\'ouvrir une autre société');
  const bulAutre = get('SELECT b.id FROM bulletins b JOIN salaries e ON e.id=b.salarie_id WHERE e.societe_id=2 LIMIT 1');
  if (bulAutre) ok((await req('GET', `/paie/bulletin/${bulAutre.id}`)).lieu === '/paie', 'Société : bulletin d\'une autre société inaccessible');
  ok((await req('GET', '/salaries/7')).lieu === '/salaries', 'Société : fiche d\'un salarié d\'une autre société inaccessible');
  await req('GET', '/deconnexion');

  // mode Utilisateur : saisie courante dans ses sociétés ; ni règles, ni comptes, ni sorties
  await entrer('utilisateur');
  await req('POST', '/societes/choisir', { id: '1' });
  for (const [p, l] of [['/regles', 'règles'], ['/utilisateurs', 'comptes'], ['/journal', 'journal'], ['/sauvegardes', 'sauvegardes'], ['/salaries/2/sortie', 'sorties'], ['/salaries/1/donnees', 'export des données'], ['/societe/parametres', 'informations légales']]) ok((await req('GET', p)).statut === 403, `Utilisateur : pas d'accès (${l})`);
  ok((await req('POST', '/structure/departement', { nom: 'Interdit' })).statut === 403 && !get("SELECT id FROM departements WHERE nom='Interdit'"), 'Utilisateur : la structure est en lecture seule');
  await page200('/salaries');
  await page200('/conges');
  await page200('/structure');
  ok(!(await req('GET', '/recherche?q=regles')).texte.includes('/regles'), 'Utilisateur : la recherche ne propose pas les règles');
  await req('POST', '/societes/choisir', { id: '2' });
  ok((await req('GET', '/salaries')).texte.includes('Tchicaya'), 'Utilisateur : passe d\'une société ouverte à l\'autre');
  // préférences d'affichage
  await req('POST', '/compte/affichage', { theme: 'sombre', texte: '130', contraste: '1', mouvement: '1', police: 'lisible' });
  ok(/data-theme="sombre" data-texte="130" data-contraste="1" data-mouvement="1" data-police="lisible"/.test((await req('GET', '/salaries')).texte), 'préférences d\'affichage appliquées à la page');
  await req('POST', '/compte/affichage', { theme: 'pirate', texte: '999' });
  ok(/data-theme="auto" data-texte="100"/.test((await req('GET', '/salaries')).texte), 'préférence inconnue : valeur par défaut');
}

async function testsProduction() {
  ok((await req('GET', '/')).lieu === '/installation', 'premier lancement : création du compte Admin');
  ok((await req('GET', '/demo/entrer/admin')).lieu === '/installation', 'aucune entrée de démonstration');
  ok(!(await req('GET', '/connexion')).texte.includes('/demo/entrer'), 'production : pas de boutons d\'entrée directe');
  ok((await req('POST', '/installation', { nom: 'Test', email: 'admin@test.cg', mdp: 'court', mdp2: 'court' })).lieu.includes('erreur=court'), 'mot de passe trop court refusé');
  ok((await req('POST', '/installation', { nom: 'Test', email: 'admin@test.cg', mdp: 'motdepasse123', mdp2: 'motdepasse123' })).lieu.includes('erreur=courant'), 'mot de passe courant refusé');
  ok((await req('POST', '/installation', { nom: 'Test', email: 'admin@test.cg', mdp: 'phrase de passe solide', mdp2: 'phrase de passe solide' }, { origin: 'http://site-malveillant.example' })).statut === 403, 'installation depuis un autre site refusée');
  ok((await req('POST', '/installation', { nom: 'Responsable Test', email: 'admin@test.cg', mdp: 'phrase de passe solide', mdp2: 'phrase de passe solide' })).statut === 302, 'compte Admin créé');
  await jetonFrais();
  ok(get("SELECT role FROM utilisateurs WHERE email='admin@test.cg'").role === 'admin', 'le premier compte est en mode Admin');
  ok(get('SELECT COUNT(*) n FROM salaries').n === 0 && get('SELECT COUNT(*) n FROM conventions').n === 5 && get('SELECT COUNT(*) n FROM parametres').n > 30, 'base vierge avec le référentiel légal');
  await req('POST', '/societes', { nom: 'Société Test', ville: 'Brazzaville', convention: 'BTP', niu: '' });
  for (const p of ['/', '/analyses', '/salaries', '/embauche', '/conges', '/paie', '/declarations', '/variables', '/structure', '/convention', '/regles', '/dotations', '/utilisateurs', '/sauvegardes']) await page200(p);
  ok(get("SELECT convention_code FROM societes WHERE nom='Société Test'").convention_code === 'BTP', 'convention rattachée à la création');

  // parcours : l'administrateur global crée une société et son administrateur, qui crée ensuite ses utilisateurs
  ok((await req('POST', '/societes', { nom: 'Boulangerie du Plateau', ville: 'Brazzaville', convention: 'Commerce', resp_nom: 'Chef Boulangerie', resp_email: 'chef@boulangerie.cg', resp_mdp: 'court' })).lieu.includes('m=mdp') && !get("SELECT id FROM societes WHERE nom='Boulangerie du Plateau'"), 'société refusée si le mot de passe de son administrateur est refusé (tout ou rien)');
  ok((await req('POST', '/societes', { nom: 'Boulangerie du Plateau', ville: 'Brazzaville', convention: 'Commerce', resp_nom: 'Chef Boulangerie', resp_email: 'chef@boulangerie.cg', resp_mdp: 'provisoire du patron' })).lieu.includes('m=creee'), 'société créée avec son administrateur');
  const boul = get("SELECT id FROM societes WHERE nom='Boulangerie du Plateau'").id;
  const chef = get("SELECT * FROM utilisateurs WHERE email='chef@boulangerie.cg'");
  ok(chef.role === 'societe' && chef.societe_id === boul && chef.changer_mdp === 1, 'administrateur de société rattaché, mot de passe provisoire');
  ok((await req('GET', '/societes')).texte.includes('Chef Boulangerie'), 'l\'administrateur de chaque société est affiché');
  // deux administrateurs globaux au plus
  await req('POST', '/utilisateurs', { nom: 'Second admin', email: 'admin2@test.cg', role: 'admin', mdp: 'second administrateur' });
  ok(get("SELECT role FROM utilisateurs WHERE email='admin2@test.cg'")?.role === 'admin', 'second administrateur global créé');
  ok((await req('POST', '/utilisateurs', { nom: 'Troisième', email: 'admin3@test.cg', role: 'admin', mdp: 'troisieme administrateur' })).lieu.includes('m=admins') && !get("SELECT id FROM utilisateurs WHERE email='admin3@test.cg'"), 'troisième administrateur global refusé');
  await req('GET', '/deconnexion');
  // l'administrateur de la société se connecte, change son mot de passe et crée un utilisateur de sa société
  await connecter('chef@boulangerie.cg', 'provisoire du patron');
  ok((await req('GET', '/')).lieu === '/compte?m=changer', 'administrateur de société : changement du mot de passe provisoire exigé');
  await req('POST', '/compte', { actuel: 'provisoire du patron', mdp: 'le pain du plateau chaque matin', mdp2: 'le pain du plateau chaque matin' });
  await jetonFrais();
  ok((await req('GET', '/utilisateurs')).statut === 200, 'administrateur de société : accès à ses comptes');
  ok(!(await req('GET', '/utilisateurs')).texte.includes('value="admin"'), 'administrateur de société : ne peut pas créer d\'administrateur global');
  await req('POST', '/utilisateurs', { nom: 'Vendeuse', email: 'vendeuse@boulangerie.cg', role: 'utilisateur', societes: String(get("SELECT id FROM societes WHERE nom='Société Test'").id), mdp: 'provisoire de la boutique' });
  const vendeuse = get("SELECT id FROM utilisateurs WHERE email='vendeuse@boulangerie.cg'");
  ok(vendeuse && require('../acces').societesDe({ id: vendeuse.id, role: 'utilisateur' }).join() === String(boul), 'utilisateur créé dans la seule société de son administrateur (choix d\'une autre société ignoré)');
  await req('GET', '/deconnexion');
  await connecter('vendeuse@boulangerie.cg', 'provisoire de la boutique');
  ok((await req('GET', '/salaries')).lieu === '/compte?m=changer', 'utilisateur : changement du mot de passe provisoire exigé');
  await req('GET', '/deconnexion');
  await connecter('admin@test.cg', 'phrase de passe solide');

  // compte Utilisateur : mot de passe provisoire à changer à la première connexion
  await req('POST', '/utilisateurs', { nom: 'Agent RH', email: 'rh@test.cg', role: 'utilisateur', societes: String(get('SELECT id FROM societes').id), mdp: 'provisoire agent rh' });
  ok(get("SELECT changer_mdp FROM utilisateurs WHERE email='rh@test.cg'")?.changer_mdp === 1, 'compte Utilisateur créé avec un mot de passe provisoire');
  await req('GET', '/deconnexion');
  ok((await req('POST', '/connexion', { email: 'rh@test.cg', mdp: 'faux-mot-de-passe' })).lieu.includes('erreur=identifiants'), 'mauvais mot de passe refusé');
  ok((await req('POST', '/connexion', { email: 'inconnu@test.cg', mdp: 'faux-mot-de-passe' })).lieu.includes('erreur=identifiants'), 'adresse inconnue : même réponse');
  ok((await req('POST', '/connexion', { email: 'rh@test.cg', mdp: 'provisoire agent rh', suite: '/' })).lieu === '/', 'connexion par mot de passe');
  await jetonFrais();
  ok((await req('GET', '/salaries')).lieu === '/compte?m=changer', 'mot de passe provisoire : changement exigé');
  await req('POST', '/compte', { actuel: 'provisoire agent rh', mdp: 'ma nouvelle phrase secrète', mdp2: 'ma nouvelle phrase secrète' });
  await jetonFrais();
  await page200('/salaries');
  ok(get("SELECT COUNT(*) n FROM journal WHERE action='Échec de connexion'").n >= 2, 'échecs de connexion inscrits au journal');

  // ancien format de mot de passe (version 1.0) : accepté puis recalculé au format renforcé
  const crypto = require('node:crypto'), sel = crypto.randomBytes(16);
  run('UPDATE utilisateurs SET mot_de_passe=? WHERE email=?', `scrypt$${sel.toString('hex')}$${crypto.scryptSync('ancien mot de passe 1.0', sel, 64).toString('hex')}`, 'admin@test.cg');
  ok((await req('POST', '/connexion', { email: 'admin@test.cg', mdp: 'ancien mot de passe 1.0', suite: '/' }, { 'x-forwarded-for': '10.0.2.1' })).statut === 302 && get("SELECT mot_de_passe FROM utilisateurs WHERE email='admin@test.cg'").mot_de_passe.startsWith('scrypt17$'), 'ancien mot de passe accepté puis renforcé');
  await jetonFrais();

  // session fermée après inactivité
  run("UPDATE sessions SET activite='2000-01-01T00:00:00.000Z'");
  ok((await req('GET', '/salaries')).lieu === '/connexion?erreur=session', 'session fermée après inactivité');

  // verrouillage du compte après 10 échecs, même depuis des adresses différentes
  for (let i = 0; i < 10; i++) await req('POST', '/connexion', { email: 'rh@test.cg', mdp: 'faux' }, { 'x-forwarded-for': `10.0.0.${i}` });
  ok(get("SELECT bloque_jusqua FROM utilisateurs WHERE email='rh@test.cg'").bloque_jusqua > new Date().toISOString(), 'compte verrouillé après 10 échecs');
  ok((await req('POST', '/connexion', { email: 'rh@test.cg', mdp: 'ma nouvelle phrase secrète' }, { 'x-forwarded-for': '10.0.1.1' })).lieu.includes('erreur=bloque'), 'compte verrouillé : bon mot de passe refusé aussi');
  // limitation par adresse IP
  for (let i = 0; i < 8; i++) await req('POST', '/connexion', { email: 'x@test.cg', mdp: 'faux' }, { 'x-forwarded-for': '10.9.9.9' });
  ok((await req('POST', '/connexion', { email: 'admin@test.cg', mdp: 'phrase de passe solide' }, { 'x-forwarded-for': '10.9.9.9' })).lieu.includes('erreur=bloque'), 'blocage d\'une adresse IP après 8 échecs');
}

const serveur = app.listen(0, '127.0.0.1', async () => {
  base = `http://127.0.0.1:${serveur.address().port}`;
  try {
    await (mode === 'demo' ? testsDemo() : testsProduction());
    console.log(`OK  ${reussis} vérifications réussies (mode ${mode})`);
  } catch (err) {
    console.error(`ÉCHEC (mode ${mode}) : ${err.message}`);
    process.exitCode = 1;
  } finally {
    serveur.close();
    require('../db').db.close();
    try { fs.rmSync(dossier, { recursive: true, force: true }); } catch { /* fichier temporaire : nettoyé par le système */ }
    process.exit();
  }
});
