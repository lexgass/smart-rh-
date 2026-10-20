// Lance Smart RH sur la base de démonstration (demo/smart-rh-demo.db), exactement comme en production.
// Usage : npm run demo   (préparer la base d'abord : npm run demo:preparer)
const fs = require('node:fs');
const path = require('node:path');

const dossier = path.join(__dirname, '..', 'demo');
process.env.SMART_RH_DB ||= path.join(dossier, 'smart-rh-demo.db');
process.env.SMART_RH_SAUVEGARDES ||= path.join(path.dirname(process.env.SMART_RH_DB), 'sauvegardes');
if (!fs.existsSync(process.env.SMART_RH_DB)) { console.log('Aucune base de démonstration : lancez d\'abord npm run demo:preparer'); process.exit(1); }
require('../server').demarrer();
