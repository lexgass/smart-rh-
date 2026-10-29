// Logo de chaque société : envoyé avec le formulaire (multipart), vérifié, rangé dans la base (donc dans les sauvegardes),
// puis repris sur le bulletin de paie et les autres documents imprimables.
// Formats acceptés : PNG, JPEG, WebP, 1 Mo au plus. Le SVG est refusé : il peut contenir du script.
const express = require('express');
const { db, run, get } = require('./db');
const acces = require('./acces');

// table à part : la fiche société est lue à chaque page, le logo seulement quand il s'affiche
db.exec('CREATE TABLE IF NOT EXISTS societe_logos(societe_id INTEGER PRIMARY KEY, type TEXT, donnees BLOB, modifie_le TEXT)');

const TAILLE_MAX = 1024 * 1024;
const FORMATS = 'PNG, JPG ou WebP, 1 Mo au plus';

// type réel du fichier, lu dans ses premiers octets (jamais d'après son nom ni d'après ce qu'annonce le navigateur)
function typeImage(b) {
  if (!Buffer.isBuffer(b) || b.length < 12) return null;
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// découpe un corps multipart/form-data : champs texte dans req.body, fichiers dans req.fichiers
function decouper(corps, frontiere) {
  const champs = {}, fichiers = {};
  const sep = Buffer.from(`--${frontiere}`);
  let pos = corps.indexOf(sep);
  while (pos !== -1) {
    const debut = pos + sep.length;
    if (corps.toString('latin1', debut, debut + 2) === '--') break; // fin du corps
    const suivant = corps.indexOf(sep, debut);
    if (suivant === -1) break;
    const partie = corps.subarray(debut + 2, suivant - 2); // sans le saut de ligne initial et final
    const fin = partie.indexOf('\r\n\r\n');
    if (fin !== -1) {
      const entetes = partie.toString('utf8', 0, fin), contenu = partie.subarray(fin + 4);
      const nom = /name="([^"]*)"/i.exec(entetes)?.[1];
      const fichier = /filename="([^"]*)"/i.exec(entetes);
      if (nom && fichier) { if (contenu.length) fichiers[nom] = { nom: fichier[1], donnees: contenu }; }
      else if (nom) champs[nom] = champs[nom] === undefined ? contenu.toString('utf8') : [].concat(champs[nom], contenu.toString('utf8'));
    }
    pos = suivant;
  }
  return { champs, fichiers };
}

// 6 Mo : pièces scannées du dossier salarié (5 Mo au plus, contrôlé dans documents.js) ; le logo reste limité à 1 Mo
const corpsBrut = express.raw({ type: 'multipart/form-data', limit: '6mb' });
function lireMultipart(req, res, next) {
  if (req.method !== 'POST' || !/^multipart\/form-data/i.test(req.headers['content-type'] || '')) return next();
  corpsBrut(req, res, (err) => {
    if (err) return res.status(413).send(`Fichier trop lourd : ${FORMATS}.`);
    const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(req.headers['content-type']);
    const frontiere = m && (m[1] || m[2]).trim();
    const { champs, fichiers } = frontiere && Buffer.isBuffer(req.body) ? decouper(req.body, frontiere) : { champs: {}, fichiers: {} };
    req.body = champs; req.fichiers = fichiers;
    next();
  });
}

// contrôle d'un logo envoyé : null si accepté, sinon le code du refus
function refusLogo(f) {
  if (!f) return null;
  if (f.donnees.length > TAILLE_MAX) return 'logo_taille';
  return typeImage(f.donnees) ? null : 'logo_format';
}
const MESSAGES = { logo_taille: `Logo trop lourd : ${FORMATS}.`, logo_format: `Ce fichier n'est pas une image acceptée : ${FORMATS}.` };

function enregistrer(societeId, f) {
  run('INSERT OR REPLACE INTO societe_logos(societe_id,type,donnees,modifie_le) VALUES(?,?,?,?)', societeId, typeImage(f.donnees), f.donnees, new Date().toISOString());
}
const retirer = (societeId) => run('DELETE FROM societe_logos WHERE societe_id=?', societeId);
const versionDe = (societeId) => get('SELECT modifie_le FROM societe_logos WHERE societe_id=?', societeId)?.modifie_le || null;

// balise <img> du logo, ou chaîne vide si la société n'en a pas (la version force le rafraîchissement après un changement)
function balise(societeId, cls = 'logo-societe') {
  const v = versionDe(societeId);
  return v ? `<img class="${cls}" src="/societe/logo/${societeId}?v=${encodeURIComponent(v)}" alt="Logo de la société">` : '';
}

function routes(app) {
  // le logo n'est servi qu'aux comptes qui ont accès à cette société
  app.get('/societe/logo/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!req.user || !acces.accede(req.user, id)) return res.status(404).end();
    const l = get('SELECT type, donnees FROM societe_logos WHERE societe_id=?', id);
    if (!l) return res.status(404).end();
    res.set({ 'Content-Type': l.type, 'Cache-Control': 'private, max-age=86400', 'Content-Disposition': 'inline' }).send(Buffer.from(l.donnees));
  });
}

module.exports = { typeImage, lireMultipart, refusLogo, enregistrer, retirer, balise, routes, MESSAGES, FORMATS, TAILLE_MAX };
