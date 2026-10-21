// Journal : chaque modification, connexion et consultation de données personnelles garde qui, quand, où et quoi.
// Il n'existe aucun écran pour modifier ou effacer une ligne du journal.
const { db, run, all } = require('./db');

db.exec('CREATE TABLE IF NOT EXISTS journal(id INTEGER PRIMARY KEY, date TEXT, utilisateur_id INTEGER, utilisateur TEXT, societe_id INTEGER, action TEXT, chemin TEXT, ip TEXT)');
db.exec('CREATE INDEX IF NOT EXISTS ix_journal_soc ON journal(societe_id, id)');

// libellé lisible de l'action d'après l'adresse du formulaire
const ACTIONS = [
  [/^\/connexion$/, null], [/^\/installation$/, 'Création du compte principal'], [/^\/compte$/, 'Changement de mot de passe'], [/^\/compte\/affichage$/, null],
  [/^\/utilisateurs\/\d+\/societes$/, 'Modification des sociétés d\'un utilisateur'], [/^\/societes\/ouvrir$/, null],
  [/^\/utilisateurs$/, 'Création d\'un utilisateur'], [/^\/utilisateurs\/\d+\/desactiver$/, 'Désactivation d\'un utilisateur'], [/^\/utilisateurs\/\d+\/activer$/, 'Réactivation d\'un utilisateur'], [/^\/utilisateurs\/\d+\/mdp$/, 'Réinitialisation d\'un mot de passe'],
  [/^\/societes$/, 'Création d\'une société'], [/^\/societes\/choisir$/, null], [/^\/societe\/parametres$/, 'Modification des informations de la société'], [/^\/societe\/logo$/, 'Modification du logo de la société'], [/^\/societe\/logo\/retirer$/, 'Suppression du logo de la société'],
  [/^\/structure\/departement$/, 'Ajout d\'un département'], [/^\/structure\/categorie$/, 'Ajout d\'une catégorie'], [/^\/structure\/poste$/, 'Ajout d\'un poste'],
  [/^\/regles\/parametre$/, 'Nouvelle version d\'une règle de paie'], [/^\/regles\/rubrique\/\d+\/bascule$/, 'Activation ou désactivation d\'une rubrique'],
  [/^\/embauche$/, 'Embauche'], [/^\/salaries\/\d+\/modifier$/, 'Modification d\'une fiche salarié'], [/^\/salaries\/\d+\/sortie$/, 'Sortie d\'un salarié'],
  [/^\/dotations\/materiel$/, 'Ajout de matériel au catalogue'], [/^\/dotations$/, 'Remise de matériel'], [/^\/dotations\/\d+\/retour$/, 'Retour de matériel'],
  [/^\/paie\/calculer$/, 'Calcul de la paie'], [/^\/variables$/, 'Saisie des éléments variables'],
  [/^\/conges$/, 'Saisie d\'une absence'], [/^\/conges\/\d+\/valider$/, 'Validation d\'une absence'], [/^\/conges\/\d+\/refuser$/, 'Refus d\'une absence'], [/^\/conges\/\d+\/annuler$/, 'Annulation d\'une absence'],
  [/^\/convention\/choisir$/, 'Changement de convention collective'], [/^\/convention\/bareme\/\d+$/, 'Modification d\'un barème de convention'], [/^\/convention\/niveau\/\d+$/, 'Modification du niveau d\'une catégorie'],
  [/^\/sauvegardes$/, 'Sauvegarde manuelle'], [/^\/demo\/reinitialiser$/, 'Réinitialisation de la démonstration'],
];
const libelle = (chemin) => { const a = ACTIONS.find(([r]) => r.test(chemin)); return a ? a[1] : `Action ${chemin}`; };

