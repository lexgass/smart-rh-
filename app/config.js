// Configuration de Smart RH, lue dans les variables d'environnement (voir DEPLOIEMENT.md).
const path = require('node:path');

const oui = (v) => ['1', 'oui', 'true', 'yes'].includes(String(v || '').toLowerCase());
const dossier = path.dirname(process.env.SMART_RH_DB || path.join(__dirname, 'smart-rh.db'));

module.exports = {
  // port et adresse d'écoute : 127.0.0.1 = ce poste seulement, 0.0.0.0 = tout le réseau local
  port: Number(process.env.PORT) || 4322,
  hote: process.env.HOST || '127.0.0.1',
  // fichier de la base de données
  base: process.env.SMART_RH_DB || path.join(__dirname, 'smart-rh.db'),
  // sauvegardes automatiques, chiffrées avec la clé du fichier « cle-sauvegarde.txt » (créée au premier lancement)
  dossierSauvegardes: process.env.SMART_RH_SAUVEGARDES || path.join(__dirname, 'sauvegardes'),
  // fichiers de log (un par jour) : application, requêtes, surveillance ; conservés N jours
  dossierLogs: process.env.SMART_RH_LOGS || path.join(dossier, 'logs'),
  joursLogs: Number(process.env.SMART_RH_LOGS_JOURS) || 30,
  joursConservation: Number(process.env.SMART_RH_CONSERVATION) || 14,
  cleSauvegarde: process.env.SMART_RH_CLE_SAUVEGARDE || path.join(dossier, 'cle-sauvegarde.txt'),
  // sessions : fermées après une période sans activité, et dans tous les cas après une durée maximale
  minutesInactivite: Number(process.env.SMART_RH_INACTIVITE_MINUTES) || 30,
  heuresSession: Number(process.env.SMART_RH_SESSION_HEURES) || 12,
  // HTTPS intégré : certificat créé par « npm run certificat » (dossier certificat/ à côté de la base)
  https: oui(process.env.SMART_RH_HTTPS),
  certificat: process.env.SMART_RH_CERTIFICAT || path.join(dossier, 'certificat', 'smart-rh.crt'),
  clePrivee: process.env.SMART_RH_CLE || path.join(dossier, 'certificat', 'smart-rh.key'),
  // derrière un serveur web (IIS, Nginx) : adresse du client lue dans X-Forwarded-For
  proxy: oui(process.env.SMART_RH_PROXY),
  // serveur en ligne : le HTTPS est assuré par le serveur web placé devant (Caddy) ; cookies « Secure » et HSTS quand même
  httpsProxy: oui(process.env.SMART_RH_HTTPS_PROXY),
  // serveur en ligne : l'écran de premier lancement n'est ouvert qu'avec ce code (créé par le script d'installation)
  jetonInstallation: process.env.SMART_RH_INSTALLATION_JETON || '',
};
// adresses vues par le navigateur en HTTPS : intégré ou assuré par le serveur web placé devant
module.exports.securise = module.exports.https || module.exports.httpsProxy;
