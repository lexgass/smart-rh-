// Smart RH. Lancer avec : node server.js (configuration : config.js et DEPLOIEMENT.md)
const path = require('node:path');
const express = require('express');
const { run, all, get, transaction, creerSociete, config } = require('./db');
const auth = require('./auth');
const acces = require('./acces');
const journal = require('./journal');
const sauvegarde = require('./sauvegarde');
const logo = require('./logo');
const journalisation = require('./journalisation');
const paie = require('./paie');
const droits = require('./droits');

const app = express();
app.disable('x-powered-by');
if (config.proxy) app.set('trust proxy', 1);
// en-têtes de sécurité : aucun script écrit dans les pages, pas d'intégration dans un autre site, ressources locales uniquement,
// pages jamais gardées en cache (elles contiennent des données personnelles), HTTPS imposé au navigateur quand il est actif
app.use((req, res, next) => {
  res.set({
    'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Resource-Policy': 'same-origin',
    ...(config.https ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
  });
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use(journalisation.acces); // une ligne par requête (les fichiers statiques ne sont pas tracés)

app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use(express.urlencoded({ extended: false, limit: '200kb', parameterLimit: 5000 }));
app.use(logo.lireMultipart); // formulaires avec fichier (logo de la société)

/* ---------- utilitaires d'affichage ---------- */
const e = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fcfa = (n) => (n == null ? '—' : Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' '));
const nb = (n) => (n == null ? '' : String(n).replace('.', ','));
const dateFr = (d) => (d ? d.split('-').reverse().join('/') : '—');
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const periodeFr = (p) => `${MOIS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
const millions = (n) => `${(n / 1e6).toFixed(2).replace('.', ',')} M`;
const periodeCourte = (p) => `${MOIS_COURT[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;
const initiales = (...m) => m.filter(Boolean).map((x) => x.trim()[0]).join('').slice(0, 2).toUpperCase();

// bulle d'aide : visible au survol et au focus clavier
const aide = (t) => `<span class="aide" tabindex="0" role="img" aria-label="Aide : ${e(t)}" data-bulle="${e(t)}">?</span>`;

// icônes au trait (style Lucide), couleur héritée du texte
const ICONES = {
  grille: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  equipe: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  ajout: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  colis: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
  paie: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 17.5v-11"/>',
  reglages: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  societe: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  sortie: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  agenda: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  loupe: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  echange: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  portefeuille: '<path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
  imprimer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  alerte: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  tendance: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  horloge: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  fleche: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  soleil: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  balance: '<path d="M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z"/>',
  telecharger: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  coche: '<path d="M20 6 9 17l-5-5"/>',
  calcul: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h4"/>',
  bouclier: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  hors_ligne: '<path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>',
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[n]}</svg>`;
const LOGO = '<img src="/logo.svg" alt="" width="34" height="34">';
const marque = `<span class="marque">${LOGO}<span>Smart<b>RH</b></span></span>`;

const MENU = [
  ['Pilotage', [['/', 'Tableau de bord', 'grille'], ['/analyses', 'Vue d\'ensemble', 'tendance']]],
  ['Personnel', [['/salaries', 'Salariés', 'equipe'], ['/embauche', 'Embauche', 'ajout'], ['/conges', 'Congés et absences', 'soleil'], ['/dotations', 'Dotations', 'colis']]],
  ['Paie', [['/variables', 'Éléments variables', 'horloge'], ['/paie', 'Paie du mois', 'paie'], ['/declarations', 'Déclarations', 'document'], ['/regles', 'Règles de paie', 'reglages', 'regles']]],
  ['Société', [['/structure', 'Structure', 'grille'], ['/convention', 'Convention collective', 'balance'], ['/societe/parametres', 'Informations légales', 'document', 'societe.infos']]],
  ['Administration', [['/utilisateurs', 'Utilisateurs', 'equipe', 'comptes'], ['/journal', 'Journal', 'horloge', 'journal'], ['/sauvegardes', 'Sauvegardes', 'telecharger', 'sauvegardes']]],
];

// plusieurs sociétés ouvertes : Admin, ou Utilisateur rattaché à plus d'une société
const plusieursSocietes = (req) => req.profil === 'admin' || (req.societesOuvertes?.length || 0) > 1;
// attributs de la page selon les préférences d'affichage du compte (Mon compte → Affichage et accessibilité)
const attributsAffichage = (req) => { const p = auth.preferences(req.user); return ` data-theme="${p.theme}" data-texte="${p.texte}" data-contraste="${p.contraste}" data-mouvement="${p.mouvement}" data-police="${p.police}"`; };

// o = { titre, sous, action: html du bouton principal, fil: libellé du fil d'Ariane }
function page(req, o, corps) {
  const s = req.societe;
  const actif = (u) => (u === '/' ? req.path === '/' : req.path.startsWith(u));
  const lien = ([u, t, i]) => `<a href="${u}"${actif(u) ? ' class="actif" aria-current="page"' : ''}>${ic(i)}${t}</a>`;
  const cabinet = plusieursSocietes(req) ? `<div class="groupe"><span>${req.profil === 'admin' ? 'Cabinet' : 'Mes sociétés'}</span>${lien(['/societes', req.profil === 'admin' ? 'Sociétés clientes' : 'Choisir une société', 'societe'])}</div>` : '';
  // sans société ouverte, l'Admin garde l'accès à l'administration
  const admin = !s && req.profil === 'admin' ? MENU.filter(([g]) => g === 'Administration').map(([groupe, liens]) => `<div class="groupe"><span>${groupe}</span>${liens.filter(([, , , d]) => !d || acces.peut(req, d)).map(lien).join('')}</div>`).join('') : '';
  const nav = cabinet + admin + (s ? MENU.map(([groupe, liens]) => {
    const l = liens.filter(([, , , droit]) => !droit || acces.peut(req, droit));
    if (!l.length) return '';
    return `<div class="groupe"><span>${groupe}</span>${l.map(([u, t, i]) => `<a href="${u}"${actif(u) ? ' class="actif" aria-current="page"' : ''}>${ic(i)}${t}</a>`).join('')}</div>`;
  }).join('') : '');
  return `<!doctype html><html lang="fr"${attributsAffichage(req)}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(o.titre)} — Smart RH</title><link rel="icon" href="/logo.svg"><link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/style.css"></head><body class="app">
<a class="evitement" href="#principal">Aller au contenu</a>
<aside class="lateral"><a href="${s ? '/' : '/societes'}" class="lien-marque" aria-label="Smart RH, accueil">${marque}</a>
<nav aria-label="Navigation principale">${nav}</nav>
<div class="pied-lateral"><div class="avatar petit">${initiales(...req.user.nom.split(' '))}</div><div><b>${e(req.user.nom)}</b><small>${e(auth.ROLES[req.profil])}</small><span class="liens-compte"><a href="/compte">Mon compte</a><a href="/deconnexion">${ic('sortie')}Se déconnecter</a></span></div></div></aside>
<div class="contenu">
<div class="barre-haut"><div class="fil">${s ? `<span class="pastille-soc">${initiales(...s.nom.split(' '))}</span><b>${e(s.nom)}</b><span class="sep">/</span>` : ''}<span>${e(o.fil || o.titre)}</span></div>
<div class="barre-droite"><button type="button" class="bouton-recherche" id="ouvrir-recherche" aria-label="Rechercher (Ctrl+K)">${ic('loupe')}<span>Rechercher</span><kbd>Ctrl K</kbd></button>${acces.donneesFictives() ? '<span class="badge-demo" data-bulle="Base de démonstration : sociétés et salariés fictifs. Elle fonctionne comme la production, comptes et mots de passe compris. Les taux restent indicatifs tant que l\'expert-comptable ne les a pas validés." tabindex="0">Démonstration</span>' : ''}

${s && plusieursSocietes(req) ? `<a class="bouton fantome" href="/societes">${ic('echange')}Changer de société</a>` : ''}</div></div>
<main id="principal" tabindex="-1"><div class="titre-page"><div><h1>${e(o.titre)}</h1>${o.sous ? `<p>${o.sous}</p>` : ''}</div>${o.action || ''}</div>${corps}</main></div>
<script src="/app.js"></script></body></html>`;
}
const carte = (titre, corps, o = {}) => `<section class="carte${o.cls ? ` ${o.cls}` : ''}"${o.id ? ` id="${o.id}"` : ''}>${titre ? `<div class="carte-tete"><h2>${titre}</h2>${o.outil || ''}</div>` : ''}${corps}</section>`;
const tableau = (entetes, lignes, vide = 'Aucune donnée pour le moment.', id = '') => (lignes.length
  ? `<div class="tab"${id ? ` id="${id}"` : ''}><table><thead><tr>${entetes.map((h) => `<th${/^\+/.test(h) ? ' class="n"' : ''}>${h.replace(/^\+/, '')}</th>`).join('')}</tr></thead><tbody>${lignes.join('')}</tbody></table></div>${id ? `<p class="vide" id="${id}-vide" hidden>Aucun résultat pour cette recherche.</p>` : ''}`
  : `<div class="etat-vide">${ic('horloge')}<p>${e(vide)}</p></div>`);
const options = (liste, valeur, texte, choisi) => liste.map((x) => `<option value="${e(x[valeur])}"${String(x[valeur]) === String(choisi) ? ' selected' : ''}>${e(typeof texte === 'function' ? texte(x) : x[texte])}</option>`).join('');
// la bulle d'aide d'un indicateur est toujours au même endroit : en haut à droite
const kpi = (icone, valeur, libelle, bulle, ton = '') => `<div class="kpi ${ton}"><div class="kpi-ic">${ic(icone)}</div><div><b>${valeur}</b><span>${libelle}</span></div>${bulle ? aide(bulle) : ''}</div>`;
const personne = (s, lien = true) => `<span class="personne"><span class="avatar">${initiales(s.prenom, s.nom)}</span><span>${lien ? `<a href="/salaries/${s.id}">${e(s.prenom)} ${e(s.nom)}</a>` : `${e(s.prenom)} ${e(s.nom)}`}${s.poste ? `<small>${e(s.poste)}${s.dep ? `, ${e(s.dep)}` : ''}</small>` : ''}</span></span>`;
// urgence d'une échéance : rouge à 15 jours ou moins, orange à 30, jaune à 60 ; toujours icône + libellé, jamais la couleur seule
const joursAvant = (d) => Math.round((new Date(d) - new Date(aujourdhui())) / 864e5);
const niveau = (j) => (j <= 15 ? 'critique' : j <= 30 ? 'serieux' : j <= 60 ? 'attention' : 'ok');
const NIVEAUX = { critique: 'Urgent', serieux: 'Proche', attention: 'À prévoir', ok: 'Lointain' };
const ICONE_NIV = { critique: 'alerte', serieux: 'horloge', attention: 'agenda', ok: 'agenda' };
const prochaineEcheance = (s) => {
  const j = aujourdhui(), l = [];
  if (s.fin_essai && s.fin_essai >= j) l.push([s.fin_essai, 'Fin d\'essai']);
  if (s.date_fin && s.date_fin >= j) l.push([s.date_fin, 'Fin de CDD']);
  return l.sort((a, b) => a[0].localeCompare(b[0]))[0] || null;
};
const echeance = (x) => {
  if (!x) return '<span class="discret">Aucune</span>';
  const [d, t] = x, j = joursAvant(d), n = niveau(j);
  return `<span class="ech ech-${n}" tabindex="0" data-bulle="${e(`${t} le ${dateFr(d)}. ${NIVEAUX[n]} : ${j} jour${j > 1 ? 's' : ''} restant${j > 1 ? 's' : ''}.`)}">${ic(ICONE_NIV[n])}${e(t)}<b>J-${j}</b></span>`;
};
const badgeContrat = (t) => `<span class="et ${t === 'CDD' ? 'bleu' : 'vert'}">${e(t)}</span>`;

/* ---------- session : comptes et connexion (auth.js), journal des actions (journal.js) ---------- */
app.use((req, res, next) => { res.locals.interdit = interdit; res.locals.sansSociete = sansSociete; next(); });
app.use(auth.middleware);
app.use(auth.jetonFormulaires);
app.use(journal.middleware);
const texte = (v, max = 120) => String(v ?? '').trim().slice(0, max);

/* ---------- sociétés (vue cabinet) ---------- */
app.get('/societes', (req, res) => {
  if (!plusieursSocietes(req)) return res.redirect('/');
  const ouvertes = req.societesOuvertes;
  const socs = all(`SELECT s.*, (SELECT COUNT(*) FROM salaries WHERE societe_id=s.id AND statut='Actif') effectif,
    (SELECT SUM(k.salaire_base+k.sursalaire+k.prime_transport) FROM salaries x JOIN contrats k ON k.salarie_id=x.id WHERE x.societe_id=s.id AND x.statut='Actif') masse,
    (SELECT MAX(b.periode) FROM bulletins b JOIN salaries x ON x.id=b.salarie_id WHERE x.societe_id=s.id) derniere,
    (SELECT GROUP_CONCAT(nom, ', ') FROM utilisateurs WHERE role='societe' AND societe_id=s.id AND actif=1) responsables FROM societes s ORDER BY nom`).filter((s) => ouvertes === null || ouvertes.includes(s.id));
  const voitResponsables = acces.peut(req, 'societes.creer');
  const cartes = socs.map((s) => `
    <form method="post" action="/societes/choisir" class="carte carte-soc"><input type="hidden" name="id" value="${s.id}">
      <div class="soc-tete">${logo.balise(s.id, 'logo-carte') || `<span class="pastille-soc grande">${initiales(...s.nom.split(' '))}</span>`}<div><h3>${e(s.nom)}</h3><small>${e(s.ville)}, convention ${e(s.convention)}</small></div></div>
      <dl class="mini-stats"><div><dt>Salariés</dt><dd>${s.effectif}</dd></div><div><dt>Masse brute ${aide('Masse salariale brute mensuelle prévue aux contrats, en millions de FCFA.')}</dt><dd>${s.masse ? millions(s.masse) : '—'} <small>FCFA</small></dd></div><div><dt>Dernière paie</dt><dd>${s.derniere ? periodeCourte(s.derniere) : '—'}</dd></div></dl>
      ${voitResponsables ? `<p class="responsable-soc">${s.responsables ? `${ic('bouclier')}<span>Administrateur : <b>${e(s.responsables)}</b></span>` : `<span class="et jaune" data-bulle="Personne n'administre encore cette société : créez son administrateur dans Utilisateurs, mode « Administrateur de société »." tabindex="0">Aucun administrateur</span>`}</p>` : ''}
      <button class="bouton secondaire">Ouvrir le dossier</button></form>`).join('');
  req.societe = null;
  const creer = acces.peut(req, 'societes.creer');
  res.send(page(req, { titre: creer ? 'Sociétés clientes' : 'Mes sociétés', sous: creer ? `${socs.length} dossiers suivis par le cabinet. Chaque société a ses propres règles, salariés et bulletins.` : `Les ${socs.length} sociétés auxquelles votre compte a accès. Choisissez celle sur laquelle travailler.`, action: creer ? `<a class="bouton" href="#nouvelle">${ic('plus')}Ajouter une société</a>` : '' }, `
  <div class="grille-auto">${cartes}</div>
  ${!creer ? '' : carte(`Ajouter une société${aide('La nouvelle société reçoit une copie des règles du modèle « Congo 2026 ». Vous pourrez ensuite les adapter à sa convention collective.')}`, `
    ${MSG_SOCIETE[req.query.m] ? `<p class="${req.query.m === 'creee' ? 'succes-ligne' : 'alerte-ligne'}" role="status">${MSG_SOCIETE[req.query.m]}</p>` : ''}
    <form method="post" action="/societes" class="form-pile" enctype="multipart/form-data">
      <div class="form-ligne quatre">
      <label>Raison sociale<input name="nom" required maxlength="120" placeholder="Ex. : Boulangerie du Plateau"></label><label>Ville<input name="ville" required maxlength="80" value="Brazzaville"></label>
      <label>Convention collective ${aide('Texte signé pour un secteur d\'activité. Il fixe les catégories, les primes, le préavis et les indemnités.')}<select name="convention"><option>Commerce</option><option>BTP</option><option>Banques et assurances</option><option>Hôtellerie</option><option>Industrie</option></select></label>
      <label>NIU ${aide('Numéro d\'identification unique attribué par l\'administration fiscale.')}<input name="niu" maxlength="40"></label></div>
      <label class="champ-logo">Logo de la société ${aide(`Il apparaîtra en tête des bulletins de paie et des documents imprimés. ${logo.FORMATS}. Facultatif : il peut être ajouté plus tard dans « Informations légales ».`)}<input type="file" name="logo" accept="image/png,image/jpeg,image/webp"></label>
      <fieldset class="choix-affichage"><legend>Administrateur de la société ${aide('Recommandé : la personne qui créera et gérera les comptes de cette société. Elle reçoit un mot de passe provisoire, à changer à sa première connexion. Laissez vide si le cabinet gère lui-même la société.')}</legend>
      <div class="form-ligne trois"><label>Nom<input name="resp_nom" maxlength="120" autocomplete="off"></label><label>Adresse e-mail<input type="email" name="resp_email" maxlength="200" autocomplete="off"></label>
      <label>Mot de passe provisoire<input type="password" name="resp_mdp" minlength="12" maxlength="128" autocomplete="new-password"></label></div></fieldset>
      <div><button class="bouton">${ic('plus')}Créer la société</button></div></form>`, { id: 'nouvelle' })}`));
});
// création d'une société et, si renseigné, de son administrateur (mot de passe provisoire) : tout ou rien
const MSG_SOCIETE = {
  creee: 'Société créée avec son administrateur. Transmettez-lui son adresse et son mot de passe provisoire : il le changera à sa première connexion.',
  champs: 'Renseignez la raison sociale et la ville.',
  resp: 'Administrateur : renseignez son nom, une adresse e-mail valide et un mot de passe provisoire, ou laissez les trois champs vides.',
  existe: 'Administrateur : cette adresse e-mail est déjà utilisée par un autre compte.',
  mdp: 'Administrateur : mot de passe provisoire refusé (12 caractères au moins, pas un mot de passe courant, sans l\'adresse e-mail).',
  ...logo.MESSAGES,
};
app.post('/societes', (req, res) => {
  const b = req.body, echec = (m) => res.redirect(`/societes?m=${m}#nouvelle`);
  if (!texte(b.nom) || !texte(b.ville)) return echec('champs');
  const resp = { nom: texte(b.resp_nom), email: texte(b.resp_email, 200).toLowerCase(), mdp: String(b.resp_mdp || '') };
  const avecResp = Boolean(resp.nom || resp.email || resp.mdp);
  if (avecResp) {
    if (!resp.nom || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(resp.email) || !resp.mdp) return echec('resp');
    if (get('SELECT id FROM utilisateurs WHERE email=?', resp.email)) return echec('existe');
    if (auth.motDePasseRefuse(resp.mdp, resp.email)) return echec('mdp');
  }
  const refusLogo = logo.refusLogo(req.fichiers?.logo);
  if (refusLogo) return echec(refusLogo);
  const conv = get('SELECT code, nom FROM conventions WHERE nom=?', b.convention) || { code: 'COMMERCE', nom: 'Commerce' };
  const id = transaction(() => {
    const sid = creerSociete({ nom: texte(b.nom), ville: texte(b.ville, 80), convention: conv.nom, niu: texte(b.niu, 40) });
    run('UPDATE societes SET convention_code=? WHERE id=?', conv.code, sid);
    if (avecResp) auth.creerUtilisateur({ email: resp.email, nom: resp.nom, mdp: resp.mdp, role: 'societe', societeId: sid, changerMdp: 1 });
    if (req.fichiers?.logo) logo.enregistrer(sid, req.fichiers.logo);
    return sid;
  });
  if (avecResp) return res.redirect('/societes?m=creee#nouvelle');
  auth.choisirSociete(req, id); res.redirect('/structure');
});
app.post('/societes/choisir', (req, res) => { auth.choisirSociete(req, Number(req.body.id)); res.redirect('/'); });

/* ---------- tableau de bord ---------- */
app.get('/', (req, res) => {
  const sid = req.societe.id, jour = aujourdhui();
  const limite = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
  const sal = all(`SELECT e.*, p.intitule poste, d.nom dep, c.type, c.date_fin, c.fin_essai, c.salaire_base, c.sursalaire, c.prime_transport FROM salaries e JOIN contrats c ON c.salarie_id=e.id
    LEFT JOIN postes p ON p.id=e.poste_id LEFT JOIN departements d ON d.id=p.departement_id WHERE e.societe_id=? AND e.statut='Actif'`, sid);
  const brutDe = (s) => s.salaire_base + s.sursalaire + s.prime_transport;
  const masse = sal.reduce((a, s) => a + brutDe(s), 0);
  const alertes = [];
  for (const s of sal) {
    if (s.fin_essai && s.fin_essai >= jour && s.fin_essai <= limite) alertes.push([s.fin_essai, 'Fin de période d\'essai', s, 'Confirmer l\'embauche ou rompre l\'essai par écrit avant cette date.']);
    if (s.date_fin && s.date_fin >= jour && s.date_fin <= limite) alertes.push([s.date_fin, 'Fin de CDD', s, 'Renouveler une seule fois, transformer en CDI ou préparer le solde de tout compte.']);
  }
  alertes.sort((a, b) => a[0].localeCompare(b[0]));
  const jours = (d) => Math.round((new Date(d) - new Date(jour)) / 864e5);
  const dot = get('SELECT COUNT(*) n FROM dotations d JOIN salaries e ON e.id=d.salarie_id WHERE e.societe_id=? AND d.date_retour IS NULL', sid).n;
  const periode = jour.slice(0, 7);
  const paieMois = get('SELECT SUM(net) net, SUM(brut+patronal) cout, COUNT(*) n FROM bulletins b JOIN salaries e ON e.id=b.salarie_id WHERE e.societe_id=? AND periode=?', sid, periode);
  const parDep = Object.entries(sal.reduce((m, s) => { m[s.dep || 'Sans département'] = (m[s.dep || 'Sans département'] || 0) + brutDe(s); return m; }, {})).sort((a, b) => b[1] - a[1]);
  const nbCdd = sal.filter((s) => s.type === 'CDD').length;
  const derniers = all('SELECT x.*, e.nom, e.prenom FROM evenements x JOIN salaries e ON e.id=x.salarie_id WHERE e.societe_id=? ORDER BY x.date DESC, x.id DESC LIMIT 5', sid);

  const finMois = new Date(Number(periode.slice(0, 4)), Number(periode.slice(5, 7)), 0).toISOString().slice(0, 10);
  res.send(page(req, { titre: 'Tableau de bord', sous: `Situation au ${dateFr(jour)}.` }, `
  <section class="bandeau" aria-labelledby="bandeau-titre">
    <div class="bandeau-texte"><p class="bandeau-sur">Paie de ${periodeFr(periode)}</p>
      <h2 id="bandeau-titre">${paieMois.n ? `${fcfa(paieMois.net)} FCFA nets à verser` : 'Paie à calculer'}</h2>
      <p>${paieMois.n ? `${paieMois.n} bulletins calculés. Coût total pour l'employeur : ${fcfa(paieMois.cout)} FCFA.` : `${sal.length} salariés à payer. Les règles en vigueur au ${dateFr(finMois)} seront appliquées.`}</p>
      <div class="bandeau-actions"><form method="post" action="/paie/calculer"><input type="hidden" name="periode" value="${periode}"><button class="bouton or">${ic('calcul')}${paieMois.n ? 'Recalculer' : 'Calculer'} la paie</button></form>${paieMois.n ? `<a class="lien-clair" href="/paie?periode=${periode}">Ouvrir le livre de paie</a>` : ''}</div></div>
    <dl class="bandeau-chiffres">
      <div><dt>Salariés actifs</dt><dd>${sal.length}</dd><small>dont ${nbCdd} en CDD</small></div>
      <div><dt>Masse salariale ${aide('Salaires de base, sursalaires et indemnités de transport prévus aux contrats, avant cotisations.')}</dt><dd>${millions(masse)}</dd><small>FCFA par mois</small></div>
      <div><dt>Matériel confié</dt><dd>${dot}</dd><small>remise${dot > 1 ? 's' : ''} en cours</small></div>
    </dl>
  </section>
  <div class="disposition d-2-1">
    ${carte(`Échéances des 60 prochains jours${aide('Les dates de fin de période d\'essai et de fin de CDD, pour décider à temps.')}`, alertes.length ? `<ul class="liste-echeances">${alertes.map(([d, t, s, conseil]) => `
      <li class="niv-${niveau(jours(d))}"><div class="date-bloc"><b>${d.slice(8, 10)}</b><small>${MOIS_COURT[Number(d.slice(5, 7)) - 1]}</small></div>
      <div class="ech-corps">${echeance([d, t])}${personne(s)}<p>${conseil}</p></div><span class="compte">${NIVEAUX[niveau(jours(d))]}</span></li>`).join('')}</ul>`
      : '<div class="etat-vide">Aucune échéance dans les 60 prochains jours.</div>')}
    <div class="pile">
    ${carte(`Absences${aide('Salariés absents aujourd\'hui et demandes de congé en attente de décision.')}`, (() => {
      const absents = all("SELECT c.*, e.nom, e.prenom FROM conges c JOIN salaries e ON e.id=c.salarie_id WHERE e.societe_id=? AND c.statut='valide' AND c.date_debut<=? AND c.date_fin>=?", sid, jour, jour);
      const attente = get("SELECT COUNT(*) n FROM conges c JOIN salaries e ON e.id=c.salarie_id WHERE e.societe_id=? AND c.statut='demande'", sid).n;
      return `${absents.length ? `<ul class="liste-simple">${absents.map((a) => `<li>${personne({ id: a.salarie_id, nom: a.nom, prenom: a.prenom })}<small class="discret">jusqu'au ${dateFr(a.date_fin)}</small></li>`).join('')}</ul>` : '<p class="discret">Personne n\'est absent aujourd\'hui.</p>'}
        <a class="lien-action" href="/conges">${attente ? `<span class="et jaune">${attente} demande${attente > 1 ? 's' : ''} à valider</span>` : 'Ouvrir le planning'}</a>`;
    })())}
    ${carte(`Masse salariale par département${aide('Répartition de la masse brute mensuelle prévue aux contrats.')}`, `<ul class="barres-h">${parDep.map(([d, v]) => `<li><span>${e(d)}</span><span class="piste"><span style="width:${Math.max(4, Math.round(v / parDep[0][1] * 100))}%"></span></span><b>${fcfa(v)}</b></li>`).join('')}</ul>`)}
    </div>
  </div>
  <div class="disposition d-1-1">
    ${carte('Dernières activités', tableau(['Date', 'Salarié', 'Événement'], derniers.map((x) => `<tr><td class="discret">${dateFr(x.date)}</td><td>${personne({ ...x, id: x.salarie_id })}</td><td><b>${e(x.type)}</b><br><small class="discret">${e(x.detail)}</small></td></tr>`)))}
    ${carte('Accès rapides', `<div class="raccourcis">
      <a href="/embauche">${ic('ajout')}<span><b>Embaucher</b><small>Salarié, contrat, essai</small></span></a>
      <a href="/dotations#remise">${ic('colis')}<span><b>Remettre du matériel</b><small>Avec fiche à signer</small></span></a>
      ${acces.peut(req, 'regles') ? `<a href="/regles">${ic('reglages')}<span><b>Faire évoluer une règle</b><small>Taux, plafond, barème</small></span></a>` : ''}
      <a href="/paie">${ic('paie')}<span><b>Livre de paie</b><small>Bulletins du mois</small></span></a></div>`)}
  </div>`));
});

/* ---------- vue d'ensemble : graphiques ---------- */
const COULEURS = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)'];
const legende = (items) => `<ul class="legende">${items.map(([lib, i]) => `<li><span class="pastille-serie" style="background:${COULEURS[i]}"></span>${lib}</li>`).join('')}</ul>`;
const donnees = (entetes, lignes) => `<details class="donnees"><summary>Voir les données</summary>${tableau(entetes, lignes.map((l) => `<tr>${l.map((c, k) => `<td${k ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`))}</details>`;
const pct = (v, t) => (t ? Math.round(v / t * 100) : 0);
app.get('/analyses', (req, res) => {
  const sid = req.societe.id, jour = aujourdhui();
  const sal = all(`${SQL_SAL} AND e.statut='Actif' ORDER BY e.nom`, sid);
  const masse = sal.reduce((a, s) => a + s.salaire_base + s.sursalaire + s.prime_transport, 0);
  const nbCdd = sal.filter((s) => s.type === 'CDD').length, nbCdi = sal.length - nbCdd;
  const derniere = get('SELECT b.periode, SUM(b.net) net, SUM(b.retenues) ret, SUM(b.patronal) pat, COUNT(*) n FROM bulletins b JOIN salaries e ON e.id=b.salarie_id WHERE e.societe_id=? GROUP BY b.periode ORDER BY b.periode DESC LIMIT 1', sid);

  // 1. échéancier sur 6 mois
  const horizon = 182;
  const ech = sal.flatMap((s) => [[s.fin_essai, 'Fin d\'essai', s], [s.date_fin, 'Fin de CDD', s]])
    .filter(([d]) => d && d >= jour && joursAvant(d) <= horizon).sort((a, b) => a[0].localeCompare(b[0]));
  const debut = new Date(jour), mois = [];
  for (let k = 1; k <= 6; k++) { const m = new Date(debut.getFullYear(), debut.getMonth() + k, 1); const j = Math.round((m - debut) / 864e5); if (j <= horizon) mois.push([MOIS_COURT[m.getMonth()], j / horizon * 100]); }
  const seuils = [[15, 'critique'], [30, 'serieux'], [60, 'attention']];
  const graduation = `<div class="frise-axe">${mois.map(([m, x]) => `<span style="left:${x}%">${m}</span>`).join('')}</div>`;
  const zones = `<div class="zones">${seuils.map(([j, n], k) => `<span class="zone zone-${n}" style="left:${k ? seuils[k - 1][0] / horizon * 100 : 0}%;width:${(j - (k ? seuils[k - 1][0] : 0)) / horizon * 100}%"></span>`).join('')}</div>`;
  const echeancier = ech.length ? `<div class="echeancier">
    <div class="ech-ligne entete"><span></span><div class="piste-temps">${graduation}</div></div>
    ${ech.map(([d, t, s]) => { const j = joursAvant(d), n = niveau(j); return `<div class="ech-ligne"><span>${personne(s)}</span><div class="piste-temps">${zones}${mois.map(([, x]) => `<i class="repere" style="left:${x}%"></i>`).join('')}<span class="jalon jalon-${n}" style="left:${j / horizon * 100}%" tabindex="0" data-bulle="${e(`${s.prenom} ${s.nom} : ${t.toLowerCase()} le ${dateFr(d)}, dans ${j} jours (${NIVEAUX[n].toLowerCase()}).`)}"></span><span class="jalon-texte" style="left:${j / horizon * 100}%">${e(t)}, ${dateFr(d)}</span></div></div>`; }).join('')}
    <ul class="legende">${['critique', 'serieux', 'attention'].map((n) => `<li><span class="jalon jalon-${n} statique"></span>${NIVEAUX[n]} (${{ critique: '15 jours ou moins', serieux: '16 à 30 jours', attention: '31 à 60 jours' }[n]})</li>`).join('')}<li><span class="jalon jalon-ok statique"></span>Au-delà de 60 jours</li></ul>
    ${donnees(['Salarié', 'Échéance', 'Date', 'Jours restants'], ech.map(([d, t, s]) => [`${e(s.prenom)} ${e(s.nom)}`, e(t), dateFr(d), joursAvant(d)]))}</div>`
    : '<div class="etat-vide">Aucune fin d\'essai ni de CDD dans les six prochains mois.</div>';

  // 2. CDI / CDD
  const contrats = `<div class="barre-100" role="img" aria-label="${nbCdi} CDI et ${nbCdd} CDD">
    ${[[nbCdi, 'CDI', 0], [nbCdd, 'CDD', 1]].filter(([v]) => v).map(([v, l, i]) => `<span style="flex:${v};background:${COULEURS[i]}" tabindex="0" data-bulle="${l} : ${v} salarié${v > 1 ? 's' : ''}, soit ${pct(v, sal.length)} % de l'effectif."></span>`).join('')}</div>
    <div class="etiquettes-100">${[[nbCdi, 'CDI'], [nbCdd, 'CDD']].filter(([v]) => v).map(([v, l]) => `<span style="flex:${v}"><b>${pct(v, sal.length)} %</b> ${l}, ${v} salarié${v > 1 ? 's' : ''}</span>`).join('')}</div>
    ${legende([['CDI', 0], ['CDD', 1]])}${donnees(['Contrat', 'Salariés', 'Part'], [['CDI', nbCdi, `${pct(nbCdi, sal.length)} %`], ['CDD', nbCdd, `${pct(nbCdd, sal.length)} %`]])}`;

  // 3. coût de la dernière paie
  const cout = derniere ? (() => {
    const parts = [[derniere.net, 'Net versé aux salariés', 0], [derniere.ret, 'Retenues salariés', 1], [derniere.pat, 'Charges employeur', 2]], tot = derniere.net + derniere.ret + derniere.pat;
    return `<p class="chiffre-titre"><b>${fcfa(tot)}</b> FCFA de coût total en ${periodeFr(derniere.periode)}</p>
    <div class="barre-100" role="img" aria-label="Répartition du coût total">${parts.map(([v, l, i]) => `<span style="flex:${v};background:${COULEURS[i]}" tabindex="0" data-bulle="${l} : ${fcfa(v)} FCFA, soit ${pct(v, tot)} % du coût total."></span>`).join('')}</div>
    <ul class="legende valeurs">${parts.map(([v, l, i]) => `<li><span class="pastille-serie" style="background:${COULEURS[i]}"></span>${l}<b>${fcfa(v)} FCFA</b><small>${pct(v, tot)} %</small></li>`).join('')}</ul>
    ${donnees(['Poste', 'Montant (FCFA)', 'Part'], parts.map(([v, l]) => [l, fcfa(v), `${pct(v, tot)} %`]))}`;
  })() : '<div class="etat-vide">Aucune paie calculée pour le moment. <a href="/paie">Calculer la paie</a></div>';

  // 4. masse par département
  const parDep = Object.entries(sal.reduce((m, s) => { const k = s.dep || 'Sans département'; m[k] = (m[k] || 0) + s.salaire_base + s.sursalaire + s.prime_transport; return m; }, {})).sort((a, b) => b[1] - a[1]);
  const maxDep = parDep[0]?.[1] || 1;
  const depts = `<ul class="barres-g">${parDep.map(([d, v]) => `<li><span>${e(d)}</span><span class="piste-g"><span style="width:${v / maxDep * 100}%" tabindex="0" data-bulle="${e(d)} : ${fcfa(v)} FCFA par mois, ${pct(v, masse)} % de la masse salariale."></span></span><b>${fcfa(v)}</b></li>`).join('')}</ul>
    ${donnees(['Département', 'Masse brute (FCFA)', 'Part'], parDep.map(([d, v]) => [e(d), fcfa(v), `${pct(v, masse)} %`]))}`;

  // 5. ancienneté
  const tranches = [['Moins d\'1 an', 0, 1], ['1 à 3 ans', 1, 3], ['3 à 5 ans', 3, 5], ['5 à 10 ans', 5, 10], ['10 ans et plus', 10, 99]]
    .map(([l, a, b]) => [l, sal.filter((s) => { const n = paie.anneesEntre(s.date_embauche, jour); return n >= a && n < b; }).length]);
  const maxT = Math.max(1, ...tranches.map((t) => t[1]));
  const anciennete = `<div class="colonnes" role="img" aria-label="Répartition des salariés par ancienneté">${tranches.map(([l, v]) => `<div class="colonne"><b>${v}</b><span class="tige" style="height:${v / maxT * 100}%" tabindex="0" data-bulle="${l} : ${v} salarié${v > 1 ? 's' : ''}."></span><small>${l}</small></div>`).join('')}</div>
    ${donnees(['Ancienneté', 'Salariés'], tranches)}`;

  res.send(page(req, { titre: 'Vue d\'ensemble', sous: 'L\'effectif, les échéances et les coûts de la société, en un coup d\'œil. Survolez un graphique pour le détail.' }, `
  <div class="kpis">
    ${kpi('equipe', sal.length, 'salariés actifs')}
    ${kpi('agenda', ech.filter(([d]) => joursAvant(d) <= 30).length, 'échéances dans les 30 jours', 'Fins de période d\'essai et de CDD à traiter dans le mois.', ech.some(([d]) => joursAvant(d) <= 15) ? 'rouge' : '')}
    ${kpi('portefeuille', `${millions(masse)} <small>FCFA</small>`, 'masse salariale brute mensuelle')}
    ${kpi('paie', derniere ? `${fcfa((derniere.net + derniere.ret + derniere.pat) / derniere.n)} <small>FCFA</small>` : '—', 'coût moyen d\'un salarié par mois', 'Coût total de la dernière paie (brut et charges employeur) divisé par le nombre de bulletins.')}
  </div>
  ${carte(`Échéancier des six prochains mois${aide('Chaque losange est une fin de période d\'essai ou de CDD. Sa couleur indique l\'urgence.')}`, echeancier)}
  <div class="disposition d-1-1">
    ${carte(`Contrats${aide('Répartition de l\'effectif actif entre CDI et CDD.')}`, contrats)}
    ${carte(`Coût de la dernière paie${aide('Ce que la paie coûte à l\'employeur, décomposé entre ce que touchent les salariés, ce qui est retenu sur leur salaire et les charges patronales.')}`, cout)}
  </div>
  <div class="disposition d-1-1">
    ${carte(`Masse salariale par département${aide('Salaires bruts mensuels prévus aux contrats, par département.')}`, depts)}
    ${carte(`Ancienneté${aide('Nombre de salariés selon leur ancienneté dans la société.')}`, anciennete)}
  </div>`));
});

/* ---------- structure ---------- */
app.get('/structure', (req, res) => {
  const sid = req.societe.id;
  const deps = all('SELECT d.*, (SELECT COUNT(*) FROM postes WHERE departement_id=d.id) n FROM departements d WHERE societe_id=? ORDER BY nom', sid);
  const cats = all('SELECT * FROM categories WHERE societe_id=? ORDER BY code', sid);
  const postes = all('SELECT p.*, d.nom dep, c.code cat, c.libelle catlib, (SELECT COUNT(*) FROM salaries WHERE poste_id=p.id) occ FROM postes p LEFT JOIN departements d ON d.id=p.departement_id LEFT JOIN categories c ON c.id=p.categorie_id WHERE p.societe_id=? ORDER BY d.nom, p.intitule', sid);
  res.send(page(req, { titre: 'Structure de la société', sous: 'Départements, catégories professionnelles et postes. Les postes servent ensuite à l\'embauche.' }, `
  <div class="disposition d-1-1-1">
    ${carte(`Départements <span class="compteur">${deps.length}</span>`, `${tableau(['Nom', '+Postes'], deps.map((d) => `<tr><td>${e(d.nom)}</td><td class="n">${d.n}</td></tr>`))}
      <form method="post" action="/structure/departement" class="form-ajout"><input name="nom" required placeholder="Nouveau département" aria-label="Nom du nouveau département"><button class="bouton secondaire">Ajouter</button></form>`)}
    ${carte(`Catégories <span class="compteur">${cats.length}</span>${aide('Classement prévu par la convention collective. Chaque catégorie a un salaire minimum.')}`, `${tableau(['Code', 'Libellé', '+Minimum'], cats.map((c) => `<tr><td><span class="code">${e(c.code)}</span></td><td>${e(c.libelle)}</td><td class="n">${fcfa(c.salaire_min)}</td></tr>`))}
      <form method="post" action="/structure/categorie" class="form-ajout"><input name="code" required placeholder="Code" aria-label="Code" class="court"><input name="libelle" required placeholder="Libellé" aria-label="Libellé"><input name="salaire_min" type="number" min="0" required placeholder="Minimum" aria-label="Salaire minimum en FCFA" class="moyen"><button class="bouton secondaire">Ajouter</button></form>`)}
    ${carte(`Ajouter un poste`, `<form method="post" action="/structure/poste" class="form-pile"><label>Intitulé du poste<input name="intitule" required placeholder="Ex. : Caissier"></label>
      <label>Département<select name="departement_id" required>${options(deps, 'id', 'nom')}</select></label>
      <label>Catégorie<select name="categorie_id" required>${options(cats, 'id', (c) => `${c.code} — ${c.libelle}`)}</select></label><button class="bouton">${ic('plus')}Ajouter le poste</button></form>`)}
  </div>
  ${carte(`Postes <span class="compteur">${postes.length}</span>`, tableau(['Intitulé', 'Département', 'Catégorie', '+Occupé par'], postes.map((p) => `<tr><td><b>${e(p.intitule)}</b></td><td>${e(p.dep)}</td><td><span class="code">${e(p.cat)}</span> ${e(p.catlib)}</td><td class="n">${p.occ} salarié${p.occ > 1 ? 's' : ''}</td></tr>`)))}`));
});
app.post('/structure/departement', (req, res) => { const nom = texte(req.body.nom); if (nom) run('INSERT INTO departements(societe_id,nom) VALUES(?,?)', req.societe.id, nom); res.redirect('/structure'); });
app.post('/structure/categorie', (req, res) => {
  const code = texte(req.body.code, 20), libelle = texte(req.body.libelle);
  if (code && libelle) run('INSERT INTO categories(societe_id,code,libelle,salaire_min,niveau) VALUES(?,?,?,?,?)', req.societe.id, code, libelle, Math.max(0, Number(req.body.salaire_min) || 0), Number((code.match(/\d+/) || [1])[0]));
  res.redirect('/structure');
});
app.post('/structure/poste', (req, res) => {
  const sid = req.societe.id, intitule = texte(req.body.intitule);
  // le département et la catégorie doivent appartenir à la société ouverte
  const dep = get('SELECT id FROM departements WHERE id=? AND societe_id=?', Number(req.body.departement_id), sid), cat = get('SELECT id FROM categories WHERE id=? AND societe_id=?', Number(req.body.categorie_id), sid);
  if (intitule && dep && cat) run('INSERT INTO postes(societe_id,departement_id,categorie_id,intitule) VALUES(?,?,?,?)', sid, dep.id, cat.id, intitule);
  res.redirect('/structure');
});

/* ---------- règles de paie ---------- */
const interdit = (req, res) => res.status(403).send(page(req, { titre: 'Accès réservé' }, carte('', `<div class="etat-vide">${ic('bouclier')}<p>Cette page n'est pas ouverte à votre mode d'accès (${e(auth.ROLES[req.profil])}). Si vous en avez besoin, demandez-le à l'administrateur de Smart RH.</p><a class="bouton secondaire" href="/">Revenir au tableau de bord</a></div>`)));
const sansSociete = (req) => page(req, { titre: 'Aucune société' }, carte('', `<div class="etat-vide">${ic('societe')}<p>Votre compte n'est rattaché à aucune société pour le moment. Demandez à l'administrateur de Smart RH de vous en ouvrir une.</p></div>`));
const FAMILLES = [['CNSS', 'Sécurité sociale (CNSS)'], ['CAMU', 'Assurance maladie (CAMU)'], ['ITS', 'Impôt sur les salaires (ITS)'], ['TUS', 'Taxes sur les salaires'], ['TOL', 'Taxes sur les salaires'], ['ANC', 'Ancienneté'], ['', 'Général']];
const famille = (code) => FAMILLES.find(([p]) => code.startsWith(p))[1];
app.get('/regles', (req, res) => {
  const sid = req.societe.id, jour = aujourdhui();
  const onglet = ['parametres', 'rubriques', 'bareme'].includes(req.query.onglet) ? req.query.onglet : 'parametres';
  const historique = req.query.historique === '1';
  const params = all('SELECT * FROM parametres WHERE societe_id IS NULL OR societe_id=? ORDER BY code, date_debut', sid);
  // version en vigueur de chaque code : la plus récente déjà commencée, la société avant le modèle
  const enVigueur = new Map();
  for (const p of params) if (p.date_debut <= jour) {
    const c = enVigueur.get(p.code);
    if (!c || p.date_debut > c.date_debut || (p.date_debut === c.date_debut && p.societe_id && !c.societe_id)) enVigueur.set(p.code, p);
  }
  const visibles = params.filter((p) => historique || enVigueur.get(p.code) === p || p.date_debut > jour);
  const parFamille = new Map();
  for (const p of visibles) { const f = famille(p.code); if (!parFamille.has(f)) parFamille.set(f, []); parFamille.get(f).push(p); }
  const ordreF = [...new Set(FAMILLES.map((x) => x[1]))];
  const lignes = ordreF.filter((f) => parFamille.has(f)).flatMap((f) => [`<tr class="groupe-ligne"><td colspan="5">${f}</td></tr>`, ...parFamille.get(f).map((p) => {
    const actif = enVigueur.get(p.code) === p;
    const etat = p.date_debut > jour ? '<span class="et jaune">À venir</span>' : actif ? '<span class="et vert">En vigueur</span>' : '<span class="et gris">Archivée</span>';
    return `<tr class="${actif || p.date_debut > jour ? '' : 'pale'}"><td>${e(p.libelle)}<small class="discret bloc">${e(p.source)}</small></td><td class="n"><b>${p.unite === 'FCFA' ? fcfa(p.valeur) : nb(p.valeur)}</b> <small>${e(p.unite)}</small></td><td>${dateFr(p.date_debut)}</td><td>${p.societe_id ? '<span class="et bleu">Cette société</span>' : '<span class="discret">Modèle Congo</span>'}</td><td>${etat}</td></tr>`;
  })]);
  const codes = [...enVigueur.values()].sort((a, b) => a.libelle.localeCompare(b.libelle));
  const rub = all('SELECT * FROM rubriques WHERE societe_id=? ORDER BY ordre', sid);
  const SENS = { gain: ['Gain', 'vert'], retenue: ['Retenue salarié', 'rouge'], patronale: ['Charge employeur', 'bleu'] };
  const formule = (r) => (r.mode === 'taux' ? `${nb(paie.param(r.taux_param, sid, jour))} % ${{ BRUT: 'du brut total', COTISABLE: 'du brut cotisable', IMPOSABLE_NET: 'de l\'imposable après retraite' }[r.assiette]}${r.plafond_param ? `, plafonné à ${fcfa(paie.param(r.plafond_param, sid, jour))} FCFA` : ''}${r.seuil_param ? `, au-delà de ${fcfa(paie.param(r.seuil_param, sid, jour))} FCFA` : ''}`
    : r.mode === 'fixe' ? `${fcfa(paie.param(r.montant_param, sid, jour))} FCFA par mois` : r.mode === 'its' ? 'Barème de l\'ITS (onglet Barème)' : r.mode === 'anciennete' ? 'Selon l\'ancienneté (famille « Ancienneté »)' : 'Montant prévu au contrat');
  const tranches = all('SELECT * FROM tranches_its ORDER BY date_debut, (borne_sup IS NULL), borne_sup');
  let bas = 0;
  const onglets = [['parametres', 'Taux et plafonds', 'Les valeurs légales, chacune avec sa date d\'effet.'], ['rubriques', 'Lignes du bulletin', 'Ce qui apparaît sur le bulletin et comment c\'est calculé.'], ['bareme', 'Barème de l\'ITS', 'Les tranches de l\'impôt sur les salaires.']];
  const formulaire = carte(`Faire évoluer une règle${aide('Une nouvelle valeur ne remplace pas l\'ancienne : elle prend le relais à sa date d\'effet. Les bulletins passés restent calculés avec l\'ancienne valeur.')}`, `
    <form method="post" action="/regles/parametre" class="form-pile" id="evolution">
    <label>Règle<select name="code">${options(codes, 'code', 'libelle')}</select></label>
    <label>Nouvelle valeur<input name="valeur" type="number" step="any" required></label>
    <label>Date d'effet<input name="date_debut" type="date" required value="${jour}"></label>
    <label>Portée ${aide('« Cette société » ne touche que le dossier ouvert. « Modèle Congo » s\'applique à toutes les sociétés du cabinet qui n\'ont pas leur propre valeur.')}<select name="portee"><option value="societe">Cette société seulement</option>${acces.peut(req, 'modele.modifier') ? '<option value="modele">Modèle Congo (toutes les sociétés)</option>' : ''}</select></label>
    <label>Texte de référence<input name="source" placeholder="Décret, loi, convention…"></label><button class="bouton">${ic('plus')}Enregistrer la nouvelle version</button></form>`, { cls: 'collant' });
  let contenu;
  if (onglet === 'parametres') contenu = `<div class="disposition d-2-1">${carte('', `<div class="barre-outils"><a class="interrupteur${historique ? ' on' : ''}" href="/regles?historique=${historique ? 0 : 1}" role="switch" aria-checked="${historique}"><span></span>Afficher les versions archivées</a></div>
    ${tableau(['Règle', '+Valeur', `Depuis le`, `Portée`, 'État'], lignes)}`)}${formulaire}</div>`;
  else if (onglet === 'rubriques') contenu = carte('', tableau(['Ligne du bulletin', 'Nature', 'Mode de calcul', `Cotisable ${aide('Entre dans la base des cotisations CNSS et CAMU.')}`, `Imposable ${aide('Entre dans la base de l\'impôt sur les salaires.')}`, 'État', ''], rub.map((r) => `<tr class="${r.actif ? '' : 'pale'}"><td><b>${e(r.libelle)}</b></td><td><span class="et ${SENS[r.sens][1]}">${SENS[r.sens][0]}</span></td><td>${e(formule(r))}</td><td>${r.sens === 'gain' ? (r.cotisable ? 'Oui' : 'Non') : '—'}</td><td>${r.sens === 'gain' ? (r.imposable ? 'Oui' : 'Non') : '—'}</td><td>${r.actif ? '<span class="et vert">Active</span>' : '<span class="et gris">Désactivée</span>'}</td>
    <td class="n"><form method="post" action="/regles/rubrique/${r.id}/bascule"><button class="bouton fantome petit">${r.actif ? 'Désactiver' : 'Activer'}</button></form></td></tr>`)));
  else contenu = `<div class="disposition d-2-1">${carte('', tableau(['Tranche annuelle par part', '+Taux', '+Forfait'], tranches.map((t) => { const l = `<tr><td>${t.borne_sup ? `de ${fcfa(bas ? bas + 1 : 0)} à ${fcfa(t.borne_sup)} FCFA` : `au-delà de ${fcfa(bas)} FCFA`}</td><td class="n"><b>${nb(t.taux)} %</b></td><td class="n">${t.forfait ? `${fcfa(t.forfait)} FCFA` : '—'}</td></tr>`; bas = t.borne_sup; return l; })))}
    ${carte('Comment l\'ITS est calculé', `<ol class="etapes-calcul"><li>Salaire imposable du mois, moins la retraite CNSS.</li><li>Multiplié par 12, moins l'abattement de ${nb(paie.param('ITS_ABATTEMENT', sid, jour))} %.</li><li>Arrondi au millier inférieur, puis divisé par le nombre de parts.</li><li>Barème appliqué à une part, puis multiplié par le nombre de parts.</li><li>Divisé par 12 pour la retenue du mois.</li></ol><p class="discret">Barème en vigueur depuis le ${dateFr(tranches[0]?.date_debut)}. L'abattement et le quotient familial se règlent dans « Taux et plafonds ».</p>`)}</div>`;
  res.send(page(req, { titre: 'Règles de paie', sous: 'Aucune règle n\'est figée dans le logiciel : tout se règle ici, avec une date d\'effet.', action: onglet === 'parametres' ? `<a class="bouton" href="#evolution">${ic('plus')}Faire évoluer une règle</a>` : '' }, `
  <nav class="onglets" aria-label="Sections des règles">${onglets.map(([k, t, b]) => `<a href="/regles?onglet=${k}"${onglet === k ? ' class="actif" aria-current="page"' : ''} data-bulle="${e(b)}">${t}</a>`).join('')}</nav>${contenu}`));
});
app.post('/regles/parametre', (req, res) => {
  const m = get('SELECT * FROM parametres WHERE code=? ORDER BY date_debut DESC LIMIT 1', req.body.code);
  const valeur = Number(req.body.valeur);
  if (m && Number.isFinite(valeur) && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date_debut)) {
    const portee = req.body.portee === 'modele' && acces.peut(req, 'modele.modifier') ? null : req.societe.id;
    run('INSERT INTO parametres(societe_id,code,libelle,valeur,unite,date_debut,source) VALUES(?,?,?,?,?,?,?)', portee, m.code, m.libelle, valeur, m.unite, req.body.date_debut, texte(req.body.source, 200) || 'Saisie manuelle');
  }
  res.redirect('/regles');
});
app.post('/regles/rubrique/:id/bascule', (req, res) => {
  run('UPDATE rubriques SET actif=1-actif WHERE id=? AND societe_id=?', Number(req.params.id), req.societe.id); res.redirect('/regles?onglet=rubriques');
});

/* ---------- salariés ---------- */
const SQL_SAL = `SELECT e.*, p.intitule poste, d.nom dep, c.code cat, c.libelle catlib, k.type, k.date_debut, k.date_fin, k.fin_essai, k.salaire_base, k.sursalaire, k.prime_transport
  FROM salaries e LEFT JOIN postes p ON p.id=e.poste_id LEFT JOIN departements d ON d.id=p.departement_id LEFT JOIN categories c ON c.id=p.categorie_id
  LEFT JOIN contrats k ON k.salarie_id=e.id WHERE e.societe_id=?`;
app.get('/salaries', (req, res) => {
  const sal = all(`${SQL_SAL} ORDER BY e.statut='Sorti', e.nom`, req.societe.id), jour = aujourdhui();
  const nbActifs = sal.filter((s) => s.statut === 'Actif').length;
  res.send(page(req, { titre: 'Salariés', sous: `${nbActifs} salariés actifs dans ${e(req.societe.nom)}${sal.length > nbActifs ? `, ${sal.length - nbActifs} sorti${sal.length - nbActifs > 1 ? 's' : ''}` : ''}.`, action: `<a class="bouton" href="/embauche">${ic('ajout')}Embaucher un salarié</a>` }, carte('', `
  <div class="barre-outils"><label class="recherche">${ic('loupe')}<input type="search" placeholder="Rechercher un nom, un poste, un matricule…" data-filtre="#liste-sal" aria-label="Rechercher un salarié"></label></div>
  ${tableau(['Salarié', 'Matricule', 'Contrat', `Prochaine échéance ${aide('Fin de période d\'essai ou de CDD. Rouge : 15 jours ou moins. Orange : 30 jours ou moins. Jaune : 60 jours ou moins.')}`, 'Entrée', `Ancienneté`, '+Salaire de base'], sal.map((s) => `<tr${s.statut === 'Sorti' ? ' class="pale"' : ''}><td>${personne(s)}</td><td class="discret">${e(s.matricule)}</td><td>${badgeContrat(s.type)}</td><td>${s.statut === 'Sorti' ? `<span class="et gris">Sorti le ${dateFr(s.date_fin)}</span>` : echeance(prochaineEcheance(s))}</td><td>${dateFr(s.date_embauche)}</td><td>${paie.anneesEntre(s.date_embauche, jour)} an(s)</td><td class="n"><b>${fcfa(s.salaire_base)}</b> <small>FCFA</small></td></tr>`), 'Aucun salarié. Commencez par une embauche.', 'liste-sal')}`)));
});
app.get('/salaries/:id', (req, res) => {
  const s = get(`${SQL_SAL} AND e.id=?`, req.societe.id, Number(req.params.id));
  if (!s) return res.redirect('/salaries');
  const jour = aujourdhui();
  const ev = all('SELECT * FROM evenements WHERE salarie_id=? ORDER BY date DESC, id DESC', s.id);
  const dot = all('SELECT d.*, m.designation FROM dotations d JOIN materiels m ON m.id=d.materiel_id WHERE d.salarie_id=? ORDER BY date_remise DESC', s.id);
  const bul = all('SELECT * FROM bulletins WHERE salarie_id=? ORDER BY periode DESC', s.id);
  const champ = (l, v, b) => `<div><dt>${l}${b ? aide(b) : ''}</dt><dd>${v}</dd></div>`;
  const parts = paie.partsFiscales(s, s.societe_id, jour);
  const niv = get('SELECT c.niveau FROM postes p JOIN categories c ON c.id=p.categorie_id WHERE p.id=?', s.poste_id)?.niveau || 1;
  const conv = get('SELECT nom FROM conventions WHERE code=?', paie.conventionDe(s.societe_id))?.nom || '';
  const pr = droits.preavis(s.societe_id, niv), ind = droits.indemnite(s, s, jour), sol = droits.soldeConges(s, jour);
  const tauxAnc = paie.tauxAnciennete(paie.anneesEntre(s.date_embauche, jour), s.societe_id, jour);
  const absences = all('SELECT * FROM conges WHERE salarie_id=? ORDER BY date_debut DESC LIMIT 5', s.id);
  const TYPES_ABS = require('./routes-conges').TYPES;
  const actions = s.statut === 'Actif'
    ? `<div class="groupe-actions"><a class="bouton secondaire" href="/salaries/${s.id}/modifier">${ic('reglages')}Modifier</a><a class="bouton secondaire" href="/dotations?salarie=${s.id}#remise">${ic('colis')}Remettre du matériel</a>${acces.peut(req, 'sorties') ? `<a class="bouton fantome" href="/salaries/${s.id}/sortie">${ic('sortie')}Organiser la sortie</a>` : ''}${acces.peut(req, 'donnees.personnelles') ? `<a class="bouton fantome" href="/salaries/${s.id}/donnees" data-bulle="Toutes les données enregistrées sur ce salarié, pour répondre à une demande d'accès (loi n° 29-2019).">${ic('telecharger')}Données personnelles</a>` : ''}</div>`
    : `<div class="groupe-actions"><a class="bouton secondaire" href="/salaries/${s.id}/certificat">${ic('document')}Certificat de travail</a><a class="bouton secondaire" href="/salaries/${s.id}/solde">${ic('imprimer')}Solde de tout compte</a></div>`;
  res.send(page(req, { titre: 'Fiche salarié', fil: `Salariés / ${s.prenom} ${s.nom}`, action: actions }, `
  <section class="carte entete-salarie"><span class="avatar grand">${initiales(s.prenom, s.nom)}</span>
    <div><h2>${e(s.prenom)} ${e(s.nom)}</h2><p>${e(s.poste)}, ${e(s.dep)}, catégorie ${e(s.cat)}</p><div class="badges">${badgeContrat(s.type)}${s.statut === 'Actif' ? `<span class="et vert">Actif</span>${prochaineEcheance(s) ? echeance(prochaineEcheance(s)) : ''}` : `<span class="et rouge">Sorti le ${dateFr(s.date_fin)}</span>`}<span class="et gris">Matricule ${e(s.matricule)}</span></div></div>
    <dl class="mini-stats"><div><dt>Brut mensuel</dt><dd>${fcfa(s.salaire_base + s.sursalaire + s.prime_transport)} <small>FCFA</small></dd></div><div><dt>Ancienneté</dt><dd>${paie.anneesEntre(s.date_embauche, jour)} an(s)</dd></div><div><dt>Parts fiscales ${aide('Nombre de parts du quotient familial, calculé à partir de la situation de famille et des enfants à charge.')}</dt><dd>${nb(parts)}</dd></div></dl></section>
  <div class="disposition d-1-1-1">
    ${carte('Identité', `<dl class="fiche">${champ('Sexe', s.sexe === 'F' ? 'Femme' : 'Homme')}${champ('Naissance', dateFr(s.date_naissance))}${champ('Situation familiale', e(s.situation))}${champ('Enfants à charge', s.enfants)}${champ('Numéro CNSS', e(s.num_cnss) || '—', 'Numéro d\'immatriculation du salarié à la Caisse nationale de sécurité sociale.')}${champ('Téléphone', e(s.telephone) || '—')}</dl>`)}
    ${carte('Contrat', `<dl class="fiche">${champ('Type', e(s.type))}${champ('Début', dateFr(s.date_debut))}${champ('Fin', dateFr(s.date_fin))}${champ('Fin d\'essai', dateFr(s.fin_essai), 'Au plus 6 mois, renouvellement compris (Code du travail, art. 35).')}${champ('Catégorie', `${e(s.cat)} — ${e(s.catlib)}`)}${champ('Entrée', dateFr(s.date_embauche))}</dl>`)}
    ${carte('Rémunération', `<dl class="fiche">${champ('Salaire de base', `${fcfa(s.salaire_base)} FCFA`)}${champ('Sursalaire', `${fcfa(s.sursalaire)} FCFA`, 'Complément de salaire individuel au-delà du minimum de la catégorie.')}${champ('Transport', `${fcfa(s.prime_transport)} FCFA`, 'Indemnité non imposable si elle est versée à tout le personnel, dans la limite de la convention.')}</dl>`)}
  </div>
  <div class="disposition d-1-1">
    ${carte(`Droits selon la convention ${e(conv)}${aide('Calculés à partir de la convention collective de la société et du niveau de la catégorie du poste.')}`, `<dl class="fiche">
      ${champ('Préavis', pr.manquant ? '<span class="et jaune">À renseigner</span>' : e(pr.texte), pr.source)}
      ${champ('Prime d\'ancienneté', `${nb(tauxAnc)} % du salaire de base`, 'Taux applicable ce mois-ci selon l\'ancienneté.')}
      ${champ('Congés annuels', `${sol.annuels.total} jours ouvrables${sol.annuels.supplement ? ` (dont ${sol.annuels.supplement} d'ancienneté)` : ''}`)}
      ${champ('Indemnité de licenciement', ind.montant ? `${fcfa(ind.montant)} FCFA` : e(ind.texte || '—'), ind.montant ? `Estimation si le licenciement intervenait aujourd'hui, hors faute lourde. Base : ${fcfa(ind.salaireMoyen.montant)} FCFA (${ind.salaireMoyen.source}).` : 'Selon l\'ancienneté minimale et le barème de la convention.')}
      </dl>`)}
    ${carte(`Congés${aide('Le solde disponible vient de la dernière période de 12 mois terminée ; la période en cours s\'acquiert mois par mois.')}`, `<dl class="mini-stats solde"><div><dt>Disponible</dt><dd>${sol.ouvert ? `${nb(sol.disponible)} j` : '—'}</dd></div><div><dt>Pris</dt><dd>${nb(sol.pris)} j</dd></div><div><dt>En cours</dt><dd>${nb(sol.enCours)} j</dd></div></dl>
      ${sol.ouvert ? '' : `<p class="discret petit-texte">Droit ouvert à partir du ${dateFr(sol.ouvertLe)}, après 12 mois de service.</p>`}
      ${absences.length ? `<ul class="liste-simple">${absences.map((a) => `<li><span><span class="pastille-type t-${a.type}"></span>${TYPES_ABS[a.type][0]}</span><small class="discret">${dateFr(a.date_debut)} au ${dateFr(a.date_fin)}${a.statut === 'demande' ? ', en attente' : a.statut === 'refuse' ? ', refusée' : ''}</small></li>`).join('')}</ul>` : ''}
      <a class="lien-action" href="/conges?salarie=${s.id}#nouvelle">Saisir une absence</a>`)}
  </div>
  <div class="disposition d-1-1">
    ${carte('Matériel remis', tableau(['Matériel', '+Qté', 'Remis le', 'Situation'], dot.map((d) => `<tr><td>${e(d.designation)}</td><td class="n">${d.quantite}</td><td>${dateFr(d.date_remise)}</td><td>${d.date_retour ? `<span class="discret">Rendu le ${dateFr(d.date_retour)}</span>` : '<span class="et vert">En possession</span>'}</td></tr>`), 'Aucun matériel remis.'))}
    ${carte('Bulletins de paie', tableau(['Période', '+Brut', '+Net à payer', ''], bul.map((b) => `<tr><td>${periodeFr(b.periode)}</td><td class="n">${fcfa(b.brut)}</td><td class="n"><b>${fcfa(b.net)}</b></td><td class="n"><a href="/paie/bulletin/${b.id}">Ouvrir</a></td></tr>`), 'Aucun bulletin calculé.'))}
  </div>
  ${carte('Historique', `<ol class="frise">${ev.map((x) => `<li><span class="point"></span><div><b>${e(x.type)}</b><span>${e(x.detail)}</span></div><time>${dateFr(x.date)}</time></li>`).join('')}</ol>`)}`));
});

/* ---------- embauche ---------- */
app.get('/embauche', (req, res) => {
  const sid = req.societe.id, jour = aujourdhui();
  const postes = all('SELECT p.id, p.intitule, d.nom dep, c.code cat, c.salaire_min, c.niveau FROM postes p LEFT JOIN departements d ON d.id=p.departement_id LEFT JOIN categories c ON c.id=p.categorie_id WHERE p.societe_id=? ORDER BY p.intitule', sid);
  const smig = paie.param('SMIG', sid, jour);
  if (!postes.length) return res.send(page(req, { titre: 'Embauche' }, carte('', '<div class="etat-vide">Créez d\'abord un poste dans <a href="/structure">Structure</a>.</div>')));
  res.send(page(req, { titre: 'Embaucher un salarié', sous: 'Trois étapes. Le contrat, la période d\'essai et la fiche salarié sont créés à l\'enregistrement.' }, `
  <div class="disposition d-2-1">
  <form method="post" action="/embauche" class="carte assistant" novalidate>
    <ol class="pas"><li class="actif"><span>1</span>Identité</li><li><span>2</span>Poste et contrat</li><li><span>3</span>Rémunération</li></ol>
    <fieldset data-pas="0"><legend>Identité du salarié</legend><div class="champs">
      <label>Nom<input name="nom" required autocomplete="off"></label><label>Prénom<input name="prenom" required autocomplete="off"></label>
      <label>Sexe<select name="sexe"><option value="F">Femme</option><option value="M">Homme</option></select></label>
      <label>Date de naissance<input name="date_naissance" type="date" required></label>
      <label>Situation familiale ${aide('Sert à calculer le nombre de parts pour l\'impôt sur les salaires.')}<select name="situation"><option>Célibataire</option><option>Marié(e)</option><option>Divorcé(e)</option><option>Veuf(ve)</option></select></label>
      <label>Enfants à charge ${aide('Chaque enfant à charge ajoute une demi-part, dans la limite de 6,5 parts.')}<input name="enfants" type="number" min="0" value="0" required></label>
      <label>Numéro CNSS ${aide('Facultatif à l\'embauche : l\'immatriculation peut être faite ensuite.')}<input name="num_cnss"></label><label>Téléphone<input name="telephone" type="tel"></label></div></fieldset>
    <fieldset data-pas="1" hidden><legend>Poste et contrat</legend><div class="champs">
      <label class="large">Poste<select name="poste_id">${postes.map((p) => `<option value="${p.id}" data-min="${p.salaire_min || 0}" data-essai="${droits.essai(sid, p.niveau || 1).mois}" data-libelle="${e(p.intitule)} — ${e(p.dep)}">${e(p.intitule)} — ${e(p.dep)} (${e(p.cat)})</option>`).join('')}</select></label>
      <label>Type de contrat ${aide('CDD : 2 ans au plus, un seul renouvellement, écrit obligatoire. Sinon, il devient un CDI.')}<select name="type"><option>CDI</option><option>CDD</option></select></label>
      <label>Date d'entrée<input name="date_debut" type="date" required value="${jour}"></label>
      <label id="date-fin" hidden>Date de fin du CDD<input name="date_fin" type="date"></label>
      <label>Période d'essai (mois) ${aide('Proposée selon la convention collective et la catégorie du poste. Elle doit être écrite ; 6 mois au plus, renouvellement compris.')}<input name="essai_mois" type="number" min="0" max="6" value="${droits.essai(sid, postes[0].niveau || 1).mois}" required></label></div></fieldset>
    <fieldset data-pas="2" hidden><legend>Rémunération mensuelle</legend><div class="champs">
      <label>Salaire de base (FCFA) ${aide('Au moins le SMIG et le minimum de la catégorie du poste.')}<input name="salaire_base" type="number" min="0" required></label>
      <label>Sursalaire (FCFA) ${aide('Complément individuel, facultatif.')}<input name="sursalaire" type="number" min="0" value="0" required></label>
      <label>Indemnité de transport (FCFA) ${aide('Non imposable si elle est versée à tout le personnel, dans la limite de la convention.')}<input name="prime_transport" type="number" min="0" value="25000" required></label></div></fieldset>
    <div class="actions"><button type="button" id="prec" class="bouton secondaire" hidden>Précédent</button><button type="button" id="suiv" class="bouton">Continuer</button><button id="fin" class="bouton" hidden>Enregistrer l'embauche</button></div>
  </form>
  <aside class="carte recap collant" id="recap" data-smig="${smig}" aria-live="polite"><h2>Récapitulatif</h2>
    <dl class="fiche une-col"><div><dt>Salarié</dt><dd id="r-nom">—</dd></div><div><dt>Poste</dt><dd id="r-poste">—</dd></div><div><dt>Contrat</dt><dd id="r-contrat">—</dd></div><div><dt>Période d'essai</dt><dd id="r-essai">—</dd></div>
    <div><dt>Brut mensuel prévu</dt><dd id="r-brut" class="fort">—</dd></div><div><dt>Salaire de base minimum ${aide('Le plus élevé entre le SMIG et le minimum de la catégorie du poste.')}</dt><dd id="r-min">—</dd></div></dl>
    <p class="alerte-ligne" id="r-alerte" hidden>Le salaire de base est inférieur au minimum applicable.</p></aside>
  </div><script src="/embauche.js"></script>`));
});
app.post('/embauche', (req, res) => {
  const b = req.body, sid = req.societe.id;
  const poste = get('SELECT * FROM postes WHERE id=? AND societe_id=?', Number(b.poste_id), sid);
  if (!poste || !b.nom || !b.prenom || !/^\d{4}-\d{2}-\d{2}$/.test(b.date_debut || '')) return res.redirect('/embauche');
  const n = get('SELECT COUNT(*) n FROM salaries WHERE societe_id=?', sid).n + 1;
  const mat = `${req.societe.nom.slice(0, 2).toUpperCase()}-${String(n).padStart(3, '0')}`;
  const mois = Math.min(6, Math.max(0, Number(b.essai_mois) || 0));
  let essai = null;
  if (mois) { const d = new Date(b.date_debut); d.setMonth(d.getMonth() + mois); essai = d.toISOString().slice(0, 10); }
  const type = b.type === 'CDD' ? 'CDD' : 'CDI';
  const id = run('INSERT INTO salaries(societe_id,matricule,nom,prenom,sexe,date_naissance,situation,enfants,num_cnss,telephone,poste_id,date_embauche,statut) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
    sid, mat, b.nom, b.prenom, b.sexe === 'M' ? 'M' : 'F', b.date_naissance || null, b.situation, Number(b.enfants) || 0, b.num_cnss || '', b.telephone || '', poste.id, b.date_debut, 'Actif').lastInsertRowid;
  run('INSERT INTO contrats(salarie_id,type,date_debut,date_fin,fin_essai,salaire_base,sursalaire,prime_transport) VALUES(?,?,?,?,?,?,?,?)',
    id, type, b.date_debut, type === 'CDD' && b.date_fin ? b.date_fin : null, essai, Number(b.salaire_base) || 0, Number(b.sursalaire) || 0, Number(b.prime_transport) || 0);
  run('INSERT INTO evenements(salarie_id,date,type,detail) VALUES(?,?,?,?)', id, b.date_debut, 'Embauche', `${type} — ${poste.intitule}`);
  res.redirect(`/salaries/${id}`);
});

/* ---------- dotations ---------- */
app.get('/dotations', (req, res) => {
  const sid = req.societe.id;
  const mats = all('SELECT m.*, (SELECT COALESCE(SUM(quantite),0) FROM dotations WHERE materiel_id=m.id AND date_retour IS NULL) sortis FROM materiels m WHERE societe_id=? ORDER BY designation', sid);
  const sal = all('SELECT id, nom, prenom FROM salaries WHERE societe_id=? AND statut=\'Actif\' ORDER BY nom', sid);
  const dot = all('SELECT d.*, m.designation, e.nom, e.prenom FROM dotations d JOIN materiels m ON m.id=d.materiel_id JOIN salaries e ON e.id=d.salarie_id WHERE e.societe_id=? ORDER BY d.date_retour IS NOT NULL, d.date_remise DESC', sid);
  const enCours = dot.filter((d) => !d.date_retour);
  const valeur = enCours.reduce((a, d) => a + d.quantite * (mats.find((m) => m.id === d.materiel_id)?.valeur || 0), 0);
  res.send(page(req, { titre: 'Dotations matérielles', sous: 'Le matériel confié aux salariés, avec une fiche de remise à signer et le suivi des retours.', action: `<a class="bouton" href="#remise">${ic('colis')}Remettre du matériel</a>` }, `
  <div class="kpis trois">${kpi('colis', enCours.length, 'remises en cours')}${kpi('portefeuille', `${fcfa(valeur)} <small>FCFA</small>`, 'de matériel chez les salariés', 'Valeur d\'achat du matériel remis et pas encore rendu.')}${kpi('grille', mats.length, 'articles au catalogue')}</div>
  <div class="disposition d-2-1">
    <div class="pile">
    ${carte(`Suivi des remises`, tableau(['Salarié', 'Matériel', '+Qté', 'Remis le', 'Situation', ''], dot.map((d) => `<tr class="${d.date_retour ? 'pale' : ''}"><td>${personne({ id: d.salarie_id, nom: d.nom, prenom: d.prenom })}</td><td>${e(d.designation)}<small class="discret bloc">${e(d.etat)}</small></td><td class="n">${d.quantite}</td><td>${dateFr(d.date_remise)}</td><td>${d.date_retour ? `<span class="discret">Rendu le ${dateFr(d.date_retour)}</span>` : '<span class="et vert">En possession</span>'}</td>
      <td class="n outils"><a href="/dotations/${d.id}/fiche" class="bouton fantome petit" data-bulle="Fiche à imprimer et à faire signer au salarié.">${ic('imprimer')}Fiche</a>${d.date_retour ? '' : `<form method="post" action="/dotations/${d.id}/retour"><button class="bouton fantome petit">Retour</button></form>`}</td></tr>`), 'Aucune remise enregistrée.'))}
    ${carte('Catalogue', `${tableau(['Matériel', 'Référence', '+Valeur', `Disponibilité ${aide('Quantité en stock moins le matériel actuellement chez les salariés.')}`], mats.map((m) => `<tr><td><b>${e(m.designation)}</b></td><td class="discret">${e(m.reference)}</td><td class="n">${fcfa(m.valeur)}</td><td><span class="jauge"><span style="width:${Math.round((m.stock - m.sortis) / m.stock * 100)}%"></span></span> ${m.stock - m.sortis} / ${m.stock}</td></tr>`))}
      <form method="post" action="/dotations/materiel" class="form-ajout"><input name="designation" required placeholder="Nouvel article" aria-label="Désignation"><input name="reference" placeholder="Référence" aria-label="Référence" class="moyen"><input name="valeur" type="number" min="0" required placeholder="Valeur" aria-label="Valeur en FCFA" class="moyen"><input name="stock" type="number" min="1" value="1" required aria-label="Stock" class="court"><button class="bouton secondaire">Ajouter</button></form>`)}
    </div>
    ${carte('Remettre du matériel', `<form method="post" action="/dotations" class="form-pile">
      <label>Salarié<select name="salarie_id" required>${options(sal, 'id', (s) => `${s.nom} ${s.prenom}`, req.query.salarie)}</select></label>
      <label>Matériel<select name="materiel_id" required>${options(mats.filter((m) => m.stock - m.sortis > 0), 'id', (m) => `${m.designation} (${m.stock - m.sortis} disponibles)`)}</select></label>
      <div class="champs"><label>Quantité<input name="quantite" type="number" min="1" value="1" required></label>
      <label>État ${aide('État du matériel au moment de la remise, reporté sur la fiche signée.')}<select name="etat"><option>Neuf</option><option>Bon état</option><option>Usagé</option></select></label></div>
      <label>Date de remise<input name="date_remise" type="date" required value="${aujourdhui()}"></label><button class="bouton">Enregistrer et imprimer la fiche</button></form>`, { id: 'remise', cls: 'collant' })}
  </div>`));
});
app.post('/dotations/materiel', (req, res) => { run('INSERT INTO materiels(societe_id,designation,reference,valeur,stock) VALUES(?,?,?,?,?)', req.societe.id, req.body.designation, req.body.reference || '', Number(req.body.valeur) || 0, Math.max(1, Number(req.body.stock) || 1)); res.redirect('/dotations'); });
app.post('/dotations', (req, res) => {
  const sid = req.societe.id, b = req.body;
  const s = get('SELECT id FROM salaries WHERE id=? AND societe_id=?', Number(b.salarie_id), sid);
  const m = get('SELECT m.*, (SELECT COALESCE(SUM(quantite),0) FROM dotations WHERE materiel_id=m.id AND date_retour IS NULL) sortis FROM materiels m WHERE id=? AND societe_id=?', Number(b.materiel_id), sid);
  const q = Math.max(1, Number(b.quantite) || 1);
  if (!s || !m || q > m.stock - m.sortis) return res.redirect('/dotations');
  const id = run('INSERT INTO dotations(salarie_id,materiel_id,date_remise,quantite,etat) VALUES(?,?,?,?,?)', s.id, m.id, b.date_remise, q, b.etat).lastInsertRowid;
  run('INSERT INTO evenements(salarie_id,date,type,detail) VALUES(?,?,?,?)', s.id, b.date_remise, 'Dotation', `${q} × ${m.designation}`);
  res.redirect(`/dotations/${id}/fiche`);
});
const dotation = (req) => get('SELECT d.*, m.designation, m.reference, m.valeur, e.nom, e.prenom, e.matricule, p.intitule poste FROM dotations d JOIN materiels m ON m.id=d.materiel_id JOIN salaries e ON e.id=d.salarie_id LEFT JOIN postes p ON p.id=e.poste_id WHERE d.id=? AND e.societe_id=?', Number(req.params.id), req.societe.id);
app.post('/dotations/:id/retour', (req, res) => {
  const d = dotation(req);
  if (d && !d.date_retour) { run('UPDATE dotations SET date_retour=? WHERE id=?', aujourdhui(), d.id); run('INSERT INTO evenements(salarie_id,date,type,detail) VALUES(?,?,?,?)', d.salarie_id, aujourdhui(), 'Retour de matériel', `${d.quantite} × ${d.designation}`); }
  res.redirect('/dotations');
});
const imprimable = (titre, retour, corps) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(titre)}</title><link rel="icon" href="/logo.svg"><link rel="stylesheet" href="/fonts/fonts.css"><link rel="stylesheet" href="/style.css"></head>
<body class="doc"><div class="barre-doc"><a href="${e(retour)}" class="bouton fantome">← Retour</a><button class="bouton" type="button" data-imprimer>${ic('imprimer')}Imprimer ou enregistrer en PDF</button></div><article>${corps}<p class="edite">Édité avec Smart RH</p></article><script src="/imprimer.js"></script></body></html>`;
app.get('/dotations/:id/fiche', (req, res) => {
  const d = dotation(req); if (!d) return res.redirect('/dotations');
  const s = req.societe;
  res.send(imprimable('Fiche de remise de matériel', '/dotations', `
  <div class="entete"><div>${logo.balise(s.id)}<b>${e(s.nom)}</b><br>${e(s.ville)}<br>NIU ${e(s.niu)}</div><div class="droite"><h1>Fiche de remise de matériel</h1>N° ${String(d.id).padStart(5, '0')} du ${dateFr(d.date_remise)}</div></div>
  <table class="simple"><tr><th>Salarié</th><td>${e(d.prenom)} ${e(d.nom)} (${e(d.matricule)})</td></tr><tr><th>Poste</th><td>${e(d.poste)}</td></tr></table>
  <table class="simple"><tr><th>Matériel</th><th>Référence</th><th class="n">Quantité</th><th>État</th><th class="n">Valeur unitaire</th></tr>
  <tr><td>${e(d.designation)}</td><td>${e(d.reference)}</td><td class="n">${d.quantite}</td><td>${e(d.etat)}</td><td class="n">${fcfa(d.valeur)} FCFA</td></tr></table>
  <p>Le salarié reconnaît avoir reçu le matériel ci-dessus pour l'exercice de ses fonctions. Il s'engage à en prendre soin et à le restituer à la demande de l'employeur ou à la fin de son contrat.</p>
  <div class="signatures"><div>L'employeur<br><small>Nom, signature et cachet</small></div><div>Le salarié<br><small>Mention « reçu le » et signature</small></div></div>`));
});

/* ---------- paie ---------- */
app.get('/paie', (req, res) => {
  const sid = req.societe.id;
  const periode = /^\d{4}-\d{2}$/.test(req.query.periode || '') ? req.query.periode : aujourdhui().slice(0, 7);
  const bul = all('SELECT b.*, e.nom, e.prenom, e.matricule, p.intitule poste FROM bulletins b JOIN salaries e ON e.id=b.salarie_id LEFT JOIN postes p ON p.id=e.poste_id WHERE e.societe_id=? AND b.periode=? ORDER BY e.nom', sid, periode);
  const somme = (k) => bul.reduce((a, b) => a + b[k], 0);
  const action = `<form method="post" action="/paie/calculer"><input type="hidden" name="periode" value="${periode}"><button class="bouton">${ic('calcul')}${bul.length ? 'Recalculer' : 'Calculer'} la paie de ${periodeFr(periode)}</button></form>`;
  res.send(page(req, { titre: 'Paie du mois', sous: `Le calcul applique les règles en vigueur à la fin de ${periodeFr(periode)}.`, action }, `
  <form method="get" action="/paie" class="barre-outils periode"><label class="en-ligne">${ic('agenda')}Période<input type="month" name="periode" value="${periode}" data-envoi-auto>
</label><noscript><button class="bouton secondaire">Afficher</button></noscript></form>
  ${bul.length ? `<div class="kpis">
    ${kpi('portefeuille', `${fcfa(somme('brut'))} <small>FCFA</small>`, 'salaires bruts', 'Total des gains : salaire de base, sursalaire, prime d\'ancienneté et indemnités.')}
    ${kpi('equipe', `${fcfa(somme('retenues'))} <small>FCFA</small>`, 'retenues sur salaires', 'Retraite CNSS, assurance maladie, taxe d\'occupation des locaux et impôt sur les salaires.')}
    ${kpi('paie', `${fcfa(somme('net'))} <small>FCFA</small>`, 'nets à payer', 'Ce que les salariés reçoivent : brut moins retenues.', 'vert')}
    ${kpi('societe', `${fcfa(somme('patronal'))} <small>FCFA</small>`, 'charges employeur', 'Cotisations CNSS et CAMU patronales et taxe unique sur les salaires, en plus du brut.')}
  </div>` : ''}
  ${carte(`Livre de paie — ${periodeFr(periode)} ${bul.length ? `<span class="compteur">${bul.length} bulletins</span>` : ''}`, tableau(['Salarié', 'Matricule', '+Brut', '+Retenues', '+Net à payer', `+Charges employeur`, ''], bul.map((b) => `<tr><td>${personne({ id: b.salarie_id, nom: b.nom, prenom: b.prenom, poste: b.poste })}</td><td class="discret">${e(b.matricule)}</td><td class="n">${fcfa(b.brut)}</td><td class="n">${fcfa(b.retenues)}</td><td class="n"><b>${fcfa(b.net)}</b></td><td class="n">${fcfa(b.patronal)}</td><td class="n"><a class="bouton fantome petit" href="/paie/bulletin/${b.id}">Bulletin</a></td></tr>`).concat(bul.length ? [`<tr class="total"><td>Total</td><td></td><td class="n">${fcfa(somme('brut'))}</td><td class="n">${fcfa(somme('retenues'))}</td><td class="n">${fcfa(somme('net'))}</td><td class="n">${fcfa(somme('patronal'))}</td><td></td></tr>`] : []), `Aucun bulletin pour ${periodeFr(periode)}. Lancez le calcul avec le bouton en haut à droite.`))}`));
});
app.post('/paie/calculer', (req, res) => {
  const periode = /^\d{4}-\d{2}$/.test(req.body.periode || '') ? req.body.periode : aujourdhui().slice(0, 7);
  paie.calculerSociete(req.societe.id, periode);
  res.redirect(`/paie?periode=${periode}`);
});
app.get('/paie/bulletin/:id', (req, res) => {
  const b = get(`SELECT b.*, e.nom, e.prenom, e.matricule, e.num_cnss, e.situation, e.enfants, e.date_embauche, p.intitule poste, c.code cat
    FROM bulletins b JOIN salaries e ON e.id=b.salarie_id LEFT JOIN postes p ON p.id=e.poste_id LEFT JOIN categories c ON c.id=p.categorie_id WHERE b.id=? AND e.societe_id=?`, Number(req.params.id), req.societe.id);
  if (!b) return res.redirect('/paie');
  const s = req.societe, L = all('SELECT * FROM bulletin_lignes WHERE bulletin_id=? ORDER BY ordre', b.id);
  const bloc = (sens) => L.filter((l) => l.sens === sens).map((l) => `<tr><td>${e(l.libelle)}</td><td class="n">${l.base != null ? fcfa(l.base) : ''}</td><td class="n">${l.taux != null ? `${nb(l.taux)} %` : ''}</td><td class="n">${sens === 'gain' ? fcfa(l.montant) : ''}</td><td class="n">${sens === 'retenue' ? fcfa(l.montant) : ''}</td><td class="n">${sens === 'patronale' ? fcfa(l.montant) : ''}</td></tr>`).join('');
  res.send(imprimable(`Bulletin de paie — ${b.prenom} ${b.nom} — ${periodeFr(b.periode)}`, `/paie?periode=${b.periode}`, `
  <div class="entete"><div>${logo.balise(s.id)}<b>${e(s.nom)}</b><br>${e(s.ville)}<br>NIU ${e(s.niu)}, RCCM ${e(s.rccm)}<br>CNSS employeur ${e(s.cnss_employeur)}</div><div class="droite"><h1>Bulletin de paie</h1>${periodeFr(b.periode)}</div></div>
  <table class="simple"><tr><th>Salarié</th><td>${e(b.prenom)} ${e(b.nom)}</td><th>Matricule</th><td>${e(b.matricule)}</td></tr>
  <tr><th>Poste</th><td>${e(b.poste)}</td><th>Catégorie</th><td>${e(b.cat)}</td></tr>
  <tr><th>Numéro CNSS</th><td>${e(b.num_cnss)}</td><th>Date d'entrée</th><td>${dateFr(b.date_embauche)}</td></tr>
  <tr><th>Situation familiale</th><td>${e(b.situation)}, ${b.enfants} enfant(s)</td><th>Parts fiscales</th><td>${nb(b.parts)}</td></tr></table>
  <table class="simple lignes"><tr><th>Rubrique</th><th class="n">Base</th><th class="n">Taux</th><th class="n">Gains</th><th class="n">Retenues</th><th class="n">Part employeur</th></tr>
  ${bloc('gain')}<tr class="total"><td>Salaire brut</td><td></td><td></td><td class="n">${fcfa(b.brut)}</td><td></td><td></td></tr>
  ${bloc('retenue')}<tr class="total"><td>Total des retenues</td><td></td><td></td><td></td><td class="n">${fcfa(b.retenues)}</td><td></td></tr>
  ${bloc('patronale')}<tr class="total"><td>Total des charges employeur</td><td></td><td></td><td></td><td></td><td class="n">${fcfa(b.patronal)}</td></tr></table>
  <div class="net"><span>Net à payer</span><b>${fcfa(b.net)} FCFA</b></div>
  <p class="petit">Brut cotisable : ${fcfa(b.cotisable)} FCFA, Brut imposable : ${fcfa(b.imposable)} FCFA, Coût total employeur : ${fcfa(b.brut + b.patronal)} FCFA.<br>
  Maquette : taux indicatifs, à valider par un expert-comptable avant tout usage réel.</p>
  <div class="signatures"><div>L'employeur</div><div>Le salarié<br><small>Reçu le, signature</small></div></div>`));
});

const h = { e, fcfa, nb, dateFr, aujourdhui, MOIS, page, carte, tableau, options, kpi, personne, aide, ic, interdit, imprimable, marque };
auth(app, h);
journal(app, h);
sauvegarde(app, h);
require('./routes-gestion')(app, h);
require('./routes-conges')(app, h);
require('./routes-conventions')(app, h);
require('./routes-declarations')(app, h);
require('./routes-variables')(app, h);
require('./routes-sortie')(app, h);
require('./routes-outils')(app, h);
logo.routes(app);

// page introuvable et erreur inattendue
app.use((req, res) => {
  if (!req.user) return res.status(404).send('Page introuvable.');
  res.status(404).send(page(req, { titre: 'Page introuvable' }, carte('', `<div class="etat-vide">${ic('loupe')}<p>Cette page n'existe pas ou n'est plus disponible.</p><a class="bouton secondaire" href="/">Revenir au tableau de bord</a></div>`)));
});
app.use((err, req, res, next) => {
  console.error(new Date().toISOString(), req.method, req.originalUrl, err);
  journalisation.log.erreur('Erreur inattendue dans une page', { m: req.method, p: req.path, u: req.user?.id || null, erreur: err.message, pile: err.stack?.split('\n').slice(0, 6).join(' / ') });
  if (res.headersSent) return next(err);
  const corps = carte('', `<div class="etat-vide">${ic('alerte')}<p>Une erreur inattendue s'est produite. L'action n'a peut-être pas été enregistrée : vérifiez avant de recommencer. Si le problème persiste, transmettez l'heure exacte à votre support.</p><a class="bouton secondaire" href="/">Revenir au tableau de bord</a></div>`);
  try { res.status(500).send(req.user ? page(req, { titre: 'Erreur' }, corps) : 'Erreur inattendue.'); } catch { res.status(500).send('Erreur inattendue.'); }
});

// HTTPS : certificat créé par « npm run certificat » (clé + certificat, ou fichier .pfx sous Windows sans OpenSSL)
function optionsHttps() {
  const fs = require('node:fs');
  if (fs.existsSync(config.certificat) && fs.existsSync(config.clePrivee)) return { cert: fs.readFileSync(config.certificat), key: fs.readFileSync(config.clePrivee) };
  const pfx = config.certificat.replace(/\.crt$/i, '.pfx');
  if (fs.existsSync(pfx)) return { pfx: fs.readFileSync(pfx), passphrase: fs.existsSync(`${pfx}.mdp.txt`) ? fs.readFileSync(`${pfx}.mdp.txt`, 'utf8').trim() : undefined };
  throw new Error(`SMART_RH_HTTPS=1 mais aucun certificat trouvé (${config.certificat}). Lancez d'abord : npm run certificat`);
}

// démarrage (node server.js, ou scripts/demo.js pour la base de démonstration)
function demarrer() {
  const memoire = journalisation.installer();
  const version = require('./package.json').version;
  if (!config.https && config.hote !== '127.0.0.1' && config.hote !== 'localhost' && !config.proxy) {
    console.warn('ATTENTION : Smart RH est ouvert au réseau sans HTTPS. Les mots de passe et les salaires circulent en clair. Lancez « npm run certificat » puis activez SMART_RH_HTTPS=1.');
    journalisation.log.alerte('Ouvert au réseau sans HTTPS', { hote: config.hote });
  }
  let serveur;
  try {
    serveur = config.https ? require('node:https').createServer({ ...optionsHttps(), minVersion: 'TLSv1.2' }, app) : require('node:http').createServer(app);
  } catch (err) { journalisation.log.erreur('Démarrage impossible', { erreur: err.message }); throw err; }
  serveur.on('error', (err) => {
    journalisation.log.erreur(err.code === 'EADDRINUSE' ? `Port ${config.port} déjà utilisé : une autre copie de Smart RH tourne peut-être` : 'Erreur du serveur', { code: err.code, erreur: err.message });
    console.error(err.message);
    process.exit(1);
  });
  // délais : une connexion lente ou abandonnée ne monopolise pas le serveur
  Object.assign(serveur, { requestTimeout: 30e3, headersTimeout: 15e3, keepAliveTimeout: 5e3 });
  serveur.listen(config.port, config.hote, () => {
    console.log(`Smart RH ${acces.donneesFictives() ? '(base de démonstration) ' : ''}: ${config.https ? 'https' : 'http'}://${config.hote === '0.0.0.0' ? 'localhost' : config.hote}:${config.port}`);
    journalisation.log.info('Démarrage', { version, node: process.version, pid: process.pid, adresse: `${config.https ? 'https' : 'http'}://${config.hote}:${config.port}`, base: config.base, demonstration: acces.donneesFictives(), inactivite_min: config.minutesInactivite, logs: config.dossierLogs, ...memoire() });
    sauvegarde.planifier();
  });
  return serveur;
}
if (require.main === module) demarrer();
module.exports = app;
module.exports.demarrer = demarrer;