// adresse du client : derrière un serveur web, la première adresse de X-Forwarded-For
const ipDe = (req) => String((require('./config').proxy && (req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '').slice(0, 64);

// inscription directe (connexions, consultations de données personnelles, téléchargements)
function noter(req, action, o = {}) {
  const u = o.utilisateur !== undefined ? o.utilisateur : req.user;
  try {
    run('INSERT INTO journal(date,utilisateur_id,utilisateur,societe_id,action,chemin,ip) VALUES(?,?,?,?,?,?,?)', new Date().toISOString(), u?.id || null, u ? `${u.nom} (${u.email})` : String(o.qui || '').slice(0, 120), o.societeId !== undefined ? o.societeId : req.societe?.id || null, action, req.originalUrl.slice(0, 200), ipDe(req));
  } catch { /* le journal ne doit jamais bloquer l'action elle-même */ }
  // copie dans le fichier de log (sécurité et traçabilité, lisible même si la base est inaccessible)
  require('./journalisation').log.securite(action, { u: u?.id || null, compte: u?.email || (o.qui ? String(o.qui).slice(0, 120) : null), soc: o.societeId !== undefined ? o.societeId : req.societe?.id || null, p: req.path, ip: ipDe(req) });
}

// consultations tracées : données personnelles, bulletins, déclarations et documents de sortie
const CONSULTATIONS = [
  [/^\/salaries\/\d+$/, 'Consultation d\'une fiche salarié'], [/^\/paie\/bulletin\/\d+$/, 'Consultation d\'un bulletin de paie'],
  [/^\/salaries\/\d+\/(certificat|solde)$/, 'Consultation d\'un document de sortie'], [/^\/salaries\/\d+\/donnees$/, 'Export des données personnelles d\'un salarié'],
  [/^\/declarations\/(export|imprimer)$/, 'Export d\'une déclaration'], [/^\/sauvegardes\/.+/, 'Téléchargement d\'une sauvegarde'],
];

function middleware(req, res, next) {
  if (req.method === 'GET') {
    const c = CONSULTATIONS.find(([r]) => r.test(req.path));
    if (c) res.on('finish', () => { if (res.statusCode === 200) noter(req, c[1]); });
    return next();
  }
  if (req.method !== 'POST') return next();
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const action = libelle(req.path);
    if (action) noter(req, action);
  });
  next();
}

module.exports = (app, h) => {
  const { e, page, carte, tableau } = h;
  app.get('/journal', (req, res) => {
    const filtre = req.profil === 'admin' ? (req.query.societe ? Number(req.query.societe) : null) : req.user.societe_id;
    const lignes = filtre ? all('SELECT j.*, s.nom societe FROM journal j LEFT JOIN societes s ON s.id=j.societe_id WHERE j.societe_id=? ORDER BY j.id DESC LIMIT 300', filtre)
      : all('SELECT j.*, s.nom societe FROM journal j LEFT JOIN societes s ON s.id=j.societe_id ORDER BY j.id DESC LIMIT 300');
    const socs = all('SELECT id, nom FROM societes ORDER BY nom');
    const quand = (d) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    res.send(page(req, { titre: 'Journal', sous: 'Les 300 dernières actions : modifications, connexions et consultations de données personnelles.' }, carte('', `
      ${req.profil === 'admin' ? `<form method="get" class="barre-outils periode"><label class="en-ligne">Société<select name="societe" data-envoi-auto><option value="">Toutes</option>${socs.map((s) => `<option value="${s.id}"${s.id === filtre ? ' selected' : ''}>${e(s.nom)}</option>`).join('')}</select></label></form>` : ''}
      <div class="barre-outils"><label class="recherche"><input type="search" placeholder="Filtrer : une personne, une action…" data-filtre="#liste-journal" aria-label="Filtrer le journal"></label></div>
      ${tableau(['Date', 'Personne', 'Action', 'Société', 'Adresse IP'], lignes.map((l) => `<tr><td class="discret">${quand(l.date)}</td><td>${e(l.utilisateur)}</td><td><b>${e(l.action)}</b></td><td>${e(l.societe || '—')}</td><td class="discret">${e(l.ip)}</td></tr>`), 'Aucune action enregistrée pour le moment.', 'liste-journal')}`)));
  });
};
Object.assign(module.exports, { middleware, noter, ipDe });
